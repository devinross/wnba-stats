// ---------------------------------------------------------------------------
// The footnote under a section: where the numbers came from, and — where we
// computed rather than copied them — the arithmetic that turned wnba.com's
// totals into what's on screen.
//
// Deliberately quiet. It sits below the explanatory copy in a section, at the
// smallest readable size, and only the source link carries any emphasis.
// ---------------------------------------------------------------------------

import { C } from "./palette.js";

export default function SourceNote({ source }) {
  if (!source) return null;
  const { label, url, formula, caveat } = source;
  return (
    <p
      style={{
        fontSize: 11,
        color: C.MUTE,
        margin: "10px 2px 0",
        paddingTop: 8,
        borderTop: `1px solid ${C.LINE}`,
        lineHeight: 1.55,
      }}
    >
      <span style={{ letterSpacing: 0.4, textTransform: "uppercase" }}>Source</span>{" · "}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: C.BRAND, borderBottom: `1px solid ${C.LINE}`, textDecoration: "none" }}
      >
        wnba.com › {label}
      </a>
      {formula && <> — {formula}</>}
      {caveat && (
        <>
          {" "}
          <span style={{ opacity: 0.85 }}>{caveat}</span>
        </>
      )}
    </p>
  );
}
