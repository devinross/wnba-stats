// ---------------------------------------------------------------------------
// The <title>, description and canonical URL for every route, in one place.
//
// Imported by scripts/prerender.mjs (to write them into each prerendered HTML
// file) and by src/App.jsx (to update them during client-side navigation), so
// the page Google indexed and the page a visitor is looking at always agree.
// Node-safe: applyHead is the only thing that touches the DOM, and nothing in
// Node calls it.
// ---------------------------------------------------------------------------

export const SITE_URL = "https://wnba.highlightfactory.app";
export const SITE_NAME = "Highlight Factory";
export const OG_IMAGE = `${SITE_URL}/og.png`;

const POSITIONS = { G: "guard", F: "forward", C: "center" };

/** "G-F" -> "guard", "" -> null. Only the first listed position is used. */
export function positionLabel(pos) {
  const key = String(pos || "").trim().toUpperCase().charAt(0);
  return POSITIONS[key] || null;
}

/**
 * Metadata for one route.
 *   { team, tab, player, season, path }
 * `player` is the roster entry (for the player pages), `path` the canonical
 * pathname from routes.js. Titles are kept near 60 characters and descriptions
 * near 155 so neither gets truncated in results.
 */
export function pageMeta({ team, tab, player, season, path = "/" }) {
  const yr = season ? `${season} ` : "";
  const canonical = SITE_URL + (path === "/" ? "/" : path);

  if (player && tab === "players" && team) {
    const role = positionLabel(player.pos);
    return {
      canonical,
      title: `${player.name} ${yr}Stats & Game Log | ${team.teamName}`,
      description:
        `${player.name} ${yr}stats for the ${team.name}: game log, points, rebounds and assists per game, ` +
        `shooting splits, true shooting percentage and a shot-zone breakdown` +
        `${role ? ` for the ${team.teamName} ${role}` : ""}.`,
      ogTitle: `${player.name} — ${yr}${team.name} stats`,
    };
  }

  if (team) {
    return {
      canonical,
      title: `${team.name} ${yr}Stats — Shot Charts & Lineups`,
      description:
        `${team.name} ${yr}team stats: shot-zone charts versus the WNBA average, four factors, ` +
        `most-used lineups by net rating, on/off player impact, and where the ${team.teamName} rank across the league.`,
      ogTitle: `${team.name} ${yr}stats`,
    };
  }

  return {
    canonical,
    title: "WNBA Stats — Shot Charts & Four Factors | Highlight Factory",
    description:
      "Free WNBA team and player analytics: shot-zone charts, four factors, lineup net ratings, " +
      "on/off impact and league-wide rankings for every team. Updated nightly.",
    ogTitle: "WNBA Stats — Shot Charts, Four Factors & Lineups",
  };
}

/** Browser-only: point the live document at `meta` after a client-side nav. */
export function applyHead(meta) {
  if (typeof document === "undefined") return;
  document.title = meta.title;

  const set = (selector, attr, value) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  };
  set('meta[name="description"]', "content", meta.description);
  set('link[rel="canonical"]', "href", meta.canonical);
  set('meta[property="og:url"]', "content", meta.canonical);
  set('meta[property="og:title"]', "content", meta.ogTitle);
  set('meta[property="og:description"]', "content", meta.description);
}
