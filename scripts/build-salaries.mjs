// ---------------------------------------------------------------------------
// Salary snapshot: one row per player, joining a hand-maintained salary sheet
// to the season data fetch-data.mjs already wrote.
//
// stats.wnba.com publishes no contract data, so the salaries come from a CSV
// checked into the repo (data/salaries/<season>.csv, sourced from
// herhoopstats.com's WNBA salary cap sheet). Everything else on the row —
// per-game production, shooting, usage, and the play-type scores — is computed
// here from public/data/<season>/, so the page needs one small file instead of
// all fifteen team bundles.
//
// Runs after `npm run fetch` (see the `postfetch` script in package.json), so
// the nightly refresh rebuilds it against the night's stats. The CSV itself
// only changes when contracts do, which is a hand edit.
//
//   node scripts/build-salaries.mjs [--season 2026]
//
// Output: public/data/<season>/salaries.json
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, "public/data");
const csvDir = resolve(root, "data/salaries");

const SOURCE = {
  name: "Her Hoop Stats salary cap sheet",
  url: "https://herhoopstats.com/salary-cap-sheet/wnba/players/highest_salary/",
};

// --- tiny helpers ----------------------------------------------------------

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const sum = (rows, key) => rows.reduce((a, b) => a + (b[key] || 0), 0);

/** Accent- and punctuation-free lowercase name, for joining two sources. */
const normName = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** RFC-4180-ish: quoted fields, doubled quotes inside them. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** "$1,400,000" -> 1400000; "" -> null. */
const parseMoney = (value) => {
  const digits = String(value).replace(/[^0-9]/g, "");
  return digits ? Number(digits) : null;
};

// --- the salary sheet ------------------------------------------------------

/**
 * name -> { salary, signing, contracts }.
 *
 * A player can appear twice: a hardship or replacement deal and then a
 * rest-of-season contract are two rows for one player. Those are summed, since
 * what the page is about is what she is paid across the season — the row count
 * rides along so the table can say when a figure is two contracts added up.
 */
function readSalaries(season) {
  const path = resolve(csvDir, `${season}.csv`);
  if (!existsSync(path)) return null;

  const [header, ...rows] = parseCsv(readFileSync(path, "utf8"));
  const col = (want) => header.findIndex((h) => h.trim().toUpperCase() === want);
  const iName = col("PLAYER");
  const iSalary = header.findIndex((h) => /SALARY/i.test(h));
  const iSigning = header.findIndex((h) => /SIGNING/i.test(h));
  // Optional, and never read into the page — it exists so that a sheet row that
  // fails to match a roster can say which team it claimed to be on, which is
  // most of the work of tracking down a spelling difference.
  const iTeam = header.findIndex((h) => /TEAM/i.test(h));
  if (iName < 0 || iSalary < 0) {
    throw new Error(`${path}: expected PLAYER and SALARY columns, got ${header.join(", ")}`);
  }

  const byName = new Map();
  for (const row of rows) {
    const name = (row[iName] || "").trim();
    if (!name) continue;
    const salary = parseMoney(row[iSalary]);
    const signing = ((iSigning >= 0 && row[iSigning]) || "").trim().replace(/^--$/, "");
    const team = ((iTeam >= 0 && row[iTeam]) || "").trim();
    const key = normName(name);
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, { name, salary, signing: signing || null, team: team || null, contracts: 1 });
      continue;
    }
    prev.contracts++;
    prev.salary = (prev.salary || 0) + (salary || 0);
    // A player's rows all carry the same designation, so the first one that has
    // it answers for the rest.
    prev.signing = prev.signing || signing || null;
    prev.team = prev.team || team || null;
  }
  return byName;
}

// --- season data -----------------------------------------------------------

function readSeason(season) {
  const seasonDir = resolve(dataDir, String(season));
  const league = JSON.parse(readFileSync(resolve(seasonDir, "league.json"), "utf8"));
  const bundles = new Map();
  for (const team of league.teams) {
    try {
      bundles.set(team.id, JSON.parse(readFileSync(resolve(seasonDir, "teams", `${team.id}.json`), "utf8")));
    } catch (_) {
      bundles.set(team.id, {});
    }
  }
  return { league, bundles };
}

/**
 * Every stint a player had this season, keyed by playerId. A player traded
 * mid-season is on two rosters with a slice of her games on each; the page
 * wants one row per player, so the stints are merged below and the team shown
 * is whichever one she played for most recently.
 */
function collectStints(league, bundles) {
  const stints = new Map();
  for (const team of league.teams) {
    const bundle = bundles.get(team.id) || {};
    const advByName = new Map((bundle.playerAdv || []).map((p) => [normName(p.name), p]));
    // On/off carries a player id, so it joins on that rather than on its name —
    // it spells them "Borlase, Isobel" where every other feed says "Isobel
    // Borlase".
    const onOffById = new Map((bundle.onOff || []).map((p) => [p.playerId, p]));
    // Game ids sort chronologically, which is how a trade is ordered below.
    const gameId = new Map((bundle.games || []).map((g) => [g.i, g.id]));
    const slugByName = new Map((team.players || []).map((p) => [normName(p.name), p.slug]));

    for (const player of bundle.roster || []) {
      const logs = player.logs || [];
      if (!stints.has(player.playerId)) stints.set(player.playerId, []);
      stints.get(player.playerId).push({
        team,
        player,
        logs,
        adv: advByName.get(normName(player.name)) || null,
        onOff: onOffById.get(player.playerId) || null,
        slug: slugByName.get(normName(player.name)) || null,
        lastGame: logs.length ? gameId.get(logs[logs.length - 1].g) || "" : "",
      });
    }
  }
  return stints;
}

/** Merge shot buckets ([{t|z, m, a}]) from every stint into one map. */
function mergeBuckets(stints, key, field) {
  const totals = new Map();
  for (const stint of stints) {
    for (const bucket of stint.player[key] || []) {
      const at = totals.get(bucket[field]) || { m: 0, a: 0 };
      at.m += bucket.m || 0;
      at.a += bucket.a || 0;
      totals.set(bucket[field], at);
    }
  }
  return totals;
}

/**
 * Merge `shotDefend` — one row per shot category the player defended, with what
 * those shooters hit against her (`pct`) and what they normally hit (`normPct`)
 * — across every stint. The normal rate is re-weighted by attempts rather than
 * averaged, since a trade splits a player's season unevenly.
 */
function mergeDefend(stints) {
  const totals = new Map();
  for (const stint of stints) {
    for (const b of stint.player.shotDefend || []) {
      const at = totals.get(b.c) || { fgm: 0, fga: 0, normMade: 0 };
      at.fgm += b.fgm || 0;
      at.fga += b.fga || 0;
      at.normMade += ((b.normPct || 0) / 100) * (b.fga || 0);
      totals.set(b.c, at);
    }
  }
  return totals;
}

/**
 * Hollinger's Game Score — a single number for what a player did in a game, on
 * roughly a points scale. It's the production half of "production vs salary":
 * unlike per-game averages it prices in the misses and the turnovers, and
 * unlike a rate stat it rewards being available, which is a thing a contract
 * buys.
 */
const gameScore = (g) =>
  (g.pts || 0) + 0.4 * (g.fgm || 0) - 0.7 * (g.fga || 0) - 0.4 * ((g.fta || 0) - (g.ftm || 0)) +
  0.7 * (g.orb || 0) + 0.3 * (g.drb || 0) + (g.stl || 0) + 0.7 * (g.ast || 0) + 0.7 * (g.blk || 0) -
  0.4 * (g.pf || 0) - (g.tov || 0);

/** One merged row per player: totals, rates, and the shot diet behind the scores. */
function buildRow(playerId, stints) {
  const ordered = [...stints].sort((a, b) => String(a.lastGame).localeCompare(String(b.lastGame)));
  const current = ordered[ordered.length - 1];
  const logs = ordered.flatMap((s) => s.logs);
  const gp = logs.length;
  const min = sum(logs, "min");

  const fgm = sum(logs, "fgm"), fga = sum(logs, "fga");
  const tpm = sum(logs, "tpm"), tpa = sum(logs, "tpa");
  const ftm = sum(logs, "ftm"), fta = sum(logs, "fta");
  const pts = sum(logs, "pts");
  const orb = sum(logs, "orb"), drb = sum(logs, "drb");
  const ast = sum(logs, "ast"), tov = sum(logs, "tov");
  const stl = sum(logs, "stl"), blk = sum(logs, "blk");
  const prod = logs.reduce((a, g) => a + gameScore(g), 0);

  // Usage, assist and rebound rates only exist in the advanced feed, so a
  // traded player's are averaged across her stints, weighted by the minutes she
  // played in each.
  const weighted = (key) => {
    let num = 0, den = 0;
    for (const s of ordered) {
      if (!s.adv || s.adv[key] == null) continue;
      const w = sum(s.logs, "min") || 1;
      num += s.adv[key] * w;
      den += w;
    }
    return den ? num / den : null;
  };

  const per36 = (total) => (min > 0 ? (total / min) * 36 : 0);
  const pct = (m, a) => (a > 0 ? (m / a) * 100 : null);

  const types = mergeBuckets(ordered, "shotTypes", "t");
  const zones = mergeBuckets(ordered, "shotZones", "z");
  const typeAt = (key) => types.get(key) || { m: 0, a: 0 };
  const zoneAt = (key) => zones.get(key) || { m: 0, a: 0 };
  const shotTotal = [...types.values()].reduce((a, b) => a + b.a, 0);
  const paint = { m: zoneAt("ra").m + zoneAt("paint").m, a: zoneAt("ra").a + zoneAt("paint").a };

  const pos = ordered.map((s) => s.player.pos).find(Boolean) || "";

  // --- defense ------------------------------------------------------------
  // Two independent readings, both of which need taming before they can be
  // ranked. The team's defensive rating with her on the floor against off it is
  // the only measure of impact there is, but at 30-odd games it is mostly the
  // four teammates around her; the matchup feed is her own work but on a few
  // hundred contested shots. So each is pulled toward "league average" in
  // proportion to how much of it there is (see SHRINK_ON / SHRINK_DEF), which
  // leaves a big sample nearly intact and a thin one near zero.
  const minOn = ordered.reduce((a, s) => a + ((s.onOff && s.onOff.minOn) || 0), 0);
  const defDiff = minOn
    ? ordered.reduce((a, s) => a + ((s.onOff && s.onOff.defDiff) || 0) * ((s.onOff && s.onOff.minOn) || 0), 0) / minOn
    : null;
  const onCourt = (key) => {
    if (!minOn) return null;
    const total = ordered.reduce((a, s) => a + ((s.onOff && s.onOff[key]) || 0) * ((s.onOff && s.onOff.minOn) || 0), 0);
    return r1(total / minOn);
  };

  const defend = mergeDefend(ordered);
  const defAt = (key) => {
    const d = defend.get(key);
    if (!d || !d.fga) return null;
    return {
      fga: d.fga,
      pct: r1((d.fgm / d.fga) * 100),
      // Positive means those shooters did BETTER than their season norm against
      // her, which is a defender being scored on.
      diff: r1(((d.fgm - d.normMade) / d.fga) * 100),
    };
  };
  const defAll = defAt("all");
  const defRim = defAt("lt6");

  // Sign-flipped so that, like every other input to a score, more is better.
  const damped = (value, sample, prior) =>
    value == null ? 0 : r2(-value * (sample / (sample + prior)));

  return {
    playerId,
    name: current.player.name,
    pos,
    posGroup: pos.trim().toUpperCase().charAt(0) || null,
    num: current.player.num || null,
    teamId: current.team.id,
    slug: current.slug,
    // Every team she suited up for, oldest first — the table footnotes a trade
    // rather than pretending she was on one roster all year.
    teams: ordered.map((s) => s.team.abbr),
    gp,
    min,
    mpg: gp ? r1(min / gp) : 0,
    ppg: gp ? r1(pts / gp) : 0,
    rpg: gp ? r1((orb + drb) / gp) : 0,
    apg: gp ? r1(ast / gp) : 0,
    spg: gp ? r1(stl / gp) : 0,
    bpg: gp ? r1(blk / gp) : 0,
    topg: gp ? r1(tov / gp) : 0,
    pfpg: gp ? r1(sum(logs, "pf") / gp) : 0,
    tpg: gp ? r1(tpm / gp) : 0,
    fgPct: pct(fgm, fga) == null ? null : r1(pct(fgm, fga)),
    tpPct: pct(tpm, tpa) == null ? null : r1(pct(tpm, tpa)),
    ftPct: pct(ftm, fta) == null ? null : r1(pct(ftm, fta)),
    ts: fga + 0.44 * fta > 0 ? r1((pts / (2 * (fga + 0.44 * fta))) * 100) : null,
    usg: weighted("usg") == null ? null : r1(weighted("usg")),
    astPct: weighted("astPct") == null ? null : r1(weighted("astPct")),
    rebPct: weighted("rebPct") == null ? null : r1(weighted("rebPct")),
    net: weighted("net") == null ? null : r1(weighted("net")),
    pie: weighted("pie") == null ? null : r1(weighted("pie")),
    prod: r1(prod),
    prodPg: gp ? r1(prod / gp) : 0,
    // The raw defensive readings, kept whole so the table can show what the
    // defensive score is made of rather than only its rank.
    defense: {
      minOn,
      defOn: onCourt("defOn"),
      defOff: onCourt("defOff"),
      defDiff: defDiff == null ? null : r1(defDiff),
      fga: defAll ? defAll.fga : null,
      fgaPg: defAll && gp ? r1(defAll.fga / gp) : null,
      pct: defAll ? defAll.pct : null,
      diff: defAll ? defAll.diff : null,
      rimFga: defRim ? defRim.fga : null,
      rimPct: defRim ? defRim.pct : null,
      rimDiff: defRim ? defRim.diff : null,
    },
    // The raw inputs the play-type scores are built from, kept on the row so
    // the page can show what a score is made of instead of only its rank.
    rates: {
      pts36: r1(per36(pts)),
      reb36: r1(per36(orb + drb)),
      orb36: r1(per36(orb)),
      ast36: r1(per36(ast)),
      astTov: tov > 0 ? r2(ast / tov) : ast > 0 ? 99 : 0,
      tpa36: r1(per36(tpa)),
      spot336: r1(per36(typeAt("spot3").a)),
      spot3Pct: pct(typeAt("spot3").m, typeAt("spot3").a) == null ? null : r1(pct(typeAt("spot3").m, typeAt("spot3").a)),
      spot3Share: shotTotal > 0 ? r1((typeAt("spot3").a / shotTotal) * 100) : 0,
      // Post-ups on their own, because they're what separates a post scorer
      // from a guard who lives at the rim; the wider interior bucket (cuts,
      // putbacks, uncategorised layups) rides alongside as supporting volume.
      post36: r1(per36(typeAt("post").a)),
      interior36: r1(per36(typeAt("post").a + typeAt("putback").a + typeAt("cut").a + typeAt("rim").a)),
      drive36: r1(per36(typeAt("drive").a)),
      float36: r1(per36(typeAt("float").a)),
      drivePct: pct(typeAt("drive").m, typeAt("drive").a) == null ? null : r1(pct(typeAt("drive").m, typeAt("drive").a)),
      paint36: r1(per36(paint.a)),
      paintPct: pct(paint.m, paint.a) == null ? null : r1(pct(paint.m, paint.a)),
      ftr: fga > 0 ? r2(fta / fga) : 0,
      stl36: r1(per36(stl)),
      blk36: r1(per36(blk)),
      // Negated: staying out of foul trouble is the good end, and every part of
      // a score has to point the same way for the percentile blend to work.
      cleanD: r2(-per36(sum(logs, "pf"))),
      // Damped on/off and matchup readings — see the note in buildRow.
      defImpact: damped(defDiff, minOn, SHRINK_ON),
      defSaved: damped(defAll ? defAll.diff : null, defAll ? defAll.fga : 0, SHRINK_DEF),
      defRim: damped(defRim ? defRim.diff : null, defRim ? defRim.fga : 0, SHRINK_RIM),
    },
    totals: { fgm, fga, tpm, tpa, ftm, fta, pts, orb, drb, ast, tov, stl, blk },
  };
}

// --- play-type scoring -----------------------------------------------------

// A player has to have been on the floor enough for a rate to mean anything.
// Below this she still gets a row — the salary is the point of the page — but
// no scores, and she stays out of the percentile pools so a two-minute cameo
// can't set the top of a scale.
const MIN_GAMES = 5;
const MIN_MINUTES = 150;

// How much of a defensive reading survives its own sample size. At `prior` the
// number is halved; well past it, it is kept almost whole. On/off is in
// on-court minutes, the matchup ones in shots defended.
const SHRINK_ON = 400;
const SHRINK_DEF = 150;
const SHRINK_RIM = 60;

// A "best fit" has to be a real strength (FIT_FLOOR), and anything this close to
// the top one is called alongside it rather than losing on a tiebreak.
const FIT_FLOOR = 60;
const FIT_MARGIN = 2;

// Role value — a role's score per dollar — is only computed for a player who is
// actually above average in that role. Any ratio with money on the bottom is won
// by whoever is cheapest, so without this the "best value rebounder" is a
// minimum-salary player who scores 40: cheap, but not a rebounder. Above the
// median it starts meaning something.
const ROLE_VALUE_FLOOR = 55;

/**
 * Percentile rank of `value` within a sorted pool, 0-100. Ties share the
 * midpoint of the range they span, so five players who all took zero post shots
 * get the same score rather than an arbitrary order.
 */
function percentileFn(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (value) => {
    if (!sorted.length) return 0;
    let low = 0, high = sorted.length;
    while (low < high) { const mid = (low + high) >> 1; if (sorted[mid] < value) low = mid + 1; else high = mid; }
    let end = low;
    while (end < sorted.length && sorted[end] === value) end++;
    return ((low + end) / 2 / sorted.length) * 100;
  };
}

/**
 * A rate shrunk toward the league average by `prior` attempts of it. Raw
 * percentages on 20 attempts are mostly noise, and a 3-for-4 shooter topping a
 * shooting score is the fastest way to make a leaderboard useless.
 */
const shrink = (made, attempts, leagueRate, prior) =>
  ((made + leagueRate * prior) / (attempts + prior)) * 100;

/**
 * The five play-type scores plus the value score, each 0-100.
 *
 * Every one is a weighted blend of *percentile ranks* within the qualified
 * pool, not of the raw numbers — so a 90 always means "top 10% of rotation
 * players at this", whatever the units of the parts are, and one component with
 * a fat tail (post-up volume, say) can't swamp the others.
 *
 * They describe what a player *does*, mixing volume with how well she does it.
 * A high spot-up score is a high-volume catch-and-shoot three-point shooter who
 * makes them; a low one can mean either she doesn't take them or she misses.
 */
const PLAY_TYPES = [
  {
    key: "spot",
    label: "Spot-up shooter",
    blurb: "Catch-and-shoot volume from three, and whether they go in.",
    parts: [
      { weight: 0.50, of: (p) => p.rates.spot336 },
      { weight: 0.35, of: (p) => p.shrunk.tp },
      { weight: 0.15, of: (p) => p.rates.spot3Share },
    ],
  },
  {
    key: "playmaker",
    label: "Playmaker",
    blurb: "Assists per 36, share of teammate baskets created, and care with the ball.",
    parts: [
      { weight: 0.45, of: (p) => p.rates.ast36 },
      { weight: 0.35, of: (p) => p.astPct },
      { weight: 0.20, of: (p) => p.rates.astTov },
    ],
  },
  {
    key: "post",
    label: "Post scorer",
    blurb: "Back-to-basket volume, the interior diet around it, finishing, and fouls drawn.",
    parts: [
      { weight: 0.50, of: (p) => p.rates.post36 },
      { weight: 0.20, of: (p) => p.rates.interior36 },
      { weight: 0.20, of: (p) => p.shrunk.paint },
      { weight: 0.10, of: (p) => p.rates.ftr },
    ],
  },
  {
    // Named for the shot bucket it is built from, which src/PlayTypes.jsx calls
    // "Drive" on every player page — the same feed should not go by two names.
    key: "driving",
    label: "Driving",
    blurb: "Getting to the rim off the bounce — drive and floater volume, finishing, and trips to the line.",
    parts: [
      { weight: 0.45, of: (p) => p.rates.drive36 },
      { weight: 0.20, of: (p) => p.rates.float36 },
      { weight: 0.20, of: (p) => p.shrunk.drive },
      { weight: 0.15, of: (p) => p.rates.ftr },
    ],
  },
  {
    key: "scorer",
    label: "Scoring",
    blurb: "Points per 36, the share of possessions used, and true-shooting efficiency.",
    parts: [
      { weight: 0.45, of: (p) => p.rates.pts36 },
      { weight: 0.25, of: (p) => p.usg },
      { weight: 0.30, of: (p) => p.shrunk.ts },
    ],
  },
  {
    key: "defense",
    label: "Defense",
    blurb:
      "How the team's defense changes with her on the floor, whether the players she guards shoot worse " +
      "than usual, rim protection, steals, and staying out of foul trouble.",
    parts: [
      { weight: 0.26, of: (p) => p.rates.defImpact },
      { weight: 0.26, of: (p) => p.rates.defSaved },
      { weight: 0.14, of: (p) => p.rates.stl36 },
      { weight: 0.12, of: (p) => p.rates.blk36 },
      { weight: 0.12, of: (p) => p.rates.defRim },
      { weight: 0.10, of: (p) => p.rates.cleanD },
    ],
  },
  {
    key: "rebounder",
    label: "Rebounding",
    blurb: "Rebounds per 36, share of available boards, and work on the offensive glass.",
    parts: [
      { weight: 0.45, of: (p) => p.rates.reb36 },
      { weight: 0.35, of: (p) => p.rebPct },
      { weight: 0.20, of: (p) => p.rates.orb36 },
    ],
  },
];

function scorePlayers(rows) {
  const pool = rows.filter((p) => p.gp >= MIN_GAMES && p.min >= MIN_MINUTES);

  // League baselines for the shrunk shooting rates.
  const lg = (key) => {
    const made = pool.reduce((a, p) => a + p.totals[key[0]], 0);
    const att = pool.reduce((a, p) => a + p.totals[key[1]], 0);
    return att > 0 ? made / att : 0;
  };
  const lgTp = lg(["tpm", "tpa"]);
  const weightedRate = (of) =>
    pool.reduce((a, p) => a + (of(p) || 0) * p.min, 0) / (pool.reduce((a, p) => a + p.min, 0) || 1) / 100;
  const lgPaint = weightedRate((p) => p.rates.paintPct);
  const lgDrive = weightedRate((p) => p.rates.drivePct);
  const lgTs = weightedRate((p) => p.ts);

  for (const p of rows) {
    // The shot-type feed gives makes and attempts; both were folded into per-36
    // rates on the row, so they're unfolded here rather than carried twice.
    const attemptsOf = (rate) => Math.round((rate * p.min) / 36);
    const madeOf = (attempts, pct) => Math.round((attempts * (pct || 0)) / 100);
    const paintA = attemptsOf(p.rates.paint36);
    const driveA = attemptsOf(p.rates.drive36);
    p.shrunk = {
      tp: r1(shrink(p.totals.tpm, p.totals.tpa, lgTp, 50)),
      paint: r1(shrink(madeOf(paintA, p.rates.paintPct), paintA, lgPaint, 40)),
      drive: r1(shrink(madeOf(driveA, p.rates.drivePct), driveA, lgDrive, 40)),
      // True shooting has to be shrunk on its own scale: possessions, not makes.
      ts: r1(shrink((p.totals.pts / 2) || 0, p.totals.fga + 0.44 * p.totals.fta, lgTs, 60)),
    };
  }

  // One percentile function per component, fitted on the qualified pool only.
  const scales = new Map();
  for (const type of PLAY_TYPES) {
    type.parts.forEach((part, i) => {
      scales.set(`${type.key}:${i}`, percentileFn(pool.map((p) => part.of(p) ?? 0)));
    });
  }

  for (const p of rows) {
    if (p.gp < MIN_GAMES || p.min < MIN_MINUTES) {
      p.scores = null;
      p.fit = null;
      continue;
    }
    const scores = {};
    for (const type of PLAY_TYPES) {
      let total = 0;
      type.parts.forEach((part, i) => {
        total += part.weight * scales.get(`${type.key}:${i}`)(part.of(p) ?? 0);
      });
      scores[type.key] = Math.round(total);
    }
    p.scores = scores;
    // What she does furthest above the rest of the league — the label the table
    // leads with. Nobody clearly above average at anything is "Balanced" rather
    // than being handed the least-bad of her scores.
    //
    // Every role within FIT_MARGIN of the top one is named, not just the
    // highest: a player can genuinely be two things at once, and picking one of
    // a 96/96 by which archetype happens to be declared first in this file is a
    // coin flip dressed up as a finding. About one qualified player in seven is
    // this close, and Kelsey Plum — tied at the top in slashing and scoring — is
    // exactly the case that makes a single label misleading.
    const ranked = PLAY_TYPES.map((t) => [t.key, scores[t.key]]).sort((a, b) => b[1] - a[1]);
    const best = ranked[0][1];
    p.fit = best >= FIT_FLOOR
      ? ranked.filter(([, v]) => v >= best - FIT_MARGIN).slice(0, 2).map(([key]) => key)
      : [];
  }

  // The same question asked one role at a time: who delivers the most spot-up
  // shooting, or rim protection, or rebounding, per dollar? Each role is ranked
  // on score-per-$1M within its own pool of above-average players, so the number
  // stays on the 0-100 scale everything else on the page uses — a 95 is "top 5%
  // of this league at this role for the money", not a ratio in units nobody can
  // read. The raw ratio is score / (salary/1e6), which the page recovers from
  // the row when it wants to show one.
  const roleScales = new Map();
  for (const type of PLAY_TYPES) {
    const eligible = rows.filter(
      (p) => p.salary && p.scores && p.scores[type.key] >= ROLE_VALUE_FLOOR
    );
    roleScales.set(type.key, {
      scale: percentileFn(eligible.map((p) => p.scores[type.key] / (p.salary / 1e6))),
      n: eligible.length,
    });
  }
  for (const p of rows) {
    if (!p.salary || !p.scores) { p.roleValue = null; continue; }
    p.roleValue = {};
    for (const type of PLAY_TYPES) {
      p.roleValue[type.key] =
        p.scores[type.key] >= ROLE_VALUE_FLOOR
          ? Math.round(roleScales.get(type.key).scale(p.scores[type.key] / (p.salary / 1e6)))
          : null;
    }
  }

  // Value is production per dollar, ranked among players who have both — a row
  // with no salary in the sheet can't be on this scale at all.
  //
  // Two of them, because "was this contract worth it?" and "is this player worth
  // it?" are different questions and a season with games missed splits them:
  //
  //   value    season production per $1M. Availability counts, which is the
  //            honest read on a contract — a team pays for a season, and games
  //            missed to injury are games it did not get.
  //   valuePg  the same, per game played. Injury is priced out, so this is what
  //            the player returns when she is actually on the floor.
  //
  // Napheesa Collier is the case that needs both: ten games at $1.4M is close to
  // the worst contract on the board by the first measure and a good one by the
  // second, and neither of those is the wrong answer.
  const paid = rows.filter((p) => p.salary && p.scores);
  const perMillion = (p) => p.prod / (p.salary / 1e6);
  const perMillionPerGame = (p) => p.prodPg / (p.salary / 1e6);
  const valueScale = percentileFn(paid.map(perMillion));
  const valuePgScale = percentileFn(paid.map(perMillionPerGame));
  for (const p of rows) {
    if (!p.salary || !p.scores) {
      p.valuePerM = null; p.value = null; p.valuePgPerM = null; p.valuePg = null;
      p.costPerProd = null; p.costPerProdPg = null;
      continue;
    }
    p.valuePerM = r1(perMillion(p));
    p.value = Math.round(valueScale(perMillion(p)));
    p.valuePgPerM = r1(perMillionPerGame(p));
    p.valuePg = Math.round(valuePgScale(perMillionPerGame(p)));
    p.costPerProd = p.prod > 0 ? Math.round(p.salary / p.prod) : null;
    p.costPerProdPg = p.prodPg > 0 ? Math.round(p.salary / p.prodPg) : null;
  }

  return { qualified: pool.length };
}

// --- run -------------------------------------------------------------------

const args = process.argv.slice(2);
const seasonArg = args.includes("--season") ? Number(args[args.indexOf("--season") + 1]) : null;
const index = JSON.parse(readFileSync(resolve(dataDir, "index.json"), "utf8"));
const season = seasonArg || index.currentSeason;

const salaries = readSalaries(season);
if (!salaries) {
  console.log(`salaries: no data/salaries/${season}.csv — nothing to build.`);
  process.exit(0);
}
if (!existsSync(resolve(dataDir, String(season), "league.json"))) {
  console.log(`salaries: no public/data/${season}/league.json — run \`npm run fetch\` first.`);
  process.exit(0);
}

const { league, bundles } = readSeason(season);
const stints = collectStints(league, bundles);

const rows = [...stints.entries()].map(([playerId, list]) => buildRow(playerId, list));

// Join the sheet on. Names come from two feeds that don't share ids, so the
// unmatched ones are reported rather than silently dropped — a rename upstream
// should be visible in the build log, not as a player quietly missing a salary.
const matched = new Set();
for (const row of rows) {
  const hit = salaries.get(normName(row.name));
  row.salary = hit ? hit.salary : null;
  row.signing = hit ? hit.signing : null;
  row.contracts = hit ? hit.contracts : 0;
  if (hit) matched.add(normName(row.name));
}
const unmatched = [...salaries.values()]
  .filter((s) => !matched.has(normName(s.name)))
  .map((s) => ({ name: s.name, salary: s.salary, team: s.team || null }));

const { qualified } = scorePlayers(rows);

// Trim the working fields the page doesn't read.
for (const row of rows) { delete row.shrunk; delete row.totals; }
rows.sort((a, b) => (b.salary || 0) - (a.salary || 0) || b.prod - a.prod);

const out = {
  meta: {
    season,
    generatedAt: new Date().toISOString(),
    statsAsOf: league.meta?.generatedAt || null,
    source: SOURCE,
    players: rows.length,
    withSalary: rows.filter((r) => r.salary).length,
    qualified,
    minGames: MIN_GAMES,
    minMinutes: MIN_MINUTES,
    roleValueFloor: ROLE_VALUE_FLOOR,
    // Salaried players the sheet lists who aren't on any roster in this
    // season's data — waived, overseas, or signed after the last refresh.
    unmatched,
  },
  playTypes: PLAY_TYPES.map(({ key, label, blurb }) => ({ key, label, blurb })),
  teams: league.teams.map((t) => ({ id: t.id, name: t.name, teamName: t.teamName, abbr: t.abbr, emoji: t.emoji })),
  players: rows,
};

writeFileSync(resolve(dataDir, String(season), "salaries.json"), JSON.stringify(out));
console.log(
  `salaries: ${rows.length} players (${out.meta.withSalary} with a ${season} salary, ${qualified} qualified for scores)` +
    `${unmatched.length ? ` — ${unmatched.length} sheet rows not on a roster: ${unmatched.map((u) => (u.team ? `${u.name} (${u.team})` : u.name)).join(", ")}` : ""}`
);
