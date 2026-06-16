/**
 * update-data.js – using openfootball’s public JSON
 * ----------------------------------------------------------------
 * Fetches World Cup 2026 data from:
 *   https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
 * Computes standings and writes data/data.json.
 * No API key required.
 * ----------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const DATA_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

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

// ===================== BULLETPROOF computeStats =====================
function computeStats(matches, allTeams) {
  const stats = {};
  allTeams.forEach(t => {
    stats[t] = { pts: 0, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  });

  const completedMatches = [];

  matches.forEach(m => {
    const homeName = normaliseTeamName(m.team1);
    const awayName = normaliseTeamName(m.team2);

    // Extract the full‑time score from score.ft
    const homeGoals = m.score && m.score.ft ? m.score.ft[0] : null;
    const awayGoals = m.score && m.score.ft ? m.score.ft[1] : null;

    // Only process if we have valid numbers
    if (homeGoals !== null && awayGoals !== null && typeof homeGoals === "number" && typeof awayGoals === "number") {

      // ---------- SAFE DATE CONSTRUCTION ----------
      let dateObj;
      try {
        let dateStr = m.date; // expects "YYYY-MM-DD"
        if (dateStr) {
          // Append time if available, otherwise default to midnight UTC
          const timePart = m.time ? m.time : "00:00:00";
          dateStr = dateStr + "T" + timePart + "Z"; // Z for UTC
          dateObj = new Date(dateStr);
          if (isNaN(dateObj.getTime())) {
            // Fallback: try without time
            dateObj = new Date(m.date);
          }
        } else {
          // No date provided – use current time
          dateObj = new Date();
        }
      } catch (e) {
        // If anything fails, use current time
        dateObj = new Date();
      }
      // Ensure we have a valid date
      if (isNaN(dateObj.getTime())) {
        dateObj = new Date();
      }
      // --------------------------------------------

      completedMatches.push({
        fixtureId: m.id || `${m.team1}-${m.team2}-${m.date}`,
        date: dateObj.toISOString(),
        stage: m.group || m.round || "Group stage",
        home: homeName,
        away: awayName,
        homeGoals,
        awayGoals,
        venue: m.ground || null
      });

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

  completedMatches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { stats, matches: completedMatches };
}
// ===================== END OF computeStats =====================

function computeFriendScores(stats) {
  return friends.map(f => {
    const totalPts = f.teams.reduce((sum, t) => sum + (stats[t]?.pts || 0), 0);
    return { name: f.name, teams: f.teams, points: totalPts };
  });
}

/**
 * Flexible parser – tries to extract an array of match objects from any structure.
 */
async function fetchOpenFootballData() {
  const res = await fetch(DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch openfootball data: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  // Helper: check if an object looks like a match (has team1 and team2)
  function isMatch(obj) {
    return obj && typeof obj === "object" && "team1" in obj && "team2" in obj;
  }

  // Helper: recursively find the first array that contains match objects
  function findMatchesArray(obj) {
    if (Array.isArray(obj)) {
      // If the array itself contains match objects, return it
      if (obj.length > 0 && isMatch(obj[0])) {
        return obj;
      }
      // Otherwise, search each item
      for (const item of obj) {
        const found = findMatchesArray(item);
        if (found) return found;
      }
    } else if (obj && typeof obj === "object") {
      // Search each property value
      for (const key of Object.keys(obj)) {
        const found = findMatchesArray(obj[key]);
        if (found) return found;
      }
    }
    return null;
  }

  // Attempt to find matches
  let matchesArray = findMatchesArray(data);

  if (!matchesArray) {
    console.warn("Could not find any match data in the response. Returning empty array.");
    return [];
  }

  // Attach a default round/group if missing
  return matchesArray.map(m => {
    if (!m.round && !m.group) {
      m.round = "Match";
    }
    return m;
  });
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
    leagueId: 1,
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
