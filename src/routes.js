// ---------------------------------------------------------------------------
// URL scheme.
//
//   /                                         current season, league landing
//   /salaries                                 current season, salary + play-type table
//   /team/atlanta-dream                       a team's Team tab
//   /team/atlanta-dream/allisha-gray          a player's Players tab
//   /2024                                     a past season's landing
//   /2024/team/atlanta-dream                  that team, that season
//   /2024/team/atlanta-dream/allisha-gray
//
// The season in progress keeps the unprefixed URLs it has always had, so
// nothing already indexed moves; past seasons live under a year prefix.
//
// This module is imported by BOTH the browser app (src/App.jsx) and the build
// script that prerenders one HTML file per route (scripts/prerender.mjs), so
// the two can never disagree about what a URL means. Keep it free of browser
// globals — it has to run in Node.
// ---------------------------------------------------------------------------

/** "Atlanta Dream" -> "atlanta-dream"; "A'ja Wilson" -> "aja-wilson". */
export function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: Nikolić -> Nikolic
    .toLowerCase()
    .replace(/['’]/g, "") // apostrophes vanish rather than becoming a dash
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const teamSlug = (team) => slugify(team.name);

/**
 * Slugs for a roster, aligned to its indices. Two players on one roster could
 * in principle slugify the same (a "Jr." suffix stripped, say), so repeats get
 * a numeric suffix instead of two routes fighting over one URL.
 *
 * The fetch script runs this at write time and stores the result as
 * `team.players[].slug` in league.json, so the browser can resolve a player URL
 * without first downloading that team's roster. Both callers share this
 * function precisely so those two answers can't drift apart.
 */
export function rosterSlugs(roster = []) {
  const seen = new Map();
  return roster.map((p) => {
    const base = slugify(p.name) || "player";
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

/** The URL prefix for a season: "" for the one in progress, "/2024" for the rest. */
export function seasonPrefix(season, currentSeason) {
  return Number(season) === Number(currentSeason) ? "" : `/${season}`;
}

/**
 * The canonical path for a piece of app state.
 *
 * `view: "salaries"` is the one page that isn't about a team or a season the
 * archive covers — contracts come from a hand-maintained sheet that only exists
 * for the season being played, so it lives at a bare /salaries with no year
 * prefix and no per-season copies.
 */
export function buildPath({ team, tab, player, season, currentSeason, view }) {
  const prefix = seasonPrefix(season, currentSeason);
  if (view === "salaries") return "/salaries";
  if (!team) return prefix || "/";
  const base = `${prefix}/team/${teamSlug(team)}`;
  if (tab === "players" && player) return `${base}/${player}`;
  return base;
}

/**
 * pathname -> { season, teamSlug, playerSlug }. Pure string work: it runs
 * before any data has loaded, which is what lets the app fetch only the season
 * and team the URL actually asks for.
 *
 * `seasons` is the list of seasons that exist (from data/index.json), so
 * "/2024/..." is only read as a season when 2024 is one of them — otherwise the
 * whole path falls back to the current season's landing.
 */
export function parsePath(pathname, { seasons = [], currentSeason } = {}) {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  const known = new Set(seasons.map(Number));

  // Salaries are current-season only (see buildPath), so the route is read
  // before the year prefix is — "/2024/salaries" is not a page.
  if (parts.length === 1 && parts[0] === "salaries") {
    return { season: currentSeason, teamSlug: null, playerSlug: null, view: "salaries", matched: true };
  }

  let season = currentSeason;
  if (parts.length && /^\d{4}$/.test(parts[0])) {
    const year = Number(parts[0]);
    if (!known.has(year)) return { season: currentSeason, teamSlug: null, playerSlug: null, view: null, matched: false };
    season = year;
    parts.shift();
  }

  if (!parts.length) return { season, teamSlug: null, playerSlug: null, view: null, matched: true };
  if (parts[0] !== "team" || !parts[1]) return { season, teamSlug: null, playerSlug: null, view: null, matched: false };
  return { season, teamSlug: parts[1], playerSlug: parts[2] || null, view: null, matched: true };
}

/**
 * Resolve the team/player halves of a parsed path against a loaded season.
 *
 * A path with no team is the league page — the season as a whole — so it
 * resolves to `teamId: null` rather than to some arbitrary first team. Anything
 * unrecognized falls back to the same league page, so a stale or hand-edited URL
 * still renders the app instead of an error.
 */
export function resolveInSeason({ teamSlug: wantTeam, playerSlug: wantPlayer }, league) {
  const fallback = { teamId: null, tab: "team", sel: 0, matched: false };
  if (!wantTeam) return { ...fallback, matched: true };

  const team = league.teams.find((t) => teamSlug(t) === wantTeam);
  if (!team) return fallback;
  if (!wantPlayer) return { teamId: team.id, tab: "team", sel: 0, matched: true };

  const idx = (team.players || []).findIndex((p) => p.slug === wantPlayer);
  if (idx < 0) return { teamId: team.id, tab: "team", sel: 0, matched: true };
  return { teamId: team.id, tab: "players", sel: idx, matched: true };
}

/**
 * Every route for one season, in sitemap order. `players: false` stops at team
 * pages — what the build does for past seasons, where ~250 prerendered player
 * pages per archived year would swamp the build for little crawl value.
 * `salaries: true` adds the one salary page, which belongs to the live season
 * alone.
 */
export function seasonRoutes(league, currentSeason, { players = true, salaries = false } = {}) {
  const prefix = seasonPrefix(league.meta.season, currentSeason);
  const routes = [prefix || "/"];
  if (salaries) routes.push("/salaries");
  for (const team of league.teams) {
    const base = `${prefix}/team/${teamSlug(team)}`;
    routes.push(base);
    if (players) for (const p of team.players || []) routes.push(`${base}/${p.slug}`);
  }
  return routes;
}
