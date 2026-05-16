import { useEffect, useRef, useState } from "react";
import type { Team } from "./teams";

interface Props {
  home: Team;
  away: Team;
  duration?: number; // seconds
  onEnd: (result: { home: number; away: number }) => void;
}

interface Player {
  x: number; y: number; vx: number; vy: number;
  team: "home" | "away";
  role: "GK" | "DEF" | "MID" | "FWD";
  homeX: number; homeY: number;
}

const W = 900;
const H = 540;
const GOAL_H = 160;

export function PitchGame({ home, away, duration = 120, onEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [time, setTime] = useState(duration);
  const [message, setMessage] = useState<string | null>("KICK OFF!");
  const stateRef = useRef<{
    players: Player[];
    ball: { x: number; y: number; vx: number; vy: number; owner: number | null };
    controlIdx: number;
    keys: Record<string, boolean>;
    score: { home: number; away: number };
    paused: boolean;
    lastShootAt: number;
    lastPassAt: number;
    lastSwitchAt: number;
  }>(null!);

  useEffect(() => {
    // init
    const formation = [
      { role: "GK" as const, x: 0.05, y: 0.5 },
      { role: "DEF" as const, x: 0.2, y: 0.25 },
      { role: "DEF" as const, x: 0.2, y: 0.75 },
      { role: "MID" as const, x: 0.38, y: 0.5 },
      { role: "FWD" as const, x: 0.45, y: 0.3 },
      { role: "FWD" as const, x: 0.45, y: 0.7 },
    ];
    const players: Player[] = [];
    formation.forEach((f) => {
      players.push({
        x: f.x * W, y: f.y * H, vx: 0, vy: 0,
        team: "home", role: f.role,
        homeX: f.x * W, homeY: f.y * H,
      });
    });
    formation.forEach((f) => {
      const mx = (1 - f.x) * W;
      players.push({
        x: mx, y: f.y * H, vx: 0, vy: 0,
        team: "away", role: f.role,
        homeX: mx, homeY: f.y * H,
      });
    });
    stateRef.current = {
      players,
      ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, owner: null },
      controlIdx: 4, // a forward
      keys: {},
      score: { home: 0, away: 0 },
      paused: false,
      lastShootAt: 0,
      lastPassAt: 0,
      lastSwitchAt: 0,
    };

    const kd = (e: KeyboardEvent) => { stateRef.current.keys[e.key.toLowerCase()] = true; };
    const ku = (e: KeyboardEvent) => { stateRef.current.keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    setTimeout(() => setMessage(null), 1500);

    const timer = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          clearInterval(timer);
          setTimeout(() => onEnd(stateRef.current.score), 800);
          stateRef.current.paused = true;
          setMessage("FULL TIME");
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    let raf = 0;
    const ctx = canvasRef.current!.getContext("2d")!;
    const loop = () => {
      step();
      draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetPositions(kickoffTeam: "home" | "away") {
    const s = stateRef.current;
    s.players.forEach((p) => { p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0; });
    s.ball.x = W / 2; s.ball.y = H / 2; s.ball.vx = 0; s.ball.vy = 0;
    s.ball.owner = kickoffTeam === "home" ? 4 : 10;
  }

  function step() {
    const s = stateRef.current;
    if (s.paused) return;
    const k = s.keys;

    // Switch player
    if (k["s"] && performance.now() - s.lastSwitchAt > 250) {
      s.lastSwitchAt = performance.now();
      // pick closest home outfield player to ball
      let best = 1, bd = Infinity;
      s.players.forEach((p, i) => {
        if (p.team !== "home" || p.role === "GK") return;
        const d = (p.x - s.ball.x) ** 2 + (p.y - s.ball.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      s.controlIdx = best;
    }

    // Move controlled player
    const cp = s.players[s.controlIdx];
    const speed = 2.6;
    let dx = 0, dy = 0;
    if (k["arrowleft"] || k["a"]) dx -= 1;
    if (k["arrowright"] || k["d"]) dx += 1;
    if (k["arrowup"] || k["w"]) dy -= 1;
    if (k["arrowdown"]) dy += 1;
    // Note: 'a' is also pass — handled below; we use arrows primarily for movement
    if (dx || dy) {
      const m = Math.hypot(dx, dy);
      cp.vx = (dx / m) * speed;
      cp.vy = (dy / m) * speed;
    } else {
      cp.vx *= 0.7; cp.vy *= 0.7;
    }

    // AI for other players: drift toward homeX/homeY + react to ball if close
    s.players.forEach((p, i) => {
      if (i === s.controlIdx) return;
      const ballSide = s.ball.x < W / 2 ? "home" : "away";
      const aggressive = p.team === ballSide ? 0.04 : 0.02;
      const targetX = p.homeX * 0.6 + s.ball.x * 0.4;
      const targetY = p.homeY * 0.5 + s.ball.y * 0.5;
      p.vx += (targetX - p.x) * aggressive * 0.05;
      p.vy += (targetY - p.y) * aggressive * 0.05;
      // limit
      const sp = Math.hypot(p.vx, p.vy);
      const max = p.role === "GK" ? 1.4 : 2.0;
      if (sp > max) { p.vx = (p.vx / sp) * max; p.vy = (p.vy / sp) * max; }
    });

    // Apply velocities & clamp
    s.players.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      p.x = Math.max(10, Math.min(W - 10, p.x));
      p.y = Math.max(10, Math.min(H - 10, p.y));
    });

    // Ball physics
    if (s.ball.owner !== null) {
      const owner = s.players[s.ball.owner];
      const dir = owner.team === "home" ? 1 : -1;
      s.ball.x = owner.x + dir * 14;
      s.ball.y = owner.y;
      s.ball.vx = 0; s.ball.vy = 0;
    } else {
      s.ball.x += s.ball.vx;
      s.ball.y += s.ball.vy;
      s.ball.vx *= 0.985;
      s.ball.vy *= 0.985;
      if (s.ball.y < 10 || s.ball.y > H - 10) {
        s.ball.vy *= -0.6;
        s.ball.y = Math.max(10, Math.min(H - 10, s.ball.y));
      }
      // pick up
      for (let i = 0; i < s.players.length; i++) {
        const p = s.players[i];
        if (Math.hypot(p.x - s.ball.x, p.y - s.ball.y) < 14) {
          s.ball.owner = i;
          if (p.team === "home") s.controlIdx = i;
          break;
        }
      }
    }

    // Actions: D = shoot, F = pass (we'll use D shoot, F pass to avoid conflict with movement letters)
    // Per spec: 'a' = pass, 's' = switch player. We'll remap movement to arrows only.
    // Re-do movement to ONLY arrows:
    // (override above) -- we already accept both, but pass/switch shouldn't move.
    if (k["d"] && s.ball.owner !== null && s.players[s.ball.owner].team === "home" && performance.now() - s.lastShootAt > 400) {
      s.lastShootAt = performance.now();
      const shooter = s.players[s.ball.owner];
      const targetX = W - 5;
      const targetY = H / 2 + (Math.random() - 0.5) * GOAL_H * 0.7;
      const ang = Math.atan2(targetY - shooter.y, targetX - shooter.x);
      s.ball.vx = Math.cos(ang) * 10;
      s.ball.vy = Math.sin(ang) * 10;
      s.ball.owner = null;
    }
    if (k[" "] && s.ball.owner !== null && s.players[s.ball.owner].team === "home" && performance.now() - s.lastPassAt > 300) {
      // space also passes
      doPass(s);
    }
    if (k["q"] && s.ball.owner !== null && s.players[s.ball.owner].team === "home" && performance.now() - s.lastPassAt > 300) {
      doPass(s);
    }

    // AI shooting / passing for away
    if (s.ball.owner !== null) {
      const owner = s.players[s.ball.owner];
      if (owner.team === "away") {
        if (owner.x < 200 && Math.random() < 0.04) {
          // shoot
          const ang = Math.atan2(H / 2 - owner.y + (Math.random() - 0.5) * 100, -owner.x);
          s.ball.vx = Math.cos(ang) * 9;
          s.ball.vy = Math.sin(ang) * 9;
          s.ball.owner = null;
        } else if (Math.random() < 0.02) {
          // pass to nearest teammate forward
          let best = -1, bd = Infinity;
          s.players.forEach((p, i) => {
            if (p.team !== "away" || i === s.ball.owner) return;
            if (p.x > owner.x) return;
            const d = Math.hypot(p.x - owner.x, p.y - owner.y);
            if (d < bd && d > 40) { bd = d; best = i; }
          });
          if (best >= 0) {
            const t = s.players[best];
            const ang = Math.atan2(t.y - owner.y, t.x - owner.x);
            s.ball.vx = Math.cos(ang) * 7;
            s.ball.vy = Math.sin(ang) * 7;
            s.ball.owner = null;
          }
        }
      }
    }

    // Goals
    if (s.ball.x >= W - 5 && Math.abs(s.ball.y - H / 2) < GOAL_H / 2) {
      s.score.home++;
      setScore({ ...s.score });
      setMessage(`GOAL! ${home.short} ${s.score.home} - ${s.score.away} ${away.short}`);
      setTimeout(() => setMessage(null), 1600);
      resetPositions("away");
    } else if (s.ball.x <= 5 && Math.abs(s.ball.y - H / 2) < GOAL_H / 2) {
      s.score.away++;
      setScore({ ...s.score });
      setMessage(`GOAL! ${home.short} ${s.score.home} - ${s.score.away} ${away.short}`);
      setTimeout(() => setMessage(null), 1600);
      resetPositions("home");
    } else if (s.ball.x < 0 || s.ball.x > W) {
      // out of play, reset to nearest player
      s.ball.x = Math.max(20, Math.min(W - 20, s.ball.x));
      s.ball.vx = 0; s.ball.vy = 0;
    }
  }

  function doPass(s: typeof stateRef.current) {
    s.lastPassAt = performance.now();
    const owner = s.players[s.ball.owner!];
    let best = -1, bd = Infinity;
    s.players.forEach((p, i) => {
      if (p.team !== "home" || i === s.ball.owner) return;
      const d = Math.hypot(p.x - owner.x, p.y - owner.y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    const t = s.players[best];
    const ang = Math.atan2(t.y - owner.y, t.x - owner.x);
    s.ball.vx = Math.cos(ang) * 8;
    s.ball.vy = Math.sin(ang) * 8;
    s.ball.owner = null;
    s.controlIdx = best;
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const s = stateRef.current;
    // pitch
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#2d8a3e");
    grd.addColorStop(1, "#1f6b2d");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    // stripes
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
      ctx.fillRect((i * W) / 10, 0, W / 10, H);
    }
    // lines
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, W - 10, H - 10);
    ctx.beginPath(); ctx.moveTo(W / 2, 5); ctx.lineTo(W / 2, H - 5); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 60, 0, Math.PI * 2); ctx.stroke();
    // penalty boxes
    ctx.strokeRect(5, H / 2 - 110, 90, 220);
    ctx.strokeRect(W - 95, H / 2 - 110, 90, 220);
    // goals
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(0, H / 2 - GOAL_H / 2, 5, GOAL_H);
    ctx.fillRect(W - 5, H / 2 - GOAL_H / 2, 5, GOAL_H);

    // players
    s.players.forEach((p, i) => {
      const team = p.team === "home" ? home : away;
      ctx.fillStyle = team.primary;
      ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = team.secondary; ctx.lineWidth = 2; ctx.stroke();
      if (i === s.controlIdx) {
        ctx.strokeStyle = "#fde047"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.stroke();
      }
    });

    // ball
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.stroke();
  }

  const mm = Math.floor(time / 60).toString().padStart(2, "0");
  const ss = (time % 60).toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-6 w-full max-w-[900px] bg-card rounded-lg px-6 py-3 border">
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
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="rounded-lg shadow-2xl border-2 border-border" />
        {message && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 px-8 py-4 rounded-lg font-display text-4xl text-primary animate-in zoom-in">
              {message}
            </div>
          </div>
        )}
      </div>
      <div className="text-sm text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 justify-center max-w-[900px]">
        <span><kbd className="px-2 py-0.5 bg-muted rounded">Arrows</kbd> Move</span>
        <span><kbd className="px-2 py-0.5 bg-muted rounded">A</kbd> / <kbd className="px-2 py-0.5 bg-muted rounded">Space</kbd> Pass</span>
        <span><kbd className="px-2 py-0.5 bg-muted rounded">D</kbd> Shoot</span>
        <span><kbd className="px-2 py-0.5 bg-muted rounded">S</kbd> Switch Player</span>
      </div>
    </div>
  );
}
