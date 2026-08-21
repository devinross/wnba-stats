import React, { useMemo, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { C, FONT_DISPLAY } from "./palette";
import { teamColors } from "./teamColors";
import TeamBadge from "./TeamBadge.jsx";

// ---------------------------------------------------------------------------
// The salary page: every player in the league on one row, with what she is paid
// next to what she has produced.
//
// It reads a single file — data/<season>/salaries.json, written by
// scripts/build-salaries.mjs — because the alternative is downloading all
// fifteen team bundles to fill one table. Contracts come from a hand-maintained
// sheet (stats.wnba.com publishes none); everything else on the row is computed
// from the same game logs the rest of the site draws.
//
// Three things it is trying to answer, which is why the table has three column
// modes rather than forty columns:
//   Production — what she actually does per game.
//   Play types — what KIND of player she is, as a 0-100 rank per archetype.
//   Value      — production per dollar, and where that ranks.
// ---------------------------------------------------------------------------

const dash = <span style={{ color: C.MUTE }}>—</span>;

/** 1400000 -> "$1.40M"; 528846 -> "$529k". */
function money(value) {
  if (!value) return null;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${Math.round(value / 1000)}k`;
}

const one = (v) => (v == null ? dash : v.toFixed(1));

/**
 * A signed number where LOW is the good end — every defensive difference on the
 * page works this way. A negative on/off means the team defends better with her
 * on it; a negative "vs normal" means the players she guards shot worse than
 * they usually do.
 */
const saved = (v) =>
  v == null ? dash : (
    <span style={{ color: v < 0 ? C.GOOD : v > 0 ? C.LOSS_FG : C.MUTE }}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}
    </span>
  );
const int = (v) => (v == null ? dash : Math.round(v).toLocaleString());

const POSITIONS = [
  { key: "all", label: "All positions" },
  { key: "G", label: "Guards" },
  { key: "F", label: "Forwards" },
  { key: "C", label: "Centers" },
];

// Salary bands, chosen off the actual 2026 shape of the cap: the supermax tier,
// the mid-tier most starters sit in, and everything at or near the minimum.
const SALARY_BANDS = [
  { key: "all", label: "Any salary", test: () => true },
  { key: "top", label: "$1M and up", test: (p) => p.salary >= 1e6 },
  { key: "mid", label: "$400k – $1M", test: (p) => p.salary >= 4e5 && p.salary < 1e6 },
  { key: "low", label: "Under $400k", test: (p) => p.salary > 0 && p.salary < 4e5 },
  { key: "none", label: "Not on the sheet", test: (p) => !p.salary },
];

const SCORE_FLOORS = [
  { key: "0", label: "Any score" },
  { key: "60", label: "60+ (above average)" },
  { key: "75", label: "75+ (top quarter)" },
  { key: "85", label: "85+ (elite)" },
];

const MODES = [
  { key: "production", label: "Production" },
  { key: "types", label: "Play types" },
  { key: "defense", label: "Defense" },
  { key: "value", label: "Value" },
];

// --- score cell -------------------------------------------------------------

/**
 * A 0-100 play-type score, washed in brand plum in proportion to itself. The
 * tint is what makes the table scannable across a row — where a player's
 * strengths are reads as a shape before any of the numbers do.
 */
function Score({ value, active }) {
  if (value == null) return dash;
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 34,
        padding: "3px 7px",
        borderRadius: 7,
        // Below the league midpoint there is nothing to celebrate, so the wash
        // only starts once a score is above it — otherwise every cell is tinted
        // and none of them stand out.
        background: value > 50 ? `rgba(58, 17, 54, ${((value - 50) / 50) * 0.16})` : "transparent",
        color: value >= 75 ? C.BRAND : C.TXT,
        fontWeight: value >= 75 || active ? 700 : 600,
        fontFamily: FONT_DISPLAY,
      }}
    >
      {value}
    </span>
  );
}

// --- columns ----------------------------------------------------------------
//
// `best: "low"` marks a column where a small number is the good one, which is
// what decides the direction of a first click — sorting by $/production should
// open with the cheapest production on top, not the most expensive.

const PRODUCTION_COLUMNS = [
  { key: "gp", label: "GP", value: (p) => p.gp, cell: (p) => p.gp },
  { key: "mpg", label: "MPG", value: (p) => p.mpg, cell: (p) => one(p.mpg) },
  { key: "ppg", label: "PPG", value: (p) => p.ppg, cell: (p) => one(p.ppg) },
  { key: "rpg", label: "REB", value: (p) => p.rpg, cell: (p) => one(p.rpg) },
  { key: "apg", label: "AST", value: (p) => p.apg, cell: (p) => one(p.apg) },
  { key: "spg", label: "STL", value: (p) => p.spg, cell: (p) => one(p.spg) },
  { key: "bpg", label: "BLK", value: (p) => p.bpg, cell: (p) => one(p.bpg) },
  { key: "topg", label: "TOV", best: "low", value: (p) => p.topg, cell: (p) => one(p.topg) },
  { key: "fgPct", label: "FG%", value: (p) => p.fgPct, cell: (p) => one(p.fgPct) },
  { key: "tpPct", label: "3P%", value: (p) => p.tpPct, cell: (p) => one(p.tpPct) },
  { key: "ts", label: "TS%", value: (p) => p.ts, cell: (p) => one(p.ts) },
  { key: "usg", label: "USG%", value: (p) => p.usg, cell: (p) => one(p.usg) },
];

// What the defensive score is built from, so the rank can be argued with. The
// two "vs normal" columns are the matchup feed: how the players she guarded shot
// against her, against how those same players shoot the rest of the time.
const DEFENSE_COLUMNS = [
  { key: "spg", label: "STL", value: (p) => p.spg, cell: (p) => one(p.spg) },
  { key: "bpg", label: "BLK", value: (p) => p.bpg, cell: (p) => one(p.bpg) },
  { key: "pfpg", label: "PF", best: "low", value: (p) => p.pfpg, cell: (p) => one(p.pfpg) },
  {
    key: "defDiff", label: "D ON/OFF", best: "low",
    hint: "Team defensive rating with her on the floor minus with her off it",
    value: (p) => p.defense.defDiff,
    cell: (p) => saved(p.defense.defDiff),
  },
  {
    key: "defFgaPg", label: "SHOTS/G",
    hint: "Shots she was the closest defender on, per game",
    value: (p) => p.defense.fgaPg, cell: (p) => one(p.defense.fgaPg),
  },
  {
    key: "defPct", label: "FG% ALL", best: "low",
    hint: "What the players she guarded shot against her",
    value: (p) => p.defense.pct, cell: (p) => one(p.defense.pct),
  },
  {
    key: "defSaved", label: "VS NORM", best: "low",
    hint: "That figure against what those same players shoot the rest of the time",
    value: (p) => p.defense.diff, cell: (p) => saved(p.defense.diff),
  },
  {
    key: "defRim", label: "RIM", best: "low",
    hint: "Same comparison, on shots from inside six feet",
    value: (p) => p.defense.rimDiff, cell: (p) => saved(p.defense.rimDiff),
  },
  {
    key: "defense", label: "DEF",
    hint: "Defense score",
    value: (p) => (p.scores ? p.scores.defense : null),
    cell: (p) => <Score value={p.scores ? p.scores.defense : null} />,
  },
];

const VALUE_COLUMNS = [
  { key: "gp", label: "GP", value: (p) => p.gp, cell: (p) => p.gp },
  { key: "prodPg", label: "PROD/G", value: (p) => p.prodPg, cell: (p) => one(p.prodPg) },
  { key: "prod", label: "PROD", value: (p) => p.prod, cell: (p) => int(p.prod) },
  {
    key: "costPerProd", label: "$/PROD", best: "low",
    value: (p) => (p.salary ? p.costPerProd : null),
    cell: (p) => (p.costPerProd == null ? dash : `$${p.costPerProd.toLocaleString()}`),
  },
  {
    key: "value", label: "VALUE",
    hint: "Season production per dollar — games missed count against it",
    value: (p) => p.value,
    cell: (p) => (
      <span title={p.valuePerM == null ? undefined : `${p.valuePerM} production per $1M across the season`}>
        <Score value={p.value} />
      </span>
    ),
  },
  {
    // Same money, same production, divided by games played instead of spread
    // across the season — so a player who missed half of it is priced on the
    // half she played rather than on the half she didn't.
    key: "valuePg", label: "VALUE/G",
    hint: "Production per game per dollar — injury and rest priced out",
    value: (p) => p.valuePg,
    cell: (p) => (
      <span title={p.costPerProdPg == null ? undefined : `$${p.costPerProdPg.toLocaleString()} per point of per-game production`}>
        <Score value={p.valuePg} />
      </span>
    ),
  },
];

// --- filter controls --------------------------------------------------------

const controlStyle = {
  appearance: "none",
  WebkitAppearance: "none",
  font: "inherit",
  fontSize: 13,
  color: C.TXT,
  background: C.PANEL,
  border: `1px solid ${C.LINE}`,
  borderRadius: 10,
  padding: "9px 30px 9px 12px",
  cursor: "pointer",
  minWidth: 0,
};

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.MUTE, fontWeight: 700 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <div style={{ position: "relative", display: "grid" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={controlStyle}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.BRAND, fontSize: 11, pointerEvents: "none" }}
      >
        ▾
      </span>
    </div>
  );
}

// --- the salary/production scatter -----------------------------------------

function ScatterTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 12 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, marginBottom: 3 }}>{p.name}</div>
      <div style={{ color: C.MUTE }}>
        {p.abbr} · {p.pos || "—"} · {money(p.salary)}
      </div>
      <div style={{ marginTop: 4 }}>
        {p.prod.toFixed(0)} production, {p.prodPg.toFixed(1)} per game
      </div>
      <div style={{ color: C.MUTE }}>${p.costPerProd.toLocaleString()} per production point</div>
    </div>
  );
}

/**
 * Salary against season production, one dot per player in her team's primary
 * colour. The dashed lines are the medians of what's on screen, so the top-left
 * quadrant is the honest definition of a bargain — more production than half
 * the league for less money than half of it.
 */
function ValueScatter({ rows }) {
  const points = useMemo(
    () =>
      rows
        .filter((p) => p.salary && p.scores)
        // `abbr` is the team she is on now — a mid-season trade leaves two on
        // the row, and the dot should be the colour of the current one.
        .map((p) => ({ ...p, abbr: p.teams[p.teams.length - 1], x: p.salary, y: p.prod })),
    [rows]
  );

  const medians = useMemo(() => {
    if (!points.length) return null;
    const mid = (values) => {
      const s = [...values].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    return { salary: mid(points.map((p) => p.x)), prod: mid(points.map((p) => p.y)) };
  }, [points]);

  if (points.length < 8) return null;

  const dot = (props) => {
    const { cx, cy, payload } = props;
    const [primary] = teamColors({ abbr: payload.abbr });
    return <circle cx={cx} cy={cy} r={5} fill={primary} fillOpacity={0.78} stroke={C.PANEL} strokeWidth={1} />;
  };

  return (
    <>
      <ResponsiveContainer width="100%" height={330}>
        <ScatterChart margin={{ top: 12, right: 22, bottom: 30, left: 4 }}>
          <CartesianGrid stroke={C.LINE} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, (max) => Math.ceil(max / 1e5) * 1e5]}
            tickFormatter={(v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}k`)}
            tick={{ fill: C.MUTE, fontSize: 11 }}
            stroke={C.LINE}
            label={{ value: "2026 salary  →", position: "bottom", fill: C.MUTE, fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            tick={{ fill: C.MUTE, fontSize: 11 }}
            stroke={C.LINE}
            label={{ value: "Season production  →", angle: -90, position: "insideLeft", fill: C.MUTE, fontSize: 12, style: { textAnchor: "middle" } }}
          />
          <ZAxis range={[60, 60]} />
          {medians && <ReferenceLine x={medians.salary} stroke={C.SEPARATOR} strokeDasharray="5 4" />}
          {medians && <ReferenceLine y={medians.prod} stroke={C.SEPARATOR} strokeDasharray="5 4" />}
          <Tooltip cursor={{ strokeDasharray: "3 3", stroke: C.LINE }} content={<ScatterTooltip />} />
          <Scatter data={points} shape={dot} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      <p style={{ fontSize: 12, color: C.MUTE, margin: "10px 2px 0", lineHeight: 1.55 }}>
        Each dot is a player: what she is paid across, what she has produced up. The dashed lines are the medians of
        the {points.length} players on screen{medians ? ` (${money(medians.salary)}, ${Math.round(medians.prod)} production)` : ""} —
        so above the horizontal line and left of the vertical one is the bargain quadrant, and below-and-right is
        the opposite.
      </p>
    </>
  );
}

// --- the page ---------------------------------------------------------------

export default function SalaryView({ data, teams, season, playerHref, onPickPlayer }) {
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState("all");
  const [team, setTeam] = useState("all");
  const [type, setType] = useState("all");
  const [floor, setFloor] = useState("0");
  const [band, setBand] = useState("all");
  const [signing, setSigning] = useState("all");
  const [pool, setPool] = useState("rotation");
  const [mode, setMode] = useState("production");
  // Whether the play-type columns show the score itself or that score per
  // dollar. Same seven columns either way — only what the number means changes.
  const [basis, setBasis] = useState("score");
  const [sort, setSort] = useState({ key: "salary", dir: -1 });

  const teamById = useMemo(() => new Map((teams || []).map((t) => [t.id, t])), [teams]);
  const playTypes = data.playTypes || [];
  const typeLabel = useMemo(() => new Map(playTypes.map((t) => [t.key, t.label])), [playTypes]);

  // Contract designations, taken from whatever the sheet actually contains this
  // year rather than a hardcoded list — the CBA's labels change.
  const signings = useMemo(() => {
    const found = [...new Set(data.players.map((p) => p.signing).filter(Boolean))].sort();
    return [{ key: "all", label: "Any contract" }, ...found.map((s) => ({ key: s, label: s }))];
  }, [data.players]);

  const teamOptions = useMemo(
    () => [{ key: "all", label: "All teams" }, ...(teams || []).map((t) => ({ key: String(t.id), label: t.name }))],
    [teams]
  );
  const typeOptions = useMemo(
    () => [{ key: "all", label: "Any play type" }, ...playTypes.map((t) => ({ key: t.key, label: t.label }))],
    [playTypes]
  );

  // The play-type columns are built from the file, so adding an archetype to
  // the build script puts a column here without touching this component.
  const typeColumns = useMemo(
    () =>
      playTypes.map((t) => {
        const perDollar = basis === "perDollar";
        const at = (p) => (perDollar ? p.roleValue && p.roleValue[t.key] : p.scores && p.scores[t.key]);
        return {
          key: t.key,
          label: t.label.split(" ")[0].toUpperCase(),
          title: perDollar ? `${t.label} per dollar` : t.label,
          value: at,
          cell: (p) => {
            const v = at(p);
            // The raw ratio is what the rank is built from, so it rides along in
            // the tooltip rather than taking a column of its own.
            const ratio =
              perDollar && v != null && p.salary
                ? `${Math.round(p.scores[t.key] / (p.salary / 1e6))} ${t.label.toLowerCase()} score per $1M — ${p.scores[t.key]} on ${money(p.salary)}`
                : undefined;
            return (
              <span title={ratio}>
                <Score value={v == null ? null : v} active={type === t.key} />
              </span>
            );
          },
        };
      }),
    [playTypes, type, basis]
  );

  // Which modes carry the "best fit" column. Play types is the obvious one; Value
  // wants it too, because "she is the best contract on the board" is a different
  // statement depending on whether you are buying a rim protector or a shooter.
  const showsFit = mode === "types" || mode === "value";

  const columns =
    mode === "types" ? typeColumns
    : mode === "defense" ? DEFENSE_COLUMNS
    : mode === "value" ? VALUE_COLUMNS
    : PRODUCTION_COLUMNS;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bandTest = (SALARY_BANDS.find((b) => b.key === band) || SALARY_BANDS[0]).test;
    const min = Number(floor);
    return data.players.filter((p) => {
      if (pool === "rotation" && !p.scores) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (pos !== "all" && p.posGroup !== pos) return false;
      if (team !== "all" && String(p.teamId) !== team) return false;
      if (signing !== "all" && p.signing !== signing) return false;
      if (!bandTest(p)) return false;
      if (type !== "all") {
        const score = p.scores ? p.scores[type] : null;
        if (score == null) return false;
        if (min && score < min) return false;
      }
      return true;
    });
  }, [data.players, query, pos, team, type, floor, band, signing, pool]);

  const sorted = useMemo(() => {
    // The columns currently on screen come first, so they win any key collision:
    // "defense" is both the Defense mode's score column and a play-type column,
    // and clicking a header has to sort by the number under it — which is the
    // score in one mode and score-per-dollar in the other.
    const all = [
      ...columns,
      { key: "salary", best: "high", value: (p) => p.salary },
      { key: "name", best: "low", value: (p) => p.name.toLowerCase() },
      ...PRODUCTION_COLUMNS, ...DEFENSE_COLUMNS, ...VALUE_COLUMNS, ...typeColumns,
    ];
    const col = all.find((c) => c.key === sort.key) || all[0];
    const flip = col.best === "low" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = col.value(a), bv = col.value(b);
      // A player with no number for this column sorts to the bottom whichever
      // way the column is pointing — "unknown" is not "worst".
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return (b.prod || 0) - (a.prod || 0);
      return (av < bv ? -1 : 1) * sort.dir * flip;
    });
  }, [filtered, sort, columns, typeColumns]);

  // Selecting a play type is a statement about what you want to look at, so it
  // sorts by that score and shows the score columns without a second click.
  const pickType = (next) => {
    setType(next);
    if (next === "all") return;
    // Defense has a mode of its own showing what the score is made of; the rest
    // are only ever columns in the play-type table.
    setMode(next === "defense" ? "defense" : "types");
    setSort({ key: next, dir: -1 });
  };

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }));

  const active =
    query || pos !== "all" || team !== "all" || type !== "all" || band !== "all" ||
    signing !== "all" || floor !== "0" || pool !== "rotation";
  const reset = () => {
    setQuery(""); setPos("all"); setTeam("all"); setType("all");
    setFloor("0"); setBand("all"); setSigning("all"); setPool("rotation");
  };

  const cell = { padding: "9px 10px", borderBottom: `1px solid ${C.LINE}55` };
  const num = { ...cell, textAlign: "right", fontFamily: FONT_DISPLAY, fontWeight: 700, whiteSpace: "nowrap" };
  const th = { padding: "8px 10px", fontWeight: 600, borderBottom: `1px solid ${C.LINE}`, whiteSpace: "nowrap" };

  const totalPayroll = useMemo(
    () => filtered.reduce((a, p) => a + (p.salary || 0), 0),
    [filtered]
  );

  return (
    <main className="hf-container" style={{ paddingTop: 22, paddingBottom: 10 }}>
      <section style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px", marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: 0 }}>Filter the league</h2>
          {active && (
            <button
              type="button"
              onClick={reset}
              className="pill-toggle"
              style={{
                appearance: "none", border: `1px solid ${C.LINE}`, background: "transparent",
                borderRadius: 999, padding: "5px 14px", fontSize: 12, color: C.BRAND, cursor: "pointer",
                fontFamily: FONT_DISPLAY, fontWeight: 600,
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))",
            gap: 12,
          }}
        >
          <Field label="Search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Player name"
              style={{ ...controlStyle, padding: "9px 12px", cursor: "text" }}
            />
          </Field>
          <Field label="Position">
            <Select value={pos} onChange={setPos} options={POSITIONS} />
          </Field>
          <Field label="Team">
            <Select value={team} onChange={setTeam} options={teamOptions} />
          </Field>
          <Field label="Play type">
            <Select value={type} onChange={pickType} options={typeOptions} />
          </Field>
          <Field label="Minimum score">
            <Select value={floor} onChange={setFloor} options={SCORE_FLOORS} />
          </Field>
          <Field label="Salary">
            <Select value={band} onChange={setBand} options={SALARY_BANDS} />
          </Field>
          <Field label="Contract">
            <Select value={signing} onChange={setSigning} options={signings} />
          </Field>
          <Field label="Who's included">
            <Select
              value={pool}
              onChange={setPool}
              options={[
                { key: "rotation", label: `Rotation (${data.meta.minMinutes}+ min)` },
                { key: "all", label: "Everyone on a roster" },
              ]}
            />
          </Field>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: C.MUTE, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
          <span>
            <strong style={{ color: C.TXT }}>{sorted.length}</strong> player{sorted.length === 1 ? "" : "s"}
          </span>
          <span>
            <strong style={{ color: C.TXT }}>{sorted.filter((p) => p.salary).length}</strong> with a listed salary
          </span>
          <span>
            Combined <strong style={{ color: C.TXT }}>{money(totalPayroll) || "$0"}</strong>
          </span>
          {type !== "all" && <span>Ranked by {typeLabel.get(type)?.toLowerCase()} score</span>}
        </div>
      </section>

      <section style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px", marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: 0 }}>
            {season} salaries
          </h2>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {mode === "types" && (
              <div style={{ display: "flex", gap: 4, marginRight: 6 }}>
                {[
                  { key: "score", label: "Score" },
                  { key: "perDollar", label: "Per $" },
                ].map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setBasis(b.key)}
                    className="pill-toggle"
                    style={{
                      appearance: "none", cursor: "pointer", borderRadius: 999,
                      padding: "6px 13px", fontSize: 12, fontFamily: FONT_DISPLAY, fontWeight: 600,
                      border: `1px solid ${basis === b.key ? C.BRAND : C.LINE}`,
                      background: basis === b.key ? C.PANEL_2 : "transparent",
                      color: basis === b.key ? C.BRAND : C.MUTE,
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`hf-btn pill-toggle ${mode === m.key ? "hf-btn--primary" : "hf-btn--ghost"}`}
                style={{ padding: "7px 15px", fontSize: 13 }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="scroll-x">
          {/* Wide enough that no column has to squeeze; narrower screens get the
              sideways scroll .scroll-x paints a fade for. */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: mode === "value" ? 1040 : mode === "types" ? 1180 : 1040 }}>
            <thead>
              <tr style={{ color: C.MUTE, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
                <th style={{ ...th, textAlign: "left", width: 34 }}>#</th>
                <th style={{ ...th, textAlign: "left", padding: 0 }} aria-sort={sort.key === "name" ? (sort.dir === -1 ? "descending" : "ascending") : "none"}>
                  <SortButton align="left" active={sort.key === "name"} dir={sort.dir} onClick={() => toggle("name")}>
                    Player
                  </SortButton>
                </th>
                <th style={{ ...th, textAlign: "left" }}>Team</th>
                <th style={{ ...th, textAlign: "right", padding: 0 }} aria-sort={sort.key === "salary" ? (sort.dir === -1 ? "descending" : "ascending") : "none"}>
                  <SortButton title="salary" active={sort.key === "salary"} dir={sort.dir} onClick={() => toggle("salary")}>
                    {season} Salary
                  </SortButton>
                </th>
                {showsFit && <th style={{ ...th, textAlign: "left" }}>Best fit</th>}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={{ ...th, textAlign: "right", padding: 0 }}
                    title={c.hint || c.title}
                    aria-sort={sort.key === c.key ? (sort.dir === -1 ? "descending" : "ascending") : "none"}
                  >
                    <SortButton title={c.title || c.label} active={sort.key === c.key} dir={sort.dir} onClick={() => toggle(c.key)}>
                      {c.label}
                    </SortButton>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, idx) => {
                const t = teamById.get(p.teamId);
                const href = playerHref ? playerHref(p.teamId, p.name) : null;
                return (
                  <tr key={p.playerId}>
                    <td style={{ ...cell, color: C.MUTE, fontFamily: FONT_DISPLAY, width: 34 }}>{idx + 1}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      {href ? (
                        <a
                          href={href}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                            e.preventDefault();
                            onPickPlayer(p.teamId, p.name);
                          }}
                          style={{ color: C.TXT, fontWeight: 600 }}
                        >
                          {p.name}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      )}
                      <span style={{ color: C.MUTE, marginLeft: 7, fontSize: 12 }}>{p.pos || "—"}</span>
                    </td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        {t && <TeamBadge team={t} size={22} />}
                        <span style={{ fontSize: 12 }}>{p.teams[p.teams.length - 1]}</span>
                        {p.teams.length > 1 && (
                          <span style={{ fontSize: 11, color: C.MUTE }} title={`Also played for ${p.teams.slice(0, -1).join(", ")} this season`}>
                            ←{p.teams[0]}
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ ...num, background: sort.key === "salary" ? C.PANEL_2 : undefined }}>
                      {money(p.salary) || dash}
                      {p.contracts > 1 && (
                        <span style={{ color: C.MUTE, fontWeight: 400, fontSize: 11 }} title="Two contracts this season, added together">
                          {" "}×{p.contracts}
                        </span>
                      )}
                      {p.signing && <div style={{ fontSize: 10, color: C.MUTE, fontWeight: 600, letterSpacing: 0.5 }}>{p.signing}</div>}
                    </td>
                    {/* Two labels when two scores are within a couple of points —
                        she really is both, and naming one would be a coin flip. */}
                    {showsFit && (
                      <td style={{ ...cell, whiteSpace: "nowrap", fontSize: 12, color: p.fit && p.fit.length ? C.TXT : C.MUTE }}>
                        {p.fit && p.fit.length
                          ? p.fit.map((key) => typeLabel.get(key)).join(" · ")
                          : p.scores
                          ? "Balanced"
                          : dash}
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} style={{ ...num, background: sort.key === c.key ? C.PANEL_2 : undefined }}>
                        {c.cell(p)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!sorted.length && (
                <tr>
                  <td colSpan={4 + (showsFit ? 1 : 0) + columns.length} style={{ ...cell, textAlign: "center", color: C.MUTE, padding: "34px 10px" }}>
                    No players match those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: 12, color: C.MUTE, margin: "12px 2px 0", lineHeight: 1.55 }}>
          Salaries are the {season} cap figure from the{" "}
          <a href={data.meta.source.url} target="_blank" rel="noopener noreferrer" style={{ color: C.BRAND }}>
            {data.meta.source.name}
          </a>
          ; stats.wnba.com publishes no contract data, so they're maintained by hand and can lag a signing.
          Everything else is computed from this season's game logs. {data.meta.withSalary} of {data.meta.players}{" "}
          rostered players have a listed figure.
        </p>
      </section>

      <section style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px", marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: 0 }}>Production vs salary</h2>
          <span style={{ fontSize: 11, color: C.MUTE }}>follows the filters above</span>
        </div>
        <ValueScatter rows={filtered} />
      </section>

      <section style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px", marginBottom: 22 }}>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: "0 0 6px" }}>
          How the scores work
        </h2>
        <p style={{ fontSize: 13, color: C.MUTE, margin: "0 0 14px", lineHeight: 1.6 }}>
          Each play-type score is a 0-100 rank among the {data.meta.qualified} players with at least{" "}
          {data.meta.minGames} games and {data.meta.minMinutes} minutes — 90 means top 10% of rotation players at that
          thing. They blend volume with how well it goes, so a low score can mean either she doesn't do it or it
          doesn't work. They describe a role, not a grade: a 95 rebounder is not a better player than a 60 one, she is
          a different one. Switching the table to <strong style={{ color: C.TXT }}>Per $</strong> re-ranks the same
          seven columns by score per dollar, which is how you find the cheapest real rebounder or rim protector on the
          board rather than the best one.
        </p>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px 22px", margin: 0 }}>
          {playTypes.map((t) => (
            <div key={t.key}>
              <dt style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{t.label}</dt>
              <dd style={{ margin: 0, fontSize: 12.5, color: C.MUTE, lineHeight: 1.55 }}>{t.blurb}</dd>
            </div>
          ))}
          <div>
            <dt style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Value</dt>
            <dd style={{ margin: 0, fontSize: 12.5, color: C.MUTE, lineHeight: 1.55 }}>
              Production per million dollars, ranked. Production is Game Score — points, rebounds, assists, steals and
              blocks less the misses and turnovers. <strong style={{ color: C.TXT }}>Value</strong> sums it over the
              season, so games missed count against the contract; <strong style={{ color: C.TXT }}>Value/G</strong>
              divides by games played instead, pricing out injury and rest. A player who missed half the year sits low
              on the first and high on the second, and neither is the wrong answer — one asks whether the contract paid
              off, the other whether the player is worth it.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

/** A sortable column header. Same behaviour as the standings table's. */
function SortButton({ active, dir, onClick, align = "right", title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Sort by ${title || (typeof children === "string" ? children : "this column")}`}
      style={{
        appearance: "none", background: "transparent", border: "none", cursor: "pointer",
        font: "inherit", letterSpacing: "inherit", textTransform: "inherit",
        color: active ? C.BRAND : C.MUTE, fontWeight: active ? 700 : 600,
        padding: "8px 10px", width: "100%", textAlign: align, whiteSpace: "nowrap",
      }}
    >
      {children}
      <span aria-hidden="true" style={{ marginLeft: 3, opacity: active ? 1 : 0.25 }}>
        {active && dir === 1 ? "▲" : "▼"}
      </span>
    </button>
  );
}
