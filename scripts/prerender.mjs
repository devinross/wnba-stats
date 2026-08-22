// ---------------------------------------------------------------------------
// Prerender: one HTML file per route, for every season.
//
// The app is client-rendered, so `vite build` emits a single index.html whose
// body is `<div id="root"></div>`. That gives search engines exactly one URL to
// index and no content to read on it. This script turns the build into real
// pages — the league landing, one per team, one per player — each with:
//
//   * its own <title>, description, canonical and Open Graph tags
//     (from src/pageMeta.js, the same module the running app uses when you
//     navigate client-side, so the two can't drift)
//   * a static content shell of that entity's actual numbers, built from the
//     same public/data files the app fetches at runtime. React replaces it on
//     mount, so it's on screen for a frame — but it means a crawler that
//     doesn't execute JavaScript still gets the page's substance, and links to
//     follow to the other pages.
//   * JSON-LD describing what the page is (SportsTeam / Person / Dataset) plus
//     a breadcrumb trail.
//
// The live season also gets /salaries and /gm, when scripts/build-salaries.mjs
// has written a salaries.json for it — the two pages that aren't about a team.
//
// The current season gets the full treatment (landing + team + player pages).
// Completed seasons get their landing and team pages only: another ~250 player
// pages per archived year would multiply the build for little crawl value, and
// those URLs still work — they just render client-side.
//
// It also writes dist/sitemap.xml listing every route.
//
// Runs as part of `npm run build`, so the nightly data refresh regenerates all
// of it — new players get pages, departed ones stop being listed.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { teamSlug, seasonPrefix, seasonRoutes } from "../src/routes.js";
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

const template = readFileSync(templatePath, "utf8");
const dataDir = resolve(root, "public/data");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/**
 * Reassemble one season from its split files — league.json plus every
 * teams/<id>.json — back into the single object the page builders below read.
 * The split exists to keep the browser's downloads small; at build time we're
 * on local disk and want the whole thing.
 */
function readSeason(season) {
  const league = readJson(resolve(dataDir, String(season), "league.json"));
  league.data = {};
  for (const team of league.teams) {
    try {
      league.data[team.id] = readJson(resolve(dataDir, String(season), "teams", `${team.id}.json`));
    } catch (_) {
      league.data[team.id] = {};
    }
  }
  return league;
}

const index = readJson(resolve(dataDir, "index.json"));
const currentSeason = index.currentSeason;
if (!index.seasons?.length) {
  console.error("prerender: data/index.json lists no seasons — run `npm run fetch` first.");
  process.exit(1);
}

// Module-level state for the page builders: set once per season by renderSeason.
let league = null;
let salaries = null; // the salary file for the live season, when there is one
let season = currentSeason;
let updatedISO = new Date().toISOString();
let updatedHuman = "";
let isArchive = false;
const humanDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

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

const prefix = () => seasonPrefix(season, currentSeason);
const teamPathOf = (team) => `${prefix()}/team/${teamSlug(team)}`;
const homePath = () => prefix() || "/";

// The home page is the league page, so its shell is the league's own numbers:
// the slate around the build date, the standings, and the leaderboards. Same
// three things the app draws, in plain HTML.
const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
});
const ET_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric", minute: "2-digit",
});

function slateShell(teamById) {
  const games = league.scoreboard || [];
  if (!games.length) return "";
  const dates = [...new Set(games.map((g) => g.date))].sort();
  const today = ET_DAY.format(new Date());
  const day = dates.find((d) => d >= today) || dates[dates.length - 1];
  const onDay = games.filter((g) => g.date === day);
  if (!onDay.length) return "";

  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric",
  });
  const rows = onDay
    .map((g) => {
      const home = teamById.get(g.home), away = teamById.get(g.away);
      if (!home || !away) return "";
      const when = g.status === 1
        ? `${g.tip ? `${ET_TIME.format(new Date(g.tip))} ET` : "time TBD"}`
        : `final, ${away.abbr} ${g.awayScore} – ${home.abbr} ${g.homeScore}`;
      return `<li><a href="${teamPathOf(away)}">${esc(away.name)}</a> at <a href="${teamPathOf(home)}">${esc(home.name)}</a> — ${esc(when)}</li>`;
    })
    .join("");
  return `<h2>WNBA games, ${esc(label)}</h2>
      <ul>${rows}</ul>`;
}

function standingsShell(teamById) {
  const rows = league.standings || [];
  if (!rows.length) return "";
  const netById = new Map((league.teamRanks?.teams || []).map((t) => [t.teamId, t.net]));
  const body = rows
    .map((t, i) => {
      const team = teamById.get(t.teamId);
      if (!team) return "";
      const net = netById.get(t.teamId);
      return `<tr><td>${i + 1}</td><td><a href="${teamPathOf(team)}">${esc(team.name)}</a></td>` +
        `<td>${t.w}–${t.l}</td><td>${t.pct.toFixed(3)}</td><td>${t.pf.toFixed(1)}</td><td>${t.pa.toFixed(1)}</td>` +
        `<td>${t.diff > 0 ? "+" : ""}${t.diff.toFixed(1)}</td><td>${net == null ? "—" : `${net > 0 ? "+" : ""}${net}`}</td></tr>`;
    })
    .join("");
  return `<h2>${season} WNBA standings</h2>
      <table><thead><tr><th>#</th><th>Team</th><th>W–L</th><th>PCT</th><th>PF</th><th>PA</th><th>Diff</th><th>Net rating</th></tr></thead>
      <tbody>${body}</tbody></table>`;
}

const LEADER_LABELS = [
  ["pts", "Points", "points"],
  ["reb", "Rebounds", "rebounds"],
  ["ast", "Assists", "assists"],
  ["stl", "Steals", "steals"],
  ["blk", "Blocks", "blocks"],
];

function leadersShell(teamById) {
  const leaders = league.leaders;
  if (!leaders) return "";
  const blocks = LEADER_LABELS.map(([key, label, noun]) => {
    const rows = leaders[key] || [];
    if (!rows.length) return "";
    const items = rows
      .map((p) => {
        const team = teamById.get(p.teamId);
        const slug = team && (team.players || []).find((x) => x.name === p.name);
        const name = slug
          ? `<a href="${teamPathOf(team)}/${slug.slug}">${esc(p.name)}</a>`
          : esc(p.name);
        return `<li>${name}${team ? `, ${esc(team.name)}` : ""} — ${p.v} ${noun} per game</li>`;
      })
      .join("");
    return `<h3>${label}</h3><ul>${items}</ul>`;
  }).join("");
  return blocks ? `<h2>${season} WNBA league leaders</h2>${blocks}` : "";
}

function homeShell() {
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const teamLinks = league.teams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `<li><a href="${teamPathOf(t)}">${esc(t.name)} stats</a></li>`)
    .join("");
  const seasonLinks = index.seasons
    .map((s) => {
      const path = seasonPrefix(s.season, currentSeason) || "/";
      return path === homePath()
        ? `<li>${s.season}</li>`
        : `<li><a href="${path}">${s.season} WNBA stats</a></li>`;
    })
    .join("");
  return `<h1>${season} WNBA Stats</h1>
      <p>${isArchive ? "Final standings" : "Standings, today's games"}, league leaders and team analytics for all ${league.teams.length} WNBA teams, from Highlight Factory. Updated ${esc(updatedHuman)}.</p>
      ${slateShell(teamById)}
      ${standingsShell(teamById)}
      ${leadersShell(teamById)}
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
      <h2>Other seasons</h2>
      <ul>${seasonLinks}</ul>
      <p><a href="${PARENT_URL}">Highlight Factory</a> is the modern basketball film tool, powered with AI.</p>`;
}

const salariesPath = () => "/salaries";
const gmPath = () => "/gm";

const usd = (value) =>
  value == null ? "—" : `$${value.toLocaleString("en-US")}`;

/**
 * The salary page's shell: the top of the table as real rows, plus the highest
 * scorer in each play type. Both are what the page is for, and both are lists
 * of players a crawler can follow into their own pages.
 */
function salariesShell() {
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const linkFor = (p) => {
    const team = teamById.get(p.teamId);
    if (!team || !p.slug) return esc(p.name);
    return `<a href="${teamPathOf(team)}/${p.slug}">${esc(p.name)}</a>`;
  };

  const paid = salaries.players.filter((p) => p.salary);
  const top = [...paid].sort((a, b) => b.salary - a.salary).slice(0, 25);
  const rows = top
    .map((p) => {
      const team = teamById.get(p.teamId);
      return `<tr><td>${linkFor(p)}</td><td>${esc(p.pos || "—")}</td>` +
        `<td>${team ? `<a href="${teamPathOf(team)}">${esc(team.name)}</a>` : "—"}</td>` +
        `<td>${usd(p.salary)}</td><td>${p.ppg}</td><td>${p.rpg}</td><td>${p.apg}</td></tr>`;
    })
    .join("");

  const bargains = paid
    .filter((p) => p.value != null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((p) => `<li>${linkFor(p)} — ${usd(p.salary)}, ${p.ppg} points, ${p.rpg} rebounds and ${p.apg} assists per game</li>`)
    .join("");

  const byType = (salaries.playTypes || [])
    .map((type) => {
      const best = salaries.players
        .filter((p) => p.scores)
        .sort((a, b) => b.scores[type.key] - a.scores[type.key])
        .slice(0, 5);
      if (!best.length) return "";
      const items = best
        .map((p) => `<li>${linkFor(p)} — ${p.scores[type.key]} out of 100${p.salary ? `, ${usd(p.salary)}` : ""}</li>`)
        .join("");
      return `<h3>${esc(type.label)}</h3><p>${esc(type.blurb)}</p><ul>${items}</ul>`;
    })
    .join("");

  return `<h1>${season} WNBA Player Salaries</h1>
      <p>What every WNBA player is paid in ${season}, next to what she has produced — points, rebounds and assists per game, a play-type score for the kind of player she is, and a value ranking of production per dollar. ${salaries.meta.withSalary} of ${salaries.meta.players} rostered players have a listed salary. Updated ${esc(updatedHuman)}.</p>
      <h2>Highest-paid players, ${season}</h2>
      <table><thead><tr><th>Player</th><th>Pos</th><th>Team</th><th>${season} salary</th><th>PPG</th><th>REB</th><th>AST</th></tr></thead>
      <tbody>${rows}</tbody></table>
      ${bargains ? `<h2>Best value contracts</h2><p>Most season production per dollar.</p><ul>${bargains}</ul>` : ""}
      <h2>Play types</h2>
      <p>Each score is a 0-100 rank among the ${salaries.meta.qualified} players with at least ${salaries.meta.minGames} games and ${salaries.meta.minMinutes} minutes, blending how much a player does something with how well it goes.</p>
      ${byType}
      <h2>On this page</h2>
      <p>The full table is filterable by position, team, play type, salary band and contract designation, and sortable on every column, with a salary-against-production chart for the players on screen.</p>
      <p>Salaries from the ${esc(salaries.meta.source.name)}; stats from stats.wnba.com.</p>
      <p><a href="${homePath()}">All WNBA teams, ${season}</a></p>`;
}

/**
 * The GM tool's shell. It's an interactive page with nothing static to show, so
 * this describes what the tool does and then spends its links on the pieces it
 * is built from — the cheapest useful player at each role, which is the tool's
 * whole subject and a set of players a crawler can follow.
 */
function gmShell() {
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const linkFor = (p) => {
    const team = teamById.get(p.teamId);
    return team && p.slug ? `<a href="${teamPathOf(team)}/${p.slug}">${esc(p.name)}</a>` : esc(p.name);
  };

  const bargains = (salaries.playTypes || [])
    .map((type) => {
      const best = salaries.players
        .filter((p) => p.roleValue && p.roleValue[type.key] != null)
        .sort((a, b) => b.roleValue[type.key] - a.roleValue[type.key])
        .slice(0, 3);
      if (!best.length) return "";
      const items = best
        .map((p) => `<li>${linkFor(p)} — ${usd(p.salary)}, ${p.scores[type.key]} out of 100</li>`)
        .join("");
      return `<h3>${esc(type.label)}</h3><ul>${items}</ul>`;
    })
    .join("");

  const teamLinks = league.teams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `<li><a href="${teamPathOf(t)}">${esc(t.name)}</a></li>`)
    .join("");

  return `<h1>WNBA Virtual GM — ${season} Salary Cap &amp; Roster Builder</h1>
      <p>Build a ${season} WNBA roster against the salary cap. Start from a real team or from nothing, sign and cut real players at their real ${season} salaries, and watch what the roster can and cannot do — its payroll, its positional balance, and its play-type shape next to a typical team. Nothing is saved anywhere but your own browser.</p>
      <h2>What you are working with</h2>
      <ul>
        <li>${salaries.meta.withSalary} players at their ${season} salaries, from the ${esc(salaries.meta.source.name)}.</li>
        <li>A default cap of ${usd(salaries.meta.capHint)} — the largest payroll a real team is carrying this season, since no feed publishes a cap figure. It is editable.</li>
        <li>A roster target of ${salaries.meta.rosterTarget}, and each player's production and play-type scores from this season's game logs.</li>
      </ul>
      ${bargains ? `<h2>Best value at each role</h2><p>The cheapest players in the league who are genuinely good at one thing — where a roster under the cap is usually won.</p>${bargains}` : ""}
      <h2>Teams to start from</h2>
      <ul>${teamLinks}</ul>
      <p><a href="${salariesPath()}">Every ${season} salary and play-type score</a> · <a href="${homePath()}">All WNBA teams, ${season}</a></p>`;
}

function teamShell(team) {
  const s = teamSummary(team);
  const b = league.data[team.id] || {};
  const roster = b.roster || [];
  const slugs = (team.players || []).map((p) => p.slug);
  const playerLinks = roster
    .map((p, i) => {
      const ps = playerSummary(p);
      const detail = ps ? ` — ${ps.ppg} ppg, ${ps.rpg} rpg, ${ps.apg} apg in ${ps.gp} games` : "";
      return `<li><a href="${teamPathOf(team)}/${slugs[i]}">${esc(p.name)}</a>${p.num ? ` #${esc(p.num)}` : ""}${p.pos ? `, ${esc(p.pos)}` : ""}${esc(detail)}</li>`;
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
      <p><a href="${homePath()}">All WNBA teams, ${season}</a></p>`;
}

function playerShell(team, player) {
  const s = playerSummary(player);
  const role = positionLabel(player.pos);
  const teamPath = teamPathOf(team);
  if (!s) {
    return `<h1>${esc(player.name)}</h1>
      <p>${esc(player.name)} has not logged a game for the <a href="${teamPath}">${esc(team.name)}</a> in the ${season} season yet.</p>
      <p><a href="${homePath()}">All WNBA teams</a></p>`;
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
      <p><a href="${teamPath}">${esc(team.name)} team stats</a> · <a href="${homePath()}">All WNBA teams</a></p>`;
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

function jsonLdFor({ team, player, path, view }) {
  if (view === "gm") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        {
          "@type": "WebApplication",
          "@id": SITE_URL + path + "#app",
          name: "WNBA Virtual GM",
          applicationCategory: "SportsApplication",
          operatingSystem: "Any",
          url: SITE_URL + path,
          description:
            `Build a ${season} WNBA roster against the salary cap: sign and cut real players at their real ` +
            "salaries and see the roster's payroll, balance and play-type shape.",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          publisher: { "@id": `${PARENT_URL}/#organization` },
        },
        breadcrumbs([
          { name: `${season} WNBA Stats`, path: homePath() },
          { name: "Virtual GM", path },
        ]),
      ],
    };
  }

  if (view === "salaries") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        {
          "@type": "Dataset",
          "@id": SITE_URL + path + "#dataset",
          name: `${season} WNBA player salaries and production`,
          description:
            `Every ${season} WNBA player's salary alongside her per-game production, play-type scores ` +
            "and a production-per-dollar value ranking.",
          url: SITE_URL + path,
          isAccessibleForFree: true,
          dateModified: updatedISO,
          temporalCoverage: String(season),
          creator: { "@id": `${PARENT_URL}/#organization` },
          keywords: ["WNBA salaries", "WNBA contracts", "player value", "basketball analytics"],
          distribution: {
            "@type": "DataDownload",
            encodingFormat: "application/json",
            contentUrl: `${SITE_URL}/data/${season}/salaries.json`,
          },
        },
        breadcrumbs([
          { name: `${season} WNBA Stats`, path: homePath() },
          { name: "Player salaries", path },
        ]),
      ],
    };
  }

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
          { name: `${season} WNBA Stats`, path: homePath() },
          { name: team.name, path: teamPathOf(team) },
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
          { name: `${season} WNBA Stats`, path: homePath() },
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
        "@id": `${SITE_URL}${homePath()}#dataset`,
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
          contentUrl: `${SITE_URL}/data/${season}/league.json`,
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

function buildPage({ team, player, path, tab, view }) {
  const meta = pageMeta({ team, tab, player, season, path, archive: isArchive, view });
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

  const shell =
    view === "salaries" ? salariesShell()
    : view === "gm" ? gmShell()
    : player ? playerShell(team, player)
    : team ? teamShell(team)
    : homeShell();
  html = replaceOnce(
    html,
    /<div id="root"><\/div>/,
    `<div id="root"><div id="seo-shell">\n      ${shell}\n      <noscript><p><strong>This dashboard needs JavaScript to draw its charts.</strong> The summary above lists what it covers.</p></noscript>\n    </div></div>`,
    "#root"
  );

  html = html.replace(
    "</head>",
    `  <script type="application/ld+json">${JSON.stringify(jsonLdFor({ team, player, path, view }))}</script>\n  </head>`
  );

  return html;
}

function writePage(path, html) {
  const dir = path === "/" ? distDir : resolve(distDir, "." + path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "index.html"), html);
}

// --- run -------------------------------------------------------------------

// Newest season first, so the sitemap leads with the pages that matter most.
const seasonList = index.seasons.map((s) => Number(s.season)).sort((a, b) => b - a);

let count = 0;
const routes = [];

function renderSeason(year) {
  league = readSeason(year);
  // Contracts are only maintained for the season being played (see
  // scripts/build-salaries.mjs), so an archived year simply has no salary page.
  const salaryPath = resolve(dataDir, String(year), "salaries.json");
  salaries = Number(year) === Number(currentSeason) && existsSync(salaryPath) ? readJson(salaryPath) : null;
  season = league.meta?.season ?? year;
  updatedISO = league.meta?.generatedAt || new Date().toISOString();
  updatedHuman = humanDate(updatedISO);
  isArchive = Number(season) !== Number(currentSeason);

  if (!league.teams?.length) {
    console.error(`prerender: ${year} has no teams — refusing to write empty pages for it.`);
    process.exit(1);
  }

  // Only the live season is worth ~250 player pages; see the note at the top.
  const withPlayers = !isArchive;

  writePage(homePath(), buildPage({ path: homePath() }));
  count++;

  if (salaries) {
    writePage(salariesPath(), buildPage({ path: salariesPath(), view: "salaries" }));
    writePage(gmPath(), buildPage({ path: gmPath(), view: "gm" }));
    count += 2;
  }

  for (const team of league.teams) {
    const tPath = teamPathOf(team);
    writePage(tPath, buildPage({ team, path: tPath, tab: "team" }));
    count++;

    if (!withPlayers) continue;
    const roster = (league.data[team.id] || {}).roster || [];
    const slugs = (team.players || []).map((p) => p.slug);
    roster.forEach((player, i) => {
      const pPath = `${tPath}/${slugs[i]}`;
      writePage(pPath, buildPage({ team, player, path: pPath, tab: "players" }));
      count++;
    });
  }

  routes.push(...seasonRoutes(league, currentSeason, { players: withPlayers, salaries: !!salaries }));
  return { year: season, teams: league.teams.length, archive: isArchive };
}

const rendered = seasonList.map(renderSeason);

// --- sitemap ---------------------------------------------------------------

// The live season changes nightly; a finished one never will again.
const lastmodFor = (route) => {
  const match = /^\/(\d{4})(\/|$)/.exec(route);
  const year = match ? Number(match[1]) : currentSeason;
  const entry = index.seasons.find((s) => Number(s.season) === year);
  return (entry?.generatedAt || updatedISO).slice(0, 10);
};
const changefreqFor = (route) => (/^\/\d{4}(\/|$)/.test(route) ? "yearly" : "daily");
const priorityFor = (route) => {
  const archive = /^\/\d{4}(\/|$)/.test(route);
  const depth = route.split("/").filter(Boolean).length;
  if (route === "/") return "1.0";
  if (route === "/salaries" || route === "/gm") return "0.9";
  if (archive) return depth <= 1 ? "0.6" : "0.4";
  return depth === 2 ? "0.8" : "0.6";
};

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (r) =>
      `  <url><loc>${SITE_URL}${r === "/" ? "/" : r}</loc><lastmod>${lastmodFor(r)}</lastmod>` +
      `<changefreq>${changefreqFor(r)}</changefreq><priority>${priorityFor(r)}</priority></url>`
  )
  .join("\n")}
</urlset>
`;
writeFileSync(resolve(distDir, "sitemap.xml"), sitemap);

if (routes.length !== count) {
  console.error(`prerender: wrote ${count} pages but the sitemap lists ${routes.length} — these must match.`);
  process.exit(1);
}

const live = rendered.find((r) => !r.archive);
console.log(
  `prerender: ${count} pages across ${rendered.length} seasons + sitemap.xml — ` +
    `${live ? `${live.year} in full (${live.teams} teams, players included)` : "no live season"}, ` +
    `${rendered.filter((r) => r.archive).map((r) => r.year).join(", ") || "no"} archived (team pages only)`
);
