import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TEAMS, type Team } from "@/game/teams";
import { PitchGame } from "@/game/PitchGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Striker Arena — 2D Football PC Game" },
      { name: "description", content: "Pick a mode, pick your team, and play a fast-paced 2D football match in your browser." },
    ],
  }),
  component: Index,
});

type Screen =
  | { s: "menu" }
  | { s: "teamSelect"; mode: Mode; pick: "home" | "away"; home?: Team }
  | { s: "match"; mode: Mode; home: Team; away: Team; round: number; total: number; cupScore: { you: number; opp: number } }
  | { s: "result"; mode: Mode; home: Team; away: Team; score: { home: number; away: number }; round: number; total: number; cupScore: { you: number; opp: number } };

type Mode = "quick" | "career" | "tournament" | "vs";

function Index() {
  const [screen, setScreen] = useState<Screen>({ s: "menu" });

  if (screen.s === "menu") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <header className="text-center mb-12">
          <h1 className="font-display text-7xl md:text-9xl text-primary tracking-wider drop-shadow-[0_4px_24px_rgba(234,179,8,0.3)]">
            STRIKER ARENA
          </h1>
          <p className="text-muted-foreground mt-3 tracking-widest uppercase text-sm">
            2D Football · Pick a mode and play
          </p>
        </header>
        <div className="grid gap-4 w-full max-w-md">
          <ModeButton title="Quick Play" desc="Jump straight into a single match" onClick={() => setScreen({ s: "teamSelect", mode: "quick", pick: "home" })} />
          <ModeButton title="2 Players" desc="Local versus — P1 keys vs P2 keys on one keyboard" onClick={() => setScreen({ s: "teamSelect", mode: "vs", pick: "home" })} />
          <ModeButton title="Career" desc="Play a 5-match season as your club" onClick={() => setScreen({ s: "teamSelect", mode: "career", pick: "home" })} />
          <ModeButton title="Tournament" desc="Knockout cup — win 3 in a row" onClick={() => setScreen({ s: "teamSelect", mode: "tournament", pick: "home" })} />
        </div>
        <footer className="mt-16 text-xs text-muted-foreground/60">P1: Arrows · A · S · D &nbsp;·&nbsp; P2: I J K L · U · G · H</footer>
      </main>
    );
  }

  if (screen.s === "teamSelect") {
    const title = screen.pick === "home" ? "Select your team" : "Select opponent";
    return (
      <main className="min-h-screen px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <button onClick={() => setScreen({ s: "menu" })} className="text-muted-foreground hover:text-foreground text-sm mb-6">← Back</button>
          <h2 className="font-display text-5xl text-primary mb-2">{title}</h2>
          <p className="text-muted-foreground mb-8 uppercase tracking-widest text-xs">{screen.mode} mode</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {TEAMS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (screen.pick === "home") {
                    if (screen.mode === "quick" || screen.mode === "vs") {
                      setScreen({ s: "teamSelect", mode: screen.mode, pick: "away", home: t });
                    } else {
                      const opp = pickOpp(t);
                      const total = screen.mode === "career" ? 5 : 3;
                      setScreen({ s: "match", mode: screen.mode, home: t, away: opp, round: 1, total, cupScore: { you: 0, opp: 0 } });
                    }
                  } else {
                    setScreen({ s: "match", mode: screen.mode, home: screen.home!, away: t, round: 1, total: 1, cupScore: { you: 0, opp: 0 } });
                  }
                }}
                disabled={screen.home?.id === t.id}
                className="group relative bg-card hover:bg-secondary border-2 border-border hover:border-primary rounded-lg p-5 text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
              >
                <div className="w-full h-20 rounded mb-3 flex items-center justify-center font-display text-3xl" style={{ background: t.primary, color: t.secondary }}>
                  {t.short}
                </div>
                <div className="font-display text-xl">{t.name}</div>
                <div className="text-xs text-muted-foreground mt-1">RATING {t.rating}</div>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (screen.s === "match") {
    return (
      <main className="min-h-screen px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setScreen({ s: "menu" })} className="text-muted-foreground hover:text-foreground text-sm">← Quit</button>
            <div className="font-display text-xl text-muted-foreground">
              {screen.mode === "quick" ? "FRIENDLY" : `${screen.mode.toUpperCase()} · MATCH ${screen.round}/${screen.total}`}
            </div>
            <div className="w-12" />
          </div>
          <PitchGame
            home={screen.home}
            away={screen.away}
            duration={90}
            onEnd={(result) => {
              const won = result.home > result.away;
              const cupScore = { you: screen.cupScore.you + (won ? 1 : 0), opp: screen.cupScore.opp + (won ? 0 : 1) };
              setScreen({ s: "result", mode: screen.mode, home: screen.home, away: screen.away, round: screen.round, total: screen.total, score: result, cupScore });
            }}
          />
        </div>
      </main>
    );
  }

  // result
  const won = screen.score.home > screen.score.away;
  const drew = screen.score.home === screen.score.away;
  const tournamentOut = screen.mode === "tournament" && !won;
  const seasonDone = screen.round >= screen.total || tournamentOut;
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="max-w-xl w-full text-center">
        <div className="font-display text-2xl text-muted-foreground uppercase tracking-widest mb-2">Full Time</div>
        <div className="font-display text-7xl text-primary mb-2">
          {screen.score.home} - {screen.score.away}
        </div>
        <div className="text-lg mb-8">{screen.home.name} vs {screen.away.name}</div>
        <div className="text-3xl font-display mb-8">
          {won ? "VICTORY" : drew ? "DRAW" : "DEFEAT"}
        </div>
        {screen.mode !== "quick" && (
          <div className="mb-8 text-muted-foreground">
            {screen.mode === "career" ? "Season record" : "Cup run"}: <span className="text-foreground font-display text-xl">{screen.cupScore.you}W - {screen.cupScore.opp}L</span>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          {!seasonDone && (
            <button
              onClick={() => {
                const opp = pickOpp(screen.home);
                setScreen({ s: "match", mode: screen.mode, home: screen.home, away: opp, round: screen.round + 1, total: screen.total, cupScore: screen.cupScore });
              }}
              className="bg-primary text-primary-foreground font-display text-xl px-8 py-3 rounded-lg hover:scale-105 transition-transform"
            >
              Next Match →
            </button>
          )}
          {seasonDone && screen.mode === "tournament" && won && (
            <div className="font-display text-4xl text-primary mb-4 w-full">🏆 CHAMPIONS! 🏆</div>
          )}
          <button
            onClick={() => setScreen({ s: "menu" })}
            className="bg-secondary text-secondary-foreground font-display text-xl px-8 py-3 rounded-lg hover:scale-105 transition-transform"
          >
            Main Menu
          </button>
        </div>
      </div>
    </main>
  );
}

function pickOpp(home: Team): Team {
  const pool = TEAMS.filter((t) => t.id !== home.id);
  return pool[Math.floor(Math.random() * pool.length)];
}

function ModeButton({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group bg-card hover:bg-secondary border-2 border-border hover:border-primary rounded-lg p-6 text-left transition-all hover:translate-x-2"
    >
      <div className="font-display text-3xl text-primary group-hover:text-accent transition-colors">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{desc}</div>
    </button>
  );
}
