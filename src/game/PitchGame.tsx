import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Team } from "./teams";

interface Props {
  home: Team;
  away: Team;
  duration?: number;
  onEnd: (result: { home: number; away: number }) => void;
}

const PW = 90;
const PH = 56;
const GOAL_W = 14;

interface Player {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  team: "home" | "away";
  role: "GK" | "DEF" | "MID" | "FWD";
  home: THREE.Vector3;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  walkPhase: number;
  celebrate: number; // seconds remaining
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
    passAim: THREE.Group;
    shotAim: THREE.Group;
    passTargetIdx: number | null;
    cameraShake: number;
    celebration: number; // overall celebration timer
  }>(null!);

  useEffect(() => {
    const mount = mountRef.current!;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();

    // Sky gradient background via canvas
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 16; skyCanvas.height = 256;
    const sctx = skyCanvas.getContext("2d")!;
    const grad = sctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#0a1428");
    grad.addColorStop(0.5, "#1e3a5f");
    grad.addColorStop(1, "#4a6a8a");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 16, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    scene.background = skyTex;
    scene.fog = new THREE.Fog(0x1e3a5f, 100, 260);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 600);
    camera.position.set(0, 45, 55);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(40, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    scene.add(sun);

    // Floodlights at 4 corners
    const flPositions = [
      [-PW / 2 - 18, PH / 2 + 18],
      [PW / 2 + 18, PH / 2 + 18],
      [-PW / 2 - 18, -PH / 2 - 18],
      [PW / 2 + 18, -PH / 2 - 18],
    ];
    flPositions.forEach(([x, z]) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 28),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }),
      );
      pole.position.set(x, 14, z);
      pole.castShadow = true;
      scene.add(pole);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1.2, 2.5),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2cc, emissiveIntensity: 0.8 }),
      );
      head.position.set(x, 28, z);
      scene.add(head);
      const sl = new THREE.SpotLight(0xfff5d6, 0.9, 200, Math.PI / 4, 0.5, 1);
      sl.position.set(x, 28, z);
      sl.target.position.set(0, 0, 0);
      scene.add(sl);
      scene.add(sl.target);
    });

    // Pitch stripes
    const stripeCount = 14;
    for (let i = 0; i < stripeCount; i++) {
      const w = PW / stripeCount;
      const geo = new THREE.PlaneGeometry(w, PH);
      const mat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x2fa645 : 0x247a36,
        roughness: 0.85,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.x = -PW / 2 + w / 2 + i * w;
      m.receiveShadow = true;
      scene.add(m);
    }

    // Outer ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 300),
      new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // Pitch lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const addLine = (pts: THREE.Vector3[]) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(g, lineMat));
    };
    const y = 0.02;
    addLine([
      new THREE.Vector3(-PW / 2, y, -PH / 2),
      new THREE.Vector3(PW / 2, y, -PH / 2),
      new THREE.Vector3(PW / 2, y, PH / 2),
      new THREE.Vector3(-PW / 2, y, PH / 2),
      new THREE.Vector3(-PW / 2, y, -PH / 2),
    ]);
    addLine([new THREE.Vector3(0, y, -PH / 2), new THREE.Vector3(0, y, PH / 2)]);
    const circlePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      circlePts.push(new THREE.Vector3(Math.cos(a) * 8, y, Math.sin(a) * 8));
    }
    addLine(circlePts);
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
    const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, opacity: 0.3, transparent: true, side: THREE.DoubleSide });
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
      const net = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 5), netMat);
      net.position.set(x + s * 2.5, 2.5, 0);
      net.rotation.y = (s * Math.PI) / 2;
      scene.add(net);
      const netTop = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 2.5), netMat);
      netTop.position.set(x + s * 1.25, 5, 0);
      netTop.rotation.x = -Math.PI / 2;
      scene.add(netTop);
    });

    // Crowd texture (procedural)
    const crowdCanvas = document.createElement("canvas");
    crowdCanvas.width = 256; crowdCanvas.height = 64;
    const cctx = crowdCanvas.getContext("2d")!;
    cctx.fillStyle = "#0a0a0a";
    cctx.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 1800; i++) {
      const palette = ["#c0392b", "#2980b9", "#f1c40f", "#27ae60", "#ecf0f1", "#8e44ad", "#e67e22"];
      cctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      cctx.fillRect(Math.random() * 256, Math.random() * 64, 2 + Math.random() * 2, 2 + Math.random() * 2);
    }
    const crowdTex = new THREE.CanvasTexture(crowdCanvas);
    crowdTex.wrapS = THREE.RepeatWrapping;

    // Stadium stands (sloped) with crowd
    const buildStand = (cx: number, cz: number, length: number, depth: number, alongX: boolean) => {
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x222a2f, roughness: 0.95 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(alongX ? length : depth, 2, alongX ? depth : length), baseMat);
      base.position.set(cx, 1, cz);
      base.receiveShadow = true;
      scene.add(base);
      // Tiered crowd plane
      const tier = new THREE.Mesh(
        new THREE.PlaneGeometry(length, 14),
        new THREE.MeshStandardMaterial({ map: crowdTex.clone(), roughness: 1 }),
      );
      (tier.material as THREE.MeshStandardMaterial).map!.repeat.set(length / 12, 1);
      (tier.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
      tier.position.set(cx, 8, cz);
      if (alongX) {
        tier.rotation.x = (cz > 0 ? 1 : -1) * (Math.PI / 2.4);
        tier.position.z = cz + (cz > 0 ? -2 : 2);
      } else {
        tier.rotation.y = cx > 0 ? -Math.PI / 2 : Math.PI / 2;
        tier.rotation.x = (Math.PI / 2.4);
        tier.position.x = cx + (cx > 0 ? -2 : 2);
      }
      scene.add(tier);
      // Roof
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? length + 4 : depth + 2, 0.6, alongX ? depth + 2 : length + 4),
        new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.7 }),
      );
      roof.position.set(cx, 16, cz);
      roof.castShadow = true;
      scene.add(roof);
    };
    buildStand(0, -PH / 2 - 14, PW + 40, 14, true);
    buildStand(0, PH / 2 + 14, PW + 40, 14, true);
    buildStand(-PW / 2 - 14, 0, PH + 14, 14, false);
    buildStand(PW / 2 + 14, 0, PH + 14, 14, false);

    // Scoreboard above one stand
    const scoreboard = new THREE.Mesh(
      new THREE.BoxGeometry(24, 6, 1),
      new THREE.MeshStandardMaterial({ color: 0x0b0b0b, emissive: 0x1a1a1a }),
    );
    scoreboard.position.set(0, 22, -PH / 2 - 14);
    scene.add(scoreboard);

    // Player builder with animatable legs
    const makePlayer = (color: string, secondary: string) => {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.6 });
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.6, 12), bodyMat);
      torso.position.y = 1.5;
      torso.castShadow = true;
      g.add(torso);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xf0c090, roughness: 0.7 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), headMat);
      head.position.y = 2.6;
      head.castShadow = true;
      g.add(head);
      const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(secondary), roughness: 0.7 });
      const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 8), legMat);
      legL.position.set(0.25, 0.5, 0);
      legL.castShadow = true;
      g.add(legL);
      const legR = legL.clone();
      legR.position.x = -0.25;
      g.add(legR);
      return { group: g, legL, legR: legR as THREE.Mesh };
    };

    const formation = [
      { role: "GK" as const, x: -0.46, z: 0 },
      { role: "DEF" as const, x: -0.32, z: -0.22 },
      { role: "DEF" as const, x: -0.32, z: 0.22 },
      { role: "MID" as const, x: -0.12, z: 0 },
      { role: "FWD" as const, x: -0.05, z: -0.18 },
      { role: "FWD" as const, x: -0.05, z: 0.18 },
    ];
    const players: Player[] = [];
    formation.forEach((f) => {
      const { group, legL, legR } = makePlayer(home.primary, home.secondary);
      const pos = new THREE.Vector3(f.x * PW, 0, f.z * PH);
      group.position.copy(pos);
      scene.add(group);
      players.push({ mesh: group, pos, vel: new THREE.Vector3(), team: "home", role: f.role, home: pos.clone(), legL, legR, walkPhase: 0, celebrate: 0 });
    });
    formation.forEach((f) => {
      const { group, legL, legR } = makePlayer(away.primary, away.secondary);
      const pos = new THREE.Vector3(-f.x * PW, 0, f.z * PH);
      group.position.copy(pos);
      group.rotation.y = Math.PI;
      scene.add(group);
      players.push({ mesh: group, pos, vel: new THREE.Vector3(), team: "away", role: f.role, home: pos.clone(), legL, legR, walkPhase: 0, celebrate: 0 });
    });

    // Ball
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    );
    ball.castShadow = true;
    ball.position.set(0, 0.5, 0);
    scene.add(ball);

    // Control indicator
    const indicator = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.3, 32),
      new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    indicator.rotation.x = -Math.PI / 2;
    indicator.position.y = 0.05;
    scene.add(indicator);

    // Aim HUD: pass aim (cyan) and shot aim (red) — built as flat arrow groups
    const buildAimArrow = (color: number) => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 0.4),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      shaft.rotation.x = -Math.PI / 2;
      shaft.position.x = 0.5;
      g.add(shaft);
      const head = new THREE.Mesh(
        new THREE.CircleGeometry(0.9, 3),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
      );
      head.rotation.x = -Math.PI / 2;
      head.rotation.z = -Math.PI / 2;
      g.add(head);
      g.position.y = 0.08;
      g.visible = false;
      return g;
    };
    const passAim = buildAimArrow(0x22d3ee);
    const shotAim = buildAimArrow(0xef4444);
    scene.add(passAim);
    scene.add(shotAim);

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
      passAim,
      shotAim,
      passTargetIdx: null,
      cameraShake: 0,
      celebration: 0,
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

  function findPassTarget(s: typeof stateRef.current, team: "home" | "away") {
    const ownerIdx = s.ball.owner!;
    const owner = s.players[ownerIdx];
    const attackDir = team === "home" ? 1 : -1;
    let best = -1, bestScore = -Infinity;
    s.players.forEach((p, i) => {
      if (p.team !== team || i === ownerIdx) return;
      const dx = p.pos.x - owner.pos.x;
      const dz = p.pos.z - owner.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4 || dist > 40) return;
      // prefer forward teammates
      const forward = dx * attackDir;
      const sc = forward * 1.5 - dist * 0.4;
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    return best;
  }

  function doPass(s: typeof stateRef.current) {
    s.lastPass = performance.now();
    const owner = s.players[s.ball.owner!];
    const best = s.passTargetIdx ?? findPassTarget(s, owner.team);
    if (best < 0) return;
    const t = s.players[best];
    const dir = new THREE.Vector3().subVectors(t.pos, owner.pos).setY(0).normalize();
    s.ball.vel.set(dir.x * 28, 0, dir.z * 28);
    s.ball.owner = null;
    if (owner.team === "home") s.controlIdx = best;
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
    const speed = 12;
    if (dx || dz) {
      const m = Math.hypot(dx, dz);
      cp.vel.x = (dx / m) * speed;
      cp.vel.z = (dz / m) * speed;
      cp.mesh.rotation.y = Math.atan2(dx, dz);
    } else {
      cp.vel.x *= 0.6; cp.vel.z *= 0.6;
    }

    // AI for others (smarter — opponents press, attack, mark)
    s.players.forEach((p, i) => {
      if (i === s.controlIdx && p.team === "home") return;
      const attackX = p.team === "home" ? PW / 2 : -PW / 2;
      const hasBall = s.ball.owner === i;
      const ourPossession = s.ball.owner !== null && s.players[s.ball.owner].team === p.team;
      let tx: number, tz: number;
      if (hasBall) {
        // dribble toward goal
        tx = attackX * 0.95;
        tz = s.ball.pos.z * 0.7;
      } else if (ourPossession) {
        // make supporting run
        tx = p.home.x + (attackX - p.home.x) * 0.35;
        tz = p.home.z * 0.7 + (Math.sin(performance.now() * 0.001 + i) * 4);
      } else {
        // defend / press
        const press = p.role === "FWD" ? 0.3 : p.role === "MID" ? 0.5 : p.role === "DEF" ? 0.6 : 0.2;
        tx = p.home.x * (1 - press) + s.ball.pos.x * press;
        tz = p.home.z * (1 - press) + s.ball.pos.z * press;
      }
      // GK behavior overrides above — actively tracks/saves ball
      if (p.role === "GK") {
        const goalX = p.team === "home" ? -PW / 2 : PW / 2;
        // predict ball's z when it reaches goal line
        const bvx = s.ball.vel.x;
        let predZ = s.ball.pos.z;
        if (Math.abs(bvx) > 1) {
          const t = (goalX - s.ball.pos.x) / bvx;
          if (t > 0 && t < 1.5) {
            predZ = s.ball.pos.z + s.ball.vel.z * t;
          }
        }
        // clamp within goal mouth + a bit
        const gW = GOAL_W / 2 + 1.5;
        tz = Math.max(-gW, Math.min(gW, predZ));
        // come off the line slightly when ball is close, hug line when far
        const ballDist = Math.abs(s.ball.pos.x - goalX);
        const offLine = Math.max(0, Math.min(3.5, 6 - ballDist * 0.15));
        tx = goalX + (p.team === "home" ? offLine : -offLine);
        // diving lunge: extra acceleration when ball is incoming fast
        const incoming = (p.team === "home" && bvx < -6) || (p.team === "away" && bvx > 6);
        const urgency = incoming && ballDist < 25 ? 3.2 : 1.6;
        p.vel.x += (tx - p.pos.x) * urgency * dt * 3;
        p.vel.z += (tz - p.pos.z) * urgency * dt * 3;
        const gsp = Math.hypot(p.vel.x, p.vel.z);
        const gmax = incoming ? 14 : 8;
        if (gsp > gmax) { p.vel.x = (p.vel.x / gsp) * gmax; p.vel.z = (p.vel.z / gsp) * gmax; }
        p.vel.x *= 0.9; p.vel.z *= 0.9;
        if (gsp > 0.5) p.mesh.rotation.y = Math.atan2(p.vel.x, p.vel.z);
        return;
      }
      p.vel.x += (tx - p.pos.x) * 0.9 * dt;
      p.vel.z += (tz - p.pos.z) * 0.9 * dt;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      const max = p.role === "GK" ? 6 : p.role === "FWD" ? 10 : 9;
      if (sp > max) { p.vel.x = (p.vel.x / sp) * max; p.vel.z = (p.vel.z / sp) * max; }
      p.vel.x *= 0.92; p.vel.z *= 0.92;
      if (Math.abs(p.vel.x) + Math.abs(p.vel.z) > 0.5) {
        p.mesh.rotation.y = Math.atan2(p.vel.x, p.vel.z);
      }
    });

    // Apply movement + leg animation + celebration
    s.players.forEach((p) => {
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      p.pos.x = Math.max(-PW / 2 + 1, Math.min(PW / 2 - 1, p.pos.x));
      p.pos.z = Math.max(-PH / 2 + 1, Math.min(PH / 2 - 1, p.pos.z));
      const sp = Math.hypot(p.vel.x, p.vel.z);
      p.walkPhase += sp * dt * 1.2;
      const swing = Math.sin(p.walkPhase * 3) * Math.min(0.6, sp * 0.08);
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
      // celebration hop
      let yOff = 0;
      if (p.celebrate > 0) {
        p.celebrate -= dt;
        yOff = Math.abs(Math.sin(p.celebrate * 10)) * 1.4;
        p.mesh.rotation.y += dt * 4;
      }
      p.mesh.position.set(p.pos.x, yOff, p.pos.z);
    });

    // Ball
    if (s.ball.owner !== null) {
      const owner = s.players[s.ball.owner];
      const dir = owner.team === "home" ? 1 : -1;
      s.ball.pos.x = owner.pos.x + dir * 1.1;
      s.ball.pos.z = owner.pos.z;
      s.ball.pos.y = 0.5;
      s.ball.vel.set(0, 0, 0);
    } else {
      s.ball.pos.x += s.ball.vel.x * dt;
      s.ball.pos.z += s.ball.vel.z * dt;
      s.ball.vel.multiplyScalar(0.985);
      for (let i = 0; i < s.players.length; i++) {
        const p = s.players[i];
        if (Math.hypot(p.pos.x - s.ball.pos.x, p.pos.z - s.ball.pos.z) < 1.3) {
          s.ball.owner = i;
          if (p.team === "home") s.controlIdx = i;
          break;
        }
      }
      if (s.ball.pos.z < -PH / 2 + 0.5 || s.ball.pos.z > PH / 2 - 0.5) {
        s.ball.vel.z *= -0.6;
        s.ball.pos.z = Math.max(-PH / 2 + 0.5, Math.min(PH / 2 - 0.5, s.ball.pos.z));
      }
    }
    s.ball.mesh.position.copy(s.ball.pos);
    s.ball.mesh.rotation.x += s.ball.vel.z * 0.05;
    s.ball.mesh.rotation.z -= s.ball.vel.x * 0.05;

    // Aim HUD — show when home controls ball
    const homeHasBall = s.ball.owner !== null && s.players[s.ball.owner].team === "home";
    if (homeHasBall) {
      const owner = s.players[s.ball.owner!];
      // pass aim
      const ti = findPassTarget(s, "home");
      s.passTargetIdx = ti;
      if (ti >= 0) {
        const t = s.players[ti];
        const ddx = t.pos.x - owner.pos.x;
        const ddz = t.pos.z - owner.pos.z;
        const len = Math.hypot(ddx, ddz);
        s.passAim.visible = true;
        s.passAim.position.set(owner.pos.x, 0.08, owner.pos.z);
        s.passAim.rotation.y = Math.atan2(ddx, ddz) - Math.PI / 2;
        s.passAim.scale.set(len * 0.95, 1, 1);
      } else {
        s.passAim.visible = false;
      }
      // shot aim: toward right goal center
      const gx = PW / 2, gz = 0;
      const sdx = gx - owner.pos.x, sdz = gz - owner.pos.z;
      const slen = Math.hypot(sdx, sdz);
      s.shotAim.visible = true;
      s.shotAim.position.set(owner.pos.x, 0.09, owner.pos.z);
      s.shotAim.rotation.y = Math.atan2(sdx, sdz) - Math.PI / 2;
      s.shotAim.scale.set(Math.min(slen * 0.6, 28), 1, 1);
    } else {
      s.passAim.visible = false;
      s.shotAim.visible = false;
      s.passTargetIdx = null;
    }

    // Shoot
    if (k["d"] && homeHasBall && performance.now() - s.lastShoot > 400) {
      s.lastShoot = performance.now();
      const shooter = s.players[s.ball.owner!];
      const targetX = PW / 2;
      const targetZ = (Math.random() - 0.5) * GOAL_W * 0.8;
      const dir = new THREE.Vector3(targetX - shooter.pos.x, 0, targetZ - shooter.pos.z).normalize();
      s.ball.vel.set(dir.x * 44, 0, dir.z * 44);
      s.ball.owner = null;
    }
    // Pass
    if ((k["a"] || k[" "]) && homeHasBall && performance.now() - s.lastPass > 300) {
      doPass(s);
    }

    // AI away actions
    if (s.ball.owner !== null) {
      const owner = s.players[s.ball.owner];
      if (owner.team === "away") {
        const distToGoal = Math.hypot(-PW / 2 - owner.pos.x, owner.pos.z);
        if (distToGoal < 28 && Math.random() < 0.05) {
          const targetZ = (Math.random() - 0.5) * GOAL_W * 0.7;
          const dir = new THREE.Vector3(-PW / 2 - owner.pos.x, 0, targetZ - owner.pos.z).normalize();
          s.ball.vel.set(dir.x * 42, 0, dir.z * 42);
          s.ball.owner = null;
        } else if (Math.random() < 0.025) {
          const best = findPassTarget(s, "away");
          if (best >= 0) {
            const t = s.players[best];
            const dir = new THREE.Vector3().subVectors(t.pos, owner.pos).normalize();
            s.ball.vel.set(dir.x * 26, 0, dir.z * 26);
            s.ball.owner = null;
          }
        }
      }
    }

    // Goals
    const triggerCelebration = (team: "home" | "away") => {
      s.celebration = 1.6;
      s.cameraShake = 0.6;
      s.players.forEach((p) => { if (p.team === team) p.celebrate = 1.6; });
    };
    if (s.ball.pos.x >= PW / 2 - 0.5 && Math.abs(s.ball.pos.z) < GOAL_W / 2) {
      s.score.home++;
      setScore({ ...s.score });
      setMessage(`GOAL! ${home.short} ${s.score.home} - ${s.score.away} ${away.short}`);
      triggerCelebration("home");
      setTimeout(() => setMessage(null), 1600);
      setTimeout(() => resetPositions("away"), 1500);
      s.ball.vel.set(0, 0, 0);
      s.ball.pos.x = PW / 2 - 0.6;
    } else if (s.ball.pos.x <= -PW / 2 + 0.5 && Math.abs(s.ball.pos.z) < GOAL_W / 2) {
      s.score.away++;
      setScore({ ...s.score });
      setMessage(`GOAL! ${home.short} ${s.score.home} - ${s.score.away} ${away.short}`);
      triggerCelebration("away");
      setTimeout(() => setMessage(null), 1600);
      setTimeout(() => resetPositions("home"), 1500);
      s.ball.vel.set(0, 0, 0);
      s.ball.pos.x = -PW / 2 + 0.6;
    } else if (Math.abs(s.ball.pos.x) > PW / 2 - 0.3) {
      s.ball.pos.x = Math.sign(s.ball.pos.x) * (PW / 2 - 1);
      s.ball.vel.set(0, 0, 0);
    }

    // Indicator
    const cp2 = s.players[s.controlIdx];
    s.indicator.position.set(cp2.pos.x, 0.05, cp2.pos.z);

    // Camera follow + shake
    const shakeX = s.cameraShake > 0 ? (Math.random() - 0.5) * s.cameraShake * 2 : 0;
    const shakeY = s.cameraShake > 0 ? (Math.random() - 0.5) * s.cameraShake : 0;
    if (s.cameraShake > 0) s.cameraShake = Math.max(0, s.cameraShake - dt * 1.2);
    const targetCam = new THREE.Vector3(
      cp2.pos.x * 0.4 + shakeX,
      35 + shakeY,
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
        {/* Aim legend HUD */}
        <div className="absolute top-3 left-3 flex flex-col gap-1 text-xs font-display tracking-wider bg-black/50 backdrop-blur px-3 py-2 rounded pointer-events-none">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: "#22d3ee" }} /> PASS AIM (A)</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: "#ef4444" }} /> SHOT AIM (D)</div>
        </div>
        {message && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 px-8 py-4 rounded-lg font-display text-4xl text-primary animate-scale-in">
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
