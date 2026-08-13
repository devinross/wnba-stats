// ---------------------------------------------------------------------------
// Rotation pattern — when each player is actually on the floor.
//
// Every other chart on this site is a season total. This one is a clock: each
// row is a player, each column one minute of game time, and the shading is how
// often she's on the floor in that minute. Starters read as a dark band that
// breaks around the 6-8 minute mark; bench players read as the inverse. Where
// two rows are exact negatives of each other, you're looking at a substitution
// pair.
//
// The shading divides by the games that player appeared in, not the team's
// games, so someone who missed a month still reads as whatever role she plays
// when available. `gp` is on every row so a thin sample is visible rather than
// implied.
//
// Built from stats.wnba.com's `gamerotation` endpoint (one request per game),
// aggregated by scripts/fetch-data.mjs into team.rotation.
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from "react";
import { C, FONT_DISPLAY, FONT_BODY } from "./palette";
import StaleNote from "./StaleNote.jsx";
import SourceNote from "./SourceNote.jsx";

const MINUTES = 40; // regulation; overtime is in the totals, not the grid
const QUARTER = 10;

// Keep the grid readable: a player who appeared in a handful of games has a
// row driven by noise, and a deep-bench row of near-empty cells says nothing.
const MIN_SHARE_OF_GAMES = 0.25;
const MIN_MPG = 4;

// White → brand plum. The ramp is the share of games on the floor, so it reads
// as one quantity and needs one hue (a rainbow here would imply categories).
function shade(pct) {
  if (pct <= 1) return C.PANEL_2;
  const t = Math.min(100, pct) / 100;
  // Perceptually the low end needs help or everything under ~30% looks blank.
  const e = Math.pow(t, 0.78);
  const from = [245, 240, 244]; // a hair off PANEL_2 so 1% isn't a hard edge
  const to = [58, 17, 54]; // C.BRAND
  return `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * e)).join(",")})`;
}

const firstName = (n) => String(n).trim().split(" ")[0];
const lastName = (n) => {
  const parts = String(n).trim().split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
};

function clock(min) {
  // Minute index → the quarter and the time within it, the way a box score
  // would say it (minute 0 is "Q1 10:00", the tip).
  const q = Math.floor(min / QUARTER) + 1;
  const left = QUARTER - (min % QUARTER);
  return `Q${q} ${left}:00–${left - 1}:00`;
}

export default function RotationChart({ rotation, stale, source, selectedName, onPlayer, playerHref }) {
  const [hover, setHover] = useState(null);

  const players = useMemo(() => {
    if (!rotation || !Array.isArray(rotation.players)) return [];
    const teamGames = rotation.games || 0;
    return rotation.players.filter(
      (p) => p.gp >= Math.max(2, teamGames * MIN_SHARE_OF_GAMES) && p.mpg >= MIN_MPG
    );
  }, [rotation]);

  if (!players.length) {
    return (
      <section style={panel}>
        <h2 style={heading}>Rotation pattern</h2>
        <p style={{ color: C.MUTE, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          Rotation data isn't available for this team yet. It's built one game at a time from
          wnba.com's play-by-play rotations, and the endpoint doesn't serve every season.
        </p>
      </section>
    );
  }

  const teamGames = rotation.games || 0;

  return (
    <section style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <h2 style={heading}>Rotation pattern · when each player is on the floor</h2>
        <span style={{ fontSize: 11, color: C.MUTE }}>
          darker = on the floor more often · {teamGames} game{teamGames === 1 ? "" : "s"}
        </span>
      </div>
      <StaleNote stale={stale} />
      <p style={{ fontSize: 12, color: C.MUTE, margin: "0 0 12px", lineHeight: 1.5 }}>
        Each column is one minute of game time. Shading is the share of her own appearances that
        player was on the floor for that minute, so a starter who missed time still reads as a
        starter. Rows that are photo-negatives of each other are the substitution pairs.
      </p>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 11, color: C.MUTE }}>
        <span>Share of games on floor</span>
        {[0, 25, 50, 75, 100].map((v) => (
          <span key={v} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: shade(v), border: `1px solid ${C.LINE}` }} />
            {v}%
          </span>
        ))}
      </div>

      <div className="scroll-x" style={{ overflowX: "auto", position: "relative" }}>
        <div style={{ minWidth: 560 }}>
          {players.map((p) => {
            const selected = p.name === selectedName;
            return (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 10, alignItems: "center", marginBottom: 3 }}>
                <div
                  style={{
                    fontSize: 12,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: selected ? C.BRAND : C.TXT,
                    fontWeight: selected ? 700 : 400,
                  }}
                  title={`${p.name} — ${p.gp} game${p.gp === 1 ? "" : "s"}, ${p.starts} start${p.starts === 1 ? "" : "s"}`}
                >
                  {/* A player can appear in the rotation but not the current
                      roster (mid-season trades), and there's no page to send
                      those to — so the link only exists when the slug does. */}
                  {onPlayer && playerHref && playerHref(p.name) ? (
                    <a
                      href={playerHref(p.name)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        onPlayer(p.name);
                      }}
                      style={{ color: "inherit", textDecoration: "none", borderBottom: `1px solid ${C.LINE}` }}
                    >
                      <span style={{ color: C.MUTE }}>{firstName(p.name).charAt(0)}. </span>
                      {lastName(p.name)}
                    </a>
                  ) : (
                    <>
                      <span style={{ color: C.MUTE }}>{firstName(p.name).charAt(0)}. </span>
                      {lastName(p.name)}
                    </>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${MINUTES}, 1fr)`, gap: 1.5 }}>
                  {p.heat.map((v, m) => (
                    <div
                      key={m}
                      onMouseEnter={() => setHover({ p, m, v })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        height: 18,
                        background: shade(v),
                        borderRadius: 2,
                        // A hairline before each quarter keeps the eye from
                        // reading the 40 columns as one undifferentiated strip.
                        marginLeft: m > 0 && m % QUARTER === 0 ? 3 : 0,
                        cursor: "default",
                        outline: hover && hover.p.id === p.id && hover.m === m ? `2px solid ${C.BRAND_HI}` : "none",
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Quarter axis */}
          <div style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 10, marginTop: 6 }}>
            <div />
            <div style={{ display: "grid", gridTemplateColumns: `repeat(4, 1fr)`, fontSize: 11, color: C.MUTE }}>
              {["Q1", "Q2", "Q3", "Q4"].map((q) => (
                <div key={q} style={{ textAlign: "center" }}>{q}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hover readout — a fixed slot rather than a floating tooltip, so the
          grid never shifts and the number is always in the same place. */}
      <div style={{ minHeight: 20, marginTop: 10, fontSize: 12, color: C.MUTE, fontFamily: FONT_BODY }}>
        {hover ? (
          <>
            <span style={{ color: C.BRAND, fontWeight: 700, fontFamily: FONT_DISPLAY }}>{hover.p.name}</span>
            {" · "}{clock(hover.m)}{" · on the floor in "}
            <strong style={{ color: C.TXT }}>{hover.v}%</strong>
            {` of her ${hover.p.gp} game${hover.p.gp === 1 ? "" : "s"}`}
          </>
        ) : (
          "Hover a cell for the exact share."
        )}
      </div>

      {/* The same rotation as numbers: how a coach uses each player, rather
          than when. Sorted by minutes, like the grid. */}
      <div className="scroll-x" style={{ overflowX: "auto", marginTop: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
          <thead>
            <tr>
              {["Player", "GP", "Starts", "MPG", "Shifts/g", "Avg shift", "First sub in", "+/− per g"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} style={{ background: p.name === selectedName ? C.PANEL_2 : "transparent" }}>
                <td style={{ ...td, textAlign: "left", fontWeight: p.name === selectedName ? 700 : 400 }}>{p.name}</td>
                <td style={td}>{p.gp}</td>
                <td style={td}>{p.starts}</td>
                <td style={td}>{p.mpg}</td>
                <td style={td}>{p.stints}</td>
                <td style={td}>{p.avgStint}</td>
                <td style={{ ...td, color: p.firstIn == null ? C.MUTE : C.TXT }}>
                  {p.firstIn == null ? "always starts" : `${p.firstIn} min`}
                </td>
                <td style={{ ...td, color: p.plus > 0 ? C.GOOD : p.plus < 0 ? C.LOSS_FG : C.MUTE }}>
                  {p.plus > 0 ? "+" : ""}{p.plus}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: C.MUTE, margin: "8px 2px 0", lineHeight: 1.5 }}>
        A shift is one unbroken stretch on the floor. "First sub in" is the average game clock of
        her first appearance in the games she came off the bench — blank for a player who has
        always started. Players under {MIN_MPG} minutes a game, or appearing in under a quarter of
        the team's games, are left out of the grid.
      </p>
      <SourceNote source={source} />
    </section>
  );
}

const panel = {
  background: C.PANEL,
  border: `1px solid ${C.LINE}`,
  borderRadius: 16,
  padding: "18px 20px",
  marginBottom: 22,
};
const heading = { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: "0 0 6px" };
const th = {
  padding: "6px 8px",
  borderBottom: `1px solid ${C.SEPARATOR}`,
  color: C.MUTE,
  fontWeight: 500,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  whiteSpace: "nowrap",
};
const td = {
  padding: "6px 8px",
  borderBottom: `1px solid ${C.LINE}`,
  textAlign: "right",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};
