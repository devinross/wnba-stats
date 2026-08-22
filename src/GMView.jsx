import React, { useEffect, useMemo, useState } from "react";
import { C, FONT_DISPLAY } from "./palette";
import TeamBadge from "./TeamBadge.jsx";

// ---------------------------------------------------------------------------
// Virtual GM: build a roster out of real players against a real payroll.
//
// It runs entirely on data/<season>/salaries.json — the same file the salary
// page reads — because everything the tool needs is already on those rows: what
// a player costs, what she produced, what kind of player she is, and how each
// of those has moved over the last five seasons. Nothing is fetched when you
// sign someone, and nothing is saved anywhere but this browser.
//
// The thing it is actually for is the trade-off, not the arithmetic. Any roster
// can be got under the cap by signing twelve minimum contracts; the question is
// what that roster then can't do. So the payroll meter, the starting five and
// the shape chart sit together, and the shape is drawn against real teams — a
// comparison, not a score.
// ---------------------------------------------------------------------------

const STORE_KEY = "wnba-gm";

// Five starters, and no rule about what they are. Three forwards and no center
// is an ordinary WNBA lineup, not a mistake — and the feed's single letter is
// too crude to arbitrate anyway, since it flattens every "G-F" to a guard. What
// a lineup can and can't do is a question the roster shape chart answers from
// production, which is the honest way to ask it.
const POSITIONS = [
  { key: "G", label: "Guards" },
  { key: "F", label: "Forwards" },
  { key: "C", label: "Centers" },
];
const STARTERS = 5;

const money = (v) =>
  v == null ? "—" : !v ? "$0" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}k`;
const exact = (v) => `$${Math.round(v).toLocaleString()}`;

const readStore = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    return raw && Array.isArray(raw.ids) ? raw : null;
  } catch (_) {
    return null;
  }
};

/**
 * A group of players' play-type shape, weighted by minutes per game.
 *
 * Averaging flat would say a twelfth man defends as much as a starter.
 * Weighting by the minutes these players actually played is the cheapest honest
 * approximation of who is on the floor — last season's usage, not a projection.
 */
function profileOf(players, playTypes) {
  const weighted = players.filter((p) => p.scores && p.mpg > 0);
  const minutes = weighted.reduce((a, p) => a + p.mpg, 0);
  if (!minutes) return null;
  const out = {};
  for (const t of playTypes) {
    out[t.key] = Math.round(weighted.reduce((a, p) => a + p.scores[t.key] * p.mpg, 0) / minutes);
  }
  return out;
}

/** A team's most-used five, which is what a real starting five amounts to. */
const topFive = (players) =>
  [...players].sort((a, b) => (b.mpg || 0) - (a.mpg || 0)).slice(0, STARTERS);

/**
 * The opening lineup: the five who played the most minutes. On a real team that
 * is, by definition, the five the coach actually started — a better answer than
 * anything a positional rule would have produced, and the same calculation the
 * league yardstick uses, so the two are comparable.
 */
const autoStarters = (roster) => topFive(roster).map((p) => p.playerId);

/**
 * The bottom line under a group of players: what they cost, what they produce,
 * and what they are.
 *
 * Money and production are real sums — twelve salaries add up to a payroll, and
 * twelve per-game figures to a team's per-game production. The attributes are
 * not: each is a 0-100 rank, and adding ranks would produce a number with no
 * meaning and no ceiling. So they're the same minutes-weighted average the
 * shape chart draws, which keeps a 60 here meaning what a 60 means everywhere
 * else on the site.
 */
function GroupTotals({ players, playTypes, label }) {
  const profile = profileOf(players, playTypes);
  const payroll = players.reduce((a, p) => a + (p.salary || 0), 0);
  const prod = players.reduce((a, p) => a + (p.prodPg || 0), 0);
  if (!players.length) return null;
  return (
    <div
      style={{
        borderTop: `1px solid ${C.SEPARATOR}`,
        padding: "9px 10px 4px",
        display: "grid",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 11 }}>
        <span style={{ letterSpacing: 1, textTransform: "uppercase", color: C.TXT, fontWeight: 700 }}>
          {label} <span style={{ color: C.MUTE, fontWeight: 400 }}>· {players.length}</span>
        </span>
        <span style={{ color: C.MUTE }}>
          <strong style={{ color: C.TXT, fontFamily: FONT_DISPLAY }}>{money(payroll)}</strong> payroll
          {" · "}
          <strong style={{ color: C.TXT, fontFamily: FONT_DISPLAY }}>{prod.toFixed(1)}</strong> prod/g
        </span>
      </div>
      {profile ? (
        <>
          <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: C.MUTE }}>
            Play-type scores, weighted by minutes
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${playTypes.length}, 1fr)`, gap: 3 }}>
            {playTypes.map((t) => {
              const v = profile[t.key];
              return (
                <div
                  key={t.key}
                  title={`${t.label}: ${v} — minutes-weighted across these ${players.length} players`}
                  style={{
                    textAlign: "center",
                    borderRadius: 6,
                    padding: "3px 1px",
                    // Same wash as the salary page's score cells: nothing below
                    // the league midpoint is tinted, so strengths stand out.
                    background: v > 50 ? `rgba(58, 17, 54, ${((v - 50) / 50) * 0.16})` : "transparent",
                  }}
                >
                  <div style={{ fontSize: 10, letterSpacing: 0.4, color: C.MUTE, fontWeight: 700, lineHeight: 1.3 }}>
                    {t.abbr}
                  </div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12.5, color: v >= 75 ? C.BRAND : C.TXT }}>
                    {v}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: C.MUTE }}>No scored minutes in this group yet.</div>
      )}
    </div>
  );
}

function Tile({ label, value, tone, hint }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 11, color: C.MUTE, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, color: tone || C.TXT }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: C.MUTE }}>{hint}</div>}
    </div>
  );
}

function CapMeter({ payroll, cap, onCap }) {
  const pct = cap > 0 ? Math.min(payroll / cap, 1) : 0;
  const over = payroll > cap;
  const space = cap - payroll;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 7, flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, color: over ? C.LOSS_FG : C.TXT }}>
          {exact(payroll)}
        </span>
        <span style={{ fontSize: 12, color: over ? C.LOSS_FG : C.MUTE }}>
          {over ? `${exact(-space)} over the cap` : `${exact(space)} of room`}
        </span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: C.PANEL_2, border: `1px solid ${C.LINE}`, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct * 100}%`, height: "100%",
            background: over ? C.LOSS_FG : pct > 0.9 ? C.WARN : C.BRAND,
            transition: "width .2s ease",
          }}
        />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 11, color: C.MUTE }}>
        <span style={{ letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Cap</span>
        <input
          type="number" value={cap} step={100000} min={0}
          onChange={(e) => onCap(Math.max(0, Number(e.target.value) || 0))}
          style={{
            font: "inherit", fontSize: 12, fontFamily: FONT_DISPLAY, color: C.TXT,
            background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 8,
            padding: "5px 8px", width: 120,
          }}
        />
        <span>editable — see the note below</span>
      </label>
    </div>
  );
}

/** This season's production against last season's: ↑, ↓, or nothing to say. */
function Trend({ history, season }) {
  if (!history || history.length < 2) return null;
  const now = history[history.length - 1];
  const prev = history[history.length - 2];
  if (now.season !== season || prev.prodPg == null || !prev.gp || now.prodPg == null) return null;
  const delta = Math.round((now.prodPg - prev.prodPg) * 10) / 10;
  if (Math.abs(delta) < 1) return null;
  return (
    <span
      title={`${prev.prodPg} production per game in ${prev.season}, ${now.prodPg} now`}
      style={{ color: delta > 0 ? C.GOOD : C.LOSS_FG, fontWeight: 700, marginLeft: 6 }}
    >
      {delta > 0 ? "↑" : "↓"}
      {Math.abs(delta)}
      {/* The arrow alone doesn't say what it's measured against. */}
      <span style={{ color: C.MUTE, fontWeight: 400 }}> vs ’{String(prev.season).slice(2)}</span>
    </span>
  );
}

/** UFA / RFA / Reserved — how a player reaches the market when her deal is up. */
function StatusChip({ status }) {
  if (!status) return null;
  const open = status === "UFA";
  return (
    <span
      title={
        open
          ? "Unrestricted free agent — she can sign anywhere"
          : status === "RFA"
          ? "Restricted free agent — her team can match an offer"
          : "Reserved — her team holds her rights"
      }
      style={{
        fontSize: 9.5, letterSpacing: 0.6, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
        border: `1px solid ${open ? C.LOSS_FG : C.LINE}`,
        color: open ? C.LOSS_FG : C.MUTE,
        whiteSpace: "nowrap",
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function PlayerRow({
  player, teamById, playTypes, season, action, onAction, starter, onStar, starable, href, onOpen,
  offseason, cost, expiring, offer, onOffer, disabled, note,
}) {
  const team = teamById.get(player.teamId);
  const fit = (player.fit || []).map((k) => playTypes.find((t) => t.key === k)?.label).filter(Boolean);
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderBottom: `1px solid ${C.LINE}55` }}>
      <button
        type="button"
        onClick={() => onAction(player)}
        disabled={disabled}
        aria-label={`${action === "add" ? "Sign" : "Cut"} ${player.name}`}
        title={disabled ? note : action === "add" ? "Sign" : "Cut"}
        className="pill-toggle"
        style={{
          appearance: "none", cursor: disabled ? "default" : "pointer", flexShrink: 0,
          width: 26, height: 26, borderRadius: 999, lineHeight: 1, fontSize: 15,
          border: `1px solid ${disabled ? C.LINE : action === "add" ? C.BRAND : C.LINE}`,
          background: "transparent", color: disabled ? C.LINE : action === "add" ? C.BRAND : C.MUTE,
        }}
      >
        {action === "add" ? "+" : "−"}
      </button>
      {onStar && (
        <button
          type="button"
          onClick={() => onStar(player)}
          disabled={!starter && !starable}
          aria-pressed={starter}
          aria-label={starter ? `Bench ${player.name}` : `Start ${player.name}`}
          title={starter ? "Move to the bench" : starable ? "Move to the starting five" : "Bench a starter first"}
          className="pill-toggle"
          style={{
            appearance: "none", cursor: !starter && !starable ? "default" : "pointer", flexShrink: 0,
            width: 26, height: 26, borderRadius: 999, lineHeight: 1, fontSize: 13,
            border: `1px solid ${starter ? C.BRAND : C.LINE}`,
            background: starter ? C.BRAND : "transparent",
            color: starter ? C.ON_BRAND : !starable ? C.LINE : C.MUTE,
          }}
        >
          ★
        </button>
      )}
      {team && <TeamBadge team={team} size={22} />}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {href ? (
            <a
              href={href}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                onOpen(player);
              }}
              style={{ color: C.TXT }}
            >
              {player.name}
            </a>
          ) : (
            player.name
          )}
          <span style={{ color: C.MUTE, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>{player.pos || "—"}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.MUTE, whiteSpace: "nowrap", overflow: "hidden" }}>
          {offseason && <StatusChip status={player.next && !player.next.signed ? player.next.status || "Expiring" : null} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {note ||
              (fit.length ? fit.join(" · ") : player.scores ? "Balanced" : "Limited minutes")}
            {player.gp ? ` · ${player.prodPg} prod/g` : ""}
          </span>
          {!note && <Trend history={player.history} season={season} />}
        </span>
      </span>
      {/* In the offseason an expiring player's number is an offer, not a fact,
          so it becomes something you can type into. */}
      {offseason && expiring && onOffer ? (
        <input
          type="number"
          value={offer || ""}
          step={10000}
          min={0}
          placeholder="0"
          aria-label={`Offer to ${player.name}`}
          title="What you'd pay to keep her"
          onChange={(e) => onOffer(player, Math.max(0, Number(e.target.value) || 0))}
          style={{
            font: "inherit", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12,
            width: 92, textAlign: "right", color: offer ? C.TXT : C.MUTE,
            background: C.PANEL, border: `1px dashed ${C.SEPARATOR}`, borderRadius: 7, padding: "3px 6px",
          }}
        />
      ) : (
        <span
          title={offseason && expiring ? `${player.name} made ${money(player.salary)} this season` : undefined}
          style={{
            fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
            color: offseason && expiring ? C.MUTE : C.TXT,
          }}
        >
          {money(offseason && !expiring ? cost : player.salary)}
        </span>
      )}
    </li>
  );
}

export default function GMView({ data, teams, season, playerHref, onPickPlayer }) {
  const playTypes = data.playTypes || [];
  const teamById = useMemo(() => new Map((teams || []).map((t) => [t.id, t])), [teams]);
  const byId = useMemo(() => new Map(data.players.map((p) => [p.playerId, p])), [data.players]);

  const saved = useMemo(() => (typeof window === "undefined" ? null : readStore()), []);
  // Ids only — a saved roster is resolved against the current file every render,
  // so a player who left the league between visits drops out rather than being
  // restored from a stale copy of her row.
  const [ids, setIds] = useState(() => (saved ? saved.ids : []));
  const [fives, setFives] = useState(() => (saved && saved.fives) || []);
  const [cap, setCap] = useState(() => (saved && saved.cap) || data.meta.capHint || 7200000);
  const [source, setSource] = useState(() => (saved && saved.source) || "blank");

  const [query, setQuery] = useState("");
  const [pos, setPos] = useState("all");
  const [need, setNeed] = useState("all");
  const [sort, setSort] = useState("salary");
  const [lens, setLens] = useState("starters");
  // Which season the whole page is being read in. "next" is the offseason: the
  // roster you'd actually still have, and what it would cost.
  const [year, setYear] = useState("now");
  // What you'd pay to keep a player whose deal is up. The offseason's whole
  // question, so it's editable per player and kept with the roster.
  const [offers, setOffers] = useState(() => (saved && saved.offers) || {});

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ids, fives, cap, source, offers }));
    } catch (_) {
      /* private browsing, quota — the tool still works, it just won't persist */
    }
  }, [ids, fives, cap, source, offers]);

  const roster = useMemo(() => ids.map((id) => byId.get(id)).filter(Boolean), [ids, byId]);
  const rosterIds = useMemo(() => new Set(ids), [ids]);
  const starterIds = useMemo(() => new Set(fives.filter((id) => rosterIds.has(id))), [fives, rosterIds]);

  const starters = useMemo(() => roster.filter((p) => starterIds.has(p.playerId)), [roster, starterIds]);
  const bench = useMemo(() => roster.filter((p) => !starterIds.has(p.playerId)), [roster, starterIds]);

  const nextSeason = data.meta.nextSeason || null;
  const offseason = year === "next" && nextSeason;

  /**
   * What a player costs in the season being read.
   *
   * This season that's her salary. Next season it's whatever her contract
   * already says — and where it says nothing, whatever you have offered her,
   * which is the decision the offseason actually consists of.
   */
  const costOf = (p) => {
    if (!offseason) return p.salary || 0;
    if (p.next && p.next.signed) return p.next.salary || 0;
    return offers[p.playerId] ?? 0;
  };
  /** Her deal is up and she is not yet re-signed. */
  const expiring = (p) => offseason && !(p.next && p.next.signed);

  const payroll = roster.reduce((a, p) => a + costOf(p), 0);
  const committed = roster.filter((p) => p.next && p.next.signed).reduce((a, p) => a + (p.next.salary || 0), 0);
  const target = data.meta.rosterTarget || 12;

  const sign = (p) => {
    setIds((v) => (v.includes(p.playerId) ? v : [...v, p.playerId]));
    // Her current salary is the only anchor there is for what she'd cost, so an
    // offer starts there and waits to be argued with.
    setOffers((v) => (v[p.playerId] != null ? v : { ...v, [p.playerId]: p.salary || 0 }));
  };
  const cut = (p) => {
    setIds((v) => v.filter((id) => id !== p.playerId));
    setFives((v) => v.filter((id) => id !== p.playerId));
  };
  const star = (p) =>
    setFives((v) =>
      v.includes(p.playerId)
        ? v.filter((id) => id !== p.playerId)
        : v.length >= STARTERS
        ? v
        : [...v, p.playerId]
    );

  const startFrom = (key) => {
    setSource(key);
    if (key === "blank") {
      setIds([]);
      setFives([]);
      return;
    }
    const id = Number(key);
    // A real roster as the feed has it, minus the deep-bench names with no
    // contract on the sheet — they'd read as free players at $0.
    const picked = data.players
      .filter((p) => p.teamId === id && p.salary)
      .sort((a, b) => b.salary - a.salary)
      .slice(0, target);
    setIds(picked.map((p) => p.playerId));
    setFives(autoStarters(picked));
  };

  // What the five you've picked is made of — reported, not judged. Whether it
  // works is the shape chart's question, and it asks it of production rather
  // than of position labels.
  const lineup = useMemo(() => {
    const parts = POSITIONS.map((s) => ({ ...s, have: starters.filter((p) => p.posGroup === s.key).length })).filter(
      (s) => s.have > 0
    );
    // The roster feed returns no position at all for some teams — New York's and
    // Toronto's whole rosters, at the time of writing. Those players are counted
    // as unlisted rather than quietly dropped, so the line adds up to five.
    const unlisted = starters.filter((p) => !POSITIONS.some((s) => s.key === p.posGroup)).length;
    const text = [...parts.map((s) => `${s.have}${s.key}`), unlisted ? `${unlisted} unlisted` : null]
      .filter(Boolean)
      .join(" · ");
    return text;
  }, [starters]);

  // --- shape ---------------------------------------------------------------
  const group = lens === "starters" ? starters : roster;
  const profile = useMemo(() => profileOf(group, playTypes), [group, playTypes]);

  // The yardstick has to be like-for-like: a starting five is compared with the
  // real teams' most-used fives, a full roster with their full rosters.
  const leagueProfile = useMemo(() => {
    const each = (teams || [])
      .map((t) => {
        const squad = data.players.filter((p) => p.teamId === t.id);
        return profileOf(lens === "starters" ? topFive(squad) : squad, playTypes);
      })
      .filter(Boolean);
    if (!each.length) return null;
    const out = {};
    for (const t of playTypes) out[t.key] = Math.round(each.reduce((a, p) => a + p[t.key], 0) / each.length);
    return out;
  }, [data.players, teams, playTypes, lens]);

  const shape = useMemo(() => {
    if (!profile || !leagueProfile) return [];
    return playTypes
      .map((t) => ({
        key: t.key, label: t.label,
        you: profile[t.key], league: leagueProfile[t.key],
        delta: profile[t.key] - leagueProfile[t.key],
      }))
      .sort((a, b) => b.delta - a.delta);
  }, [profile, leagueProfile, playTypes]);

  const shapeMax = useMemo(() => Math.max(6, ...shape.map((r) => Math.abs(r.delta))), [shape]);

  // --- year over year ------------------------------------------------------
  // The roster you've built, played backwards: what these same players produced
  // in each of the seasons on file. It answers the thing a payroll can't —
  // whether you are buying players on the way up or on the way down.
  const yoy = useMemo(() => {
    const years = data.meta.historySeasons || [];
    const hasSalary = new Set(data.meta.salarySeasons || []);
    return years.map((year) => {
      let prodPg = 0, played = 0, salary = 0, priced = 0;
      for (const p of roster) {
        const h = (p.history || []).find((x) => x.season === year);
        if (!h) continue;
        if (h.gp) { prodPg += h.prodPg || 0; played++; }
        if (h.salary) { salary += h.salary; priced++; }
      }
      return { year, prodPg: Math.round(prodPg), played, salary, priced, hasSalary: hasSalary.has(year) };
    });
  }, [roster, data.meta]);

  const yoyMax = useMemo(() => Math.max(1, ...yoy.map((y) => y.prodPg)), [yoy]);

  // The most recent season with production but no contracts — the one sheet
  // worth adding next, rather than the oldest year on file.
  const nextSheet = useMemo(() => {
    const have = new Set(data.meta.salarySeasons || []);
    return [...(data.meta.historySeasons || [])].reverse().find((y) => !have.has(y)) || season - 1;
  }, [data.meta, season]);

  const positions = useMemo(() => {
    const counts = { G: 0, F: 0, C: 0, "?": 0 };
    for (const p of roster) counts[POSITIONS.some((s) => s.key === p.posGroup) ? p.posGroup : "?"]++;
    return counts;
  }, [roster]);

  const prodPg = roster.reduce((a, p) => a + (p.prodPg || 0), 0);
  const signedCount = roster.filter((p) => p.next && p.next.signed).length;
  const freeAgents = roster.filter(expiring);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = data.players.filter((p) => !rosterIds.has(p.playerId) && p.salary);
    // In the offseason the pool is the free-agent class: everyone whose deal is
    // up. A player already signed elsewhere for next season isn't available at
    // any price — the tool models free agency, not trades, so her contract is
    // simply somebody else's.
    if (offseason) list = list.filter((p) => !(p.next && p.next.signed));
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    if (pos !== "all") list = list.filter((p) => p.posGroup === pos);
    if (need !== "all") list = list.filter((p) => p.scores && p.scores[need] >= 60);
    const key =
      sort === "salary" ? (p) => p.salary
      : sort === "cheap" ? (p) => -p.salary
      : sort === "prod" ? (p) => p.prodPg
      : sort === "value" ? (p) => p.value ?? -1
      : sort === "rising" ? (p) => {
          const h = p.history || [];
          const now = h[h.length - 1], prev = h[h.length - 2];
          return now && prev && prev.gp ? now.prodPg - prev.prodPg : -99;
        }
      : (p) => (p.scores ? p.scores[sort] : -1);
    return list.sort((a, b) => key(b) - key(a)).slice(0, 60);
  }, [data.players, rosterIds, query, pos, need, sort, offseason]);

  const weakest = useMemo(() => {
    if (!profile || !leagueProfile) return null;
    const gaps = playTypes
      .map((t) => ({ key: t.key, label: t.label, gap: profile[t.key] - leagueProfile[t.key] }))
      .sort((a, b) => a.gap - b.gap);
    return gaps[0] && gaps[0].gap < -3 ? gaps[0] : null;
  }, [profile, leagueProfile, playTypes]);

  const over = payroll > cap;
  const panel = { background: C.PANEL, border: `1px solid ${C.LINE}`, borderRadius: 16, padding: "18px 20px", marginBottom: 22 };
  const control = {
    appearance: "none", WebkitAppearance: "none", font: "inherit", fontSize: 13,
    color: C.TXT, background: C.PANEL, border: `1px solid ${C.LINE}`,
    borderRadius: 10, padding: "8px 11px", cursor: "pointer", width: "100%",
  };
  const pill = (active) => ({
    appearance: "none", cursor: "pointer", borderRadius: 999,
    padding: "6px 13px", fontSize: 12, fontFamily: FONT_DISPLAY, fontWeight: 600,
    border: `1px solid ${active ? C.BRAND : C.LINE}`,
    background: active ? C.PANEL_2 : "transparent",
    color: active ? C.BRAND : C.MUTE,
  });

  const setOffer = (p, amount) => setOffers((v) => ({ ...v, [p.playerId]: amount }));

  const rowFor = (p, opts = {}) => (
    <PlayerRow
      key={p.playerId}
      player={p}
      teamById={teamById}
      playTypes={playTypes}
      season={season}
      action="remove"
      onAction={cut}
      onStar={star}
      starter={starterIds.has(p.playerId)}
      starable={starters.length < STARTERS}
      href={playerHref ? playerHref(p.teamId, p.name) : null}
      onOpen={(pl) => onPickPlayer(pl.teamId, pl.name)}
      offseason={offseason}
      cost={costOf(p)}
      expiring={expiring(p)}
      offer={offers[p.playerId]}
      onOffer={setOffer}
      {...opts}
    />
  );

  return (
    <main className="hf-container" style={{ paddingTop: 22, paddingBottom: 10 }}>
      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "grid", gap: 5, minWidth: 220 }}>
            <span style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.MUTE, fontWeight: 700 }}>
              Start from
            </span>
            <select value={source} onChange={(e) => startFrom(e.target.value)} style={{ ...control, maxWidth: 280 }}>
              <option value="blank">A blank roster</option>
              {(teams || []).map((t) => (
                <option key={t.id} value={String(t.id)}>{t.emoji} {t.name}</option>
              ))}
            </select>
          </div>
          {nextSeason && (
            <div style={{ display: "grid", gap: 5 }}>
              <span style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.MUTE, fontWeight: 700 }}>
                Season
              </span>
              <div style={{ display: "flex", gap: 5 }}>
                {[
                  { key: "now", label: String(season) },
                  { key: "next", label: `${nextSeason} offseason` },
                ].map((b) => (
                  <button key={b.key} type="button" onClick={() => setYear(b.key)} className="pill-toggle" style={pill(year === b.key)}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 22, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Tile
              label={offseason ? "Under contract" : "Roster"}
              value={offseason ? `${signedCount}` : `${roster.length}`}
              hint={offseason ? `of ${roster.length}` : `target ${target}`}
              tone={!offseason && roster.length > target ? C.LOSS_FG : undefined}
            />
            <Tile label={offseason ? "Committed" : "Payroll"} value={money(offseason ? committed : payroll)} tone={over ? C.LOSS_FG : undefined} />
            <Tile label="Prod / game" value={prodPg ? prodPg.toFixed(0) : "—"} />
            <button type="button" onClick={() => startFrom(source)} className="hf-btn hf-btn--ghost pill-toggle" style={{ padding: "8px 16px", fontSize: 13 }}>
              Reset
            </button>
          </div>
        </div>
      </section>

      <div className="gm-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, alignItems: "start" }}>
        <section style={{ ...panel, marginBottom: 0 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: "0 0 12px" }}>
            Your roster <span style={{ color: C.MUTE, fontWeight: 400, fontSize: 13 }}>{roster.length}/{target}</span>
          </h2>
          <CapMeter payroll={payroll} cap={cap} onCap={setCap} />

          {offseason && roster.length > 0 && (
            <p style={{ fontSize: 12, color: C.MUTE, margin: "0 0 14px", lineHeight: 1.6, paddingBottom: 12, borderBottom: `1px solid ${C.LINE}` }}>
              <strong style={{ color: C.TXT }}>{signedCount} of {roster.length}</strong> are under contract for{" "}
              {nextSeason}, costing <strong style={{ color: C.TXT }}>{money(committed)}</strong>.{" "}
              {freeAgents.length ? (
                <>
                  The other <strong style={{ color: C.TXT }}>{freeAgents.length}</strong> reach the market —{" "}
                  {["UFA", "RFA", "Reserved"]
                    .map((st) => ({ st, n: freeAgents.filter((p) => (p.next || {}).status === st).length }))
                    .filter((x) => x.n)
                    .map((x) => `${x.n} ${x.st}`)
                    .join(", ") || "no status listed"}
                  . Type what you'd pay to keep each of them, or cut them and sign someone else.
                </>
              ) : (
                <>Nobody's deal is up.</>
              )}
            </p>
          )}
          {roster.length ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                <h3 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.MUTE, margin: 0 }}>
                  Starting five <span style={{ fontWeight: 400 }}>{starters.length}/{STARTERS}</span>
                </h3>
                <span style={{ fontSize: 11, color: C.MUTE }}>{lineup || "no lineup set"}</span>
              </div>
              {starters.length ? (
                <div style={{ background: C.PANEL_2, borderRadius: 12, marginBottom: 14 }}>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {[...starters].sort((a, b) => (b.mpg || 0) - (a.mpg || 0)).map((p) => rowFor(p))}
                  </ul>
                  <GroupTotals players={starters} playTypes={playTypes} label="Five" />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: C.MUTE, margin: "0 0 14px" }}>
                  Star five players below to set a lineup.
                </p>
              )}

              <h3 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.MUTE, margin: "0 0 4px" }}>
                Bench <span style={{ fontWeight: 400 }}>{bench.length}</span>
              </h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 420, overflowY: "auto" }}>
                {[...bench].sort((a, b) => (b.salary || 0) - (a.salary || 0)).map((p) => rowFor(p))}
              </ul>
              <GroupTotals players={bench} playTypes={playTypes} label="Bench" />
              <GroupTotals players={roster} playTypes={playTypes} label="Whole roster" />
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.MUTE, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.LINE}` }}>
                {POSITIONS.map((s) => (
                  <span key={s.key}>
                    {s.label} <strong style={{ color: C.TXT }}>{positions[s.key]}</strong>
                  </span>
                ))}
                {positions["?"] > 0 && (
                  <span title="The roster feed lists no position for these players">
                    Unlisted <strong style={{ color: C.TXT }}>{positions["?"]}</strong>
                  </span>
                )}
              </div>
            </>
          ) : (
            <p style={{ color: C.MUTE, fontSize: 13, margin: "18px 2px", lineHeight: 1.6 }}>
              Nothing signed yet. Pick a team above to start from a real roster, or sign players from the pool on the
              right and build one from nothing.
            </p>
          )}
        </section>

        <section style={{ ...panel, marginBottom: 0 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: "0 0 12px" }}>
            {offseason ? `${nextSeason} free agents` : "Available players"}
          </h2>
          {offseason && (
            <p style={{ fontSize: 12, color: C.MUTE, margin: "0 0 12px", lineHeight: 1.5 }}>
              Everyone whose deal is up around the league — keep your own or take someone else's. Players already
              under contract for {nextSeason} aren't here: moving one of those is a trade, and this tool deals in
              contracts rather than trades.
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" style={{ ...control, cursor: "text" }} />
            <select value={pos} onChange={(e) => setPos(e.target.value)} style={control}>
              <option value="all">Any position</option>
              {POSITIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={need} onChange={(e) => setNeed(e.target.value)} style={control}>
              <option value="all">Any skill</option>
              {playTypes.map((t) => <option key={t.key} value={t.key}>Good at {t.label.toLowerCase()}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={control}>
              <option value="salary">Most expensive</option>
              <option value="cheap">Cheapest</option>
              <option value="prod">Most productive</option>
              <option value="value">Best value</option>
              <option value="rising">Most improved</option>
              {playTypes.map((t) => <option key={t.key} value={t.key}>Best at {t.label.toLowerCase()}</option>)}
            </select>
          </div>
          {weakest && need === "all" && (
            <p style={{ fontSize: 12, color: C.MUTE, margin: "0 0 10px", lineHeight: 1.5 }}>
              Your weakest spot against a typical {lens === "starters" ? "starting five" : "roster"} is{" "}
              <button
                type="button"
                onClick={() => { setNeed(weakest.key); setSort(weakest.key); }}
                style={{ appearance: "none", background: "transparent", border: "none", padding: 0, font: "inherit", color: C.BRAND, cursor: "pointer", textDecoration: "underline" }}
              >
                {weakest.label.toLowerCase()}
              </button>{" "}
              ({weakest.gap}).
            </p>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 620, overflowY: "auto" }}>
            {available.map((p) => (
              <PlayerRow
                key={p.playerId}
                player={p}
                teamById={teamById}
                playTypes={playTypes}
                season={season}
                action="add"
                onAction={sign}
                href={playerHref ? playerHref(p.teamId, p.name) : null}
                onOpen={(pl) => onPickPlayer(pl.teamId, pl.name)}
                offseason={offseason}
                cost={p.salary}
                expiring={expiring(p)}
              />
            ))}
            {!available.length && (
              <li style={{ padding: "24px 10px", textAlign: "center", color: C.MUTE, fontSize: 13 }}>Nobody left matching that.</li>
            )}
          </ul>
        </section>
      </div>

      <section style={{ ...panel, marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: 0 }}>Roster shape</h2>
          <div style={{ display: "flex", gap: 5 }}>
            {[
              { key: "starters", label: "Starting five" },
              { key: "roster", label: "Full roster" },
            ].map((b) => (
              <button key={b.key} type="button" onClick={() => setLens(b.key)} className="pill-toggle" style={pill(lens === b.key)}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
        {profile ? (
          <>
            <div style={{ display: "grid", gap: 2, marginTop: 6 }}>
              <div style={{ display: "flex", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.MUTE, fontWeight: 700, marginBottom: 4 }}>
                <span style={{ width: 128, flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: "center" }}>
                  weaker ← typical {lens === "starters" ? "five" : "roster"} → stronger
                </span>
                <span style={{ width: 62, flexShrink: 0, textAlign: "right" }}>you</span>
              </div>
              {shape.map((r) => {
                const width = (Math.abs(r.delta) / shapeMax) * 50;
                const up = r.delta >= 0;
                return (
                  <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
                    <span style={{ width: 128, flexShrink: 0, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                    <span style={{ flex: 1, position: "relative", height: 20, background: C.PANEL_2, borderRadius: 5 }}>
                      <span style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.SEPARATOR }} />
                      <span
                        title={`${r.label}: ${r.you} against ${r.league} for a typical ${lens === "starters" ? "starting five" : "roster"}`}
                        style={{
                          position: "absolute", top: 3, bottom: 3,
                          left: up ? "50%" : `${50 - width}%`, width: `${width}%`,
                          background: up ? C.BRAND : C.SEPARATOR, borderRadius: 4,
                        }}
                      />
                    </span>
                    <span style={{ width: 62, flexShrink: 0, textAlign: "right", fontFamily: FONT_DISPLAY, fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {r.you}
                      <span style={{ color: C.MUTE, fontSize: 11, marginLeft: 5 }}>{up ? "+" : ""}{r.delta}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: C.MUTE, margin: "14px 2px 0", lineHeight: 1.6 }}>
              Each row is your {lens === "starters" ? "starting five's" : "roster's"} play-type score against the
              average of the fifteen real {lens === "starters" ? "most-used fives" : "rosters"} — the bar is the gap,
              the first number is your score. Both are weighted by the minutes these players actually played this
              season, so a starter counts for more than a twelfth man; it is last season's usage, not a projection of
              how you would use them. This is the part getting under the cap doesn't tell you: twelve minimum
              contracts balance the books and leave you unable to do anything in particular.
            </p>
          </>
        ) : (
          <p style={{ color: C.MUTE, fontSize: 13, margin: "16px 2px", lineHeight: 1.6 }}>
            {roster.length
              ? "Star a starting five above to draw its shape."
              : "Sign a few players and this draws the shape of what you've built, against real teams."}
          </p>
        )}
      </section>

      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: 0 }}>Year over year</h2>
          <span style={{ fontSize: 11, color: C.MUTE }}>these same players, in earlier seasons</span>
        </div>
        {roster.length ? (
          <>
            <div style={{ display: "grid", gap: 6 }}>
              {yoy.map((y) => (
                <div key={y.year} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 44, flexShrink: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12.5, color: y.year === season ? C.TXT : C.MUTE }}>
                    {y.year}
                  </span>
                  <span style={{ flex: 1, height: 20, background: C.PANEL_2, borderRadius: 5, position: "relative" }}>
                    <span
                      style={{
                        position: "absolute", top: 3, bottom: 3, left: 0,
                        width: `${(y.prodPg / yoyMax) * 100}%`,
                        background: y.year === season ? C.BRAND : C.SEPARATOR,
                        borderRadius: 4,
                      }}
                    />
                  </span>
                  <span style={{ width: 168, flexShrink: 0, textAlign: "right", fontSize: 12, color: C.MUTE, whiteSpace: "nowrap" }}>
                    <strong style={{ color: C.TXT, fontFamily: FONT_DISPLAY }}>{y.prodPg}</strong> prod/g ·{" "}
                    {y.played}/{roster.length} played ·{" "}
                    {y.hasSalary ? <strong style={{ color: C.TXT }}>{money(y.salary)}</strong> : <span title="No salary sheet for this season">—</span>}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: C.MUTE, margin: "14px 2px 0", lineHeight: 1.6 }}>
              Your signed players' combined production per game in each season on file, and the count who were in the
              league at all — so a bar that climbs is a roster on the way up, and one that peaked two years ago is a
              roster you are paying for what it used to be.{" "}
              {(data.meta.salarySeasons || []).length < 2 && (
                <>
                  The payroll column is only filled for {season}:{" "}
                  <strong style={{ color: C.TXT }}>contracts exist for one season</strong>, since they're maintained
                  by hand and stats.wnba.com publishes none. Add{" "}
                  <code>data/salaries/{nextSheet}.csv</code> with the same columns and that year fills in on the
                  next build.
                </>
              )}
            </p>
          </>
        ) : (
          <p style={{ color: C.MUTE, fontSize: 13, margin: "16px 2px", lineHeight: 1.6 }}>
            Sign some players and this shows what they produced in each of the last{" "}
            {(data.meta.historySeasons || []).length} seasons.
          </p>
        )}
      </section>

      <section style={panel}>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: "0 0 8px" }}>How this works</h2>
        <p style={{ fontSize: 13, color: C.MUTE, margin: 0, lineHeight: 1.65 }}>
          Salaries are real {season} figures; production and play-type scores are the same ones behind the{" "}
          <a href="/salaries" style={{ color: C.BRAND }}>salary page</a>, computed from this season's game logs.{" "}
          <strong style={{ color: C.TXT }}>The cap is not.</strong> Nothing stats.wnba.com publishes carries a cap
          number, so the default — {money(data.meta.capHint)} — is the largest payroll any real team is actually
          carrying this season, rounded up. Change it to whatever figure you want to play against. The roster target
          of {target} is a guide rather than a rule — going over turns it red and stops nothing.{" "}
          {nextSeason && (
            <>
              Next season's figures are the ones already written into each contract; where a deal is up, the number is
              blank and whatever you type is your own offer, not a projection of what she'd actually command.{" "}
            </>
          )} Nothing constrains
          the starting five either: three forwards and no center is an ordinary lineup, so the five is reported as
          whatever you picked and the shape chart above is where you find out what it can't do. Your roster is saved
          in this browser only, and never leaves it.
        </p>
      </section>
    </main>
  );
}
