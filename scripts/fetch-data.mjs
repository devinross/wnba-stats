#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WNBA Analytics — data fetcher (all teams)
//
// Pulls every WNBA team's data from stats.wnba.com ONCE and writes it to a
// single static file (public/data/wnba.json) that the web app reads. The
// deployed site then never talks to stats.wnba.com — no proxy, no CORS, no IP
// blocking, no runtime 500s. Re-run this whenever you want to refresh.
//
//     npm run fetch
//     npm run fetch -- /path/to/public_html/data/wnba.json   (custom output)
//
// Run from a machine whose IP stats.wnba.com doesn't block (your Mac is fine;
// many shared hosts are not). It prints the real status of every request.
// ---------------------------------------------------------------------------

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ----- config ---------------------------------------------------------------

const SEASON = 2026; // WNBA season (single calendar year). Change + re-run to switch seasons.
const HOST = "https://stats.wnba.com";
const REQUEST_TIMEOUT_MS = 30000;
const DELAY_BETWEEN_CALLS_MS = 500; // be gentle with the undocumented endpoint

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.wnba.com/",
  Origin: "https://www.wnba.com",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
  Connection: "keep-alive",
};

// Emoji "logo" per team, matched by a keyword in the team name. Edit freely.
// Any team that doesn't match falls back to a basketball.
const TEAM_EMOJI = [
  [/spark/i, "✨"],
  [/liberty/i, "🗽"],
  [/\bsun\b/i, "☀️"],
  [/\bsky\b/i, "☁️"],
  [/storm/i, "⛈️"],
  [/fever/i, "🌡️"],
  [/dream/i, "🌙"],
  [/wing/i, "🪽"],
  [/valkyr/i, "⚔️"],
  [/ace/i, "♠️"],
  [/lynx/i, "🐆"],
  [/mercury/i, "🪐"],
  [/mystic/i, "🔮"],
  [/fire/i, "🌹"],
  [/tempo/i, "⏩"],
];
function emojiFor(name) {
  const hit = TEAM_EMOJI.find(([re]) => re.test(String(name)));
  return hit ? hit[1] : "🏀";
}

const DEFAULT_OUT = fileURLToPath(new URL("../public/data/wnba.json", import.meta.url));
const OUT_PATH = process.argv[2] || DEFAULT_OUT;

// ----- parameter sets --------------------------------------------------------

const COMMON = {
  LeagueID: "10", Season: String(SEASON), SeasonType: "Regular Season",
  Counter: "0", Sorter: "DATE", Direction: "ASC", DateFrom: "", DateTo: "",
};

const ONOFF = {
  LeagueID: "10", Season: String(SEASON), SeasonType: "Regular Season",
  MeasureType: "Advanced", PerMode: "Totals", PlusMinus: "N", PaceAdjust: "N",
  Rank: "N", Outcome: "", Location: "", Month: "0", SeasonSegment: "",
  DateFrom: "", DateTo: "", OpponentTeamID: "0", VsConference: "", VsDivision: "",
  GameSegment: "", Period: "0", LastNGames: "0",
};

// Full WNBA filter set, deliberately WITHOUT the NBA-only TwoWay/ISTRound params.
const DASH_COMMON = {
  LeagueID: "10", Season: String(SEASON), SeasonType: "Regular Season",
  PerMode: "PerGame", MeasureType: "Advanced", PlusMinus: "N", PaceAdjust: "N",
  Rank: "N", Outcome: "", Location: "", Month: "0", SeasonSegment: "",
  DateFrom: "", DateTo: "", OpponentTeamID: "0", VsConference: "", VsDivision: "",
  Conference: "", Division: "", GameScope: "", GameSegment: "", Period: "0",
  ShotClockRange: "", LastNGames: "0", PORound: "0", TeamID: "0",
};
const TEAM_DASH = { ...DASH_COMMON, PlayerExperience: "", PlayerPosition: "", StarterBench: "" };
const PLAYER_DASH = { ...TEAM_DASH, College: "", Country: "", DraftPick: "", DraftYear: "", Height: "", Weight: "" };
const LINEUP_DASH = { ...DASH_COMMON, GroupQuantity: "5", GameID: "" };

// ----- fetch + parse helpers -------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function statsFetch(endpoint, params) {
  const usp = new URLSearchParams(params);
  const url = `${HOST}/stats/${endpoint}?${usp.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === "AbortError" ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : e.message);
  }
  clearTimeout(timer);
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch (_) {}
    let detail = `HTTP ${res.status}`;
    if (body) {
      try {
        const j = JSON.parse(body);
        const msg = j.error || j.message || j.Message || "";
        if (msg) detail = `HTTP ${res.status}: ${msg}`;
      } catch (_) {
        const snippet = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
        if (snippet) detail = `HTTP ${res.status}: ${snippet}`;
      }
    }
    throw new Error(detail);
  }
  return res.json();
}

function toObjects(json, name) {
  let sets = json.resultSets || json.resultSet || [];
  if (!Array.isArray(sets)) sets = [sets];
  let set = name ? sets.find((s) => s && s.name === name) : sets[0];
  if (!set) set = sets.find((s) => s && s.headers && s.headers.length);
  if (!set || !set.headers) return [];
  const cols = set.headers;
  return (set.rowSet || []).map((row) => {
    const o = {};
    cols.forEach((c, i) => (o[c] = row[i]));
    return o;
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  const [, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!m || !d) return String(iso);
  return `${MONTHS[m - 1]} ${d}`;
}
const n = (v) => (v == null ? 0 : Number(v) || 0);
const sumPts = (logs) => logs.reduce((a, l) => a + l.pts, 0);
const r1 = (v) => Math.round(n(v) * 10) / 10;
const pctOf = (v) => Math.round(n(v) * 1000) / 10;
function lastName(name) { const p = String(name).trim().split(" "); return p[p.length - 1]; }
function cleanLineup(g) { return String(g).split(" - ").map((s) => lastName(s)).join(" / "); }
function splitName(full) {
  const parts = String(full).trim().split(" ");
  return { teamName: parts[parts.length - 1], city: parts.slice(0, -1).join(" ") };
}

// ----- per-team transforms ---------------------------------------------------

function buildGames(teamRows, teamId, rowsByGame, scoreOf) {
  return teamRows
    .filter((r) => r.TEAM_ID === teamId)
    .sort((a, b) => (a.GAME_DATE < b.GAME_DATE ? -1 : 1))
    .map((r) => {
      const pair = rowsByGame.get(r.GAME_ID) || [];
      const opp = pair.find((x) => x.TEAM_ID !== teamId);
      const oppId = opp ? opp.TEAM_ID : null;
      // The team game-log PTS is the final (OT-inclusive) score, but it can
      // briefly lag for a just-finished game and show a regulation tie. The sum
      // of a team's players' points is always the final total, so take whichever
      // is larger — that guarantees overtime scoring is reflected.
      const tm = Math.max(n(r.PTS), scoreOf(r.GAME_ID, teamId));
      const op = opp ? Math.max(n(opp.PTS), scoreOf(r.GAME_ID, oppId)) : null;
      return {
        id: r.GAME_ID, date: fmtDate(r.GAME_DATE),
        opp: opp ? opp.TEAM_ABBREVIATION : String(r.MATCHUP || "").split(/ vs\.? | @ /)[1] || "",
        home: String(r.MATCHUP || "").includes(" vs"),
        w: r.WL === "W", tm, op,
      };
    })
    .filter((g) => (g.tm || 0) > 0 || (g.op || 0) > 0) // drop unplayed / not-yet-scored games
    .map((g, idx) => ({ ...g, i: idx })); // contiguous game indices after filtering
}

function buildRoster(playerRows, teamId, idToIndex, meta) {
  const byPlayer = new Map();
  for (const r of playerRows) {
    if (r.TEAM_ID !== teamId) continue;
    const gi = idToIndex.get(r.GAME_ID);
    if (gi == null) continue;
    if (!byPlayer.has(r.PLAYER_ID)) {
      const m = meta.get(r.PLAYER_ID) || {};
      byPlayer.set(r.PLAYER_ID, { name: r.PLAYER_NAME, pos: m.pos || "", num: m.num || "", logs: [] });
    }
    const pts = n(r.PTS), fga = n(r.FGA), fta = n(r.FTA), fgm = n(r.FGM), tpm = n(r.FG3M);
    const tsDen = 2 * (fga + 0.44 * fta);
    byPlayer.get(r.PLAYER_ID).logs.push({
      g: gi, pts, fgm, fga, tpm, tpa: n(r.FG3A), ftm: n(r.FTM), fta,
      orb: n(r.OREB), drb: n(r.DREB), ast: n(r.AST), stl: n(r.STL), blk: n(r.BLK),
      tov: n(r.TOV), pf: n(r.PF), min: parseInt(r.MIN, 10) || 0, pm: n(r.PLUS_MINUS),
      ts: tsDen > 0 ? Math.round((pts / tsDen) * 1000) / 10 : 0,
    });
  }
  return [...byPlayer.values()]
    .map((p) => ({ ...p, logs: p.logs.sort((a, b) => a.g - b.g) }))
    .filter((p) => p.logs.length > 0)
    .sort((a, b) => sumPts(b.logs) - sumPts(a.logs));
}

function shapeOnOff(json) {
  const onRows = toObjects(json, "PlayersOnCourtTeamPlayerOnOffDetails");
  const offRows = toObjects(json, "PlayersOffCourtTeamPlayerOnOffDetails");
  const offMap = new Map(offRows.map((r) => [r.VS_PLAYER_ID, r]));
  return onRows.map((on) => {
    const off = offMap.get(on.VS_PLAYER_ID);
    if (!off) return null;
    const offOn = n(on.OFF_RATING), offOff = n(off.OFF_RATING);
    const defOn = n(on.DEF_RATING), defOff = n(off.DEF_RATING);
    const offDiff = Math.round((offOn - offOff) * 10) / 10;
    const defDiff = Math.round((defOn - defOff) * 10) / 10;
    return {
      playerId: on.VS_PLAYER_ID, name: on.VS_PLAYER_NAME, minOn: parseInt(on.MIN, 10) || 0,
      offOn, offOff, defOn, defOff, offDiff, defDiff,
      netDiff: Math.round((offDiff - defDiff) * 10) / 10,
    };
  }).filter(Boolean);
}

// Four factors computed from box scores (the dedicated leaguedashteamstats
// "Four Factors" measure type returns HTTP 500 on the WNBA backend, but the
// four factors are just standard box-score formulas and the player game log
// gives us every team's — and every opponent's — box score). Aggregated over
// a team's games:
//   eFG%   = (FGM + 0.5*3PM) / FGA
//   TOV%   = TOV / (FGA + 0.44*FTA + TOV)
//   OREB%  = OREB / (OREB + opponent DREB)
//   FT rate= FTA / FGA
function emptyBox() {
  return { pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0 };
}
function addBox(a, b) {
  for (const k in b) a[k] += b[k];
  return a;
}
function factorsOf(x, oppDreb) {
  const tovDen = x.fga + 0.44 * x.fta + x.tov;
  const orebDen = x.oreb + oppDreb;
  const p = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
  return {
    efg: p(x.fgm + 0.5 * x.fg3m, x.fga),
    tov: p(x.tov, tovDen),
    oreb: p(x.oreb, orebDen),
    ftRate: p(x.fta, x.fga),
  };
}

function shapePlayerAdv(rows) {
  return rows.map((r) => ({
    playerId: r.PLAYER_ID, name: r.PLAYER_NAME, gp: n(r.GP), min: r1(r.MIN),
    usg: pctOf(r.USG_PCT), ts: pctOf(r.TS_PCT), astPct: pctOf(r.AST_PCT),
    rebPct: pctOf(r.REB_PCT), net: r1(r.NET_RATING), pie: pctOf(r.PIE),
  }));
}

function shapeLineups(rows) {
  return rows.map((r) => ({
    id: r.GROUP_ID, name: cleanLineup(r.GROUP_NAME), gp: n(r.GP), min: r1(r.MIN),
    off: r1(r.OFF_RATING), def: r1(r.DEF_RATING), net: r1(r.NET_RATING),
  })).sort((a, b) => b.min - a.min).slice(0, 8);
}

// ----- main ------------------------------------------------------------------

async function main() {
  console.log(`\nWNBA Analytics — fetching ${SEASON} data from stats.wnba.com\n`);

  // ----- league-wide data (one call each) -----
  console.log("League-wide data:");
  process.stdout.write("  • team game log … ");
  const teamRows = toObjects(await statsFetch("leaguegamelog", { ...COMMON, PlayerOrTeam: "T" }), "LeagueGameLog");
  if (!teamRows.length) throw new Error("No team game-log rows returned — cannot continue.");
  console.log(`${teamRows.length} rows`);
  await sleep(DELAY_BETWEEN_CALLS_MS);

  process.stdout.write("  • player game log … ");
  const playerRows = toObjects(await statsFetch("leaguegamelog", { ...COMMON, PlayerOrTeam: "P" }), "LeagueGameLog");
  console.log(`${playerRows.length} rows`);
  await sleep(DELAY_BETWEEN_CALLS_MS);

  // ----- three league-wide dashboards (advanced ratings, four factors, player advanced) -----
  const errLeague = {};
  async function dash(label, endpoint, params, setName) {
    process.stdout.write(`  • ${label} … `);
    try {
      const rows = toObjects(await statsFetch(endpoint, params), setName);
      console.log(`${rows.length} rows`);
      await sleep(DELAY_BETWEEN_CALLS_MS);
      return rows;
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      errLeague[label] = e.message;
      await sleep(DELAY_BETWEEN_CALLS_MS);
      return [];
    }
  }
  const ratingRows = await dash("ratings", "leaguedashteamstats", { ...TEAM_DASH, MeasureType: "Advanced", TeamID: "0" }, "LeagueDashTeamStats");
  const advRows = await dash("playeradv", "leaguedashplayerstats", { ...PLAYER_DASH, MeasureType: "Advanced", TeamID: "0" }, "LeagueDashPlayerStats");

  // ----- indexes -----
  const abbrById = new Map();
  const nameById = new Map();
  for (const r of teamRows) {
    if (r.TEAM_ID != null && !abbrById.has(r.TEAM_ID)) {
      abbrById.set(r.TEAM_ID, r.TEAM_ABBREVIATION || "");
      nameById.set(r.TEAM_ID, r.TEAM_NAME || "");
    }
  }
  const rowsByGame = new Map();
  for (const r of teamRows) {
    if (!rowsByGame.has(r.GAME_ID)) rowsByGame.set(r.GAME_ID, []);
    rowsByGame.get(r.GAME_ID).push(r);
  }

  const teamIds = [...nameById.keys()];
  console.log(`\nFound ${teamIds.length} teams.\n`);

  // League ranking (shared by all teams' Team tab).
  const teamRanks = ratingRows.length
    ? { teams: ratingRows.map((r) => ({
        teamId: r.TEAM_ID,
        name: r.TEAM_NAME,
        abbr: abbrById.get(r.TEAM_ID) || lastName(r.TEAM_NAME).slice(0, 3).toUpperCase(),
        off: r1(r.OFF_RATING), def: r1(r.DEF_RATING), net: r1(r.NET_RATING), pace: r1(r.PACE),
      })) }
    : null;

  // Current W-L (from played games) and net rating, keyed by team — used to
  // annotate each upcoming opponent.
  const recordByTeam = new Map();
  for (const r of teamRows) {
    const rec = recordByTeam.get(r.TEAM_ID) || { w: 0, l: 0 };
    if (r.WL === "W") rec.w++;
    else if (r.WL === "L") rec.l++;
    recordByTeam.set(r.TEAM_ID, rec);
  }
  const netByTeam = new Map(ratingRows.map((r) => [r.TEAM_ID, r1(r.NET_RATING)]));

  // ----- schedule → each team's upcoming (not-yet-played) games -----
  const upcomingByTeam = new Map();
  let scheduleErr = null;
  process.stdout.write("  • schedule … ");
  try {
    const sched = await statsFetch("scheduleleaguev2", { LeagueID: "10", Season: String(SEASON) });
    const gameDates = (sched && sched.leagueSchedule && sched.leagueSchedule.gameDates) || [];
    const cutoff = Date.now() - 18 * 3600 * 1000; // keep games from ~today onward
    const annotate = (oppTeam) => {
      const oppId = oppTeam.teamId;
      const rec = recordByTeam.get(oppId);
      return {
        opp: abbrById.get(oppId) || oppTeam.teamTricode || "",
        oppEmoji: emojiFor(nameById.get(oppId) || `${oppTeam.teamCity || ""} ${oppTeam.teamName || ""}`),
        oppW: rec ? rec.w : oppTeam.wins ?? 0,
        oppL: rec ? rec.l : oppTeam.losses ?? 0,
        oppNet: netByTeam.has(oppId) ? netByTeam.get(oppId) : null,
      };
    };
    let count = 0;
    for (const gd of gameDates) {
      for (const g of gd.games || []) {
        if (g.gameStatus !== 1) continue; // 1 = scheduled, 2 = live, 3 = final
        const ts = Date.parse(g.gameDateEst || g.gameDateTimeEst || gd.gameDate);
        if (Number.isFinite(ts) && ts < cutoff) continue;
        const home = g.homeTeam, away = g.awayTeam;
        if (!home || !away) continue;
        const date = fmtDate(g.gameDateEst || gd.gameDate);
        const sortTs = Number.isFinite(ts) ? ts : 0;
        const hList = upcomingByTeam.get(home.teamId) || [];
        hList.push({ date, ts: sortTs, home: true, ...annotate(away) });
        upcomingByTeam.set(home.teamId, hList);
        const aList = upcomingByTeam.get(away.teamId) || [];
        aList.push({ date, ts: sortTs, home: false, ...annotate(home) });
        upcomingByTeam.set(away.teamId, aList);
        count++;
      }
    }
    for (const list of upcomingByTeam.values()) {
      list.sort((a, b) => a.ts - b.ts);
      list.forEach((x) => delete x.ts); // sorting key only; keep the JSON tidy
    }
    console.log(`${count} upcoming games`);
  } catch (e) {
    scheduleErr = e.message;
    console.log(`FAILED — ${e.message}`);
  }
  await sleep(DELAY_BETWEEN_CALLS_MS);

  // Per-(game, team) box-score totals from the player game log, used to derive
  // four factors for each team and its opponents.
  const boxByGameTeam = new Map(); // key: `${gameId}|${teamId}`
  for (const r of playerRows) {
    const key = `${r.GAME_ID}|${r.TEAM_ID}`;
    let b = boxByGameTeam.get(key);
    if (!b) { b = emptyBox(); boxByGameTeam.set(key, b); }
    b.pts += n(r.PTS);
    b.fgm += n(r.FGM); b.fga += n(r.FGA); b.fg3m += n(r.FG3M); b.fg3a += n(r.FG3A);
    b.ftm += n(r.FTM); b.fta += n(r.FTA);
    b.oreb += n(r.OREB); b.dreb += n(r.DREB); b.tov += n(r.TOV);
  }
  // Which two teams played in each game (to find a team's opponent per game).
  const teamsInGame = new Map();
  for (const r of teamRows) {
    if (!teamsInGame.has(r.GAME_ID)) teamsInGame.set(r.GAME_ID, []);
    teamsInGame.get(r.GAME_ID).push(r.TEAM_ID);
  }
  const oppOf = (gameId, teamId) => (teamsInGame.get(gameId) || []).find((id) => id !== teamId);
  // Final (OT-inclusive) team score for a game = sum of that team's players' points.
  const scoreOf = (gameId, tid) => {
    const b = boxByGameTeam.get(`${gameId}|${tid}`);
    return b ? b.pts : 0;
  };

  function computeFourFactors(teamId, teamGames) {
    const tm = emptyBox(), op = emptyBox();
    for (const g of teamGames) {
      const tBox = boxByGameTeam.get(`${g.id}|${teamId}`);
      const oppId = oppOf(g.id, teamId);
      const oBox = oppId != null ? boxByGameTeam.get(`${g.id}|${oppId}`) : null;
      if (tBox) addBox(tm, tBox);
      if (oBox) addBox(op, oBox);
    }
    if (tm.fga === 0) return null;
    return { team: factorsOf(tm, op.dreb), opp: factorsOf(op, tm.dreb) };
  }

  // League-wide per-game shooting & possession profile for every team (used by
  // the "profile vs the WNBA" section). Aggregate each team's box totals across
  // its games, then express as per-game averages (fair across differing GP).
  const profAgg = new Map(); // teamId -> box totals + gp + possessions
  for (const [key, box] of boxByGameTeam) {
    const [gid, tidStr] = key.split("|");
    const tid = Number(tidStr);
    let a = profAgg.get(tid);
    if (!a) { a = { ...emptyBox(), gp: 0, poss: 0 }; profAgg.set(tid, a); }
    addBox(a, box);
    a.gp += 1;
    // Possessions estimate, averaged with the opponent's (the standard team
    // possession formula): 0.5 * (team + opp) of (FGA + 0.44*FTA - OREB + TOV).
    const teamPoss = box.fga + 0.44 * box.fta - box.oreb + box.tov;
    const oppId = oppOf(gid, tid);
    const oppBox = oppId != null ? boxByGameTeam.get(`${gid}|${oppId}`) : null;
    const oppPoss = oppBox ? oppBox.fga + 0.44 * oppBox.fta - oppBox.oreb + oppBox.tov : teamPoss;
    a.poss += 0.5 * (teamPoss + oppPoss);
  }
  const teamProfiles = [];
  for (const tid of teamIds) {
    const a = profAgg.get(tid);
    if (!a || a.gp === 0 || a.poss <= 0) continue;
    const per100 = (x) => Math.round((x / a.poss) * 1000) / 10; // counting stat per 100 possessions
    teamProfiles.push({
      teamId: tid,
      abbr: abbrById.get(tid) || lastName(nameById.get(tid) || "").slice(0, 3).toUpperCase(),
      gp: a.gp,
      fg3m: per100(a.fg3m),
      fg3a: per100(a.fg3a),
      fg2m: per100(a.fgm - a.fg3m),
      fg2a: per100(a.fga - a.fg3a),
      ftm: per100(a.ftm),
      fta: per100(a.fta),
      oreb: per100(a.oreb),
      tov: per100(a.tov),
      efg: a.fga > 0 ? Math.round(((a.fgm + 0.5 * a.fg3m) / a.fga) * 1000) / 10 : 0, // rate, pace-independent
    });
  }

  const advByTeam = new Map();
  for (const r of advRows) {
    if (!advByTeam.has(r.TEAM_ID)) advByTeam.set(r.TEAM_ID, []);
    advByTeam.get(r.TEAM_ID).push(r);
  }

  // ----- per-team loops (roster, on/off, lineups) -----
  console.log("Per-team data (roster · on/off · lineups):");
  const teams = [];
  const data = {};

  for (const teamId of teamIds) {
    const fullName = nameById.get(teamId);
    const { teamName, city } = splitName(fullName);
    const abbr = abbrById.get(teamId) || "";
    const emoji = emojiFor(fullName);
    process.stdout.write(`  • ${emoji} ${teamName} … `);

    const games = buildGames(teamRows, teamId, rowsByGame, scoreOf);
    const idToIndex = new Map(games.map((g) => [g.id, g.i]));

    const errors = {};
    if (errLeague.playeradv) errors.playerAdv = errLeague.playeradv;
    if (errLeague.ratings) errors.teamRanks = errLeague.ratings;
    if (scheduleErr) errors.schedule = scheduleErr;

    // roster meta (jersey/position)
    const meta = new Map();
    try {
      const rosterRows = toObjects(
        await statsFetch("commonteamroster", { TeamID: String(teamId), Season: String(SEASON), LeagueID: "10" }),
        "CommonTeamRoster"
      );
      for (const r of rosterRows) meta.set(r.PLAYER_ID, { num: r.NUM, pos: r.POSITION });
    } catch (_) { /* jersey/pos are cosmetic */ }
    await sleep(DELAY_BETWEEN_CALLS_MS);

    const roster = buildRoster(playerRows, teamId, idToIndex, meta);

    // on/off
    let onOff = [];
    try {
      onOff = shapeOnOff(await statsFetch("teamplayeronoffdetails", { ...ONOFF, TeamID: String(teamId) }));
      if (!onOff.length) errors.onOff = "No rows returned.";
    } catch (e) { errors.onOff = e.message; }
    await sleep(DELAY_BETWEEN_CALLS_MS);

    // lineups
    let lineups = [];
    try {
      lineups = shapeLineups(
        toObjects(await statsFetch("leaguedashlineups", { ...LINEUP_DASH, MeasureType: "Advanced", PerMode: "Totals", TeamID: String(teamId) }), "Lineups")
      );
      if (!lineups.length) errors.lineups = "No rows returned.";
    } catch (e) { errors.lineups = e.message; }
    await sleep(DELAY_BETWEEN_CALLS_MS);

    const fourFactors = computeFourFactors(teamId, games);
    if (!fourFactors) errors.fourFactors = "Not enough box-score data to compute four factors yet.";
    const playerAdv = shapePlayerAdv(advByTeam.get(teamId) || []);
    if (!playerAdv.length && !errors.playerAdv) errors.playerAdv = "No rows returned.";

    teams.push({ id: teamId, name: fullName, city, teamName, abbr, emoji });
    const upcoming = upcomingByTeam.get(teamId) || [];
    data[teamId] = { games, roster, onOff, fourFactors, playerAdv, lineups, upcoming, errors };

    const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
    const flags = [
      plural(games.length, "game"),
      plural(roster.length, "player"),
      `${upcoming.length} upcoming`,
      errors.onOff ? "on/off ✗" : "on/off ✓",
      errors.lineups ? "lineups ✗" : "lineups ✓",
    ].join(" · ");
    console.log(flags);
  }

  teams.sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    meta: { generatedAt: new Date().toISOString(), season: SEASON },
    teams,
    teamRanks,
    teamProfiles,
    data,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload));

  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`  ${teams.length} teams`);
  const leagueFails = Object.keys(errLeague);
  if (leagueFails.length) {
    console.log(`  league-wide datasets unavailable: ${leagueFails.join(", ")} (affects every team's Team tab)`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(`\nFatal: ${e.message}\n`);
  process.exit(1);
});
