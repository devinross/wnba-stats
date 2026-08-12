# WNBA Analytics — setup guide

A React dashboard for **every WNBA team**. Pick a team from the dropdown in the
header (each shown with an emoji, e.g. "✨ Sparks", "🗽 Liberty"); each team has a
**Team** tab and a **Players** tab, built from data pulled from **stats.wnba.com**.

The key idea: the website does **not** talk to stats.wnba.com. Instead you run a
small script once that downloads the data and saves it to a file
(`public/data/wnba.json`). The site just reads that file. So the deployed site
is plain static files — no PHP, no proxy, no API key, and none of the CORS / IP
blocking / "500" problems that come from calling stats.wnba.com live from a web
host. You refresh the numbers by re-running the script whenever you want.

This guide assumes you've **never used React**.

---

## How the pieces fit together

```
  npm run fetch                          The website (static files)
  +--------------------------+          +----------------------------+
  | scripts/fetch-data.mjs   |  writes  | reads  public/data/        |
  |  -> stats.wnba.com       | -------> |        wnba.json         |
  |  (run on your Mac)       |  JSON    |  (no network calls at all) |
  +--------------------------+          +----------------------------+
```

Run the fetch script on your Mac (its IP isn't blocked by stats.wnba.com). It
saves one snapshot containing all teams. Build the site from that snapshot and
upload the static files. Switching teams in the UI is instant — no extra loads.

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

This downloads every team's games, box scores, on/off ratings, four factors,
advanced player stats, league-wide ratings, and lineups, and writes them all to
`public/data/wnba.json`. Because it loops over every team for a few of the
endpoints, it makes ~40+ requests and takes a minute or two. It prints the real
status of each request, e.g.:

```
League-wide data:
  - team game log ... 120 rows
  - player game log ... 1100 rows
  - ratings ... 13 rows
  - playeradv ... 150 rows

Found 13 teams.

Per-team data (roster - on/off - lineups):
  - ✨ Sparks ... 14g 12p onoff✓ lineups✓
  - 🗽 Liberty ... 15g 11p onoff✓ lineups✓
  - ☀️ Sun ... 14g 12p onoff✓ lineups✓
  ... (one line per team) ...

Wrote .../public/data/wnba.json
  13 teams
```

If a per-team optional request (on/off or lineups) fails, that shows as `✗` and
that one section shows an "unavailable" note for that team — everything else
still works. If a **league-wide** request fails (ratings / four factors / player
advanced), that dataset is missing for every team. If the **core** game log
fails, the script stops and prints why.

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

`npm run build` runs `scripts/build-seo.mjs` after Vite. See
[Search engines & sharing](#search-engines--sharing) for what that does and why
it matters — the short version is that it puts real, crawlable content into
`dist/index.html`, which would otherwise ship as an empty `<div id="root">`.

---

## 5. Upload to Bluehost

Bluehost serves files from **`public_html`**. Because the site is now fully
static, **you do not need PHP or the old proxy** — just upload the files.

**Option A - cPanel File Manager:** zip the **contents of `dist/`**, upload to
`public_html`, and extract so `public_html/index.html` exists (and
`public_html/data/wnba.json` exists alongside it).

**Option B - SFTP / your editor's publish feature:** upload the **contents of
`dist/`** into `public_html/`.

Subfolder deploys (e.g. `public_html/sparks/`) work too — asset and data paths
are relative, so just upload `dist/`'s contents into that subfolder.

That's it. Load your domain and the dashboard appears.

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
- **Light only.** Like the main site, there is no night mode and no toggle.
- **Header/footer** — `src/App.jsx` carries a header matched to the marketing
  site's (`BrandMark` + "WNBA Stats / powered by Highlight Factory", mono nav,
  plum download capsule). The links back to the main site live in
  `src/config.js`.

## Search engines & sharing

This is a client-rendered React app, which is the one thing search engines
handle badly: without help, the deployed `dist/index.html` is literally
`<div id="root"></div>`. Google will execute the JavaScript and eventually see
the real page, but social scrapers, most AI crawlers, and Google's first pass
won't. Three things address that:

- **`scripts/build-seo.mjs`** runs as part of `npm run build`. It injects a
  static summary into `#root` (what the dashboard covers, plus the real team
  list and season read from `public/data/wnba.json`) and a JSON-LD block
  (`WebSite`, `Organization`, `Dataset`) into `<head>`. React replaces the
  summary the instant it mounts, so nobody sees it for more than a frame — but
  because both come from the same snapshot, the summary can't drift from the
  app. The nightly refresh keeps `dateModified` and the season current for free.
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

Canonical URL, robots and sitemap all name `wnba.highlightfactory.app` — see the
note in `HOSTING.md` about the four places to update if that ever changes.

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
npm run fetch      # re-download into public/data/wnba.json
npm run build      # rebuild dist/  (or: npm run refresh to do both)
```

Then re-upload `dist/` (or just the single updated `dist/data/wnba.json`).

**Change the season:** edit `SEASON` near the top of `scripts/fetch-data.mjs`,
then re-run `npm run fetch`.

**Change a team's emoji:** edit the `TEAM_EMOJI` list near the top of
`scripts/fetch-data.mjs` (each entry matches a keyword in the team name), then
re-run `npm run fetch`. Any team that doesn't match gets a 🏀.

**Refresh straight onto the server (optional):** you can point the script at any
output path, so a cron job could refresh the live file without a rebuild:

```bash
node scripts/fetch-data.mjs /home/youruser/public_html/data/wnba.json
```

(Only works if that server's IP isn't blocked by stats.wnba.com — many shared
hosts are blocked, which is exactly why we fetch from your Mac by default.)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site says "Couldn't load data/wnba.json" | You haven't fetched yet, or didn't upload `data/wnba.json`. Run `npm run fetch`, rebuild, and make sure `data/wnba.json` is next to `index.html`. |
| `npm run fetch` stops at the team game log | stats.wnba.com refused the core request from your network. Try again; if it persists, your IP may be temporarily blocked - try a different network. |
| A Team-tab section shows "unavailable" | That optional endpoint failed when you fetched. The red text under it shows the exact reason. Re-run `npm run fetch`. |
| "No games found" | The fetched season has no completed games, or `SEASON` in `scripts/fetch-data.mjs` is wrong. Fix and re-run `npm run fetch`. |
| Blank page / asset errors on a subfolder deploy | Make sure you uploaded the whole contents of `dist/` (including `assets/` and `data/`) into the subfolder. |

---

## What data is pulled

The fetch script calls these stats.wnba.com endpoints (LeagueID 10 = WNBA) for
every team and transforms the responses into `wnba.json`. The game logs and the
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

A per-game **shooting & possession profile** for every team (3PM, 3PA, 2PM, 2PA,
FTM, FTA, offensive rebounds, turnovers, eFG%) is also computed from the box
scores, powering the "profile vs the WNBA" comparison on the Team tab.

The four factors (team and opponent eFG%, turnover %, offensive-rebound %, and
FT rate) are **computed from the box scores** above rather than fetched — the
WNBA `leaguedashteamstats` "Four Factors" measure type returns HTTP 500, but the
four factors are standard box-score formulas, so they're derived from each
team's and its opponents' game lines.

The `leaguedash*` endpoints are sent the WNBA's standard filter parameters but
**not** the NBA-only `TwoWay` / `ISTRound` params, which make the WNBA versions
return errors.

## Project map

```
index.html              app entry
vite.config.js          dev server + build config (no proxy needed anymore)
scripts/
  fetch-data.mjs        downloads ALL teams from stats.wnba.com -> public/data/wnba.json
                        (SEASON and the TEAM_EMOJI map live at the top of this file)
public/
  data/wnba.json        the saved snapshot for every team (created by `npm run fetch`)
src/
  main.jsx              boots React
  App.jsx               team dropdown + tabs (Team / Players) + loading / error states
  api.js                loads public/data/wnba.json (no network calls)
  palette.js            brand colors + type stack (edit colors here)
  config.js             site name, canonical URL, links back to highlightfactory.app
  BrandMark.jsx         the Highlight Factory app mark (copied from the main site)
  useLeagueData.js      React hook around the loader
  Dashboard.jsx         per-player view (Players tab)
  TeamView.jsx          team view (Team tab): ranking, four factors, lineups, ...
  OnOffChart.jsx        on/off impact scatter (shown on the Team tab)
  index.css             brand tokens, typography, shared .hf-* classes
server/
  wnba.php              NOT USED anymore - the old live proxy; safe to delete
```
