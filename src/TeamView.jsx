import React, { useMemo, useState } from "react";
import { C } from "./palette";
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import OnOffChart from "./OnOffChart.jsx";

const sum = (arr, k) => arr.reduce((a, b) => a + b[k], 0);
const r1 = (n) => Math.round(n * 10) / 10;
const pct = (m, a) => (a > 0 ? r1((m / a) * 100) : 0);

function ordinal(num) {
  if (!num) return "—";
  const s = ["th", "st", "nd", "rd"], v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

function lastName(name) {
  const parts = String(name).trim().split(" ");
  return parts[parts.length - 1];
}

// Sum the per-game logs across the whole roster into one team line.
function teamShooting(roster) {
  let fgm = 0, fga = 0, tpm = 0, tpa = 0, ftm = 0, fta = 0, pts = 0;
  for (const p of roster) {
    for (const l of p.logs) {
      fgm += l.fgm; fga += l.fga; tpm += l.tpm; tpa += l.tpa;
      ftm += l.ftm; fta += l.fta; pts += l.pts;
    }
  }
  const tsDen = 2 * (fga + 0.44 * fta);
  return {
    fgm, fga, tpm, tpa, ftm, fta, pts,
    fgPct: pct(fgm, fga), tpPct: pct(tpm, tpa), ftPct: pct(ftm, fta),
    efg: fga > 0 ? r1(((fgm + 0.5 * tpm) / fga) * 100) : 0,
    ts: tsDen > 0 ? r1((pts / tsDen) * 100) : 0,
  };
}

// Per-player season averages, used for the leaders strip + scoring share.
function perPlayer(roster) {
  return roster
    .map((p) => {
      const gp = p.logs.length;
      const reb = sum(p.logs, "orb") + sum(p.logs, "drb");
      const totalPts = sum(p.logs, "pts");
      return {
        name: p.name,
        gp,
        totalPts,
        ppg: r1(totalPts / gp),
        rpg: r1(reb / gp),
        apg: r1(sum(p.logs, "ast") / gp),
        spg: r1(sum(p.logs, "stl") / gp),
        bpg: r1(sum(p.logs, "blk") / gp),
      };
    })
    .filter((p) => p.gp > 0);
}

function leaderOf(players, key) {
  return players.reduce((best, p) => (p[key] > best[key] ? p : best), players[0]);
}

function BigTile({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.PANEL_2, border: `1px solid ${C.LINE}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.MUTE, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: "Archivo, sans-serif", fontSize: 32, fontWeight: 800, lineHeight: 1, color: accent || C.TXT }}>{value}</span>
      {sub != null && <span style={{ fontSize: 12, color: C.MUTE }}>{sub}</span>}
    </div>
  );
}

function SplitBar({ label, value, max = 100, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: C.MUTE, fontWeight: 600, letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 13, color: C.TXT, fontWeight: 700, fontFamily: "Archivo, sans-serif" }}>{value}%</span>
      </div>
      <div style={{ height: 7, background: C.PANEL, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: "100%", background: color, borderRadius: 6, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}

function LeaderCard({ label, leader, statKey, unit }) {
  return (
    <div style={{ background: C.PANEL_2, border: `1px solid ${C.LINE}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.GOLD, fontWeight: 700 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{leader.name}</div>
      <div style={{ fontFamily: "Archivo, sans-serif", fontSize: 26, fontWeight: 800, color: C.TXT, lineHeight: 1.1, marginTop: 2 }}>
        {leader[statKey]}<span style={{ fontSize: 12, color: C.MUTE, fontWeight: 600, marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}

function Section({ title, hint, children, style }) {
  return (
    <section style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px", marginBottom: 22, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <h3 style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 15, margin: 0 }}>{title}</h3>
        {hint && <span style={{ fontSize: 11, color: C.MUTE }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Unavailable({ what, detail }) {
  return (
    <div>
      <p style={{ color: C.MUTE, fontSize: 13, margin: 0 }}>
        {what} weren't returned (the advanced endpoint may be unavailable from this host).
      </p>
      {detail && (
        <p style={{ color: C.LOSS_FG, fontSize: 12, margin: "8px 0 0", fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-word" }}>
          {detail}
        </p>
      )}
    </div>
  );
}

function ScoreTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: C.PANEL_2, border: `1px solid ${C.LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, minWidth: 180 }}>
      <div style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, color: C.GOLD, marginBottom: 6 }}>{d.label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: C.MUTE }}>Result</span>
        <span style={{ color: d.w ? C.GOOD : C.BAD, fontWeight: 700 }}>{d.w ? "W" : "L"} {d.for}-{d.against}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: C.MUTE }}>Margin</span>
        <span style={{ color: d.margin >= 0 ? C.GOOD : C.BAD, fontWeight: 700 }}>{d.margin > 0 ? "+" : ""}{d.margin}</span>
      </div>
    </div>
  );
}

function RankTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const row = (label, val, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: C.MUTE }}>{label}</span>
      <span style={{ color: color || C.TXT, fontWeight: 700 }}>{val}</span>
    </div>
  );
  return (
    <div style={{ background: C.PANEL_2, border: `1px solid ${C.LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, minWidth: 200 }}>
      <div style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, color: d.isSelected ? C.GOLD : C.TXT, marginBottom: 6 }}>{d.name}</div>
      {row("Net rating", `${d.net > 0 ? "+" : ""}${d.net}`, d.net >= 0 ? C.GOOD : C.BAD)}
      {row("Offense", d.off)}
      {row("Defense", d.def)}
      {row("Pace", d.pace)}
    </div>
  );
}

function FactorTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: C.PANEL_2, border: `1px solid ${C.LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, minWidth: 180 }}>
      <div style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, color: C.GOLD, marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: p.dataKey === "team" ? C.GOLD : C.PURPLE_HI }}>{p.dataKey === "team" ? "Team" : "Opponents"}</span>
          <span style={{ color: C.TXT, fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function AdvTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const row = (label, val) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: C.MUTE }}>{label}</span>
      <span style={{ color: C.TXT, fontWeight: 700 }}>{val}</span>
    </div>
  );
  return (
    <div style={{ background: C.PANEL_2, border: `1px solid ${C.LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, minWidth: 190 }}>
      <div style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, color: C.GOLD, marginBottom: 6 }}>{d.name}</div>
      {row("Usage", `${d.usg}%`)}
      {row("True shooting", `${d.ts}%`)}
      {row("Net rating", `${d.net > 0 ? "+" : ""}${d.net}`)}
      {row("Minutes", d.min)}
    </div>
  );
}

const PROFILE_METRICS = [
  { key: "fg3m", label: "3PM", full: "3-pt makes" },
  { key: "fg3a", label: "3PA", full: "3-pt attempts" },
  { key: "fg2m", label: "2PM", full: "2-pt makes" },
  { key: "fg2a", label: "2PA", full: "2-pt attempts" },
  { key: "ftm", label: "FTM", full: "free throws made" },
  { key: "fta", label: "FTA", full: "free throw attempts" },
  { key: "oreb", label: "OREB", full: "offensive rebounds" },
  { key: "tov", label: "TOV", full: "turnovers" },
  { key: "efg", label: "eFG%", full: "effective FG%", pct: true },
];

function MetricButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none",
        cursor: "pointer",
        fontFamily: "Archivo, sans-serif",
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: 0.5,
        padding: "6px 12px",
        borderRadius: 8,
        color: active ? C.ON_GOLD : C.TXT,
        background: active ? C.GOLD : "transparent",
        border: `1px solid ${active ? C.GOLD : C.LINE}`,
        transition: "background .15s ease, color .15s ease",
      }}
    >
      {children}
    </button>
  );
}

function ProfileTooltip({ active, payload, metric }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const unit = metric && metric.pct ? "%" : "";
  return (
    <div style={{ background: C.PANEL_2, border: `1px solid ${C.LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, minWidth: 160 }}>
      <div style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, color: d.isSelected ? C.GOLD : C.TXT, marginBottom: 4 }}>{d.name}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: C.MUTE }}>{metric ? metric.full : ""}</span>
        <span style={{ color: C.TXT, fontWeight: 700 }}>{d.value}{unit}</span>
      </div>
    </div>
  );
}

export default function TeamView({ games, roster, onOff, fourFactors, teamRanks, playerAdv, lineups, errors = {}, teamId, teamName = "Team", teamProfiles = [] }) {
  const team = useMemo(() => {
    const gp = games.length;
    const wins = games.filter((g) => g.w).length;
    const scored = games.reduce((a, g) => a + (g.tm || 0), 0);
    const allowed = games.reduce((a, g) => a + (g.op || 0), 0);
    const home = games.filter((g) => g.home);
    const away = games.filter((g) => !g.home);
    const rec = (arr) => `${arr.filter((g) => g.w).length}–${arr.filter((g) => !g.w).length}`;
    const last5 = games.slice(-5);
    return {
      gp,
      wins,
      losses: gp - wins,
      winPct: gp > 0 ? Math.round((wins / gp) * 1000) / 10 : 0,
      ppg: gp > 0 ? r1(scored / gp) : 0,
      oppg: gp > 0 ? r1(allowed / gp) : 0,
      margin: gp > 0 ? r1((scored - allowed) / gp) : 0,
      homeRec: rec(home),
      awayRec: rec(away),
      last5: rec(last5),
      last5seq: last5.map((g) => (g.w ? "W" : "L")),
    };
  }, [games]);

  const shooting = useMemo(() => teamShooting(roster), [roster]);
  const players = useMemo(() => perPlayer(roster), [roster]);

  const leaders = useMemo(() => ({
    ppg: leaderOf(players, "ppg"),
    rpg: leaderOf(players, "rpg"),
    apg: leaderOf(players, "apg"),
    spg: leaderOf(players, "spg"),
    bpg: leaderOf(players, "bpg"),
  }), [players]);

  const gameData = useMemo(
    () => games.map((g) => ({
      name: g.opp,
      label: `${g.date} ${g.home ? "vs" : "@"} ${g.opp}`,
      for: g.tm,
      against: g.op,
      margin: (g.tm || 0) - (g.op || 0),
      w: g.w,
    })),
    [games]
  );

  const share = useMemo(() => {
    const total = players.reduce((a, p) => a + p.totalPts, 0) || 1;
    return [...players]
      .sort((a, b) => b.totalPts - a.totalPts)
      .map((p) => ({ ...p, share: Math.round((p.totalPts / total) * 1000) / 10 }));
  }, [players]);
  const maxShare = share.length ? share[0].share : 1;

  // League-wide ranking context (selected team vs all WNBA teams).
  const ranking = useMemo(() => {
    const src = teamRanks && teamRanks.teams ? teamRanks.teams : [];
    if (!src.length) return null;
    const teams = src.map((t) => ({ ...t, isSelected: t.teamId === teamId }));
    const byNet = [...teams].sort((a, b) => b.net - a.net);
    const byOff = [...teams].sort((a, b) => b.off - a.off);
    const byDef = [...teams].sort((a, b) => a.def - b.def); // lower def rating = better
    const byPace = [...teams].sort((a, b) => b.pace - a.pace); // higher = faster (1st = fastest)
    const rankIn = (arr) => arr.findIndex((t) => t.isSelected) + 1 || null;
    return {
      total: teams.length,
      chart: byNet,
      netRank: rankIn(byNet),
      offRank: rankIn(byOff),
      defRank: rankIn(byDef),
      paceRank: rankIn(byPace),
      sparks: teams.find((t) => t.isSelected) || null,
    };
  }, [teamRanks, teamId]);

  // Shooting & possession profile vs the league.
  const [metric, setMetric] = useState("efg");
  const activeMetric = PROFILE_METRICS.find((m) => m.key === metric) || PROFILE_METRICS[0];
  const profile = useMemo(() => {
    const src = teamProfiles || [];
    if (!src.length) return null;
    const rows = src
      .map((t) => ({ abbr: t.abbr, name: t.abbr, value: t[metric] ?? 0, teamId: t.teamId, isSelected: t.teamId === teamId }))
      .sort((a, b) => b.value - a.value);
    const vals = rows.map((r) => r.value);
    const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    const idx = rows.findIndex((r) => r.isSelected);
    return {
      chart: rows,
      avg,
      total: rows.length,
      rank: idx >= 0 ? idx + 1 : null,
      selVal: idx >= 0 ? rows[idx].value : null,
    };
  }, [teamProfiles, metric, teamId]);


  // Four factors, team vs opponents.
  const ffData = useMemo(() => {
    if (!fourFactors) return null;
    const { team: t, opp: o } = fourFactors;
    return [
      { factor: "eFG%", team: t.efg, opp: o.efg },
      { factor: "Turnover %", team: t.tov, opp: o.tov },
      { factor: "Off. reb %", team: t.oreb, opp: o.oreb },
      { factor: "FT rate", team: t.ftRate, opp: o.ftRate },
    ];
  }, [fourFactors]);

  // Advanced player scatter (usage vs efficiency, sized by minutes).
  const advScatter = useMemo(
    () => (playerAdv || []).filter((p) => p.gp > 0).map((p) => ({ ...p, x: p.usg, y: p.ts, z: p.min })),
    [playerAdv]
  );
  const advTable = useMemo(
    () => [...(playerAdv || [])].filter((p) => p.gp > 0).sort((a, b) => b.min - a.min),
    [playerAdv]
  );

  const maxAbsNet = useMemo(
    () => Math.max(1, ...(lineups || []).map((l) => Math.abs(l.net))),
    [lineups]
  );

  const renderAdvDot = (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const r = 5 + Math.min(9, Math.sqrt(payload.min) / 2.2);
    const fill = payload.net >= 0 ? C.GOOD : C.BAD;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.6} stroke={fill} strokeWidth={1} />
        <text x={cx + r + 4} y={cy + 4} fill={C.TXT} fontSize={11} fontFamily="Familjen Grotesk, sans-serif">
          {lastName(payload.name)}
        </text>
      </g>
    );
  };

  return (
    <main style={{ padding: "24px 28px 40px", maxWidth: 1180, margin: "0 auto" }}>
      {/* Headline tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <BigTile label="Record" value={`${team.wins}–${team.losses}`} sub={`${team.winPct}% win rate`} accent={C.GOLD} />
        <BigTile label="Points / game" value={team.ppg} sub={`${team.oppg} allowed`} />
        <BigTile label="Avg margin" value={`${team.margin > 0 ? "+" : ""}${team.margin}`} sub="per game" accent={team.margin >= 0 ? C.GOOD : C.BAD} />
        <BigTile label="Home" value={team.homeRec} />
        <BigTile label="Away" value={team.awayRec} />
        <BigTile label="Last 5" value={team.last5seq.join(" ")} sub={team.last5} />
      </div>

      {/* Margin by game */}
      <Section title="Margin by game" hint="green = win · red = loss">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={gameData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={C.LINE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} />
            <YAxis tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} />
            <Tooltip content={<ScoreTooltip />} cursor={{ fill: C.HOVER_FILL }} />
            <ReferenceLine y={0} stroke={C.MUTE} strokeOpacity={0.5} />
            <Bar dataKey="margin" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {gameData.map((d, i) => (
                <Cell key={i} fill={d.w ? C.GOOD : C.BAD} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Points for vs against */}
      <Section
        title="Points scored vs allowed"
        hint={<span><span style={{ color: C.GOLD }}>● scored</span>{"  "}<span style={{ color: C.PURPLE_HI }}>● allowed</span></span>}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={gameData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={C.LINE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} />
            <YAxis tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} />
            <Tooltip
              contentStyle={{ background: C.PANEL_2, border: `1px solid ${C.LINE}`, borderRadius: 10, color: C.TXT }}
              labelStyle={{ color: C.GOLD }}
              labelFormatter={(l, pl) => (pl && pl[0] ? pl[0].payload.label : l)}
              formatter={(v, key) => [v, key === "for" ? "Scored" : "Allowed"]}
            />
            <ReferenceLine y={team.ppg} stroke={C.GOLD} strokeDasharray="5 4" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="for" stroke={C.GOLD} strokeWidth={2.5} dot={{ r: 3, fill: C.GOLD }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="against" stroke={C.PURPLE_HI} strokeWidth={2.5} dot={{ r: 3, fill: C.PURPLE_HI }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {/* Leaders */}
      <h3 style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 15, margin: "0 0 12px" }}>Team leaders</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <LeaderCard label="Scoring" leader={leaders.ppg} statKey="ppg" unit="ppg" />
        <LeaderCard label="Rebounding" leader={leaders.rpg} statKey="rpg" unit="rpg" />
        <LeaderCard label="Assists" leader={leaders.apg} statKey="apg" unit="apg" />
        <LeaderCard label="Steals" leader={leaders.spg} statKey="spg" unit="spg" />
        <LeaderCard label="Blocks" leader={leaders.bpg} statKey="bpg" unit="bpg" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 360px) 1fr", gap: 18, marginBottom: 22 }}>
        {/* Team shooting splits */}
        <section style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px" }}>
          <h3 style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 15, margin: "0 0 16px" }}>Team shooting</h3>
          <SplitBar label="Field goal %" value={shooting.fgPct} color={C.PURPLE_HI} />
          <SplitBar label="3-point %" value={shooting.tpPct} color={C.GOLD} />
          <SplitBar label="Free throw %" value={shooting.ftPct} color={C.PURPLE_HI} />
          <SplitBar label="Effective FG %" value={shooting.efg} max={120} color={C.GOLD} />
          <SplitBar label="True shooting %" value={shooting.ts} max={120} color={C.PURPLE_HI} />
          <div style={{ display: "flex", gap: 10, marginTop: 14, fontSize: 11, color: C.MUTE, flexWrap: "wrap" }}>
            <span>FG {shooting.fgm}/{shooting.fga}</span><span>·</span>
            <span>3P {shooting.tpm}/{shooting.tpa}</span><span>·</span>
            <span>FT {shooting.ftm}/{shooting.fta}</span>
          </div>
        </section>

        {/* Scoring share */}
        <section style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 15, margin: 0 }}>Scoring share</h3>
            <span style={{ fontSize: 11, color: C.MUTE }}>% of team points</span>
          </div>
          {share.map((p) => (
            <div key={p.name} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: C.TXT, fontWeight: 600 }}>{lastName(p.name)}</span>
                <span style={{ fontSize: 12, color: C.MUTE, fontFamily: "Archivo, sans-serif" }}>
                  {p.share}% <span style={{ opacity: 0.6 }}>· {p.totalPts} pts</span>
                </span>
              </div>
              <div style={{ height: 8, background: C.PANEL_2, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: `${(p.share / maxShare) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${C.PURPLE_HI}, ${C.GOLD})`, borderRadius: 6, transition: "width .6s ease" }} />
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* League ranking — selected team vs all WNBA teams */}
      <Section title={`${teamName} vs the WNBA · net rating`} hint={`points per 100 possessions · gold = ${teamName}`}>
        {ranking ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 16 }}>
              <BigTile label="Net rating" value={ranking.sparks ? `${ranking.sparks.net > 0 ? "+" : ""}${ranking.sparks.net}` : "—"} sub={`${ordinal(ranking.netRank)} of ${ranking.total}`} accent={ranking.sparks && ranking.sparks.net >= 0 ? C.GOOD : C.BAD} />
              <BigTile label="Offense" value={ranking.sparks ? ranking.sparks.off : "—"} sub={`${ordinal(ranking.offRank)} of ${ranking.total}`} accent={C.GOLD} />
              <BigTile label="Defense" value={ranking.sparks ? ranking.sparks.def : "—"} sub={`${ordinal(ranking.defRank)} of ${ranking.total}`} accent={C.PURPLE_HI} />
              <BigTile label="Pace" value={ranking.sparks ? ranking.sparks.pace : "—"} sub={`${ordinal(ranking.paceRank)}-fastest of ${ranking.total}`} />
            </div>
            <ResponsiveContainer width="100%" height={ranking.chart.length * 28 + 40}>
              <BarChart layout="vertical" data={ranking.chart} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={C.LINE} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} />
                <YAxis type="category" dataKey="abbr" width={46} tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} interval={0} />
                <Tooltip content={<RankTooltip />} cursor={{ fill: C.HOVER_FILL }} />
                <ReferenceLine x={0} stroke={C.MUTE} strokeOpacity={0.6} />
                <Bar dataKey="net" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {ranking.chart.map((t, i) => (
                    <Cell key={i} fill={t.isSelected ? C.GOLD : C.PURPLE_HI} fillOpacity={t.isSelected ? 1 : 0.5} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : (
          <Unavailable what="League-wide team ratings" detail={errors.teamRanks} />
        )}
      </Section>

      {/* Shooting & possession profile vs the WNBA */}
      <Section
        title={`${teamName} profile · vs the WNBA`}
        hint={`per 100 possessions · gold = ${teamName}`}
      >
        {profile ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {PROFILE_METRICS.map((m) => (
                <MetricButton key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>
                  {m.label}
                </MetricButton>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <div>
                <span style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, fontSize: 26, color: C.GOLD }}>
                  {profile.selVal != null ? profile.selVal : "—"}{activeMetric.pct ? "%" : ""}
                </span>
                <span style={{ color: C.MUTE, fontSize: 13, marginLeft: 8 }}>
                  {activeMetric.full}{profile.rank ? ` · ${ordinal(profile.rank)} of ${profile.total}` : ""}
                </span>
              </div>
              <span style={{ fontSize: 11, color: C.MUTE }}>league avg {profile.avg}{activeMetric.pct ? "%" : ""}</span>
            </div>
            <ResponsiveContainer width="100%" height={profile.chart.length * 26 + 40}>
              <BarChart layout="vertical" data={profile.chart} margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={C.LINE} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} />
                <YAxis type="category" dataKey="abbr" width={46} tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} interval={0} />
                <Tooltip content={<ProfileTooltip metric={activeMetric} />} cursor={{ fill: C.HOVER_FILL }} />
                <ReferenceLine x={profile.avg} stroke={C.GOLD} strokeDasharray="5 4" strokeOpacity={0.5} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {profile.chart.map((t, i) => (
                    <Cell key={i} fill={t.isSelected ? C.GOLD : C.PURPLE_HI} fillOpacity={t.isSelected ? 1 : 0.5} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={{ fontSize: 12, color: C.MUTE, margin: "8px 2px 0", lineHeight: 1.5 }}>
              Per 100 possessions, sorted high → low, with the dashed line at the league average. Higher is generally better for
              makes, attempts and eFG%; fewer turnovers is better.
            </p>
          </>
        ) : (
          <Unavailable what="Team shooting profiles" detail={errors.teamProfiles} />
        )}
      </Section>

      {/* Four factors */}
      <Section
        title={`Four factors · ${teamName} vs opponents`}
        hint={<span><span style={{ color: C.GOLD }}>● {teamName}</span>{"  "}<span style={{ color: C.PURPLE_HI }}>● opponents</span></span>}
      >
        {ffData ? (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ffData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barGap={4}>
                <CartesianGrid stroke={C.LINE} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="factor" tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} />
                <YAxis tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE} />
                <Tooltip content={<FactorTooltip />} cursor={{ fill: C.HOVER_FILL }} />
                <Bar dataKey="team" fill={C.GOLD} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="opp" fill={C.PURPLE_HI} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <p style={{ fontSize: 12, color: C.MUTE, margin: "8px 2px 0", lineHeight: 1.5 }}>
              The four factors that drive wins. For this team, higher eFG%, offensive rebound % and FT rate are
              better, while a lower turnover % is better — and the reverse for what they allow opponents.
            </p>
          </>
        ) : (
          <Unavailable what="Four-factor splits" detail={errors.fourFactors} />
        )}
      </Section>

      {/* On/off impact (moved from the player view) */}
      <OnOffChart onOff={onOff} />

      {/* Advanced player stats */}
      <Section title="Advanced player profile · usage vs efficiency" hint="dot size = minutes · color = net rating">
        {advScatter.length ? (
          <>
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 6 }}>
                <CartesianGrid stroke={C.LINE} strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE}
                  label={{ value: "Usage %  (share of possessions used →)", position: "bottom", fill: C.MUTE, fontSize: 12 }} />
                <YAxis type="number" dataKey="y" tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE}
                  label={{ value: "True shooting %  (↑ efficiency)", angle: -90, position: "insideLeft", fill: C.MUTE, fontSize: 12, style: { textAnchor: "middle" } }} />
                <ZAxis type="number" dataKey="z" range={[60, 60]} />
                <Tooltip content={<AdvTooltip />} cursor={{ strokeDasharray: "3 3", stroke: C.LINE }} />
                <Scatter data={advScatter} shape={renderAdvDot} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
                <thead>
                  <tr style={{ color: C.MUTE, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
                    {["Player", "GP", "MIN", "USG%", "TS%", "AST%", "REB%", "NET", "PIE"].map((h, k) => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: k === 0 ? "left" : "right", fontWeight: 600, borderBottom: `1px solid ${C.LINE}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {advTable.map((p) => (
                    <tr key={p.playerId} style={{ borderBottom: `1px solid ${C.LINE}55` }}>
                      <td style={{ padding: "9px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>{p.name}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: C.MUTE }}>{p.gp}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: C.MUTE }}>{p.min}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}>{p.usg}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}>{p.ts}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}>{p.astPct}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}>{p.rebPct}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, color: p.net >= 0 ? C.GOOD : C.LOSS_FG }}>{p.net > 0 ? "+" : ""}{p.net}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "Archivo, sans-serif", fontWeight: 700, color: C.GOLD }}>{p.pie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Unavailable what="Advanced player stats" detail={errors.playerAdv} />
        )}
      </Section>

      {/* Lineups */}
      <Section title="Most-used lineups" hint="top 8 by minutes · net = points per 100 possessions">
        {lineups && lineups.length ? (
          lineups.map((l, i) => {
            const w = Math.min(50, (Math.abs(l.net) / maxAbsNet) * 50);
            return (
              <div key={l.id} style={{ display: "grid", gridTemplateColumns: "26px 1fr 70px 130px", gap: 12, alignItems: "center", padding: "11px 0", borderBottom: i < lineups.length - 1 ? `1px solid ${C.LINE}55` : "none" }}>
                <span style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, color: C.MUTE, fontSize: 13 }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: C.MUTE }}>{l.min} min · {l.gp} GP · OFF {l.off} / DEF {l.def}</div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "Archivo, sans-serif", fontWeight: 800, fontSize: 18, color: l.net >= 0 ? C.GOOD : C.BAD }}>
                  {l.net > 0 ? "+" : ""}{l.net}
                </div>
                <div style={{ position: "relative", height: 8, background: C.PANEL_2, borderRadius: 6 }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.MUTE, opacity: 0.5 }} />
                  <div style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 6, background: l.net >= 0 ? C.GOOD : C.BAD, left: l.net >= 0 ? "50%" : `${50 - w}%`, width: `${w}%` }} />
                </div>
              </div>
            );
          })
        ) : (
          <Unavailable what="Lineup combinations" detail={errors.lineups} />
        )}
      </Section>

      {/* Results table */}
      <Section title="Results">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
            <thead>
              <tr style={{ color: C.MUTE, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
                {["Date", "Matchup", "Result", "Score", "Margin"].map((h, k) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: k < 2 ? "left" : "right", fontWeight: 600, borderBottom: `1px solid ${C.LINE}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...games].reverse().map((g) => {
                const margin = (g.tm || 0) - (g.op || 0);
                return (
                  <tr key={g.id} style={{ borderBottom: `1px solid ${C.LINE}55` }}>
                    <td style={{ padding: "9px 10px", whiteSpace: "nowrap", color: C.MUTE }}>{g.date}</td>
                    <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ color: C.MUTE }}>{g.home ? "vs" : "@"}</span> <span style={{ fontWeight: 700 }}>{g.opp}</span>
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>
                      <span style={{ fontWeight: 800, fontSize: 12, padding: "2px 8px", borderRadius: 6,
                        background: g.w ? C.WIN_BG : C.LOSS_BG, color: g.w ? C.GOOD : C.LOSS_FG }}>{g.w ? "W" : "L"}</span>
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "Archivo, sans-serif", fontWeight: 700 }}>{g.tm}-{g.op}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, color: margin >= 0 ? C.GOOD : C.LOSS_FG }}>{margin > 0 ? "+" : ""}{margin}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}
