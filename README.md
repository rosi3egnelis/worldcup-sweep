# World Cup 2026 Sweep — Setup Guide

This site shows live standings for your friends' World Cup sweep. Match
results are pulled automatically every 4 hurs — nobody
has to enter scores by hand.

## How it works

```
GitHub Actions (every 4 hours)
   → calls fetches from openfootball’s public JSON
   → recalculates points for every team and friend
   → writes data/data.json
   → commits it to the repo
        ↓
GitHub Pages serves index.html
   → index.html fetches data/data.json
   → same page, same data, for every visitor
```

Your API key lives only in GitHub's encrypted Secrets store and inside the
Actions runner. It is never sent to anyone's browser.

## One-time setup

### 1. Add your API key as a secret - NO LONGER REQUIRED
In your repo: **Settings → Secrets and variables → Actions → New repository secret**
- Name: `API_FOOTBALL_KEY`
- Value: your api-sports.io API-Football key

### 2. Allow Actions to push commits
**Settings → Actions → General → Workflow permissions** → select
**"Read and write permissions"**, then Save. (Without this, the workflow can
fetch data but can't commit the updated file back to the repo.)

### 3. Turn on GitHub Pages
**Settings → Pages → Build and deployment → Source** → select **"Deploy from
a branch"**, branch `main`, folder `/ (root)`. Save.

Your site will be live at `https://rosi3egnelis.github.io/worldcup-sweep/`
within a minute or two.

### 4. Run the workflow once manually
**Actions tab → "Update World Cup sweep data" → Run workflow**. This
populates `data/data.json` with real data immediately, instead of waiting
up to 4 hours for the first scheduled run. Check the run logs if anything
fails — the most common cause is a missing/incorrect secret name.

## Updating the sweep itself

If anyone's drafted teams change, edit the `friends` array in
`scripts/update-data.js` (and the matching team names — they must exactly
match the names API-Football uses; a few common name differences, like
"USA" → "United States", are already handled in `apiNameAliases`).

## Notes on the free plan

The free API-Football tier allows 100 requests/day. This setup uses 1
request every 4 hours (6/day), leaving plenty of headroom. If you want
faster updates during live matches, lower the cron interval in
`.github/workflows/update.yml` — just keep total daily calls under 100.

## Files

- `index.html` — the page everyone visits. Read-only, no data entry.
- `data/data.json` — generated automatically. Don't edit by hand; it gets
  overwritten every run.
- `scripts/update-data.js` — fetches fixtures, computes standings.
- `.github/workflows/update.yml` — the schedule that runs the script.
