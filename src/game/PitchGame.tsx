import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Team } from "./teams";

interface Props {
  home: Team;
  away: Team;
  duration?: number;
  onEnd: (result: { home: number; away: number }) => void;
}

// Pitch dimensions in world units
const PW = 90;   // length (x)
const PH = 56;   // width (z)
const GOAL_W = 14;

interface Player {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  team: "home" | "away";
  role: "GK" | "DEF" | "MID" | "FWD";
  home: THREE.Vector3;
}

export function PitchGame({ home, away, duration = 90, onEnd }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [time, setTime] = useState(duration);
  const [message, setMessage] = useState<string | null>("KICK OFF!");

  const stateRef = useRef<{
    players: Player[];
    ball: { mesh: THREE.Mesh; pos: THREE.Vector3; vel: THREE.Vector3; owner: number | null };
    controlIdx: number;
    keys: Record<string, boolean>;
    score: { home: number; away: number };
    paused: boolean;
    lastShoot: number;
    lastPass: number;
    lastSwitch: number;
    camera: THREE.PerspectiveCamera;
    indicator: THREE.Mesh;
  }>(null!);

  useEffect(() => {
    const mount = mountRef.current!;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1a0e);
    scene.fog = new THREE.Fog(0x0a1a0e, 80, 200);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500);
    camera.position.set(0, 45, 55);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    scene.add(sun);

    // Pitch with stripes
    const stripeCount = 12;
    for (let i = 0; i < stripeCount; i++) {
      const w = PW / stripeCount;
      const geo = new THREE.PlaneGeometry(w, PH);
      const mat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x2f9a3e : 0x267e34,
        roughness: 0.9,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.x = -PW / 2 + w / 2 + i * w;
      m.receiveShadow = true;
      scene.add(m);
    }

    // Surrounding ground (stadium floor)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 220),
      new THREE.MeshStandardMaterial({ color: 0x0d1a12, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    // Pitch lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const addLine = (points: THREE.Vector3[]) => {
      const g = new THREE.BufferGeometry().setFromPoints(points);
      scene.add(new THREE.Line(g, lineMat));
    };
    const y = 0.02;
    // Outer
    addLine([
      new THREE.Vector3(-PW / 2, y, -PH / 2),
      new THREE.Vector3(PW / 2, y, -PH / 2),
      new THREE.Vector3(PW / 2, y, PH / 2),
      new THREE.Vector3(-PW / 2, y, PH / 2),
      new THREE.Vector3(-PW / 2, y, -PH / 2),
    ]);
    // Halfway
    addLine([new THREE.Vector3(0, y, -PH / 2), new THREE.Vector3(0, y, PH / 2)]);
    // Center circle
    const circlePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      circlePts.push(new THREE.Vector3(Math.cos(a) * 8, y, Math.sin(a) * 8));
    }
    addLine(circlePts);
    // Penalty boxes
    [-1, 1].forEach((s) => {
      const x = (s * PW) / 2;
      addLine([
        new THREE.Vector3(x, y, -12),
        new THREE.Vector3(x - s * 11, y, -12),
        new THREE.Vector3(x - s * 11, y, 12),
        new THREE.Vector3(x, y, 12),
      ]);
    });

    // Goals
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, opacity: 0.25, transparent: true, side: THREE.DoubleSide });
    [-1, 1].forEach((s) => {
      const x = (s * PW) / 2;
      const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5), goalMat);
      post1.position.set(x, 2.5, -GOAL_W / 2);
      post1.castShadow = true;
      scene.add(post1);
      const post2 = post1.clone();
      post2.position.z = GOAL_W / 2;
      scene.add(post2);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, GOAL_W), goalMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(x, 5, 0);
      scene.add(bar);
      // Net (back panel)
      const net = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 5), netMat);
      net.position.set(x + s * 2.5, 2.5, 0);
      net.rotation.y = (s * Math.PI) / 2;
      scene.add(net);
      // Net top
      const netTop = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 2.5), netMat);
      netTop.position.set(x + s * 1.25, 5, 0);
      netTop.rotation.x = -Math.PI / 2;
      scene.add(netTop);
    });

    // Stadium stands (simple)
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1f, roughness: 1 });
    [
      { x: 0, z: -PH / 2 - 12, w: PW + 30, d: 14, h: 8 },
      { x: 0, z: PH / 2 + 12, w: PW + 30, d: 14, h: 8 },
      { x: -PW / 2 - 12, z: 0, w: 14, d: PH + 10, h: 8 },
      { x: PW / 2 + 12, z: 0, w: 14, d: PH + 10, h: 8 },
    ].forEach((s) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), standMat);
      m.position.set(s.x, s.h / 2, s.z);
      m.receiveShadow = true;
      scene.add(m);
    });

    // Make player mesh
    const makePlayer = (color: string, secondary: string) => {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.6 });
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.6, 12), bodyMat);
      torso.position.y = 1.2;
      torso.castShadow = true;
      g.add(torso);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xf0c090, roughness: 0.7 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), headMat);
      head.position.y = 2.3;
      head.castShadow = true;
      g.add(head);
      const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(secondary), roughness: 0.7 });
      const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 8), legMat);
      leg1.position.set(0.25, 0.5, 0);
      leg1.castShadow = true;
      g.add(leg1);
      const leg2 = leg1.clone();
      leg2.position.x = -0.25;
      g.add(leg2);
      return g;
    };

    const formation = [
      { role: "GK" as const, x: -0.45, z: 0 },
      { role: "DEF" as const, x: -0.30, z: -0.25 },
      { role: "DEF" as const, x: -0.30, z: 0.25 },
      { role: "MID" as const, x: -0.12, z: 0 },
      { role: "FWD" as const, x: -0.05, z: -0.20 },
      { role: "FWD" as const, x: -0.05, z: 0.20 },
    ];
    const players: Player[] = [];
    formation.forEach((f) => {
      const mesh = makePlayer(home.primary, home.secondary);
      const pos = new THREE.Vector3(f.x * PW, 0, f.z * PH);
      mesh.position.copy(pos);
      scene.add(mesh);
      players.push({ mesh, pos, vel: new THREE.Vector3(), team: "home", role: f.role, home: pos.clone() });
    });
    formation.forEach((f) => {
      const mesh = makePlayer(away.primary, away.secondary);
      const pos = new THREE.Vector3(-f.x * PW, 0, f.z * PH);
      mesh.position.copy(pos);
      scene.add(mesh);
      players.push({ mesh, pos, vel: new THREE.Vector3(), team: "away", role: f.role, home: pos.clone() });
    });

    // Ball
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    );
    ball.castShadow = true;
    ball.position.set(0, 0.5, 0);
    scene.add(ball);

    // Control indicator ring (under controlled player)
    const indicatorGeo = new THREE.RingGeometry(1.0, 1.3, 32);
    const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    indicator.rotation.x = -Math.PI / 2;
    indicator.position.y = 0.05;
    scene.add(indicator);

    stateRef.current = {
      players,
      ball: { mesh: ball, pos: new THREE.Vector3(0, 0.5, 0), vel: new THREE.Vector3(), owner: null },
      controlIdx: 4,
      keys: {},
      score: { home: 0, away: 0 },
      paused: false,
      lastShoot: 0, lastPass: 0, lastSwitch: 0,
      camera,
      indicator,
    };

    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      stateRef.current.keys[k] = true;
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => { stateRef.current.keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    setTimeout(() => setMessage(null), 1500);

    const timer = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          clearInterval(timer);
          stateRef.current.paused = true;
          setMessage("FULL TIME");
          setTimeout(() => onEnd(stateRef.current.score), 1200);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetPositions(kickoff: "home" | "away") {
    const s = stateRef.current;
    s.players.forEach((p) => { p.pos.copy(p.home); p.vel.set(0, 0, 0); });
    s.ball.pos.set(0, 0.5, 0);
    s.ball.vel.set(0, 0, 0);
    s.ball.owner = kickoff === "home" ? 4 : 10;
  }

  function doPass(s: typeof stateRef.current) {
    s.lastPass = performance.now();
    const owner = s.players[s.ball.owner!];
    let best = -1, bd = Infinity;
    s.players.forEach((p, i) => {
      if (p.team !== "home" || i === s.ball.owner) return;
      const d = p.pos.distanceTo(owner.pos);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    const t = s.players[best];
    const dir = new THREE.Vector3().subVectors(t.pos, owner.pos).setY(0).normalize();
    s.ball.vel.set(dir.x * 25, 0, dir.z * 25);
    s.ball.owner = null;
    s.controlIdx = best;
  }

  function step(dt: number) {
    const s = stateRef.current;
    if (s.paused) return;
    const k = s.keys;

    // Switch
    if (k["s"] && performance.now() - s.lastSwitch > 250) {
      s.lastSwitch = performance.now();
      let best = 1, bd = Infinity;
      s.players.forEach((p, i) => {
        if (p.team !== "home" || p.role === "GK") return;
        const d = p.pos.distanceToSquared(s.ball.pos);
        if (d < bd) { bd = d; best = i; }
      });
      s.controlIdx = best;
    }

    // Move controlled
    const cp = s.players[s.controlIdx];
    let dx = 0, dz = 0;
    if (k["arrowleft"]) dx -= 1;
    if (k["arrowright"]) dx += 1;
    if (k["arrowup"]) dz -= 1;
    if (k["arrowdown"]) dz += 1;
    const speed = 11;
    if (dx || dz) {
      const m = Math.hypot(dx, dz);
      cp.vel.x = (dx / m) * speed;
      cp.vel.z = (dz / m) * speed;
      // face direction
      cp.mesh.rotation.y = Math.atan2(dx, dz);
    } else {
      cp.vel.x *= 0.6; cp.vel.z *= 0.6;
    }

    // AI for others
    s.players.forEach((p, i) => {
      if (i === s.controlIdx) return;
      const aggressive = (p.team === "home") === (s.ball.pos.x < 0) ? 0.7 : 0.4;
      const tx = p.home.x * (1 - aggressive * 0.5) + s.ball.pos.x * aggressive * 0.5;
      const tz = p.home.z * (1 - aggressive * 0.7) + s.ball.pos.z * aggressive * 0.7;
      p.vel.x += (tx - p.pos.x) * 0.6 * dt;
      p.vel.z += (tz - p.pos.z) * 0.6 * dt;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      const max = p.role === "GK" ? 5 : 8;
      if (sp > max) { p.vel.x = (p.vel.x / sp) * max; p.vel.z = (p.vel.z / sp) * max; }
      p.vel.x *= 0.9; p.vel.z *= 0.9;
      if (Math.abs(p.vel.x) + Math.abs(p.vel.z) > 0.5) {
        p.mesh.rotation.y = Math.atan2(p.vel.x, p.vel.z);
      }
    });

    // Apply
    s.players.forEach((p) => {
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      p.pos.x = Math.max(-PW / 2 + 1, Math.min(PW / 2 - 1, p.pos.x));
      p.pos.z = Math.max(-PH / 2 + 1, Math.min(PH / 2 - 1, p.pos.z));
      p.mesh.position.set(p.pos.x, 0, p.pos.z);
    });

    // Ball
    if (s.ball.owner !== null) {
      const owner = s.players[s.ball.owner];
      const dir = owner.team === "home" ? 1 : -1;
      const ang = owner.mesh.rotation.y;
      s.ball.pos.x = owner.pos.x + Math.sin(ang) * 1.2 * (dir > 0 ? 1 : 1);
      s.ball.pos.z = owner.pos.z + Math.cos(ang) * 1.2 * (dir > 0 ? 1 : 1);
      // fallback: keep slightly forward in attack direction
      s.ball.pos.x = owner.pos.x + dir * 1.2;
      s.ball.pos.z = owner.pos.z;
      s.ball.pos.y = 0.5;
      s.ball.vel.set(0, 0, 0);
    } else {
      s.ball.pos.x += s.ball.vel.x * dt;
      s.ball.pos.z += s.ball.vel.z * dt;
      s.ball.vel.multiplyScalar(0.985);
      // pickup
      for (let i = 0; i < s.players.length; i++) {
        const p = s.players[i];
        if (Math.hypot(p.pos.x - s.ball.pos.x, p.pos.z - s.ball.pos.z) < 1.3) {
          s.ball.owner = i;
          if (p.team === "home") s.controlIdx = i;
          break;
        }
      }
      // walls (side lines bounce)
      if (s.ball.pos.z < -PH / 2 + 0.5 || s.ball.pos.z > PH / 2 - 0.5) {
        s.ball.vel.z *= -0.6;
        s.ball.pos.z = Math.max(-PH / 2 + 0.5, Math.min(PH / 2 - 0.5, s.ball.pos.z));
      }
    }
    s.ball.mesh.position.copy(s.ball.pos);
    s.ball.mesh.rotation.x += s.ball.vel.z * 0.05;
    s.ball.mesh.rotation.z -= s.ball.vel.x * 0.05;

    // Shoot
    if (k["d"] && s.ball.owner !== null && s.players[s.ball.owner].team === "home" && performance.now() - s.lastShoot > 400) {
      s.lastShoot = performance.now();
      const shooter = s.players[s.ball.owner];
      const targetX = PW / 2;
      const targetZ = (Math.random() - 0.5) * GOAL_W * 0.8;
      const dir = new THREE.Vector3(targetX - shooter.pos.x, 0, targetZ - shooter.pos.z).normalize();
      s.ball.vel.set(dir.x * 40, 0, dir.z * 40);
      s.ball.owner = null;
    }
    // Pass
    if ((k["a"] || k[" "]) && s.ball.owner !== null && s.players[s.ball.owner].team === "home" && performance.now() - s.lastPass > 300) {
      doPass(s);
    }

    // AI away actions
    if (s.ball.owner !== null) {
      const owner = s.players[s.ball.owner];
      if (owner.team === "away") {
        if (owner.pos.x < -PW / 4 && Math.random() < 0.04) {
          const dir = new THREE.Vector3(-PW / 2 - owner.pos.x, 0, (Math.random() - 0.5) * GOAL_W - owner.pos.z).normalize();
          s.ball.vel.set(dir.x * 35, 0, dir.z * 35);
          s.ball.owner = null;
        } else if (Math.random() < 0.02) {
          let best = -1, bd = Infinity;
          s.players.forEach((p, i) => {
            if (p.team !== "away" || i === s.ball.owner) return;
            if (p.pos.x > owner.pos.x) return;
            const d = p.pos.distanceTo(owner.pos);
            if (d < bd && d > 5) { bd = d; best = i; }
          });
          if (best >= 0) {
            const t = s.players[best];
            const dir = new THREE.Vector3().subVectors(t.pos, owner.pos).normalize();
            s.ball.vel.set(dir.x * 22, 0, dir.z * 22);
            s.ball.owner = null;
          }
        }
      }
    }

    // Goals
    if (s.ball.pos.x >= PW / 2 - 0.5 && Math.abs(s.ball.pos.z) < GOAL_W / 2) {
      s.score.home++;
      setScore({ ...s.score });
      setMessage(`GOAL! ${home.short} ${s.score.home} - ${s.score.away} ${away.short}`);
      setTimeout(() => setMessage(null), 1600);
      resetPositions("away");
    } else if (s.ball.pos.x <= -PW / 2 + 0.5 && Math.abs(s.ball.pos.z) < GOAL_W / 2) {
      s.score.away++;
      setScore({ ...s.score });
      setMessage(`GOAL! ${home.short} ${s.score.home} - ${s.score.away} ${away.short}`);
      setTimeout(() => setMessage(null), 1600);
      resetPositions("home");
    } else if (Math.abs(s.ball.pos.x) > PW / 2 - 0.3) {
      s.ball.pos.x = Math.sign(s.ball.pos.x) * (PW / 2 - 1);
      s.ball.vel.set(0, 0, 0);
    }

    // Indicator under controlled player
    const cp2 = s.players[s.controlIdx];
    s.indicator.position.set(cp2.pos.x, 0.05, cp2.pos.z);

    // Camera follow (smooth)
    const targetCam = new THREE.Vector3(
      cp2.pos.x * 0.4,
      35,
      cp2.pos.z * 0.4 + 42,
    );
    s.camera.position.lerp(targetCam, 0.05);
    s.camera.lookAt(cp2.pos.x * 0.5, 0, cp2.pos.z * 0.5);
  }

  const mm = Math.floor(time / 60).toString().padStart(2, "0");
  const ss = (time % 60).toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="flex items-center gap-6 w-full max-w-[960px] bg-card rounded-lg px-6 py-3 border">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ background: home.primary }} />
          <span className="font-display text-2xl">{home.short}</span>
        </div>
        <div className="font-display text-4xl text-primary mx-auto">
          {score.home} - {score.away}
        </div>
        <div className="font-display text-xl text-muted-foreground">{mm}:{ss}</div>
        <div className="flex items-center gap-3 ml-auto">
          <span className="font-display text-2xl">{away.short}</span>
          <div className="w-4 h-4 rounded-full" style={{ background: away.primary }} />
        </div>
      </div>
      <div className="relative w-full max-w-[960px] aspect-[16/10] rounded-lg overflow-hidden border-2 border-border shadow-2xl">
        <div ref={mountRef} className="absolute inset-0" />
        {message && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 px-8 py-4 rounded-lg font-display text-4xl text-primary">
              {message}
            </div>
          </div>
        )}
      </div>
      <div className="text-sm text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 justify-center max-w-[960px]">
        <span><kbd className="px-2 py-0.5 bg-muted rounded">Arrows</kbd> Move</span>
        <span><kbd className="px-2 py-0.5 bg-muted rounded">A</kbd> / <kbd className="px-2 py-0.5 bg-muted rounded">Space</kbd> Pass</span>
        <span><kbd className="px-2 py-0.5 bg-muted rounded">D</kbd> Shoot</span>
        <span><kbd className="px-2 py-0.5 bg-muted rounded">S</kbd> Switch Player</span>
      </div>
    </div>
  );
}
