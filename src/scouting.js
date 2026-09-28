// ---------------------------------------------------------------------------
// Scouting reports: the paragraph at the top of every team and player page.
//
// Written from the numbers, not by hand: each report measures a team (or
// player) against the rest of the league, keeps what stands out at either end,
// and strings it into prose — who they are, what they're good and bad at, the
// high and low points of the season, and a one-line verdict.
//
// Plain JS with no React, so scripts/prerender.mjs can put the same paragraph
// into the static HTML a crawler reads.
// ---------------------------------------------------------------------------

const r1 = (n) => Math.round(n * 10) / 10;
const sum = (arr, k) => arr.reduce((a, b) => a + (b[k] || 0), 0);
const pctOf = (m, a) => (a > 0 ? r1((m / a) * 100) : 0);
const signed = (n) => `${n > 0 ? "+" : ""}${n}`;
// Everything after the first name, so "Elena Delle Donne" is "Delle Donne".
const lastName = (name) => {
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
};
// "Sparks'" but "Liberty's".
const poss = (nick) => (/s$/.test(nick) ? `${nick}'` : `${nick}'s`);

function ord(num) {
  const s = ["th", "st", "nd", "rd"], v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

// "a", "a and b", "a, b and c"
function listJoin(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Where `value` falls among `values`, 1 = best. `higher` says which way is good.
function rankOf(values, value, higher = true) {
  return 1 + values.filter((v) => (higher ? v > value : v < value)).length;
}

// Share of `values` this one beats, 0-100.
function percentile(values, value) {
  if (!values.length) return 50;
  const below = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return Math.round(((below + equal / 2) / values.length) * 100);
}

// Hollinger's game score: one number for how good a single box score was.
function gameScore(l) {
  return l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.orb + 0.3 * l.drb
    + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov;
}

// League true-shooting %, from the per-team shooting profiles.
function leagueTs(teamProfiles) {
  let pts = 0, fga = 0, fta = 0;
  for (const t of teamProfiles || []) {
    pts += 2 * t.fg2m + 3 * t.fg3m + t.ftm;
    fga += t.fg2a + t.fg3a;
    fta += t.fta;
  }
  return fga > 0 ? r1((pts / (2 * (fga + 0.44 * fta))) * 100) : 54;
}

function opponentName(abbr, teams) {
  const t = (teams || []).find((x) => x.abbr === abbr);
  return t ? `the ${t.teamName}` : abbr;
}

// Longest run of wins (or losses) in `games`, with where it started and ended.
function longestRun(games, wins) {
  let best = { n: 0 }, cur = 0, start = 0;
  games.forEach((g, i) => {
    if (!!g.w === wins) {
      if (cur === 0) start = i;
      cur += 1;
      if (cur > best.n) best = { n: cur, from: games[start], to: g };
    } else cur = 0;
  });
  return best;
}

// "a 7-game", "an 8-game", "an 11-point"
const an = (n) => (/^(8|11|18)$|^8\d$/.test(String(n)) ? `an ${n}` : `a ${n}`);

const span = (run) => (run.from.date === run.to.date ? run.from.date : `${run.from.date}–${run.to.date}`);
const where = (g) => (g.home ? "vs." : "at");

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

/**
 * @returns {string|null} one paragraph, or null when there's nothing to say yet.
 */
export function teamReport({
  team, season, final = false, games = [], roster = [], fourFactors = null,
  teamRanks = null, teamProfiles = [], standings = [], teams = [], onOff = [], lineups = [],
}) {
  const V = (present, past) => (final ? past : present);
  const nick = team.teamName;
  const gp = games.length;
  if (!gp) return `The ${nick} haven't played a game yet in ${season}. Check back once the season is underway.`;

  const w = games.filter((g) => g.w).length;
  const l = gp - w;
  const winPct = w / gp;
  const out = [];

  // --- who they are -------------------------------------------------------
  const ranks = (teamRanks && teamRanks.teams) || [];
  const N = ranks.length || teams.length || 12;
  const me = ranks.find((t) => t.teamId === team.id) || null;
  const net = me ? rankOf(ranks.map((t) => t.net), me.net) : null;
  const off = me ? rankOf(ranks.map((t) => t.off), me.off) : null;
  const def = me ? rankOf(ranks.map((t) => t.def), me.def, false) : null;
  const pace = me ? rankOf(ranks.map((t) => t.pace), me.pace) : null;
  const seed = standings.findIndex((s) => s.teamId === team.id) + 1 || null;

  const tier =
    (net && net <= 2) || winPct >= 0.68 ? "contender"
    : (net && net <= Math.ceil(N * 0.45)) || winPct >= 0.55 ? "playoff"
    : (net && net <= Math.ceil(N * 0.7)) || winPct >= 0.42 ? "middle"
    : "struggling";

  let lead = `The ${nick} ${V("are", "finished")} ${w}–${l}`;
  if (seed) lead += `, ${ord(seed)} in the league standings`;
  if (me) lead += `, with a ${signed(me.net)} net rating that ${V("ranks", "ranked")} ${ord(net)} of ${N}`;
  out.push(`${lead}.`);

  if (me) {
    const top = Math.max(2, Math.round(N * 0.2));
    const paceNote =
      pace <= 2 ? ` They ${V("play", "played")} fast, too — ${ord(pace)} in pace.`
      : pace >= N - 1 ? ` They ${V("grind", "ground")} games down, ${pace === N ? "slowest" : "second-slowest"} pace in the league.`
      : "";
    if (off <= top && def <= top) {
      out.push(`They ${V("win", "won")} at both ends: ${ord(off)} in offensive rating and ${ord(def)} in defensive rating.${paceNote}`);
    } else if (def - off >= 4 && off <= N / 2) {
      out.push(`This ${V("is", "was")} an offense-first team — ${ord(off)} in offensive rating (${me.off}) but ${ord(def)} on defense (${me.def} allowed per 100).${paceNote}`);
    } else if (off - def >= 4 && def <= N / 2) {
      out.push(`Defense ${V("is", "was")} the identity — ${ord(def)} in defensive rating (${me.def} per 100) against a ${ord(off)}-ranked offense (${me.off}).${paceNote}`);
    } else if (off > N * 0.66 && def > N * 0.66) {
      out.push(`The problems ${V("run", "ran")} both ways: ${ord(off)} in offensive rating and ${ord(def)} in defensive rating.${paceNote}`);
    } else if (off <= N / 3 && def <= N / 3) {
      out.push(`They ${V("are", "were")} strong at both ends — ${ord(off)} in offensive rating, ${ord(def)} in defensive rating.${paceNote}`);
    } else if (off > N / 2 && def > N / 2) {
      out.push(`Neither end ${V("is", "was")} a strength: ${ord(off)} in offensive rating, ${ord(def)} in defensive rating.${paceNote}`);
    } else {
      out.push(`They ${V("are", "were")} balanced rather than dominant anywhere — ${ord(off)} on offense, ${ord(def)} on defense.${paceNote}`);
    }
  }

  // --- strengths & weaknesses ------------------------------------------------
  const prof = (teamProfiles || []).find((t) => t.teamId === team.id);
  const strengths = [], weaknesses = [];
  if (prof && teamProfiles.length > 3) {
    const T = teamProfiles.length;
    const col = (k) => teamProfiles.map((t) => t[k]);
    const traits = [
      { k: "efg", hi: true, good: (v, r) => `shot-making (${v}% eFG, ${ord(r)})`, bad: (v, r) => `shooting efficiency (${v}% eFG, ${ord(r)})`, fix: "its shot quality" },
      { k: "fg3m", hi: true, good: (v, r) => `three-point volume (${v} makes a game, ${ord(r)})`, bad: (v, r) => `a lack of three-point volume (${v} makes a game, ${ord(r)})`, fix: "a thin three-point attack" },
      { k: "tov", hi: false, good: (v, r) => `ball security (${v} turnovers a game, ${r === 1 ? "fewest" : `${ord(r)}-fewest`})`, bad: (v, r) => `turnovers (${v} a game, ${r === T ? "most" : `${ord(T - r + 1)}-most`} in the league)`, fix: "its turnover problem" },
      { k: "oreb", hi: true, good: (v, r) => `the offensive glass (${v} a game, ${ord(r)})`, bad: (v, r) => `offensive rebounding (${v} a game, ${ord(r)})`, fix: "a lack of second chances" },
      { k: "fta", hi: true, good: (v, r) => `getting to the line (${v} attempts a game, ${ord(r)})`, bad: (v, r) => `getting to the free-throw line (${v} attempts, ${ord(r)})`, fix: "a lack of free throws" },
    ];
    const cut = Math.max(2, Math.round(T * 0.2));
    for (const t of traits) {
      const r = rankOf(col(t.k), prof[t.k], t.hi);
      if (r <= cut) strengths.push({ r, text: t.good(prof[t.k], r) });
      else if (r > T - cut) weaknesses.push({ r: T - r, text: t.bad(prof[t.k], r), fix: t.fix });
    }
  }
  // Four factors: the biggest edge over (or gap to) opponents.
  if (fourFactors && fourFactors.team && fourFactors.opp) {
    const { team: t, opp: o } = fourFactors;
    const tovEdge = o.tov - t.tov;
    if (tovEdge >= 2.5) strengths.push({ r: 1.5, text: `forcing turnovers (opponents give it away on ${o.tov}% of possessions)` });
    if (tovEdge <= -2.5) weaknesses.push({ r: 1.5, text: `losing the turnover battle (${t.tov}% of possessions vs. ${o.tov}% for opponents)`, fix: "its turnover problem" });
    const efgEdge = t.efg - o.efg;
    if (efgEdge <= -2.5 && !weaknesses.some((x) => x.text.includes("eFG"))) {
      weaknesses.push({ r: 1, text: `getting outshot (${t.efg}% eFG vs. ${o.efg}% allowed)`, fix: "the shooting gap with its opponents" });
    }
    if (efgEdge >= 3 && !strengths.some((x) => x.text.includes("eFG"))) {
      strengths.push({ r: 1, text: `outshooting opponents (${t.efg}% eFG vs. ${o.efg}% allowed)` });
    }
  }
  strengths.sort((a, b) => a.r - b.r);
  weaknesses.sort((a, b) => a.r - b.r);
  const s2 = strengths.slice(0, 2).map((x) => x.text);
  const w2 = weaknesses.slice(0, 2).map((x) => x.text);
  if (s2.length && w2.length) {
    out.push(`Their ${s2.length > 1 ? `calling cards ${V("are", "were")}` : `calling card ${V("is", "was")}`} ${listJoin(s2)}; the soft ${w2.length > 1 ? "spots" : "spot"}, ${listJoin(w2)}.`);
  } else if (s2.length) {
    out.push(`They ${V("stand", "stood")} out for ${listJoin(s2)}, with no statistical category near the bottom of the league.`);
  } else if (w2.length) {
    out.push(`Nothing ${V("jumps", "jumped")} off the page as a strength, and the weak ${w2.length > 1 ? `spots ${V("are", "were")}` : `spot ${V("is", "was")}`} ${listJoin(w2)}.`);
  }

  // --- personnel ---------------------------------------------------------------
  const players = roster
    .filter((p) => p.logs.length)
    .map((p) => ({ id: p.playerId, name: p.name, gp: p.logs.length, pts: sum(p.logs, "pts") }))
    .map((p) => ({ ...p, ppg: r1(p.pts / p.gp) }))
    .sort((a, b) => b.pts - a.pts);
  const totalPts = players.reduce((a, p) => a + p.pts, 0) || 1;
  if (players.length) {
    const [a, b] = players;
    const shareA = Math.round((a.pts / totalPts) * 100);
    const shareB = b ? Math.round((b.pts / totalPts) * 100) : 0;
    let sentence;
    if (shareA >= 24) {
      sentence = `The offense ${V("runs", "ran")} through ${a.name}, who ${V("scores", "scored")} ${a.ppg} a night — ${shareA}% of the team's points`;
    } else if (b && shareA + shareB >= 40) {
      sentence = `${a.name} (${a.ppg} ppg) and ${b.name} (${b.ppg}) ${V("carry", "carried")} the scoring load between them`;
    } else {
      sentence = `Scoring ${V("is", "was")} spread around — ${a.name} ${V("leads", "led")} at ${a.ppg} a game, but no one ${V("accounts", "accounted")} for more than ${shareA}% of the points`;
    }
    // Who the team is best with, by on/off net rating, among real minutes.
    const maxOn = Math.max(0, ...onOff.map((o) => o.minOn || 0));
    const swing = onOff
      .filter((o) => o.minOn >= Math.max(150, maxOn * 0.3) && o.netDiff >= 7)
      .sort((x, y) => y.netDiff - x.netDiff)[0];
    const swingName = swing && (roster.find((p) => p.playerId === swing.playerId) || {}).name;
    if (swingName) {
      sentence += swingName === a.name
        ? `, and she ${V("is", "was")} also the one they can least afford to lose: ${signed(swing.netDiff)} per 100 possessions better with her on the floor.`
        : `, though the on/off numbers point to ${swingName} as the one they can least afford to lose — ${signed(swing.netDiff)} per 100 possessions better with her on the floor.`;
    } else sentence += ".";
    out.push(sentence);
  }

  // --- highs & lows -----------------------------------------------------------
  const winRun = longestRun(games, true);
  const lossRun = longestRun(games, false);
  const margin = (g) => (g.tm || 0) - (g.op || 0);
  const best = games.reduce((x, g) => (margin(g) > margin(x) ? g : x), games[0]);
  const worst = games.reduce((x, g) => (margin(g) < margin(x) ? g : x), games[0]);
  const highs = [], lows = [];
  if (winRun.n >= 3) highs.push(`${an(winRun.n)}-game winning streak (${span(winRun)})`);
  if (margin(best) >= 12) highs.push(`${an(margin(best))}-point rout of ${opponentName(best.opp, teams)} on ${best.date}`);
  if (lossRun.n >= 3) lows.push(`${an(lossRun.n)}-game losing streak (${span(lossRun)})`);
  if (margin(worst) <= -12) lows.push(`${an(-margin(worst))}-point loss ${worst.home ? "to" : "at"} ${opponentName(worst.opp, teams)} on ${worst.date}`);
  if (highs.length || lows.length) {
    let s = "";
    if (highs.length) s += `The high points: ${listJoin(highs)}.`;
    if (lows.length) s += `${s ? " " : ""}The lows: ${listJoin(lows)}.`;
    else if (lossRun.n <= 2) s += ` They never ${V("have lost", "lost")} more than ${lossRun.n === 1 ? "once" : "two"} in a row.`;
    out.push(s);
  }

  // Record against winning teams, in close games, and lately.
  const pctById = new Map(standings.map((s) => [s.teamId, s.pct]));
  const vsGood = games.filter((g) => {
    const t = teams.find((x) => x.abbr === g.opp);
    return t && (pctById.get(t.id) ?? 0) >= 0.5 && t.id !== team.id;
  });
  const vsGoodW = vsGood.filter((g) => g.w).length;
  const close = games.filter((g) => Math.abs(margin(g)) <= 5);
  const closeW = close.filter((g) => g.w).length;
  const context = [];
  if (vsGood.length >= 6) context.push(`${vsGoodW}–${vsGood.length - vsGoodW} against teams at .500 or better`);
  if (close.length >= 6 && (closeW / close.length >= 0.65 || closeW / close.length <= 0.35)) {
    context.push(`${closeW}–${close.length - closeW} in games decided by five or fewer`);
  }
  let trend = "";
  if (gp >= 20) {
    const last = games.slice(-10);
    const lastW = last.filter((g) => g.w).length;
    const before = (w - lastW) / (gp - 10);
    if (lastW / 10 - before >= 0.2 && lastW >= 7) trend = `and ${V("are", "finished")} hot, ${lastW}–${10 - lastW} over the last 10`;
    else if (before - lastW / 10 >= 0.2 && lastW <= 5) trend = `and ${V("have cooled", "faded late")}, ${lastW}–${10 - lastW} over the last 10`;
  }
  if (context.length || trend) {
    out.push(`They ${V("are", "went")} ${listJoin(context) || `${w}–${l} overall`}${trend ? `${context.length ? ", " : " "}${trend}` : ""}.`);
  }

  // --- the verdict ------------------------------------------------------------
  const flaw = weaknesses[0] ? weaknesses[0].fix : null;
  const goodRecord = vsGood.length >= 6 ? vsGoodW / vsGood.length : null;
  let verdict;
  if (tier === "contender") {
    verdict = goodRecord != null && goodRecord < 0.45
      ? `Bottom line: the résumé of a contender, but the record against good teams says they ${V("have", "had")} something to prove when it counts.`
      : `Bottom line: a legitimate title contender${flaw ? `, and ${flaw} ${V("is", "was")} the one thing that could trip them up` : " without an obvious hole"}.`;
  } else if (tier === "playoff") {
    verdict = `Bottom line: a solid playoff-caliber team${flaw ? ` whose ceiling ${V("depends", "depended")} on addressing ${flaw}` : ""}.`;
  } else if (tier === "middle") {
    verdict = `Bottom line: a middle-of-the-pack team${flaw ? ` held back by ${flaw}` : ""} — good enough to beat anyone on a given night, not consistent enough to be feared.`;
  } else {
    const star = players[0];
    verdict = `Bottom line: a difficult season${star ? `, with ${star.name} the main reason to watch` : ""}${flaw ? ` and ${flaw} the most urgent fix` : ""}.`;
  }
  out.push(verdict);

  return out.join(" ");
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function aggregate(L) {
  const gp = L.length;
  const t = {};
  for (const k of ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "ast", "stl", "blk", "tov", "min", "pf"]) t[k] = sum(L, k);
  const tsDen = 2 * (t.fga + 0.44 * t.fta);
  return {
    ...t, gp,
    ppg: r1(t.pts / gp), rpg: r1((t.orb + t.drb) / gp), apg: r1(t.ast / gp),
    spg: r1(t.stl / gp), bpg: r1(t.blk / gp), tpg: r1(t.tov / gp), mpg: r1(t.min / gp),
    fga_g: t.fga / gp, tpa_g: r1(t.tpa / gp), fta_g: t.fta / gp,
    ts: tsDen > 0 ? r1((t.pts / tsDen) * 100) : 0,
    tpPct: pctOf(t.tpm, t.tpa), ftPct: pctOf(t.ftm, t.fta),
  };
}

// Category counts a double-double on.
const DD_KEYS = ["pts", "reb", "ast", "stl", "blk"];
const withReb = (l) => ({ ...l, reb: (l.orb || 0) + (l.drb || 0) });

/**
 * @returns {string|null} one paragraph about `player`.
 */
export function playerReport({
  player, team, season, final = false, games = [], roster = [], playerAdv = [], onOff = [],
  assists = null, rotation = null, playerPool = [], teamProfiles = [],
  positionShotZones = null, leagueShotZones = [], teams = [],
}) {
  const V = (present, past) => (final ? past : present);
  const nick = team.teamName;
  const name = player.name;
  const last = lastName(name);
  const L = (player.logs || []).map(withReb);
  if (!L.length) return `${name} ${V("hasn't", "didn't")} appeared in a game for the ${nick} ${V("yet this season", `in ${season}`)}.`;

  const a = aggregate(L);
  const out = [];

  // --- the league around her --------------------------------------------------
  const maxGp = Math.max(1, ...playerPool.map((p) => p.gp));
  const qualified = playerPool.filter((p) => p.gp >= Math.max(5, maxGp * 0.35) && p.mpg >= 10);
  const mine = playerPool.find((p) => p.id === player.playerId);
  const isQualified = !!mine && qualified.includes(mine);
  const posKey = (p) => String(p || "").trim().toUpperCase().charAt(0) || "F";
  let group = qualified.filter((p) => posKey(p.pos) === posKey(player.pos));
  if (group.length < 12) group = qualified.filter((p) => (posKey(p.pos) === "G") === (posKey(player.pos) === "G"));
  const groupLabel = posKey(player.pos) === "G" ? "guards" : posKey(player.pos) === "C" && group.every((p) => posKey(p.pos) === "C") ? "centers" : "frontcourt players";
  // Her season-long numbers (both stints, if traded) for ranking; this team's for the prose.
  const ref = mine || { ...a, tpa: a.tpa_g, fta: a.fta_g };
  const leagueRank = (k, higher = true) => (isQualified ? rankOf(qualified.map((p) => p[k] ?? 0), ref[k] ?? 0, higher) : null);
  const groupPct = (k) => (isQualified ? percentile(group.map((p) => p[k] ?? 0), ref[k] ?? 0) : null);

  // --- role ---------------------------------------------------------------------
  const teamPpg = roster
    .filter((p) => p.logs.length)
    .map((p) => sum(p.logs, "pts") / p.logs.length)
    .sort((x, y) => y - x);
  const teamScoringRank = rankOf(teamPpg, a.pts / a.gp);
  const rot = rotation && (rotation.players || []).find((p) => p.id === player.playerId);
  const starts = rot ? rot.starts : null;
  const adv = playerAdv.find((p) => p.playerId === player.playerId) || null;

  let role;
  if (a.mpg < 8 || a.gp < 4) role = `a deep reserve for the ${nick}`;
  else if (teamScoringRank === 1 && a.ppg >= 14) role = `the ${poss(nick)} leading scorer and first option`;
  else if (teamScoringRank <= 3 && a.mpg >= 25) role = `one of the ${poss(nick)} primary scorers`;
  else if (a.mpg >= 26 || (starts != null && starts >= a.gp * 0.6)) role = `a starter for the ${nick}`;
  else if (a.mpg >= 16) role = `a rotation regular off the ${poss(nick)} bench`;
  else role = `a bench piece for the ${nick}`;

  const lines = [`${a.ppg} points`, `${a.rpg} rebounds`, `${a.apg} assists`];
  let lead = `${name} ${V("is", "was")} ${role}, averaging ${listJoin(lines)} in ${a.mpg} minutes across ${a.gp} game${a.gp === 1 ? "" : "s"}`;
  if (isQualified) {
    const tops = [
      ["ppg", "scoring"], ["rpg", "rebounding"], ["apg", "assists"], ["spg", "steals"], ["bpg", "blocks"],
    ].map(([k, label]) => ({ label, r: leagueRank(k) })).filter((x) => x.r <= 10).sort((x, y) => x.r - y.r).slice(0, 3);
    if (tops.length) lead += ` — ${listJoin(tops.map((x, i) => `${ord(x.r)} ${i === 0 ? "in the league " : ""}in ${x.label}`))}`;
  }
  out.push(`${lead}.`);

  if (a.mpg < 8 || a.gp < 4) {
    const high = L.reduce((x, l) => (l.pts > x.pts ? l : x), L[0]);
    const g = games[high.g];
    out.push(`It's too small a sample to say much about her game${g && high.pts >= 6 ? `; her best night was ${high.pts} points ${where(g)} ${opponentName(g.opp, teams)} on ${g.date}` : ""}.`);
    return out.join(" ");
  }

  // --- strengths & weaknesses -------------------------------------------------
  const lgTs = leagueTs(teamProfiles);
  const S = [], W = [];
  const add = (list, score, text) => list.push({ score, text });
  const gp = (k) => groupPct(k);

  if (gp("ppg") >= 85) add(S, gp("ppg"), `volume scoring`);
  if (a.fga_g >= 5) {
    const d = r1(a.ts - lgTs);
    if (d >= 4) add(S, 80 + d, `efficiency (${a.ts}% true shooting against a league average of ${lgTs}%)`);
    else if (d <= -5 && a.ppg >= 6) add(W, 80 - d, `efficiency (${a.ts}% true shooting, well under the league's ${lgTs}%)`);
  }
  if (a.tpa_g >= 2.5 && a.tpPct >= 37.5) add(S, 75 + (a.tpPct - 37.5) * 2 + a.tpa_g, `three-point shooting (${a.tpPct}% on ${a.tpa_g} attempts a game)`);
  if (a.tpa_g >= 2.5 && a.tpPct <= 29.5) add(W, 75 + (29.5 - a.tpPct) * 2, `three-point shooting (${a.tpPct}% on ${a.tpa_g} attempts a game)`);
  if (a.fta_g >= 2 && a.ftPct >= 87) add(S, 70 + (a.ftPct - 87), `free-throw shooting (${a.ftPct}%)`);
  if (a.fta_g >= 2 && a.ftPct <= 68) add(W, 75 + (68 - a.ftPct), `free-throw shooting (${a.ftPct}%)`);
  if (gp("rpg") >= 85) add(S, gp("rpg"), `rebounding (${a.rpg} a game, top ${100 - gp("rpg") || 1}% of ${groupLabel})`);
  if (gp("apg") >= 85) add(S, gp("apg"), `playmaking (${a.apg} assists a game, top ${100 - gp("apg") || 1}% of ${groupLabel})`);
  if (gp("spg") >= 88) add(S, gp("spg") - 3, `disruptive hands on defense (${a.spg} steals a game)`);
  if (gp("bpg") >= 88) add(S, gp("bpg") - 3, `rim protection (${a.bpg} blocks a game)`);
  const astTov = a.tov > 0 ? a.ast / a.tov : a.ast;
  if (a.apg >= 3 && astTov >= 2.5) add(S, 72 + astTov, `taking care of the ball (${r1(astTov)} assists per turnover)`);
  if (gp("tpg") >= 85 && astTov < 1.4) add(W, gp("tpg"), `turnovers (${a.tpg} a game against ${a.apg} assists)`);

  // Finishing at the rim, against her own position's league baseline.
  const posGroup = posKey(player.pos) === "G" ? "G" : "F";
  const baseZones = (positionShotZones && positionShotZones[posGroup]) || leagueShotZones || [];
  const rim = (player.shotZones || []).find((z) => z.z === "ra");
  const rimBase = baseZones.find((z) => z.z === "ra");
  if (rim && rimBase && rim.a >= 30) {
    const d = r1(pctOf(rim.m, rim.a) - pctOf(rimBase.m, rimBase.a));
    if (d >= 7) add(S, 74 + d, `finishing at the rim (${pctOf(rim.m, rim.a)}% in the restricted area)`);
    if (d <= -8) add(W, 74 - d, `finishing at the rim (${pctOf(rim.m, rim.a)}% in the restricted area, below ${posGroup === "G" ? "guards" : "forwards"}' ${pctOf(rimBase.m, rimBase.a)}%)`);
  }
  // Shot creation: how much of her scoring comes off a pass.
  const sc = assists && (assists.scorers || []).find((s) => s.playerId === player.playerId);
  if (sc && sc.made >= 50 && sc.pct <= 45) add(S, 76, `creating her own shot (only ${Math.round(sc.pct)}% of her baskets are assisted)`);
  // On/off.
  const oo = onOff.find((o) => o.playerId === player.playerId);
  if (oo && oo.minOn >= 200) {
    if (oo.netDiff >= 8) add(S, 78 + oo.netDiff / 2, `impact — the ${nick} ${V("are", "were")} ${signed(oo.netDiff)} per 100 possessions better with her on the floor`);
    if (oo.netDiff <= -8) add(W, 70 - oo.netDiff / 2, `on/off impact (the ${nick} ${V("are", "were")} ${-oo.netDiff} points per 100 worse with her on the floor)`);
  }

  S.sort((x, y) => y.score - x.score);
  W.sort((x, y) => y.score - x.score);
  const s3 = S.slice(0, 3).map((x) => x.text);
  const w2 = W.slice(0, 2).map((x) => x.text);
  if (s3.length) out.push(`Her game ${V("is", "was")} built on ${listJoin(s3)}.`);
  else out.push(`She ${V("is", "was")} more a steady contributor than a standout in any one area.`);
  if (w2.length) out.push(`Where she ${V("falls", "fell")} short: ${listJoin(w2)}.`);
  else if (s3.length) out.push(`There ${V("is", "was")} no glaring statistical hole in her game.`);

  // Usage vs efficiency, when the usage is high enough to matter.
  if (adv && adv.usg >= 25 && a.fga_g >= 8) {
    out.push(`She ${V("carries", "carried")} a heavy load — ${adv.usg}% usage${a.ts >= lgTs ? `, and ${V("stays", "stayed")} efficient doing it` : ", and the efficiency paid the price"}.`);
  }

  // --- highs & lows -----------------------------------------------------------
  const gameOf = (l) => games[l.g] || null;
  const vs = (l) => {
    const g = gameOf(l);
    return g ? `${where(g)} ${opponentName(g.opp, teams)} on ${g.date}` : "";
  };
  const high = L.reduce((x, l) => (l.pts > x.pts ? l : x), L[0]);
  const bestGs = L.reduce((x, l) => (gameScore(l) > gameScore(x) ? l : x), L[0]);
  const highs = [];
  highs.push(`a season-high ${high.pts} points ${vs(high)}`);
  if (bestGs !== high && gameScore(bestGs) >= gameScore(high) - 1 && bestGs.reb + bestGs.ast >= 12) {
    highs.push(`her most complete game, ${bestGs.pts} points, ${bestGs.reb} rebounds and ${bestGs.ast} assists ${vs(bestGs)}`);
  }
  const dd = L.filter((l) => DD_KEYS.filter((k) => l[k] >= 10).length >= 2).length;
  const twenty = L.filter((l) => l.pts >= 20).length;
  const counts = [];
  if (dd >= 3) counts.push(`${dd} double-doubles`);
  if (twenty >= 3) counts.push(`${twenty} games of 20 or more`);
  let hs = `High points: ${listJoin(highs)}`;
  if (counts.length) hs += `, plus ${listJoin(counts)}`;
  out.push(`${hs}.`);

  const lows = [];
  const shooting = L.filter((l) => l.fga >= Math.max(7, a.fga_g * 0.8));
  if (shooting.length >= 3) {
    const cold = shooting.reduce((x, l) => (l.fgm / l.fga < x.fgm / x.fga ? l : x), shooting[0]);
    if (cold.fgm / cold.fga <= 0.3) lows.push(`a ${cold.fgm}-of-${cold.fga} shooting night ${vs(cold)}`);
  }
  if (a.gp >= 15) {
    const tail = L.slice(-10);
    const tailPpg = r1(sum(tail, "pts") / tail.length);
    const headPpg = r1(sum(L.slice(0, -10), "pts") / (L.length - 10));
    if (headPpg - tailPpg >= 3) lows.push(`a late dip to ${tailPpg} points a game over her last 10`);
    else if (tailPpg - headPpg >= 3) out.push(`She ${V("is", "was")} trending up, too — ${tailPpg} points a game over her last 10, up from ${headPpg} before that.`);
  }
  if (lows.length) out.push(`Low points: ${listJoin(lows)}.`);

  // --- verdict ---------------------------------------------------------------------
  const ppgRank = leagueRank("ppg");
  const topCats = ["ppg", "rpg", "apg", "spg", "bpg"].filter((k) => (gp(k) || 0) >= 90).length;
  const flaw = W[0] ? W[0].text.replace(/ \(.*\)$/, "").replace(/ —.*$/, "") : null;
  let verdict;
  if ((ppgRank && ppgRank <= 8) || (topCats >= 2 && a.mpg >= 28)) {
    verdict = `Bottom line: ${last} ${V("is", "was")} one of the league's best players${flaw ? `, and the one thing between her and another level is ${flaw}` : ", and there's little in the numbers to argue with"}.`;
  } else if (a.mpg >= 26 && (S.length >= 2 || teamScoringRank <= 2)) {
    verdict = `Bottom line: a core piece for the ${nick}${flaw ? `, with ${flaw} the clearest room to grow` : ""}.`;
  } else if (S.length) {
    verdict = `Bottom line: a useful role player who ${V("brings", "brought")} ${S[0].text.replace(/ \(.*\)$/, "").replace(/ —.*$/, "")}${flaw ? ` but ${V("needs", "needed")} work on ${flaw}` : ""}.`;
  } else {
    verdict = `Bottom line: a rotation option still looking for a signature skill${flaw ? `, with ${flaw} the first thing to fix` : ""}.`;
  }
  out.push(verdict);

  return out.join(" ");
}
