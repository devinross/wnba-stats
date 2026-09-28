import React from "react";
import { C, FONT_DISPLAY } from "./palette";

// The written assessment at the top of a team or player page. The words come
// from src/scouting.js; this only sets them.
export default function ScoutingReport({ text, style }) {
  if (!text) return null;
  return (
    <section
      aria-label="Scouting report"
      style={{
        background: C.PANEL,
        border: `1px solid ${C.LINE}`,
        borderLeft: `3px solid ${C.BRAND}`,
        borderRadius: 16,
        padding: "16px 20px 18px",
        marginBottom: 24,
        ...style,
      }}
    >
      <h2
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: C.BRAND,
          margin: "0 0 8px",
        }}
      >
        Scouting report
      </h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: C.TXT, maxWidth: "80ch", textWrap: "pretty" }}>{text}</p>
    </section>
  );
}
