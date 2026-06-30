import React, { useState } from "react";
import { C, applyTheme, currentTheme } from "./palette";
import { useLeagueData } from "./useLeagueData";
import Dashboard from "./Dashboard.jsx";
import TeamView from "./TeamView.jsx";

function Center({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.INK, display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center", color: C.TXT, fontFamily: "'Familjen Grotesk', sans-serif" }}>
        {children}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none",
        cursor: "pointer",
        fontFamily: "Archivo, sans-serif",
        fontWeight: 800,
        fontSize: 13,
        letterSpacing: 1,
        textTransform: "uppercase",
        padding: "9px 18px",
        borderRadius: 10,
        color: active ? C.ON_ORANGE : C.TXT,
        background: active ? C.ORANGE : "transparent",
        border: `1px solid ${active ? C.ORANGE : C.LINE}`,
        transition: "background .2s ease, color .2s ease",
      }}
    >
      {children}
    </button>
  );
}

function TeamPicker({ teams, value, onChange }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || e.target.value)}
        aria-label="Select team"
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          background: "transparent",
          border: "none",
          color: C.TXT,
          fontFamily: "Archivo, sans-serif",
          fontWeight: 900,
          fontSize: 22,
          letterSpacing: 0.5,
          cursor: "pointer",
          padding: "0 26px 0 0",
          lineHeight: 1.1,
          outline: "none",
        }}
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id} style={{ color: "#111", fontWeight: 600 }}>
            {t.emoji} {t.teamName}
          </option>
        ))}
      </select>
      <span style={{ position: "absolute", right: 4, pointerEvents: "none", color: C.ORANGE, fontSize: 13 }}>▾</span>
    </div>
  );
}

function Shell({ league }) {
  const { teams, teamRanks, teamProfiles, leagueShotZones, positionShotZones, data, meta } = league;

  const defaultId = teams[0].id; // first team alphabetically; no team-specific default
  const [teamId, setTeamId] = useState(defaultId);
  const [tab, setTab] = useState("team");
  const [sel, setSel] = useState(0);
  const [theme, setTheme] = useState(currentTheme());

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next); // mutates the live palette + sets data-theme + persists
    setTheme(next); // re-render so components (and charts) read the new colors
  };

  const team = teams.find((t) => t.id === teamId) || teams[0];
  const bundle = data[teamId] || data[team.id];
  const { games, roster, onOff, fourFactors, playerAdv, lineups, upcoming, shotZones, errors } = bundle;

  const teamW = games.filter((g) => g.w).length;
  const teamL = games.length - teamW;

  const updated = meta && meta.generatedAt
    ? new Date(meta.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  const pickTeam = (id) => {
    setTeamId(id);
    setSel(0); // reset player selection when switching teams
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.INK,
        color: C.TXT,
        fontFamily: "'Familjen Grotesk', sans-serif",
        backgroundImage: C.BG_IMAGE,
        transition: "background-color .2s ease, color .2s ease",
      }}
    >
      <header
        style={{
          borderBottom: `1px solid ${C.LINE}`,
          padding: "20px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${C.BLUE}, ${C.BLUE_HI})`,
              display: "grid",
              placeItems: "center",
              border: `1px solid ${C.ORANGE}55`,
              fontSize: 26,
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            {team.emoji}
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.ORANGE, fontWeight: 700, marginBottom: 1 }}>
              WNBA Analytics
            </div>
            <TeamPicker teams={teams} value={teamId} onChange={pickTeam} />
            <div style={{ fontSize: 12, color: C.MUTE, marginTop: 2 }}>
              {team.city}
              {team.city ? " · " : ""}
              {tab === "team" ? "team performance" : "player performance"}
              {updated ? ` · updated ${updated}` : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.MUTE, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>Record</div>
            <div style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 22 }}>
              {teamW}
              <span style={{ color: C.MUTE }}>–</span>
              {teamL}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.MUTE, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>Games</div>
            <div style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 22 }}>{games.length}</div>
          </div>
        </div>
      </header>

      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 28px",
          borderBottom: `1px solid ${C.LINE}`,
          background: `${C.PANEL}99`,
        }}
      >
        <TabButton active={tab === "team"} onClick={() => setTab("team")}>
          Team
        </TabButton>
        <TabButton active={tab === "players"} onClick={() => setTab("players")}>
          Players
        </TabButton>
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            marginLeft: "auto",
            appearance: "none",
            cursor: "pointer",
            width: 38,
            height: 38,
            borderRadius: 10,
            border: `1px solid ${C.LINE}`,
            background: "transparent",
            color: C.TXT,
            fontSize: 16,
            lineHeight: 1,
            display: "grid",
            placeItems: "center",
          }}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </nav>

      {tab === "team" ? (
        <TeamView
          key={teamId}
          games={games}
          roster={roster}
          onOff={onOff}
          fourFactors={fourFactors}
          teamRanks={teamRanks}
          playerAdv={playerAdv}
          lineups={lineups}
          errors={errors}
          teamId={teamId}
          teamName={team.teamName}
          teamProfiles={teamProfiles}
          upcoming={upcoming}
          shotZones={shotZones}
          leagueShotZones={leagueShotZones}
        />
      ) : (
        <Dashboard key={teamId} games={games} roster={roster} sel={sel} setSel={setSel} leagueShotZones={leagueShotZones} positionShotZones={positionShotZones} />
      )}
    </div>
  );
}

export default function App() {
  const { loading, error, data: league } = useLeagueData();

  if (loading) {
    return (
      <Center>
        <div style={{ fontFamily: "Archivo, sans-serif", fontWeight: 900, fontSize: 22, color: C.ORANGE, letterSpacing: 1 }}>
          LOADING WNBA DATA…
        </div>
        <div style={{ color: C.MUTE, marginTop: 8, fontSize: 14 }}>Loading the saved data snapshot.</div>
      </Center>
    );
  }

  if (error) {
    return (
      <Center>
        <div style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "26px 28px", textAlign: "left" }}>
          <div style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Couldn't load data</div>
          <div style={{ color: C.MUTE, fontSize: 14, lineHeight: 1.6 }}>
            <code style={{ color: C.LOSS_FG }}>{String(error.message)}</code>
            <p style={{ marginTop: 12 }}>
              The site reads a saved data file (<code>data/wnba.json</code>) instead of
              calling stats.wnba.com directly. Generate or refresh it by running{" "}
              <code>npm run fetch</code> from the project, then rebuild and re-upload.
            </p>
          </div>
        </div>
      </Center>
    );
  }

  if (!league || !league.teams || !league.teams.length) {
    return (
      <Center>
        <div style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, fontSize: 18 }}>No teams found</div>
        <div style={{ color: C.MUTE, marginTop: 8, fontSize: 14 }}>
          The saved data has no teams, or the <code>SEASON</code> in <code>scripts/fetch-data.mjs</code> needs updating (then re-run <code>npm run fetch</code>).
        </div>
      </Center>
    );
  }

  return <Shell league={league} />;
}
