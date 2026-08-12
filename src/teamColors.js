// ---------------------------------------------------------------------------
// Team colors + the badge gradient recipe.
//
// Ported from the iOS app's `TeamBadge` (HighlightFactory/Views/SwiftUI/
// DiagonalAbbreviation.swift), which draws a team as a circle washed
// top-to-bottom from its primary color into its secondary. Same two constants
// there and here: the colors are saturation-boosted first, then composited at
// half opacity — compositing washes chroma out, so the boost is what keeps a
// navy from landing as gray. A team with one color fades to itself and reads
// as a flat tint.
//
// Keyed by the NBA stats abbreviation the data feed gives us, with the team
// nickname as the fallback key so a feed that renames an abbreviation (or an
// opponent referenced by name only) still finds its colors.
// ---------------------------------------------------------------------------

import { C } from "./palette";

// [primary, secondary] — the primary is the color the team leads with, so it
// sits at the top of the wash.
export const TEAM_COLORS = {
  ATL: ["#C8102E", "#418FDE"], // Dream — red into sky blue
  CHI: ["#418FDE", "#FFCD00"], // Sky — blue into yellow
  CON: ["#E03A3E", "#0A2240"], // Sun — red into navy
  DAL: ["#0C2340", "#C4D600"], // Wings — navy into lime
  GSV: ["#5B2D8E", "#1A1A1A"], // Valkyries — violet into black
  IND: ["#002D62", "#E03A3E"], // Fever — navy into red
  LVA: ["#000000", "#BA0C2F"], // Aces — black into red
  LAS: ["#552583", "#FDB927"], // Sparks — purple into gold
  MIN: ["#266092", "#79BC43"], // Lynx — blue into green
  NYL: ["#6ECEB2", "#000000"], // Liberty — seafoam into black
  PHX: ["#3B2483", "#E56020"], // Mercury — purple into orange
  PDX: ["#C8102E", "#1D1D1D"], // Fire — rose red into black
  SEA: ["#2C5234", "#FEE11A"], // Storm — green into yellow
  TOR: ["#C8102E", "#1A1A1A"], // Tempo — red into black
  WAS: ["#002B5C", "#E03A3E"], // Mystics — navy into red
};

// Same palette reached by nickname, for opponents we only have a name for.
const COLORS_BY_NAME = {
  dream: TEAM_COLORS.ATL,
  sky: TEAM_COLORS.CHI,
  sun: TEAM_COLORS.CON,
  wings: TEAM_COLORS.DAL,
  valkyries: TEAM_COLORS.GSV,
  fever: TEAM_COLORS.IND,
  aces: TEAM_COLORS.LVA,
  sparks: TEAM_COLORS.LAS,
  lynx: TEAM_COLORS.MIN,
  liberty: TEAM_COLORS.NYL,
  mercury: TEAM_COLORS.PHX,
  fire: TEAM_COLORS.PDX,
  storm: TEAM_COLORS.SEA,
  tempo: TEAM_COLORS.TOR,
  mystics: TEAM_COLORS.WAS,
};

// An expansion team the map hasn't caught up with still gets a badge — the
// brand plum, which is what every badge on the site used to be.
const FALLBACK = [C.BRAND, C.BRAND_HI];

// How far the disc's gradient lets the page through, and the chroma boost
// applied before it. iOS runs 0.5 / 1.6; this page is white rather than the
// app's card gray, so half opacity strands the darker teams (Wings navy, Storm
// green) as pastels next to type that's solid black. Holding a little more of
// the color back keeps the wash reading as the team's colors while staying
// light enough for a dark emoji — the Aces' spade — to sit on top of it.
export const BADGE_OPACITY = 0.72;
export const BADGE_SATURATION = 1.35;
// Floor on how dark a stop is allowed to get. Five teams carry black as one of
// their two colors, and the emoji sits in the middle of the disc — the Aces'
// spade on a true black wash is a black glyph on a near-black ground. Lifting
// the darkest stops to a deep charcoal keeps those teams reading as black
// without swallowing their own mark.
export const BADGE_MIN_BRIGHTNESS = 0.55;

/** The [primary, secondary] pair for a team, by abbreviation then nickname. */
export function teamColors(team) {
  if (!team) return FALLBACK;
  const byAbbr = TEAM_COLORS[String(team.abbr || "").toUpperCase()];
  if (byAbbr) return byAbbr;
  // Match on the last word of whatever name we have — "Los Angeles Sparks",
  // "Sparks" and "LA Sparks" all land on the same entry.
  const words = String(team.teamName || team.name || team || "").trim().split(/\s+/);
  const nickname = words[words.length - 1].toLowerCase();
  return COLORS_BY_NAME[nickname] || FALLBACK;
}

/** The CSS the badge paints: the team's wash, top to bottom. */
export function teamGradient(team) {
  const [top, bottom] = teamColors(team);
  return `linear-gradient(180deg, ${wash(top)}, ${wash(bottom)})`;
}

// --- color math -------------------------------------------------------------
// UIColor.saturated(by:) works in HSB and leaves brightness alone, so this does
// too — the same hex has to produce the same disc on both platforms.

function wash(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [h, s, v] = rgbToHsv(r, g, b);
  const stop = hsvToRgb(h, Math.min(s * BADGE_SATURATION, 1), Math.max(v, BADGE_MIN_BRIGHTNESS));
  return `rgba(${stop.r}, ${stop.g}, ${stop.b}, ${BADGE_OPACITY})`;
}

function hexToRgb(hex) {
  const raw = String(hex).replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsv(r, g, b) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] : [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}
