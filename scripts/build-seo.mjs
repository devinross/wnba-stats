// ---------------------------------------------------------------------------
// Post-build SEO pass over dist/index.html.
//
// The app is client-rendered: without this step the deployed HTML is literally
// `<div id="root"></div>`, so anything that reads HTML without executing
// JavaScript — social scrapers, most AI crawlers, and Google before its render
// pass — sees a page with no content on it.
//
// So after `vite build` we inject two things:
//
//   1. A static shell inside #root describing what the page holds, including
//      the real team list and season pulled from the same snapshot the app
//      reads. React replaces it the moment it mounts, so a visitor never sees
//      it for more than a frame — but it also means the shell can never
//      disagree with the app, because both are generated from wnba.json.
//   2. JSON-LD (WebSite / Organization / Dataset) in <head>.
//
// This runs as part of `npm run build`, so the nightly data refresh keeps the
// season, team list and dateModified current with no extra step.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(root, "dist/index.html");
const dataPath = resolve(root, "public/data/wnba.json");

const SITE_URL = "https://wnba.highlightfactory.app";
const PARENT_URL = "https://highlightfactory.app";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let html = readFileSync(htmlPath, "utf8");
const data = JSON.parse(readFileSync(dataPath, "utf8"));

const season = data.meta?.season ?? new Date().getFullYear();
const teams = (data.teams || []).map((t) => t.name).sort();
const updatedISO = data.meta?.generatedAt || new Date().toISOString();
const updatedHuman = new Date(updatedISO).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

if (!teams.length) {
  console.error("build-seo: no teams in wnba.json — refusing to write an empty shell.");
  process.exit(1);
}

// --- 1. The static shell ----------------------------------------------------
// Plain semantic HTML. No styling worth the name: it is on screen for a single
// frame, and every byte of CSS here is a byte a crawler has to wade through.
const shell = `<div id="seo-shell">
      <h1>${season} WNBA Stats</h1>
      <p>Team and player analytics for all ${teams.length} WNBA teams, from Highlight Factory.
      Updated ${esc(updatedHuman)}.</p>
      <h2>What this covers</h2>
      <ul>
        <li>Shot-zone maps — field-goal percentage and shot volume by court zone, compared with the WNBA average.</li>
        <li>Four factors — effective field-goal percentage, turnover rate, offensive rebound rate and free-throw rate, for a team and its opponents.</li>
        <li>League rankings — net, offensive and defensive rating and pace for every team.</li>
        <li>Lineups — minutes and net rating per 100 possessions for the most-used five-player units.</li>
        <li>On/off impact — how a team's offense and defense change with each player on and off the floor.</li>
        <li>Player profiles — per-game logs, shooting splits, usage versus true-shooting efficiency, and season highs.</li>
      </ul>
      <h2>Teams</h2>
      <ul>${teams.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
      <p><a href="${PARENT_URL}">Highlight Factory</a> is the modern basketball film tool, powered with AI.</p>
      <noscript><p><strong>This dashboard needs JavaScript to draw its charts.</strong> The summary above lists everything it covers.</p></noscript>
    </div>`;

if (!html.includes('<div id="root"></div>')) {
  console.error('build-seo: could not find an empty <div id="root"></div> in dist/index.html.');
  process.exit(1);
}
html = html.replace('<div id="root"></div>', `<div id="root">${shell}</div>`);

// --- 2. Structured data -----------------------------------------------------
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "WNBA Stats · Highlight Factory",
      description: `Team and player analytics for every WNBA team: shot zones, four factors, lineups, on/off impact and league rankings for the ${season} season.`,
      inLanguage: "en-US",
      publisher: { "@id": `${PARENT_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${PARENT_URL}/#organization`,
      name: "Highlight Factory",
      url: `${PARENT_URL}/`,
      logo: `${SITE_URL}/favicon.svg`,
      description: "The modern basketball film tool, powered with AI.",
    },
    {
      "@type": "Dataset",
      "@id": `${SITE_URL}/#dataset`,
      name: `${season} WNBA team and player analytics`,
      description:
        "Per-team and per-player WNBA statistics including shot-zone efficiency and volume, four factors, lineup net ratings, on/off splits and league-wide team ratings.",
      url: `${SITE_URL}/`,
      license: "https://www.nba.com/termsofuse",
      isAccessibleForFree: true,
      dateModified: updatedISO,
      temporalCoverage: String(season),
      creator: { "@id": `${PARENT_URL}/#organization` },
      keywords: ["WNBA", "basketball analytics", "shot charts", "four factors", "lineup data", "on/off"],
      distribution: {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${SITE_URL}/data/wnba.json`,
      },
    },
  ],
};

html = html.replace(
  "</head>",
  `  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n  </head>`
);

writeFileSync(htmlPath, html);
console.log(
  `build-seo: shell (${teams.length} teams, ${season} season, updated ${updatedHuman}) + JSON-LD written to dist/index.html`
);
