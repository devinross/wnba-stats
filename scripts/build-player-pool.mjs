// ---------------------------------------------------------------------------
// Player pool: one compact row of per-game numbers for every player in a
// season, written into that season's league.json as `playerPool`.
//
// A player page only downloads its own team's file, so on its own it can say
// how a player compares with her teammates but not with the league. The
// scouting report at the top of the page (src/scouting.js) wants the second —
// "fourth in the league in scoring", "bottom tenth in turnovers" — and this is
// the few KB that makes that possible without fetching all fifteen teams.
//
// A player traded mid-season appears on two rosters; her rows are merged by
// player id so she is ranked on her whole season, not one stint of it.
//
// Runs after `npm run fetch` (see `postfetch` in package.json), and rewrites
// every season it finds, so it doubles as its own backfill.
//
//   node scripts/build-player-pool.mjs [--season 2026]
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, "public/data");

const r1 = (n) => Math.round(n * 10) / 10;
const pct = (m, a) => (a > 0 ? r1((m / a) * 100) : null);
const STATS = ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "ast", "stl", "blk", "tov", "min"];

function buildPool(season) {
  const dir = resolve(dataDir, String(season));
  const leaguePath = resolve(dir, "league.json");
  if (!existsSync(leaguePath)) return null;
  const league = JSON.parse(readFileSync(leaguePath, "utf8"));

  const byId = new Map();
  for (const team of league.teams || []) {
    const path = resolve(dir, "teams", `${team.id}.json`);
    if (!existsSync(path)) continue;
    const bundle = JSON.parse(readFileSync(path, "utf8"));
    for (const p of bundle.roster || []) {
      if (!p.logs || !p.logs.length) continue;
      const row = byId.get(p.playerId) || { id: p.playerId, pos: p.pos || "", gp: 0, ...Object.fromEntries(STATS.map((k) => [k, 0])) };
      row.gp += p.logs.length;
      for (const l of p.logs) for (const k of STATS) row[k] += l[k] || 0;
      byId.set(p.playerId, row);
    }
  }

  const pool = [...byId.values()].map((t) => {
    const tsDen = 2 * (t.fga + 0.44 * t.fta);
    return {
      id: t.id,
      pos: t.pos,
      gp: t.gp,
      mpg: r1(t.min / t.gp),
      ppg: r1(t.pts / t.gp),
      rpg: r1((t.orb + t.drb) / t.gp),
      apg: r1(t.ast / t.gp),
      spg: r1(t.stl / t.gp),
      bpg: r1(t.blk / t.gp),
      tpg: r1(t.tov / t.gp),
      tpm: r1(t.tpm / t.gp),
      tpa: r1(t.tpa / t.gp),
      fta: r1(t.fta / t.gp),
      ts: tsDen > 0 ? r1((t.pts / tsDen) * 100) : null,
      tpPct: pct(t.tpm, t.tpa),
      ftPct: pct(t.ftm, t.fta),
    };
  });

  league.playerPool = pool;
  writeFileSync(leaguePath, JSON.stringify(league));
  return pool.length;
}

const arg = process.argv.indexOf("--season");
const seasons = arg > -1
  ? [process.argv[arg + 1]]
  : readdirSync(dataDir).filter((name) => /^\d{4}$/.test(name));

for (const season of seasons) {
  const n = buildPool(season);
  console.log(n == null ? `player pool: ${season} has no league.json — skipped` : `player pool: ${season} — ${n} players`);
}
