/**
 * update-data.js – now using openfootball’s public JSON
 * ----------------------------------------------------------------
 * Fetches World Cup 2026 data from:
 *   https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
 * Computes standings for the sweep and writes data/data.json.
 *
 * No API key required.
 * ----------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const DATA_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

// ===== Sweep allocations (unchanged) =====
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

// Aliases: map openfootball's team names to our canonical names
const nameAliases = {
  "USA": "United States",
  "Cape Verde Islands": "Cape Verde",
  "Korea Republic": "South Korea",
  "IR Iran": "Iran",
  "Czechia": "Czech Republic",
  "Côte d'Ivoire": "Ivory Coast",
  "Türkiye": "Turkey"
};

function normaliseTeamName(raw) {
  return nameAliases[raw] || raw;
}

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

function computeStats(matches, allTeams) {
  const stats = {};
  allTeams.forEach(t => {
    stats[t] = { pts: 0, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  });

  const completedMatches = [];

  matches.forEach(m => {
    // openfootball fields: team1, team2, goals1, goals2 (null if not played)
    const homeName = normaliseTeamName(m.team1);
    const awayName = normaliseTeamName(m.team2);
    const homeGoals = m.goals1;
    const awayGoals = m.goals2;

    // Only process if both goals are numbers (match finished)
    if (typeof homeGoals === "number" && typeof awayGoals === "number") {
      // Add to completed matches list
      completedMatches.push({
        fixtureId: m.id || `${m.team1}-${m.team2}-${m.date}`,
        date: m.date ? new Date(m.date + "T" + (m.time || "00:00")).toISOString() : new Date().toISOString(),
        stage: m.group || m.round || "Group stage",
        home: homeName,
        away: awayName,
        homeGoals,
        awayGoals,
        venue: m.ground || null
      });

      // Update stats only if both teams are in the sweep
      if (stats[homeName] && stats[awayName]) {
        const hs = stats[homeName];
        const as = stats[awayName];
        hs.gp++;
        hs.gf += homeGoals;
        hs.ga += awayGoals;
        as.gp++;
        as.gf += awayGoals;
        as.ga += homeGoals;

        if (homeGoals > awayGoals) {
          hs.pts += 3;
          hs.w++;
          as.l++;
        } else if (homeGoals < awayGoals) {
          as.pts += 3;
          as.w++;
          hs.l++;
        } else {
          hs.pts += 1;
          as.pts += 1;
          hs.d++;
          as.d++;
        }
      }
    }
  });

  // Sort completed matches: most recent first (by date)
  completedMatches.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { stats, matches: completedMatches };
}

function computeFriendScores(stats) {
  return friends.map(f => {
    const totalPts = f.teams.reduce((sum, t) => sum + (stats[t]?.pts || 0), 0);
    return { name: f.name, teams: f.teams, points: totalPts };
  });
}

async function fetchOpenFootballData() {
  const res = await fetch(DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch openfootball data: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  // openfootball returns either:
  //   - an array of rounds (older format)
  //   - an object with a "rounds" array (current format)
  let rounds = [];
  if (Array.isArray(data)) {
    rounds = data;
  } else if (data.rounds && Array.isArray(data.rounds)) {
    rounds = data.rounds;
  } else {
    throw new Error(
      "Unexpected JSON structure from openfootball: " +
      "expected array or object with 'rounds' array."
    );
  }

  const allMatches = [];
  for (const round of rounds) {
    if (round.matches && Array.isArray(round.matches)) {
      for (const m of round.matches) {
        m.round = round.name;   // attach round/group name for the stage field
        allMatches.push(m);
      }
    }
  }
  return allMatches;
}

async function main() {
  console.log("Fetching World Cup 2026 data from openfootball...");
  const rawMatches = await fetchOpenFootballData();
  console.log(`Received ${rawMatches.length} matches (including future ones).`);

  const { allTeams } = buildTeamIndex();
  const { stats, matches } = computeStats(rawMatches, allTeams);
  const friendScores = computeFriendScores(stats);

  const output = {
    generatedAt: new Date().toISOString(),
    season: 2026,
    leagueId: 1,                  // keep for compatibility
    totalFixturesFetched: rawMatches.length,
    completedMatches: matches.length,
    friends: friendScores,
    teamStats: stats,
    matches
  };

  const outPath = path.join(__dirname, "..", "data", "data.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Completed matches used for standings: ${matches.length}`);
}

main().catch(err => {
  console.error("update-data.js failed:", err);
  process.exit(1);
});
