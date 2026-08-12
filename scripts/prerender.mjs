// ---------------------------------------------------------------------------
// Prerender: one HTML file per route.
//
// The app is client-rendered, so `vite build` emits a single index.html whose
// body is `<div id="root"></div>`. That gives search engines exactly one URL to
// index and no content to read on it. This script turns the build into ~254
// real pages — the league landing, one per team, one per player — each with:
//
//   * its own <title>, description, canonical and Open Graph tags
//     (from src/pageMeta.js, the same module the running app uses when you
//     navigate client-side, so the two can't drift)
//   * a static content shell of that entity's actual numbers, built from the
//     same public/data/wnba.json the app fetches at runtime. React replaces it
//     on mount, so it's on screen for a frame — but it means a crawler that
//     doesn't execute JavaScript still gets the page's substance, and links to
//     follow to the other pages.
//   * JSON-LD describing what the page is (SportsTeam / Person / Dataset) plus
//     a breadcrumb trail.
//
// It also writes dist/sitemap.xml listing every route.
//
// Runs as part of `npm run build`, so the nightly data refresh regenerates all
// of it — new players get pages, departed ones stop being listed.
// ---------------------------------------------------------------------------

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { teamSlug, rosterSlugs, allRoutes } from "../src/routes.js";
import { pageMeta, positionLabel, SITE_URL, OG_IMAGE } from "../src/pageMeta.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(root, "dist");
const templatePath = resolve(distDir, "index.html");

const PARENT_URL = "https://highlightfactory.app";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const r1 = (n) => Math.round(n * 10) / 10;
const pct = (m, a) => (a > 0 ? r1((m / a) * 100) : 0);
const sum = (arr, k) => arr.reduce((a, b) => a + (b[k] || 0), 0);

const league = JSON.parse(readFileSync(resolve(root, "public/data/wnba.json"), "utf8"));
const template = readFileSync(templatePath, "utf8");

const season = league.meta?.season ?? new Date().getFullYear();
const updatedISO = league.meta?.generatedAt || new Date().toISOString();
const updatedHuman = new Date(updatedISO).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

if (!league.teams?.length) {
  console.error("prerender: wnba.json has no teams — refusing to overwrite the build with empty pages.");
  process.exit(1);
}

// --- stat rollups, mirroring what the app computes ------------------------

function teamSummary(team) {
  const b = league.data[team.id] || {};
  const games = b.games || [];
  const gp = games.length;
  const wins = games.filter((g) => g.w).length;
  const scored = games.reduce((a, g) => a + (g.tm || 0), 0);
  const allowed = games.reduce((a, g) => a + (g.op || 0), 0);
  const rank = (league.teamRanks?.teams || []).find((t) => t.teamId === team.id) || null;

  const players = (b.roster || [])
    .map((p) => {
      const n = p.logs.length;
      if (!n) return null;
      return {
        name: p.name,
        gp: n,
        ppg: r1(sum(p.logs, "pts") / n),
        rpg: r1((sum(p.logs, "orb") + sum(p.logs, "drb")) / n),
        apg: r1(sum(p.logs, "ast") / n),
      };
    })
    .filter(Boolean);
  const top = (key) => players.slice().sort((a, b) => b[key] - a[key])[0] || null;

  return {
    gp,
    wins,
    losses: gp - wins,
    ppg: gp ? r1(scored / gp) : 0,
    oppg: gp ? r1(allowed / gp) : 0,
    margin: gp ? r1((scored - allowed) / gp) : 0,
    rank,
    leaders: { pts: top("ppg"), reb: top("rpg"), ast: top("apg") },
    recent: games.slice(-5).map((g) => `${g.w ? "W" : "L"} ${g.tm}-${g.op} ${g.home ? "vs" : "@"} ${g.opp}`),
  };
}

function playerSummary(player) {
  const L = player.logs || [];
  const gp = L.length;
  if (!gp) return null;
  const fgm = sum(L, "fgm"), fga = sum(L, "fga");
  const tpm = sum(L, "tpm"), tpa = sum(L, "tpa");
  const ftm = sum(L, "ftm"), fta = sum(L, "fta");
  const pts = sum(L, "pts");
  const tsDen = 2 * (fga + 0.44 * fta);
  return {
    gp,
    ppg: r1(pts / gp),
    rpg: r1((sum(L, "orb") + sum(L, "drb")) / gp),
    apg: r1(sum(L, "ast") / gp),
    spg: r1(sum(L, "stl") / gp),
    bpg: r1(sum(L, "blk") / gp),
    mpg: r1(sum(L, "min") / gp),
    fgPct: pct(fgm, fga),
    tpPct: pct(tpm, tpa),
    ftPct: pct(ftm, fta),
    ts: tsDen > 0 ? r1((pts / tsDen) * 100) : 0,
    high: Math.max(...L.map((g) => g.pts)),
  };
}

// --- content shells --------------------------------------------------------
// Plain semantic HTML with real links. No styling: it is replaced on mount, and
// every byte here is a byte a crawler has to read past.

function homeShell() {
  const teamLinks = league.teams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `<li><a href="/team/${teamSlug(t)}">${esc(t.name)} stats</a></li>`)
    .join("");
  return `<h1>${season} WNBA Stats</h1>
      <p>Team and player analytics for all ${league.teams.length} WNBA teams, from Highlight Factory. Updated ${esc(updatedHuman)}.</p>
      <h2>What this covers</h2>
      <ul>
        <li>Shot-zone charts — field-goal percentage and shot volume by court zone, compared with the WNBA average.</li>
        <li>Four factors — effective field-goal percentage, turnover rate, offensive rebound rate and free-throw rate, for a team and its opponents.</li>
        <li>League rankings — net, offensive and defensive rating and pace for every team.</li>
        <li>Lineups — minutes and net rating per 100 possessions for the most-used five-player units.</li>
        <li>On/off impact — how a team's offense and defense change with each player on and off the floor.</li>
        <li>Player profiles — per-game logs, shooting splits, usage versus true-shooting efficiency, and season highs.</li>
      </ul>
      <h2>Teams</h2>
      <ul>${teamLinks}</ul>
      <p><a href="${PARENT_URL}">Highlight Factory</a> is the modern basketball film tool, powered with AI.</p>`;
}

function teamShell(team) {
  const s = teamSummary(team);
  const b = league.data[team.id] || {};
  const roster = b.roster || [];
  const slugs = rosterSlugs(roster);
  const playerLinks = roster
    .map((p, i) => {
      const ps = playerSummary(p);
      const detail = ps ? ` — ${ps.ppg} ppg, ${ps.rpg} rpg, ${ps.apg} apg in ${ps.gp} games` : "";
      return `<li><a href="/team/${teamSlug(team)}/${slugs[i]}">${esc(p.name)}</a>${p.num ? ` #${esc(p.num)}` : ""}${p.pos ? `, ${esc(p.pos)}` : ""}${esc(detail)}</li>`;
    })
    .join("");

  const rankLine = s.rank
    ? `<li>Net rating ${s.rank.net > 0 ? "+" : ""}${s.rank.net} per 100 possessions (offense ${s.rank.off}, defense ${s.rank.def}, pace ${s.rank.pace}).</li>`
    : "";
  const ldr = (l, unit) => (l ? `<li>${esc(l.name)} leads the team at ${l[unit === "ppg" ? "ppg" : unit === "rpg" ? "rpg" : "apg"]} ${unit}.</li>` : "");

  return `<h1>${esc(team.name)} ${season} Stats</h1>
      <p>${esc(team.name)} ${season} season: ${s.wins}–${s.losses}, scoring ${s.ppg} points per game and allowing ${s.oppg} (${s.margin > 0 ? "+" : ""}${s.margin} average margin) across ${s.gp} games. Updated ${esc(updatedHuman)}.</p>
      <h2>Season summary</h2>
      <ul>
        <li>Record ${s.wins}–${s.losses}.</li>
        <li>${s.ppg} points scored, ${s.oppg} allowed per game.</li>
        ${rankLine}
        ${ldr(s.leaders.pts, "ppg")}
        ${ldr(s.leaders.reb, "rpg")}
        ${ldr(s.leaders.ast, "apg")}
      </ul>
      ${s.recent.length ? `<h2>Recent results</h2><ul>${s.recent.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      <h2>${esc(team.teamName)} roster</h2>
      <ul>${playerLinks}</ul>
      <h2>Also on this page</h2>
      <p>Shot-zone charts shaded against the WNBA average, four factors versus opponents, most-used lineups by net rating, on/off player impact, and where the ${esc(team.teamName)} rank league-wide.</p>
      <p><a href="/">All WNBA teams</a></p>`;
}

function playerShell(team, player) {
  const s = playerSummary(player);
  const role = positionLabel(player.pos);
  const teamPath = `/team/${teamSlug(team)}`;
  if (!s) {
    return `<h1>${esc(player.name)}</h1>
      <p>${esc(player.name)} has not logged a game for the <a href="${teamPath}">${esc(team.name)}</a> in the ${season} season yet.</p>
      <p><a href="/">All WNBA teams</a></p>`;
  }
  return `<h1>${esc(player.name)} ${season} Stats</h1>
      <p>${esc(player.name)}${player.num ? `, #${esc(player.num)}` : ""}${role ? `, ${role}` : ""} for the <a href="${teamPath}">${esc(team.name)}</a>. ${s.ppg} points, ${s.rpg} rebounds and ${s.apg} assists per game in ${s.gp} games this season, averaging ${s.mpg} minutes. Updated ${esc(updatedHuman)}.</p>
      <h2>${season} per-game averages</h2>
      <ul>
        <li>${s.ppg} points</li>
        <li>${s.rpg} rebounds</li>
        <li>${s.apg} assists</li>
        <li>${s.spg} steals</li>
        <li>${s.bpg} blocks</li>
        <li>${s.mpg} minutes</li>
      </ul>
      <h2>Shooting</h2>
      <ul>
        <li>${s.fgPct}% from the field</li>
        <li>${s.tpPct}% from three</li>
        <li>${s.ftPct}% from the line</li>
        <li>${s.ts}% true shooting</li>
        <li>Season high ${s.high} points</li>
      </ul>
      <h2>Also on this page</h2>
      <p>Full game log, points-by-game and true-shooting trends, and a shot-zone breakdown compared with other WNBA ${role ? `${role}s` : "players"}.</p>
      <p><a href="${teamPath}">${esc(team.name)} team stats</a> · <a href="/">All WNBA teams</a></p>`;
}

// --- JSON-LD ---------------------------------------------------------------

const organization = {
  "@type": "Organization",
  "@id": `${PARENT_URL}/#organization`,
  name: "Highlight Factory",
  url: `${PARENT_URL}/`,
  logo: `${SITE_URL}/favicon.svg`,
  description: "The modern basketball film tool, powered with AI.",
};

function breadcrumbs(trail) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: SITE_URL + t.path,
    })),
  };
}

function jsonLdFor({ team, player, path }) {
  if (player && team) {
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        {
          "@type": "Person",
          "@id": SITE_URL + path + "#person",
          name: player.name,
          jobTitle: "Basketball player",
          affiliation: { "@type": "SportsTeam", name: team.name },
          url: SITE_URL + path,
        },
        breadcrumbs([
          { name: "WNBA Stats", path: "/" },
          { name: team.name, path: `/team/${teamSlug(team)}` },
          { name: player.name, path },
        ]),
      ],
    };
  }

  if (team) {
    const s = teamSummary(team);
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        {
          "@type": "SportsTeam",
          "@id": SITE_URL + path + "#team",
          name: team.name,
          sport: "Basketball",
          memberOf: { "@type": "SportsOrganization", name: "WNBA" },
          url: SITE_URL + path,
          location: team.city,
          ...(s.gp ? { description: `${team.name} ${season} season: ${s.wins}-${s.losses}, ${s.ppg} points per game.` } : {}),
        },
        breadcrumbs([
          { name: "WNBA Stats", path: "/" },
          { name: team.name, path },
        ]),
      ],
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
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
}

// --- page assembly ---------------------------------------------------------

// Each replacement asserts it matched, so a future edit to index.html that
// changes the shape of one of these tags fails the build instead of silently
// shipping 254 pages that all claim to be the league landing.
function replaceOnce(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    console.error(`prerender: no match for ${label} in index.html — the template shape changed.`);
    process.exit(1);
  }
  return html.replace(pattern, () => replacement);
}

function buildPage({ team, player, path, tab }) {
  const meta = pageMeta({ team, tab, player, season, path });
  let html = template;

  html = replaceOnce(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`, "<title>");
  html = replaceOnce(
    html,
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${esc(meta.description)}" />`,
    "description"
  );
  html = replaceOnce(
    html,
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${meta.canonical}" />`,
    "canonical"
  );
  html = replaceOnce(
    html,
    /<meta property="og:title"[^>]*>/,
    `<meta property="og:title" content="${esc(meta.ogTitle)}" />`,
    "og:title"
  );
  html = replaceOnce(
    html,
    /<meta\s+property="og:description"[\s\S]*?\/>/,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    "og:description"
  );
  html = replaceOnce(
    html,
    /<meta property="og:url"[^>]*>/,
    `<meta property="og:url" content="${meta.canonical}" />`,
    "og:url"
  );
  html = replaceOnce(
    html,
    /<meta property="og:image" [^>]*>/,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    "og:image"
  );

  const shell = player ? playerShell(team, player) : team ? teamShell(team) : homeShell();
  html = replaceOnce(
    html,
    /<div id="root"><\/div>/,
    `<div id="root"><div id="seo-shell">\n      ${shell}\n      <noscript><p><strong>This dashboard needs JavaScript to draw its charts.</strong> The summary above lists what it covers.</p></noscript>\n    </div></div>`,
    "#root"
  );

  html = html.replace(
    "</head>",
    `  <script type="application/ld+json">${JSON.stringify(jsonLdFor({ team, player, path }))}</script>\n  </head>`
  );

  return html;
}

function writePage(path, html) {
  const dir = path === "/" ? distDir : resolve(distDir, "." + path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "index.html"), html);
}

// --- run -------------------------------------------------------------------

let count = 0;
writePage("/", buildPage({ path: "/" }));
count++;

for (const team of league.teams) {
  const tPath = `/team/${teamSlug(team)}`;
  writePage(tPath, buildPage({ team, path: tPath, tab: "team" }));
  count++;

  const roster = (league.data[team.id] || {}).roster || [];
  const slugs = rosterSlugs(roster);
  roster.forEach((player, i) => {
    const pPath = `${tPath}/${slugs[i]}`;
    writePage(pPath, buildPage({ team, player, path: pPath, tab: "players" }));
    count++;
  });
}

// --- sitemap ---------------------------------------------------------------

const routes = allRoutes(league);
const lastmod = updatedISO.slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (r) =>
      `  <url><loc>${SITE_URL}${r === "/" ? "/" : r}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>${
        r === "/" ? "1.0" : r.split("/").length === 3 ? "0.8" : "0.6"
      }</priority></url>`
  )
  .join("\n")}
</urlset>
`;
writeFileSync(resolve(distDir, "sitemap.xml"), sitemap);

if (routes.length !== count) {
  console.error(`prerender: wrote ${count} pages but the sitemap lists ${routes.length} — these must match.`);
  process.exit(1);
}

console.log(
  `prerender: ${count} pages (1 landing, ${league.teams.length} teams, ${count - league.teams.length - 1} players) ` +
    `+ sitemap.xml — ${season} season, updated ${updatedHuman}`
);
