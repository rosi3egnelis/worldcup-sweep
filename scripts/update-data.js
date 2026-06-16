/**
 * update-data.js
 * ----------------------------------------------------------------
 * Pulls all FIFA World Cup 2026 fixtures from API-Football (v3),
 * computes points/standings for each drafted team and each friend
 * in the sweep, and writes the result to data/data.json.
 *
 * Run by .github/workflows/update.yml on a schedule (every 4 hours).
 * Requires the environment variable API_FOOTBALL_KEY (set as a
 * GitHub Actions secret — never committed to the repo).
 * ----------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.API_FOOTBALL_KEY;
if (!API_KEY) {
  console.error("Missing API_FOOTBALL_KEY environment variable.");
  process.exit(1);
}

const LEAGUE_ID = 1;    // FIFA World Cup
const SEASON = 2026;
const API_BASE = "https://v3.football.api-sports.io";

// ===== Sweep allocations =====
const friends = [
  { name: "Patty",      teams: ["Algeria", "Ghana", "Morocco", "Mexico"] },
  { name: "Kinaadman",  teams: ["Turkey", "Senegal", "Austria", "Canada"] },
  { name: "Joe",        teams: ["Tunisia", "Uzbekistan", "Paraguay", "Belgium"] },
  { name: "Brizuela",   teams: ["South Africa", "Saudi Arabia", "Uruguay", "France"] },
  { name: "Miriam",     teams: ["Qatar", "Ivory Coast", "Ecuador", "United States"] },
  { name: "Norton",     teams: ["Cape Verde", "Australia", "Switzerland", "Germany"] },
  { name: "Sal",        teams: ["DR Congo", "Jordan", "Croatia", "Portugal"] },
  { name: "Oots",       teams: ["Panama", "Bosnia and Herzegovina", "Norway", "Netherlands"] },
  { name: "Pardillo",   teams: ["Haiti", "Czech Republic", "Colombia", "England"] },
  { name: "Silenge",    teams: ["Iran", "New Zealand", "Japan", "Spain"] },
  { name: "Ron",        teams: ["Iraq", "Sweden", "Egypt", "Brazil"] },
  { name: "Rianne",     teams: ["Curacao", "Scotland", "South Korea", "Argentina"] }
];

// Aliases: API-Football's official team name -> our sweep's team name,
// in case the API spells something differently than expected.
const apiNameAliases = {
  "USA": "United States",
  "Cape Verde Islands": "Cape Verde",
  "Korea Republic": "South Korea",
  "IR Iran": "Iran",
  "Czechia": "Czech Republic",
  "Côte d'Ivoire": "Ivory Coast",
  "Türkiye": "Turkey"
};

function normaliseTeamName(apiName) {
  return apiNameAliases[apiName] || apiName;
}

async function apiGet(endpoint, params) {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, {
    headers: { "x-apisports-key": API_KEY }
  });
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API returned errors: ${JSON.stringify(json.errors)}`);
  }
  return json.response;
}

async function fetchFixtures() {
  return apiGet("/fixtures", { league: LEAGUE_ID, season: SEASON });
}

// Statuses that count as a completed match for points purposes.
// FT = full time, AET = after extra time, PEN = after penalties.
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

function buildTeamIndex() {
  const teamToFriend = {};
  const allTeams = new Set();
  friends.forEach(f => {
    f.teams.forEach(t => {
      teamToFriend[t] = f.name;
      allTeams.add(t);
    });
  });
  return { teamToFriend, allTeams };
}

function computeStats(fixtures, allTeams) {
  const stats = {};
  allTeams.forEach(t => {
    stats[t] = { pts: 0, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  });

  const matches = [];

  fixtures.forEach(fx => {
    const statusShort = fx.fixture?.status?.short;
    const homeName = normaliseTeamName(fx.teams?.home?.name);
    const awayName = normaliseTeamName(fx.teams?.away?.name);
    const homeGoals = fx.goals?.home;
    const awayGoals = fx.goals?.away;
    const isFinished = FINISHED_STATUSES.has(statusShort);

    if (isFinished && homeGoals !== null && awayGoals !== null) {
      matches.push({
        fixtureId: fx.fixture.id,
        date: fx.fixture.date,
        stage: fx.league?.round || "",
        home: homeName,
        away: awayName,
        homeGoals,
        awayGoals,
        venue: fx.fixture?.venue?.name || null
      });

      // Only accumulate stats for teams that are actually in the sweep.
      if (stats[homeName] && stats[awayName]) {
        const hs = stats[homeName];
        const as = stats[awayName];
        hs.gp++; hs.gf += homeGoals; hs.ga += awayGoals;
        as.gp++; as.gf += awayGoals; as.ga += homeGoals;

        if (homeGoals > awayGoals) { hs.pts += 3; hs.w++; as.l++; }
        else if (homeGoals < awayGoals) { as.pts += 3; as.w++; hs.l++; }
        else { hs.pts += 1; as.pts += 1; hs.d++; as.d++; }
      }
    }
  });

  // Sort matches by date ascending, most recent first for display.
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { stats, matches };
}

function computeFriendScores(stats) {
  return friends.map(f => {
    const totalPts = f.teams.reduce((sum, t) => sum + (stats[t]?.pts || 0), 0);
    return { name: f.name, teams: f.teams, points: totalPts };
  });
}

async function main() {
  console.log(`Fetching World Cup ${SEASON} fixtures (league ${LEAGUE_ID})...`);
  const fixtures = await fetchFixtures();
  console.log(`Received ${fixtures.length} fixtures.`);

  const { allTeams } = buildTeamIndex();
  const { stats, matches } = computeStats(fixtures, allTeams);
  const friendScores = computeFriendScores(stats);

  const output = {
    generatedAt: new Date().toISOString(),
    season: SEASON,
    leagueId: LEAGUE_ID,
    totalFixturesFetched: fixtures.length,
    completedMatches: matches.length,
    friends: friendScores,
    teamStats: stats,
    matches
  };

  const outPath = path.join(__dirname, "..", "data", "data.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Completed matches: ${matches.length}`);
}

main().catch(err => {
  console.error("update-data.js failed:", err);
  process.exit(1);
});
