// ---------------------------------------------------------------------------
// URL scheme.
//
//   /                                    league landing (first team, Team tab)
//   /team/atlanta-dream                  a team's Team tab
//   /team/atlanta-dream/allisha-gray     a player's Players tab
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

/** The canonical path for a piece of app state. */
export function buildPath({ team, tab, player }) {
  if (!team) return "/";
  const base = `/team/${teamSlug(team)}`;
  if (tab === "players" && player) return `${base}/${player}`;
  return base;
}

/**
 * pathname -> app state. Falls back to the league landing for anything
 * unrecognized, so a stale or hand-edited URL still renders the app.
 * `league` is the loaded snapshot ({ teams, data }).
 */
export function resolveRoute(pathname, league) {
  const fallback = { teamId: league.teams[0].id, tab: "team", sel: 0, matched: false };
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (parts[0] !== "team" || !parts[1]) return fallback;

  const team = league.teams.find((t) => teamSlug(t) === parts[1]);
  if (!team) return fallback;

  if (!parts[2]) return { teamId: team.id, tab: "team", sel: 0, matched: true };

  const roster = (league.data[team.id] || {}).roster || [];
  const idx = rosterSlugs(roster).indexOf(parts[2]);
  if (idx < 0) return { teamId: team.id, tab: "team", sel: 0, matched: true };

  return { teamId: team.id, tab: "players", sel: idx, matched: true };
}

/** Every route the site prerenders, in sitemap order. */
export function allRoutes(league) {
  const routes = ["/"];
  for (const team of league.teams) {
    routes.push(`/team/${teamSlug(team)}`);
    const roster = (league.data[team.id] || {}).roster || [];
    for (const slug of rosterSlugs(roster)) {
      routes.push(`/team/${teamSlug(team)}/${slug}`);
    }
  }
  return routes;
}
