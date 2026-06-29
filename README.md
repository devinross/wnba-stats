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
cd sparks-analytics      # the unzipped folder
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

## Light & dark mode

There's a sun/moon button in the toolbar (next to the Team / Players tabs) that
toggles a white (light) or dark interface. The choice is remembered in the
browser, and first-time visitors get whichever matches their device setting.
To tweak the actual colors for either theme, edit `src/palette.js`.

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
  palette.js            light + dark color palettes (edit colors here)
  useSparksData.js      React hook around the loader
  Dashboard.jsx         per-player view (Players tab)
  TeamView.jsx          team view (Team tab): ranking, four factors, lineups, ...
  OnOffChart.jsx        on/off impact scatter (shown on the Team tab)
  index.css             fonts + page background
server/
  wnba.php              NOT USED anymore - the old live proxy; safe to delete
```
