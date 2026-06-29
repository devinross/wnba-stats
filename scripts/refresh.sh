#!/bin/zsh
# Nightly WNBA data refresh, run locally on your Mac (residential IP reaches
# stats.wnba.com). Regenerates public/data/wnba.json and pushes to master, which
# triggers a Vercel redeploy. Invoked by the launchd agent (see HOSTING.md).

REPO="$HOME/source-code/wnba-analytics"
LOG="$HOME/Library/Logs/wnba-refresh.log"
BRANCH="data"

# Make node/npm/git findable from launchd's bare environment.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# If you use nvm, load it so `npm` resolves (harmless if you don't):
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$REPO" || { echo "$(date)  repo not found at $REPO" >> "$LOG"; exit 1; }

echo "=== $(date)  refresh start ===" >> "$LOG"
npm run fetch >> "$LOG" 2>&1

# Guard: never commit an empty/blocked snapshot over a good one.
teams=$(node --input-type=commonjs -e "const fs=require('fs');try{process.stdout.write(String((JSON.parse(fs.readFileSync('public/data/wnba.json','utf8')).teams||[]).length))}catch(e){process.stdout.write('0')}")

if [ "$teams" -gt 0 ]; then
  if git diff --quiet public/data/wnba.json; then
    echo "$(date)  no data change ($teams teams)" >> "$LOG"
  else
    git add public/data/wnba.json
    git commit -m "chore: nightly WNBA data refresh" >> "$LOG" 2>&1
    git push origin "$BRANCH" >> "$LOG" 2>&1
    echo "$(date)  pushed refresh ($teams teams)" >> "$LOG"
  fi
else
  echo "$(date)  fetch returned no teams — likely blocked; skipping commit" >> "$LOG"
fi
