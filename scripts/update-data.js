/**
 * update-data.js – using openfootball's public JSON
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
  "Türkiye": "Turkey",
  "Bosnia & Herzegovina": "Bosnia and Herzegovina",
  "Curaçao": "Curacao"
};

// Official FIFA group draw (confirmed 5 Dec 2025), used to render the
// 12 group-stage standings tables. Independent of match data — this is
// fixed for the tournament regardless of results.
const officialGroups = {
  "Group A": ["Mexico", "South Korea", "South Africa", "Czech Republic"],
  "Group B": ["Canada", "Switzerland", "Qatar", "Bosnia and Herzegovina"],
  "Group C": ["Brazil", "Morocco", "Scotland", "Haiti"],
  "Group D": ["United States", "Paraguay", "Australia", "Turkey"],
  "Group E": ["Germany", "Ecuador", "Ivory Coast", "Curacao"],
  "Group F": ["Netherlands", "Japan", "Tunisia", "Sweden"],
  "Group G": ["Belgium", "Iran", "Egypt", "New Zealand"],
  "Group H": ["Spain", "Uruguay", "Saudi Arabia", "Cape Verde"],
  "Group I": ["France", "Senegal", "Norway", "Iraq"],
  "Group J": ["Argentina", "Austria", "Algeria", "Jordan"],
  "Group K": ["Portugal", "Colombia", "Uzbekistan", "DR Congo"],
  "Group L": ["England", "Croatia", "Panama", "Ghana"]
};

// Knockout round labels, used purely to identify rounds in fixture data
// once openfootball populates them. We never compute pairings ourselves —
// FIFA's Round of 32 draw depends on an official 495-scenario lookup
// table (which of the 8 best third-placed teams qualify), so we only
// display matches once the real source data confirms both teams.
const knockoutRoundOrder = [
  "Round of 32",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "Third place play-off",
  "Final"
];

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

  function findTeamKey(teamName) {
    if (stats[teamName]) return teamName;
    const lower = teamName.toLowerCase();
    for (const key of Object.keys(stats)) {
      if (key.toLowerCase() === lower) return key;
    }
    return null;
  }

  const completedMatches = [];

  matches.forEach(m => {
    const rawHome = normaliseTeamName(m.team1);
    const rawAway = normaliseTeamName(m.team2);

    const homeName = findTeamKey(rawHome) || rawHome;
    const awayName = findTeamKey(rawAway) || rawAway;

    const homeGoals = m.score && m.score.ft ? m.score.ft[0] : null;
    const awayGoals = m.score && m.score.ft ? m.score.ft[1] : null;

    if (homeGoals !== null && awayGoals !== null && typeof homeGoals === "number" && typeof awayGoals === "number") {

      let dateObj;
      try {
        let dateStr = m.date;
        if (dateStr) {
          const timePart = m.time ? m.time : "00:00:00";
          dateStr = dateStr + "T" + timePart + "Z";
          dateObj = new Date(dateStr);
          if (isNaN(dateObj.getTime())) {
            dateObj = new Date(m.date);
          }
        } else {
          dateObj = new Date();
        }
      } catch (e) {
        dateObj = new Date();
      }
      if (isNaN(dateObj.getTime())) {
        dateObj = new Date();
      }

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

      if (stats[homeName]) {
        const hs = stats[homeName];
        hs.gp++;
        hs.gf += homeGoals;
        hs.ga += awayGoals;
        if (homeGoals > awayGoals) { hs.pts += 3; hs.w++; }
        else if (homeGoals < awayGoals) { hs.l++; }
        else { hs.pts += 1; hs.d++; }
      } else {
        console.warn(`Team "${homeName}" not in draft – ignoring stats.`);
      }

      if (stats[awayName]) {
        const as = stats[awayName];
        as.gp++;
        as.gf += awayGoals;
        as.ga += homeGoals;
        if (awayGoals > homeGoals) { as.pts += 3; as.w++; }
        else if (awayGoals < homeGoals) { as.l++; }
        else { as.pts += 1; as.d++; }
      } else {
        console.warn(`Team "${awayName}" not in draft – ignoring stats.`);
      }
    }
  });

  completedMatches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { stats, matches: completedMatches };
}

function computeFriendScores(stats) {
  return friends.map(f => {
    const totalPts = f.teams.reduce((sum, t) => sum + (stats[t]?.pts || 0), 0);
    return { name: f.name, teams: f.teams, points: totalPts };
  });
}

// Builds the 12 group tables, each team's row sorted by points, then goal
// difference, then goals scored, then name (FIFA's first three tiebreakers
// — head-to-head and fair play aren't derivable from this data, so ties
// beyond GF are broken alphabetically as a stable, honest fallback).
function buildGroupStandings(stats) {
  const groups = {};
  Object.entries(officialGroups).forEach(([groupName, teams]) => {
    const rows = teams.map(team => {
      const s = stats[team] || { pts: 0, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
      return { team, ...s, gd: s.gf - s.ga };
    });
    rows.sort((a, b) =>
      (b.pts - a.pts) || (b.gd - a.gd) || (b.gf - a.gf) || a.team.localeCompare(b.team)
    );
    groups[groupName] = rows;
  });
  return groups;
}

// Ranks every group's 3rd-placed team against each other, since 8 of the
// 12 advance to the Round of 32. This is informational only — it shows
// where each third-place team currently stands, not a guaranteed outcome,
// since results are still incomplete and FIFA's official tiebreakers
// include fair play / ranking criteria we can't compute here.
function rankThirdPlaceTeams(groupStandings) {
  const thirds = Object.entries(groupStandings).map(([groupName, rows]) => ({
    group: groupName,
    ...rows[2]
  }));
  thirds.sort((a, b) => (b.pts - a.pts) || (b.gd - a.gd) || (b.gf - a.gf) || a.team.localeCompare(b.team));
  return thirds.map((t, i) => ({ ...t, provisionalRank: i + 1, inHuntForR32: i < 8 }));
}

// Separates knockout-stage matches (Round of 32 onward) from group-stage
// ones, based purely on whatever round/stage label openfootball provides.
// We never invent a pairing ourselves — a knockout match only appears here
// once the source data names both real teams.
function splitKnockoutMatches(allMatches) {
  const knockout = {};
  knockoutRoundOrder.forEach(r => { knockout[r] = []; });

  allMatches.forEach(m => {
    const stage = m.stage || "";
    const matchedRound = knockoutRoundOrder.find(r =>
      stage.toLowerCase().includes(r.toLowerCase()) ||
      (r === "Round of 32" && /round of 32|r32/i.test(stage)) ||
      (r === "Round of 16" && /round of 16|r16/i.test(stage)) ||
      (r === "Quarter-finals" && /quarter/i.test(stage)) ||
      (r === "Semi-finals" && /semi/i.test(stage)) ||
      (r === "Third place play-off" && /third.place/i.test(stage)) ||
      (r === "Final" && /^final$/i.test(stage.trim()))
    );
    if (matchedRound) knockout[matchedRound].push(m);
  });

  return knockout;
}

async function fetchOpenFootballData() {
  const res = await fetch(DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch openfootball data: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  function isMatch(obj) {
    return obj && typeof obj === "object" && "team1" in obj && "team2" in obj;
  }

  function findMatchesArray(obj) {
    if (Array.isArray(obj)) {
      if (obj.length > 0 && isMatch(obj[0])) {
        return obj;
      }
      for (const item of obj) {
        const found = findMatchesArray(item);
        if (found) return found;
      }
    } else if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj)) {
        const found = findMatchesArray(obj[key]);
        if (found) return found;
      }
    }
    return null;
  }

  let matchesArray = findMatchesArray(data);
  if (!matchesArray) {
    console.warn("Could not find any match data in the response. Returning empty array.");
    return [];
  }
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
  const groupStandings = buildGroupStandings(stats);
  const thirdPlaceRanking = rankThirdPlaceTeams(groupStandings);
  const knockout = splitKnockoutMatches(matches);

  const output = {
    generatedAt: new Date().toISOString(),
    season: 2026,
    leagueId: 1,
    totalFixturesFetched: rawMatches.length,
    completedMatches: matches.length,
    friends: friendScores,
    teamStats: stats,
    matches,
    groupStandings,
    thirdPlaceRanking,
    knockout
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
