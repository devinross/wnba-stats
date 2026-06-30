import React, { useMemo, useState } from "react";
import { C } from "./palette";

// ---------------------------------------------------------------------------
// CourtChart — a schematic SVG half-court that colors six shot zones either by
// shooting efficiency (FG% vs the WNBA average for that zone) or by shot volume
// (share of attempts). FG% and makes/attempts are always printed on each zone.
//
// Zones come from the leaguedash*shotlocations feed as { z, m, a } where m/a are
// season totals; `league` is the same shape aggregated across the whole WNBA and
// is the baseline the efficiency view compares against.
// ---------------------------------------------------------------------------

const r1 = (n) => Math.round(n * 10) / 10;
const pctOf = (m, a) => (a > 0 ? r1((m / a) * 100) : null);

// Linear interpolate between two #rrggbb colors. t in [0,1].
function hexLerp(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

// Zone label text + anchor point (viewBox 0 0 500 470, baseline at the bottom).
const ZONE_META = {
  ra: { label: "Restricted", x: 250, y: 398 },
  paint: { label: "Paint", x: 250, y: 345 },
  mid: { label: "Mid-range", x: 250, y: 232 },
  lc3: { label: "L corner", x: 24, y: 388 },
  rc3: { label: "R corner", x: 476, y: 388 },
  atb3: { label: "Above break", x: 250, y: 92 },
};

// Filled zone shapes. Drawn in this order so paint sits on top of the mid-range
// horseshoe and the restricted area sits on top of the paint.
const ZONE_PATHS = [
  ["mid", "M45,300 L45,470 L455,470 L455,300 Q250,60 45,300 Z"],
  ["atb3", "M0,0 L0,300 L45,300 Q250,60 455,300 L500,300 L500,0 Z"],
  ["lc3", "M0,300 L45,300 L45,470 L0,470 Z"],
  ["rc3", "M455,300 L500,300 L500,470 L455,470 Z"],
  ["paint", "M175,285 L325,285 L325,470 L175,470 Z"],
  // Restricted area: straight sides up from the baseline, then a semicircle that
  // bulges toward center court (same direction as the 3-point arc).
  ["ra", "M204,470 L204,425 A46,46 0 0,1 296,425 L296,470 Z"],
];

// Display order + full names for the numbers table (matches the court zones).
const ZONE_ROWS = [
  ["ra", "Restricted area"],
  ["paint", "Paint (non-RA)"],
  ["mid", "Mid-range"],
  ["lc3", "Left corner 3"],
  ["rc3", "Right corner 3"],
  ["atb3", "Above the break 3"],
];

// Per-zone numbers table: FG%, makes/attempts, and the delta vs the WNBA
// average for that zone. Reused by the Team and Players tabs next to the court.
export function ZoneTable({ zones, league }) {
  const lByZone = new Map((league || []).map((z) => [z.z, z]));
  const byZone = new Map((zones || []).map((z) => [z.z, z]));
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ color: C.MUTE, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
          {["Zone", "FG%", "FGM/FGA", "vs lg"].map((h, k) => (
            <th key={h} style={{ padding: "8px 8px", textAlign: k === 0 ? "left" : "right", fontWeight: 600, borderBottom: `1px solid ${C.LINE}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ZONE_ROWS.map(([key, name]) => {
          const z = byZone.get(key);
          const lz = lByZone.get(key);
          const pct = z ? pctOf(z.m, z.a) : null;
          const lp = lz ? pctOf(lz.m, lz.a) : null;
          const delta = pct != null && lp != null ? r1(pct - lp) : null;
          return (
            <tr key={key} style={{ borderBottom: `1px solid ${C.LINE}55` }}>
              <td style={{ padding: "9px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{name}</td>
              <td style={{ padding: "9px 8px", textAlign: "right", fontFamily: "Archivo, sans-serif", fontWeight: 700 }}>{pct == null ? "—" : `${pct}%`}</td>
              <td style={{ padding: "9px 8px", textAlign: "right", color: C.MUTE }}>{z ? `${z.m}/${z.a}` : "—"}</td>
              <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700, color: delta == null ? C.MUTE : delta >= 0 ? C.GOOD : C.LOSS_FG }}>
                {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ToggleButton({ active, onClick, children }) {
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

export default function CourtChart({ zones, league }) {
  const [mode, setMode] = useState("eff"); // "eff" = vs league · "vol" = shot share

  const byZone = useMemo(() => {
    const m = new Map();
    for (const z of zones || []) m.set(z.z, z);
    return m;
  }, [zones]);

  const leagueByZone = useMemo(() => {
    const m = new Map();
    for (const z of league || []) m.set(z.z, z);
    return m;
  }, [league]);

  const totalAtt = useMemo(
    () => (zones || []).reduce((s, z) => s + z.a, 0),
    [zones]
  );
  const maxAtt = useMemo(
    () => Math.max(1, ...(zones || []).map((z) => z.a)),
    [zones]
  );

  if (!zones || !zones.length) return null;

  // Fill color + opacity for a zone under the active mode.
  const fillFor = (key) => {
    const z = byZone.get(key);
    if (!z || z.a === 0) return { fill: C.PANEL_2, opacity: 0.3 };
    if (mode === "vol") {
      return { fill: C.GOLD, opacity: 0.14 + 0.6 * (z.a / maxAtt) };
    }
    // Efficiency: this zone's FG% minus the league's FG% for the same zone,
    // mapped onto a red→neutral→green scale clamped at ±10 percentage points.
    const lz = leagueByZone.get(key);
    const lp = lz && lz.a > 0 ? (lz.m / lz.a) * 100 : null;
    const p = (z.m / z.a) * 100;
    if (lp == null) return { fill: C.PANEL_2, opacity: 0.55 };
    const t = Math.max(-1, Math.min(1, (p - lp) / 10));
    const fill = t >= 0 ? hexLerp(C.PANEL_2, C.GOOD, t) : hexLerp(C.PANEL_2, C.BAD, -t);
    return { fill, opacity: 0.7 };
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <ToggleButton active={mode === "eff"} onClick={() => setMode("eff")}>
          Efficiency
        </ToggleButton>
        <ToggleButton active={mode === "vol"} onClick={() => setMode("vol")}>
          Volume
        </ToggleButton>
      </div>

      <svg viewBox="0 0 500 470" width="100%" style={{ display: "block", maxWidth: 460, margin: "0 auto" }}>
        {/* Zone fills */}
        {ZONE_PATHS.map(([key, d]) => {
          const { fill, opacity } = fillFor(key);
          return <path key={key} d={d} fill={fill} fillOpacity={opacity} />;
        })}

        {/* Court line overlays */}
        <g fill="none" stroke={C.LINE} strokeWidth={2} strokeOpacity={0.9}>
          <rect x={1} y={1} width={498} height={468} rx={4} />
          {/* paint + free-throw arc */}
          <rect x={175} y={285} width={150} height={185} />
          <path d="M196,285 A54,54 0 0,0 304,285" />
          {/* 3-point line: corners + arc */}
          <path d="M45,470 L45,300 Q250,60 455,300 L455,470" strokeWidth={2.5} />
          {/* backboard + hoop */}
          <line x1={234} y1={432} x2={266} y2={432} strokeWidth={3} stroke={C.MUTE} />
          <circle cx={250} cy={425} r={5} stroke={C.MUTE} strokeWidth={2} />
        </g>

        {/* Zone labels */}
        {ZONE_PATHS.map(([key]) => {
          const meta = ZONE_META[key];
          const z = byZone.get(key);
          const pct = z ? pctOf(z.m, z.a) : null;
          return (
            <g key={`l-${key}`} textAnchor="middle" style={{ pointerEvents: "none" }}>
              <text x={meta.x} y={meta.y - 12} fontSize={10} fontWeight={600} fill={C.MUTE}>
                {meta.label}
              </text>
              <text x={meta.x} y={meta.y + 6} fontSize={17} fontWeight={800} fontFamily="Archivo, sans-serif" fill={C.TXT}>
                {pct == null ? "—" : `${pct}%`}
              </text>
              <text x={meta.x} y={meta.y + 20} fontSize={10} fill={C.MUTE}>
                {z ? `${z.m}/${z.a}` : "0/0"}
              </text>
            </g>
          );
        })}
      </svg>

      <p style={{ fontSize: 11, color: C.MUTE, margin: "12px 2px 0", lineHeight: 1.5, textAlign: "center" }}>
        {mode === "eff"
          ? "Each zone shaded by FG% vs the WNBA average for that zone — green = above, red = below."
          : "Each zone shaded gold by its share of shot attempts — brighter = more shots taken there."}
      </p>
    </div>
  );
}
