# World Cup 2026 Sweep — Setup Guide

This site shows live standings for your friends' World Cup sweep. Match
results are pulled automatically every 4 hours from a free, public World
Cup 2026 dataset — nobody has to enter scores by hand, and no API key
is needed.

## How it works

```
GitHub Actions (every 4 hours)
   → fetches openfootball's public World Cup JSON
   → recalculates points for every team and friend
   → builds group standings and the knockout bracket
   → writes data/data.json
   → commits it to the repo
        ↓
GitHub Pages serves index.html
   → index.html fetches data/data.json
   → same page, same data, for every visitor
```

## One-time setup

### 1. Allow Actions to push commits
**Settings → Actions → General → Workflow permissions** → select
**"Read and write permissions"**, then Save. (Without this, the workflow can
fetch data but can't commit the updated file back to the repo.)

### 2. Turn on GitHub Pages
**Settings → Pages → Build and deployment → Source** → select **"Deploy from
a branch"**, branch `main`, folder `/ (root)`. Save.

Your site will be live at `https://rosi3egnelis.github.io/worldcup-sweep/`
within a minute or two.

### 3. Run the workflow once manually
**Actions tab → "Update World Cup sweep data" → Run workflow**. This
populates `data/data.json` with real data immediately, instead of waiting
up to 4 hours for the first scheduled run. Check the run logs if anything
fails.

## Updating the sweep itself

If anyone's drafted teams change, edit the `friends` array in
`scripts/update-data.js`. Team names need to match the spelling used by
the data source — a few common differences (like "USA" vs "United States",
"Curaçao" vs "Curacao") are already handled in `nameAliases` near the
top of the script. If a team shows 0 points when it shouldn't, check the
Action's run log and add the correct spelling to that list.

## The "Road to the Final" tab

This tab shows three things:

1. **Group standings** — all 12 official groups, sorted by points, then
   goal difference, then goals scored. Top 2 in each group are highlighted.
2. **Best third-placed teams** — since 8 of the 12 third-place finishers
   also advance, this ranks all 12 against each other so you can see who's
   currently in that top-8 cutoff. This is provisional during the group
   stage and only becomes final once every group has finished.
3. **The knockout bracket** — Round of 32 through to the Final. FIFA's
   actual Round of 32 pairings depend on an official 495-scenario lookup
   table (which 8 third-place teams qualify decides the matchups), so
   rather than guess at that, each slot shows "TBD" until the real
   matchup is confirmed in the source data. Once it is, it appears
   automatically on the next scheduled update — no changes needed here.

If `officialGroups` in `scripts/update-data.js` ever needs correcting
(e.g. if a playoff slot changes before the tournament starts), update
the team list for that group there.

## Files

- `index.html` — the page everyone visits. Read-only, no data entry.
- `data/data.json` — generated automatically. Don't edit by hand; it gets
  overwritten every run.
- `scripts/update-data.js` — fetches fixtures, computes standings, group
  tables, and knockout bracket data.
- `.github/workflows/update.yml` — the schedule that runs the script.
