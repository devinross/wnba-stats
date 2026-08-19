# WNBA Analytics — setup guide

A React dashboard for **every WNBA team**, across **every season since 2017**.
Pick a team from the dropdown in the header (each shown with an emoji, e.g.
"✨ Sparks", "🗽 Liberty") and a season from the dropdown beside it; each team has
a **Team** tab and a **Players** tab, built from data pulled from
**stats.wnba.com**.

The key idea: the website does **not** talk to stats.wnba.com. Instead you run a
small script that downloads the data and saves it as static files under
`public/data/`. The site just reads those. So the deployed site is plain static
files — no PHP, no proxy, no API key, and none of the CORS / IP blocking / "500"
problems that come from calling stats.wnba.com live from a web host. You refresh
the numbers by re-running the script whenever you want.

This guide assumes you've **never used React**.

---

## How the pieces fit together

```
  npm run fetch                          The website (static files)
  +--------------------------+          +------------------------------+
  | scripts/fetch-data.mjs   |  writes  | reads  data/index.json        |
  |  -> stats.wnba.com       | -------> |        data/<season>/league…  |
  |  (run on your Mac)       |  JSON    |        data/<season>/teams/…  |
  +--------------------------+          +------------------------------+
```

Run the fetch script on your Mac (its IP isn't blocked by stats.wnba.com). It
writes one folder per season. Build the site from those and deploy the static
files.

**Why the data is split up.** One file per season holds every team, which meant
downloading ~900KB to look at one of them. Instead each season is a small
`league.json` (the team list and the league-wide charts, ~20KB) plus one file per
team (~60KB). A cold load is about **82KB instead of 912KB**; switching teams
fetches one small file, and anything already fetched stays in memory for the rest
of the session. Finished seasons never change, so their files are cached
permanently by the browser (see `vercel.json`) — only the current season is ever
re-downloaded.

---

## 0. Install Node.js (one time)

Download the **LTS** version from **nodejs.org** and install it. Restart your
terminal afterward so the `npm` command is available. (Node 18 or newer — the
fetch script uses the built-in `fetch`.)

## 1. Open the project and install dependencies

```bash
cd wnba-analytics      # the unzipped folder
npm install              # one time, downloads dependencies
```

## 2. Fetch the data

```bash
npm run fetch
```

That downloads **the current season** — every team's games, box scores, on/off
ratings, four factors, advanced player stats, league-wide ratings, lineups and
shot zones. It makes ~45 requests and takes a minute or two, printing the real
status of each one:

```
Seasons: 2026  →  .../public/data

────────────────────────────────────────────────────────────
2026 (season in progress)

Already on disk from 2026-08-11T11:00:12.994Z — will back-fill anything that fails today.

League-wide data:
  • team game log … 494 rows
  • player game log … 4887 rows
  • ratings … 15 rows
  ...
Per-team data (roster · on/off · lineups):
  • ✨ Sparks … 32 games · 18 players · 12 upcoming · on/off ✓ · lineups ✓
  • 🗽 Liberty … 34 games · 17 players · 10 upcoming · on/off ✓ · lineups ✓
  ... (one line per team) ...

Wrote .../public/data/2026 — 15 teams, 494 games
```

If something fails, the script falls back on the numbers already on disk rather
than writing a hole — see **When a request fails** below. A line ending in
`↺ kept onOff, lineups` means those two sections for that team came from the
previous fetch.

### Other seasons

Completed seasons never change, so they're fetched **once** and then left alone.
The nightly refresh only touches the current one.

```bash
npm run fetch                     # the current season (what the nightly job runs)
npm run fetch -- --missing        # any season since 2017 not on disk yet
npm run fetch -- --season 2019    # one season, refetched from scratch
npm run fetch -- --seasons 17-19  # a range (short or full years, or 2017,2019)
npm run fetch -- --repair         # only the seasons with gaps in them
npm run fetch -- --all            # every season from 2017 to now
npm run fetch -- --out <dir>      # write somewhere other than public/data
```

Two constants at the top of `scripts/fetch-data.mjs` set the boundaries:
`CURRENT_SEASON` (the season in progress — bump it when a new one starts) and
`OLDEST_SEASON` (how far back `--missing`, `--repair` and `--all` reach; 2017 by
default). Every endpoint this project uses goes back to **1997**, so you can set
`OLDEST_SEASON` lower and run `npm run fetch -- --missing` if you want more
history — budget about 1.5 minutes and ~750KB per season.

**If a season came out wrong**, `--repair` retries the ones with holes in them.
The script records how many datasets are missing from each season in
`public/data/index.json`, and `--repair` re-runs exactly those; anything that
fails again keeps the value it already had. To force a full refetch of one
season regardless, name it: `npm run fetch -- --season 2019`.

### When a request fails

stats.wnba.com is flaky — an endpoint that answered yesterday can return a 500
today. That used to punch a hole in the snapshot, and a chart that had been on
the page for weeks would disappear until the next good fetch.

Instead, **every dataset that fails or comes back empty is carried over from
what's already on disk**, tagged with the date it was really fetched. The section
keeps rendering, with a note above it:

> ↺ The last refresh didn't return this — showing the numbers from Aug 11.

(Hovering the note shows the underlying error.) The rules:

- **Carried per dataset**, so one broken endpoint never affects the rest. On/off
  and lineups are per team; ratings, shot zones and league profiles are shared.
- **Games and rosters carry as a pair**, since each player's game logs index into
  that team's game list.
- **The date isn't restamped.** If a section has been failing for a week, it says
  a week ago — not yesterday.
- **Nothing older than 21 days is reused** (`MAX_STALE_DAYS` in
  `scripts/fetch-data.mjs`). Past that the section goes back to showing
  "unavailable" rather than passing off three-week-old numbers as current.
- **A different season never back-fills another.** Each season only ever falls
  back on its own earlier fetch.
- **Completed seasons are exempt from both rules.** Their numbers are final, so
  a value reused from an earlier fetch isn't stale — it's just the answer. It's
  carried over however old it is, and shown without a note.
- **If the core team game log fails, nothing is written for that season** — its
  existing files are left untouched, so the site keeps serving them, and a
  ten-season backfill carries on with the next year rather than giving up.

## 3. Preview locally

```bash
npm run dev
```

Open the printed URL (usually **http://localhost:5173**). Stop with `Ctrl + C`.

## 4. Build the production files

```bash
npm run build
```

Creates the **`dist/`** folder — the finished static site (it includes the data
file you fetched). There's a shortcut that fetches fresh data and builds in one
step:

```bash
npm run refresh
```

`npm run build` runs `scripts/prerender.mjs` after Vite, which is why the build
prints something like `prerender: 254 pages`. See
[Search engines & sharing](#search-engines--sharing) — the short version is that
it turns the one-page app into a real page per team and player, each with its
own URL, title and crawlable content.

---

## 5. Deploy

The site is deployed to Vercel at **wnba.highlightfactory.app**, and every push
to the default branch redeploys — including the nightly data commits. See
[HOSTING.md](HOSTING.md) for the one-time project setup and the caching rules in
`vercel.json`.

Whatever the host, the build has two requirements:

> **It must be served from a domain root.** Asset and data paths used to be
> relative (`base: "./"`), so a subfolder worked. The site now prerenders a page
> per team and player, served from nested paths like `/team/atlanta-dream/`, and
> a relative asset URL on one of those resolves to
> `/team/atlanta-dream/assets/…`. So `vite.config.js` sets `base: "/"` and
> `dist/` has to sit at the root of a domain, not inside a subfolder of one.

It also needs to serve `dist/team/atlanta-dream/index.html` for the URL
`/team/atlanta-dream`, which static hosts (Vercel, Netlify, Apache, nginx) do by
default, plus a **single-page-app fallback** for paths with no file of their own
— a past season's player pages are rendered in the browser rather than
prerendered (see [Search engines & sharing](#search-engines--sharing)), so
`/2019/team/washington-mystics/elena-delle-donne` has to serve the root
`index.html` instead of 404ing. `vercel.json` does this with a rewrite that
excludes `/data` and `/assets`, so a genuinely missing data file still fails
honestly rather than returning HTML.

---

## Branding & theme

This site is a subdomain of Highlight Factory (`wnba.highlightfactory.app`) and
shares that brand's design language, copied from the marketing site
(`highlight-factory-promo-site`):

- **Type** — JetBrains Mono on titles, scores and labels; the system UI face on
  supporting copy. Both are exported from `src/palette.js` as `FONT_DISPLAY` /
  `FONT_BODY`, and mirrored as `--font-display` / `--font-body` in
  `src/index.css`. Components must use those rather than naming a family, since
  SVG `fontFamily` attributes can't resolve CSS variables.
- **Color** — white page, white cards separated by a hairline (never a shadow),
  black type, brand plum `#3A1136` as the accent and chart blue `#6155F5` as the
  secondary series. Edit `src/palette.js` to change any of it; keep
  `src/index.css` in sync, since the two describe the same tokens for different
  consumers (Recharts vs. page chrome).
- **Header/footer** — `src/App.jsx` carries a header matched to the marketing
  site's (`BrandMark` + "WNBA Stats / powered by Highlight Factory", mono nav,
  plum download capsule). The links back to the main site live in
  `src/config.js`.

## Search engines & sharing

A client-rendered app is two things search engines handle badly: the deployed
HTML is `<div id="root"></div>` with no content in it, and the whole site lives
at one URL. A stats site's search demand is almost all long-tail ("atlanta dream
stats", "a'ja wilson shot chart"), which one URL can never answer. So the build
turns the app into hundreds of real pages:

```
/                                      league landing, current season
/team/atlanta-dream                    a team
/team/atlanta-dream/allisha-gray       a player
/2019                                  a past season's landing
/2019/team/washington-mystics          that team, that season
/2019/team/washington-mystics/…        a player that season (rendered in the browser)
```

The season in progress keeps the unprefixed URLs it has always had, so nothing
already indexed moves; past seasons live under a year prefix.

**What gets prerendered.** The current season in full — landing, every team,
every player. Completed seasons get their landing and team pages only: another
~250 player pages per archived year would multiply the build for little crawl
value. Those URLs still work, they just render client-side, which is why the
host needs the SPA fallback described in step 5.

- **`src/routes.js`** owns the URL scheme — slugs, `buildPath`, `parsePath`,
  `resolveInSeason`, `seasonRoutes`. It is imported by the app, the build script
  *and* the fetch script, so none of them can disagree about what a URL means.
  Player slugs are de-duplicated per roster (so two similar names can't fight
  over one URL) and written into each season's `league.json` at fetch time, which
  is what lets the browser resolve a player URL before that team's file arrives.
- **`src/pageMeta.js`** owns the `<title>`, description and canonical for every
  route, and is likewise shared: `scripts/prerender.mjs` writes them into the
  static files, and `App.jsx` applies the same values during client-side
  navigation, so the page a visitor sees always matches the one Google indexed.
- **`scripts/prerender.mjs`** runs as part of `npm run build`. For each route it
  writes `dist/<route>/index.html` containing that entity's real numbers (record,
  per-game averages, leaders, roster — read from `public/data/`, which it
  reassembles from the split files),
  the right meta tags, and JSON-LD (`SportsTeam` / `Person` / `Dataset` plus
  breadcrumbs). React replaces the static content on mount, so it's on screen
  for a frame — but a crawler that doesn't run JavaScript still gets the
  substance and, importantly, links to follow. It also writes `dist/sitemap.xml`
  and fails the build if the page count and the sitemap ever disagree.
- **Internal links.** The sitemap alone isn't enough — pages need to link to
  each other. The team `<select>` isn't crawlable, so there's an "All teams" nav
  above the footer, and the roster rail and the advanced-stats table use real
  `<a href>`s (a plain left-click is still intercepted for instant navigation;
  cmd-click opens a new tab like any other link).
- **Headings.** The `<h1>` is the selected team (in `TeamPicker`), with the city
  and season attached in an `.sr-only` span since the visible design only has
  room for the short name. Section headings are `<h2>`; on the Players tab the
  player name is the `<h2>` and its sections are `<h3>`.
- **`public/og.png`** is the 1200x630 share card. It is *generated*, not drawn
  by hand — edit `scripts/og-template.html` and run:

  ```bash
  npm run og
  ```

  That renders the template with a local headless Chrome and writes the PNG.
  It's deliberately kept out of `npm run build` (it needs a browser on the
  machine and the network for the webfont), so commit the PNG when it changes.

The production domain is named in `src/pageMeta.js` (`SITE_URL`, which drives
every canonical and Open Graph URL), `src/config.js`, `index.html` and
`public/robots.txt`. Change it in all four if the subdomain ever moves; the
sitemap and the per-page canonicals follow `SITE_URL` automatically.

## Mobile

The dashboard is dense, so a few layouts are explicitly re-flowed for phones
(all in `src/index.css`, no separate mobile build):

- Below 820px the header nav collapses to a menu button and the Players tab's
  roster rail becomes a scrollable band above the stats instead of a side rail.
- Below 720px the paired panels (`.split-2`) stack, and lineup rows
  (`.lineup-row`) move their net-rating bar to a second line so the player names
  keep their width.
- Wide stat tables never squeeze — they scroll inside `.scroll-x`, which paints
  a fade on the right edge as the only available hint on a device with no
  resting scrollbar.
- On touch devices (`hover: none`), the pill toggles, footer links and the team
  picker get larger hit areas. The picker grows via an invisible overlay so the
  visible label doesn't move.

## Refreshing / updating the data

The numbers are a snapshot from when you last ran the fetch. To update:

```bash
npm run fetch      # re-download the current season into public/data/<season>/
npm run build      # rebuild dist/  (or: npm run refresh to do both)
```

Then redeploy (on Vercel, committing the refreshed `public/data/` is enough —
the nightly job does exactly this).

**When a new season starts:** bump `CURRENT_SEASON` at the top of
`scripts/fetch-data.mjs` and run `npm run fetch`. Last year's data becomes an
archive automatically — it moves under a `/<year>` URL prefix, stops being
re-fetched, and drops to team-pages-only in the prerender. Optionally add the
finished year to the immutable-cache rule in `vercel.json`; forgetting only
costs a revalidation round trip.

**Change a team's emoji:** edit the `TEAM_EMOJI` list near the top of
`scripts/fetch-data.mjs` (each entry matches a keyword in the team name), then
re-run `npm run fetch`. Any team that doesn't match gets a 🏀.

**Refresh straight onto the server (optional):** you can point the script at any
output directory, so a cron job could refresh the live files without a rebuild:

```bash
node scripts/fetch-data.mjs --out /path/to/served/data
```

(Only works if that server's IP isn't blocked by stats.wnba.com — many shared
hosts are blocked, which is exactly why we fetch from your Mac by default.)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site says "Couldn't load data/index.json" | You haven't fetched yet, or the `data/` folder didn't get deployed. Run `npm run fetch`, rebuild, and make sure `data/` sits next to `index.html`. |
| A season is missing from the dropdown | It isn't on disk. `npm run fetch -- --missing` fetches every season since `OLDEST_SEASON` that you don't have. |
| A past season looks incomplete | `npm run fetch -- --repair` retries just the seasons with gaps recorded in `data/index.json`. |
| `npm run fetch` stops at the team game log | stats.wnba.com refused the core request from your network. Try again; if it persists, your IP may be temporarily blocked - try a different network. |
| A section says "showing the numbers from …" | That endpoint failed on the last fetch, so those numbers came from the previous snapshot. Hover the note for the reason; re-run `npm run fetch` to try again. |
| A Team-tab section shows "unavailable" | That endpoint failed **and** there was nothing recent enough to fall back on (no earlier snapshot, or it's over 21 days old). The red text under it shows the exact reason. Re-run `npm run fetch`. |
| "No games found" | The fetched season has no completed games, or `CURRENT_SEASON` in `scripts/fetch-data.mjs` is wrong. Fix and re-run `npm run fetch`. |
| Blank page / asset errors after deploying | The build expects to be served from a domain root (see the note in step 5). Check that `/assets/…` and `/data/index.json` resolve at the top level, not inside a subfolder. |
| A past season's *player* URL 404s | The host has no SPA fallback. Those pages aren't prerendered by design — see step 5. |
| A team or player URL shows the landing page | The host is falling back to the root `index.html` instead of serving the prerendered `dist/team/<team>/index.html`. Expected under `vite preview`; on a real static host, check that directory indexes are enabled. |

---

## What data is pulled

The fetch script calls these stats.wnba.com endpoints (LeagueID 10 = WNBA) for
every team, once per season, and transforms the responses into the files under
`public/data/<season>/`. The game logs and the
advanced team/player/four-factor dashboards are league-wide (one call each); the
roster, on/off, and lineup endpoints are per-team (one call per team):

- `leaguegamelog` (teams) - every team's games -> each game's score, the team
  list, and a team-id->abbreviation map for the league ranking chart.
- `leaguegamelog` (players) - every player's game line -> each team's per-game
  player logs (PTS, REB, AST, FG/3P/FT, +/-, minutes, etc.).
- `commonteamroster` - jersey numbers and positions (optional).
- `teamplayeronoffdetails` (Advanced) - on/off impact (offensive/defensive
  rating per 100 possessions with each player on vs. off).
- `leaguedashteamstats` (Advanced) - every team's offensive/defensive/net
  rating, for the league-wide ranking.
- `leaguedashplayerstats` (Advanced) - per-player usage, true shooting,
  AST%/REB%, net rating, PIE.
- `leaguedashlineups` (Advanced) - five-player units -> the eight most-used
  lineups by minutes with their net rating.

- `leaguedashteamstats` (Base, `PerMode=Per100Possessions`) - every team's
  shooting & possession profile per 100 possessions (3PM, 3PA, FTM, FTA,
  offensive rebounds, turnovers), powering the "profile vs the WNBA" comparison.
- `leaguedashteamstats` ("Four Factors") - team and opponent eFG%, turnover %,
  offensive-rebound % and FT rate.

Both of those were once **derived here from box scores**; they are now taken as
published. See "Nothing is estimated" below for why that mattered — and note
that the "Four Factors" measure type used to answer HTTP 500 on the WNBA
backend, which is why it was originally derived. It works now, for every season
back to 2017.

The `leaguedash*` endpoints are sent the WNBA's standard filter parameters but
**not** the NBA-only `TwoWay` / `ISTRound` params, which make the WNBA versions
return errors.

### Per-game endpoints (backfilled over several nights)

Two datasets can't be had league-wide — they're one request per game, so they're
cached to their own file per game and never refetched. A run attempts only a
handful, so a season fills in over several nights rather than in one long pass:

- `gamerotation` -> substitution timing, in `public/data/<season>/rotations/`.
- `playbyplayv2` -> every made field goal with its scorer and its assister, in
  `public/data/<season>/assists/`. Joined to the season shot chart on
  `GAME_EVENT_ID` = `EVENTNUM` to learn what kind of shot each pass created.
  This powers the assist network, the "what each pass creates" breakdown, and
  each scorer's assisted share.

Both accept `--no-rotations` / `--no-assists` to skip, and
`--rotation-limit N` / `--assist-limit N` to fetch more than the nightly cap
(`0` for no cap). Expect roughly a third of attempts to return HTTP 500 after a
~30s wait; failures are written to an `_attempts.json` ledger so the backlog
rotates instead of jamming on the same games.

### What is *not* available

There is **no Synergy play-type data for the WNBA** — no pick-and-roll, no
isolation, no post-up frequency. `synergyplaytypes` answers HTTP 500, and the
whole tracking family (`leaguedashptstats`, `playerdashptpass`,
`leaguehustlestatsplayer` and its screen assists) answers 200 with zero rows.
No feed records screens at all. So a pass is described here by the shot at the
end of it, never by the action that created it.

## Checking the numbers against wnba.com

Every section on the site carries a **source footnote** linking to the
stats.wnba.com page it was built from, with the season and filters already
applied, so any number can be opened and checked by hand. The mapping lives in
`src/sources.js` — one entry per dataset, with query strings that mirror the
parameter sets in `scripts/fetch-data.mjs`. **If you change a `PerMode` or a
`MeasureType` in the fetch script, change it in `sources.js` too**, or the
footnote will point at a view that doesn't reconcile.

### Nothing is estimated

Every team-level rate is taken from stats.wnba.com already computed, so the
linked page reconciles cell-for-cell. This was not always true, and the three
things that changed are worth recording, because each moved numbers on screen:

- **Possessions were estimated**, with the classic
  `0.5 × ((FGA + 0.44×FTA − OREB + TOV) + the opponent's same line)`. wnba.com
  counts possessions from play-by-play instead — within a game the two teams'
  counts differ by at most 3, which an estimator can't reproduce. The estimate
  ran **2.1% high** for every team (league-wide ratio 0.979, ~1.7 possessions
  per game), which pushed every per-100 number about 2% low. Asking for
  `PerMode=Per100Possessions` hands us their division instead. *2025 Sparks
  3PA/100: was 31.2, now 31.4.*
- **Team turnovers were missing.** Team totals were summed from the player game
  log, which has no row for shot-clock violations, 5-second inbounds or too many
  players — 38 over the 2025 Sparks season, 595 league-wide. Every other field
  (FGA, 3PA, FTA, OREB, DREB, PTS) reconciled exactly; only turnovers didn't.
  Nothing sums player rows into team totals any more. *2025 Sparks TOV/100: was
  17.2, now 18.4.*
- **Pace was on a 48-minute clock.** The WNBA backend inherits the NBA's `PACE`
  basis, so it reports ~97 for a league that plays 40-minute games. The Advanced
  response also carries `PACE_PER40`, which is what the site now reads. *2025
  Sparks: was 96.8, now 80.7.*

The four factors are wnba.com's definitions, which are **not** the
Basketball-Reference ones. Turnover % is `TOV ÷ possessions` rather than Dean
Oliver's `TOV ÷ (FGA + 0.44×FTA + TOV)`, and the rebound percentages sit on a
different base than `OREB ÷ (OREB + opponent DREB)`. Both read higher here than
on Basketball-Reference — same factor, different convention, not a discrepancy.
*2025 Sparks: TOV% 18.4 vs BBRef's 15.7; OREB% 29.5 vs 24.1. eFG% and FT rate
are identical either way.*

One estimate is left, and it is not a team stat: **true shooting %** on the
Team-tab shooting panel and the Players tab still uses `PTS ÷ (2 × (FGA +
0.44×FTA))`, computed from game logs, because the per-game TS% trend needs a
per-game number. The exact season TS% is available in `leaguedashplayerstats`
(Advanced) if that ever matters more than the trend line does.

## Project map

```
index.html              app entry
vite.config.js          dev server + build config (no proxy needed anymore)
scripts/
  fetch-data.mjs        downloads a season from stats.wnba.com -> public/data/<season>/
                        (CURRENT_SEASON, OLDEST_SEASON and the TEAM_EMOJI map live at
                         the top; anything that fails is carried over from what's on disk)
  prerender.mjs         after `vite build`: one HTML page per team/player, every season, + sitemap.xml
  build-og.mjs          renders og-template.html -> public/og.png (run by hand: `npm run og`)
  og-template.html      the artwork for the social share card
public/
  data/index.json       which seasons exist, when each was fetched, what's missing
  data/<season>/league.json      that season's team list + league-wide charts
  data/<season>/teams/<id>.json  one file per team (its games, roster, on/off, lineups)
  data/<season>/rotations/<g>.json  one file per game's substitutions (backfilled nightly)
  data/<season>/assists/<g>.json    one file per game's made field goals + who assisted them
src/
  main.jsx              boots React
  App.jsx               season + team dropdowns, tabs, routing, loading / error states
  api.js                loads the data files on demand and caches them (no network calls to stats.wnba.com)
  palette.js            brand colors + type stack (edit colors here)
  config.js             site name, canonical URL, links back to highlightfactory.app
  routes.js             the URL scheme (slugs, buildPath, parsePath) - shared with the build + fetch
  pageMeta.js           per-route title / description / canonical - shared with the build
  sources.js            each dataset -> the wnba.com page it came from (+ the formulas we apply)
  SourceNote.jsx        the "Source · wnba.com > ..." footnote under every section
  BrandMark.jsx         the Highlight Factory app mark (copied from the main site)
  useLeagueData.js      React hooks for the three loads: season index, season, team
  Dashboard.jsx         per-player view (Players tab)
  TeamView.jsx          team view (Team tab): ranking, four factors, lineups, ...
  OnOffChart.jsx        on/off impact scatter (shown on the Team tab)
  PlaymakingChart.jsx   assists vs turnovers per player, with assist-to-turnover ratio
  AssistCharts.jsx      assist network matrix, what each pass creates, assisted share
  StaleNote.jsx         the "showing the numbers from ..." note on carried-over sections
  index.css             brand tokens, typography, shared .hf-* classes
server/
  wnba.php              NOT USED anymore - the old live proxy; safe to delete
```
