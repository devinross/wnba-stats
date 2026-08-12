// ---------------------------------------------------------------------------
// Data layer (static snapshot model, all teams)
//
// The app does not call stats.wnba.com at runtime. `npm run fetch`
// (scripts/fetch-data.mjs) pulls every team's data once and writes it to
// public/data/wnba.json; this module just loads that file. The deployed site is
// pure static files — no proxy, no CORS, no runtime 500s. Refresh by re-running
// the fetch script.
//
// Shape: { meta, teams: [{id,name,city,teamName,abbr,emoji}], teamRanks,
//          data: { [teamId]: { games, roster, onOff, fourFactors,
//                              playerAdv, lineups, errors } } }
// ---------------------------------------------------------------------------

// Root-absolute, not relative to the current page: the site serves prerendered
// HTML from nested paths (/team/atlanta-dream/, /team/atlanta-dream/allisha-gray/),
// and a relative URL would look for the snapshot underneath those. See the note
// on `base` in vite.config.js.
const DATA_URL = "/data/wnba.json";

export async function loadLeague() {
  let res;
  try {
    res = await fetch(DATA_URL, { cache: "no-cache" });
  } catch (e) {
    throw new Error(`Couldn't load data/wnba.json (${e.message}). Generate it with: npm run fetch`);
  }
  if (!res.ok) {
    throw new Error(
      `Couldn't load data/wnba.json (HTTP ${res.status}). ` +
        `Run \`npm run fetch\` to create it, then rebuild/redeploy.`
    );
  }
  return res.json();
}
