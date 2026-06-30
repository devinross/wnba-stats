import React, { useMemo } from "react";
import { C } from "./palette";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

const MIN_FLOOR = 40; // ignore tiny on-court samples (noisy)

// The on/off endpoint returns names as "Last, First", so the surname is the
// part before the comma (falling back to the last token for "First Last").
function lastName(name) {
  const s = String(name).trim();
  if (s.includes(",")) return s.split(",")[0].trim();
  const parts = s.split(" ");
  return parts[parts.length - 1];
}

// Build axis domain with padding around the data and 0.
function domain(values) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = Math.max(2, (hi - lo) * 0.18);
  return [Math.floor(lo - pad), Math.ceil(hi + pad)];
}

function CustomTooltip({ active, payload }) {
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
      <div style={{ fontFamily: "Archivo, sans-serif", fontWeight: 800, color: C.ORANGE, marginBottom: 6 }}>{d.name}</div>
      {row("Offense on/off", `${d.offDiff > 0 ? "+" : ""}${d.offDiff} / 100`, d.offDiff >= 0 ? C.GOOD : C.BAD)}
      {row("Defense on/off", `${d.defDiff > 0 ? "+" : ""}${d.defDiff} / 100`, d.defDiff <= 0 ? C.GOOD : C.BAD)}
      {row("Net impact", `${d.netDiff > 0 ? "+" : ""}${d.netDiff} / 100`, d.netDiff >= 0 ? C.GOOD : C.BAD)}
      {row("On-court min", d.minOn)}
      <div style={{ color: C.MUTE, marginTop: 6, fontSize: 11, lineHeight: 1.4 }}>
        On: {d.offOn}/{d.defOn} off/def · Off: {d.offOff}/{d.defOff}
      </div>
    </div>
  );
}

export default function OnOffChart({ onOff, selectedName }) {
  const data = useMemo(
    () =>
      (onOff || [])
        .filter((p) => p.minOn >= MIN_FLOOR)
        .map((p) => ({ ...p, x: p.offDiff, y: p.defDiff, z: p.minOn })),
    [onOff]
  );

  if (!data.length) {
    return (
      <section style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px", marginBottom: 22 }}>
        <h3 style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 15, margin: "0 0 6px" }}>On/off impact</h3>
        <p style={{ color: C.MUTE, fontSize: 13, margin: 0 }}>
          On/off ratings weren't returned (the advanced endpoint may be unavailable from this host).
        </p>
      </section>
    );
  }

  const xDom = domain(data.map((d) => d.x));
  const yDom = domain(data.map((d) => d.y));

  const renderDot = (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const selected = payload.name === selectedName;
    const r = 5 + Math.min(9, Math.sqrt(payload.minOn) / 3);
    const fill = payload.netDiff >= 0 ? C.GOOD : C.BAD;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={selected ? 0.95 : 0.55}
          stroke={selected ? C.ORANGE : fill} strokeWidth={selected ? 2.5 : 1} />
        <text x={cx + r + 4} y={cy + 4} fill={selected ? C.ORANGE : C.TXT} fontSize={11}
          fontWeight={selected ? 800 : 500} fontFamily="Familjen Grotesk, sans-serif">
          {lastName(payload.name)}
        </text>
      </g>
    );
  };

  return (
    <section style={{ background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px", marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <h3 style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 15, margin: 0 }}>On/off impact · per 100 possessions</h3>
        <span style={{ fontSize: 11, color: C.MUTE }}>dot size = minutes · top-right = helps both ends</span>
      </div>
      <p style={{ fontSize: 12, color: C.MUTE, margin: "0 0 6px", lineHeight: 1.5 }}>
        How the team's offense and defense change with each player on vs. off the floor.
        Right = team scores more with them on. Up = team allows fewer (defense axis is
        reversed so better defense is higher).
      </p>

      <div style={{ position: "relative" }}>
        {/* quadrant corner captions */}
        <span style={cornerStyle("tl")}>Hurts offense · helps defense</span>
        <span style={cornerStyle("tr", C.GOOD)}>Helps both</span>
        <span style={cornerStyle("bl", C.BAD)}>Hurts both</span>
        <span style={cornerStyle("br")}>Helps offense · hurts defense</span>

        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 6 }}>
            <CartesianGrid stroke={C.LINE} strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" domain={xDom} tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE}
              label={{ value: "Offensive on/off  (pts per 100 →)", position: "bottom", fill: C.MUTE, fontSize: 12 }} />
            <YAxis type="number" dataKey="y" domain={yDom} reversed tick={{ fill: C.MUTE, fontSize: 11 }} stroke={C.LINE}
              label={{ value: "Defensive on/off  (↑ = fewer opp pts per 100)", angle: -90, position: "insideLeft", fill: C.MUTE, fontSize: 12, style: { textAnchor: "middle" } }} />
            <ZAxis type="number" dataKey="z" range={[60, 60]} />
            <ReferenceLine x={0} stroke={C.ORANGE} strokeOpacity={0.5} strokeDasharray="5 4" />
            <ReferenceLine y={0} stroke={C.ORANGE} strokeOpacity={0.5} strokeDasharray="5 4" />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: C.LINE }} />
            <Scatter data={data} shape={renderDot} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function cornerStyle(pos, color) {
  const base = {
    position: "absolute",
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: 700,
    color: color || C.MUTE,
    opacity: 0.7,
    pointerEvents: "none",
    zIndex: 1,
  };
  const map = {
    tl: { top: 22, left: 44 },
    tr: { top: 22, right: 28, textAlign: "right" },
    bl: { bottom: 40, left: 44 },
    br: { bottom: 40, right: 28, textAlign: "right" },
  };
  return { ...base, ...map[pos] };
}
