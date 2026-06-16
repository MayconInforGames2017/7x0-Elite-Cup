// src/domain/league.mjs
//
// League simulation engine.
// Simulates a round-robin league (home & away) with results
// based on team strength (average rating).

/**
 * @typedef {{ id: string, name: string, strength: number }} LeagueTeam
 * @typedef {{ home: string, away: string, homeGoals: number, awayGoals: number }} MatchResult
 * @typedef {{ teamId: string, name: string, played: number, won: number, drawn: number, lost: number, gf: number, ga: number, gd: number, points: number }} StandingRow
 */

/**
 * Simulates a match result based on team strengths.
 * Uses weighted randomness so stronger teams win more often but upsets happen.
 *
 * @param {number} homeStrength - 0-100
 * @param {number} awayStrength - 0-100
 * @returns {{ homeGoals: number, awayGoals: number }}
 */
function simulateMatch(homeStrength, awayStrength) {
  // Home advantage: +5 to effective strength
  const homeEff = homeStrength + 5;
  const awayEff = awayStrength;

  // Expected goals based on strength ratio (typical 1-3 goals per side)
  const homeExpected = (homeEff / 80) * 1.8;
  const awayExpected = (awayEff / 80) * 1.4;

  // Poisson-like random goal generation
  const homeGoals = poissonRandom(homeExpected);
  const awayGoals = poissonRandom(awayExpected);

  return { homeGoals, awayGoals };
}

/**
 * Simple Poisson random number generator.
 * @param {number} lambda - expected value
 * @returns {number}
 */
function poissonRandom(lambda) {
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/**
 * Generates all fixtures (home & away) for a league.
 * @param {LeagueTeam[]} teams
 * @returns {Array<{ home: string, away: string }>}
 */
function generateFixtures(teams) {
  const fixtures = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = 0; j < teams.length; j++) {
      if (i !== j) {
        fixtures.push({ home: teams[i].id, away: teams[j].id });
      }
    }
  }
  // Shuffle for variety
  for (let i = fixtures.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fixtures[i], fixtures[j]] = [fixtures[j], fixtures[i]];
  }
  return fixtures;
}

/**
 * Simulates a full league season.
 *
 * @param {LeagueTeam[]} teams - array of teams with id, name, strength
 * @returns {{ standings: StandingRow[], results: MatchResult[], topScorer: { team: string, goals: number } }}
 */
export function simulateLeague(teams) {
  if (teams.length < 2) {
    return { standings: [], results: [], topScorer: null };
  }

  const strengthMap = new Map(teams.map(t => [t.id, t.strength]));
  const fixtures = generateFixtures(teams);

  /** @type {Map<string, StandingRow>} */
  const table = new Map();
  for (const team of teams) {
    table.set(team.id, {
      teamId: team.id,
      name: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    });
  }

  const results = [];

  for (const fixture of fixtures) {
    const homeStr = strengthMap.get(fixture.home) || 70;
    const awayStr = strengthMap.get(fixture.away) || 70;
    const { homeGoals, awayGoals } = simulateMatch(homeStr, awayStr);

    results.push({
      home: fixture.home,
      away: fixture.away,
      homeGoals,
      awayGoals,
    });

    const homeRow = table.get(fixture.home);
    const awayRow = table.get(fixture.away);

    homeRow.played++;
    awayRow.played++;
    homeRow.gf += homeGoals;
    homeRow.ga += awayGoals;
    awayRow.gf += awayGoals;
    awayRow.ga += homeGoals;

    if (homeGoals > awayGoals) {
      homeRow.won++;
      homeRow.points += 3;
      awayRow.lost++;
    } else if (homeGoals < awayGoals) {
      awayRow.won++;
      awayRow.points += 3;
      homeRow.lost++;
    } else {
      homeRow.drawn++;
      awayRow.drawn++;
      homeRow.points += 1;
      awayRow.points += 1;
    }
  }

  // Update GD
  for (const row of table.values()) {
    row.gd = row.gf - row.ga;
  }

  // Sort: points desc, GD desc, GF desc
  const standings = [...table.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });

  // Top scorer team
  const topScorer = standings.length > 0
    ? { team: standings[0].name, goals: standings[0].gf }
    : null;

  return { standings, results, topScorer };
}

/**
 * Builds league teams from the repository.
 * User team uses actual player ratings; AI teams use average registration ratings.
 *
 * @param {object} params
 * @param {string} params.userTeamName - e.g. "Real Madrid 1961-62"
 * @param {number} params.userStrength - average rating of user's 11 players
 * @param {object} params.repo - the data repository
 * @returns {LeagueTeam[]}
 */
export function buildLeagueTeams({ userTeamName, userStrength, repo }) {
  const teams = [];

  // User team
  teams.push({
    id: 'user-team',
    name: userTeamName,
    strength: userStrength,
  });

  // AI teams: one per club in the repo, with strength = average rating of all their registrations
  const clubRatings = new Map(); // clubId -> { totalRating, count, name }

  const allRegistrations = repo.registrationsById instanceof Map
    ? [...repo.registrationsById.values()]
    : Object.values(repo.registrationsById || {});

  for (const reg of allRegistrations) {
    if (reg.rating == null) continue;
    const existing = clubRatings.get(reg.clubId);
    if (existing) {
      existing.totalRating += reg.rating;
      existing.count++;
    } else {
      const club = repo.clubsById instanceof Map
        ? repo.clubsById.get(reg.clubId)
        : (repo.clubsById || {})[reg.clubId];
      clubRatings.set(reg.clubId, {
        totalRating: reg.rating,
        count: 1,
        name: club ? club.name : reg.clubId,
      });
    }
  }

  for (const [clubId, data] of clubRatings) {
    const avgRating = Math.round(data.totalRating / data.count);
    teams.push({
      id: clubId,
      name: data.name,
      strength: avgRating,
    });
  }

  return teams;
}
