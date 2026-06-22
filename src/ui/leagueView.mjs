// src/ui/leagueView.mjs
//
// Progressive league simulation — shows match by match with
// "PRÓXIMO JOGO →" button. Only shows final standings after all matches.

import { simulateLeague, buildLeagueTeams } from '../domain/league.mjs';

/**
 * @param {object} store
 * @param {object} repo
 * @returns {{ container: HTMLElement, startBtn: HTMLButtonElement }}
 */
export function createLeagueView(store, repo) {
  const container = document.createElement('div');
  container.className = 'league-view';
  container.style.display = 'none';

  const content = document.createElement('div');
  content.className = 'league-content';
  container.appendChild(content);

  // Start button (appended to sidebar externally)
  const startBtn = document.createElement('button');
  startBtn.className = 'league-start-button';
  startBtn.textContent = '⚽ INICIAR LIGA';
  startBtn.style.display = 'none';

  let currentMatchIndex = 0;
  let allResults = [];
  let teams = [];
  let userTeamName = '';

  /**
   * Gets user team name from last filter selection.
   */
  function getUserTeamName(state) {
    const clubId = state.filter.clubId;
    const editionId = state.filter.editionId;
    if (clubId && editionId) {
      const club = repo.clubsById instanceof Map
        ? repo.clubsById.get(clubId)
        : (repo.clubsById || {})[clubId];
      const edition = repo.editionsById instanceof Map
        ? repo.editionsById.get(editionId)
        : (repo.editionsById || {})[editionId];
      const clubName = club ? club.name : clubId;
      const season = edition ? edition.season : editionId;
      return `${clubName} ${season}`;
    }
    return 'Meu Time';
  }

  /**
   * Computes user team strength from assigned players.
   */
  function getUserStrength(state) {
    if (!state.team || !state.team.assignments) return 75;
    let total = 0;
    let count = 0;
    for (const regId of Object.values(state.team.assignments)) {
      if (regId == null) continue;
      let reg = null;
      if (repo.registrationsById instanceof Map) {
        reg = repo.registrationsById.get(regId);
      } else if (repo.registrationsById) {
        reg = repo.registrationsById[regId];
      }
      if (reg && reg.rating != null) {
        total += reg.rating;
        count++;
      }
    }
    return count > 0 ? Math.round(total / count) : 75;
  }

  /**
   * Resolves team name from id.
   */
  function teamName(teamId) {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : teamId;
  }

  /**
   * Starts the simulation and shows the first match.
   */
  function startSimulation() {
    const state = store.getState();
    userTeamName = getUserTeamName(state);
    const userStrength = getUserStrength(state);

    teams = buildLeagueTeams({ userTeamName, userStrength, repo });
    const result = simulateLeague(teams);
    allResults = result.results;
    currentMatchIndex = 0;

    container.style.display = 'flex';
    startBtn.style.display = 'none';

    renderCurrentMatch();
  }

  /**
   * Renders the current match view.
   */
  function renderCurrentMatch() {
    content.innerHTML = '';

    if (currentMatchIndex >= allResults.length) {
      // All matches done — show final standings
      renderFinalStandings();
      return;
    }

    const match = allResults[currentMatchIndex];
    const homeName = teamName(match.home);
    const awayName = teamName(match.away);
    const isUserMatch = match.home === 'user-team' || match.away === 'user-team';
    const roundNum = currentMatchIndex + 1;
    const totalMatches = allResults.length;

    // Header
    const header = document.createElement('div');
    header.className = 'match-header';
    header.innerHTML = `
      <span class="match-round">RODADA ${roundNum} / ${totalMatches}</span>
      <div class="match-progress-bar">
        <div class="match-progress-fill" style="width: ${(roundNum / totalMatches) * 100}%"></div>
      </div>
    `;
    content.appendChild(header);

    // Match card
    const matchCard = document.createElement('div');
    matchCard.className = `match-card${isUserMatch ? ' is-user-match' : ''}`;

    const scoreDisplay = `${match.homeGoals} – ${match.awayGoals}`;
    const homeWin = match.homeGoals > match.awayGoals;
    const awayWin = match.awayGoals > match.homeGoals;

    matchCard.innerHTML = `
      <div class="match-teams">
        <span class="match-team ${homeWin ? 'is-winner' : ''} ${match.home === 'user-team' ? 'is-user' : ''}">${homeName}</span>
        <span class="match-score">${scoreDisplay}</span>
        <span class="match-team ${awayWin ? 'is-winner' : ''} ${match.away === 'user-team' ? 'is-user' : ''}">${awayName}</span>
      </div>
    `;
    content.appendChild(matchCard);

    // Goal events (simulated minutes)
    if (match.homeGoals > 0 || match.awayGoals > 0) {
      const events = document.createElement('div');
      events.className = 'match-events';

      const allGoals = [];
      for (let i = 0; i < match.homeGoals; i++) {
        allGoals.push({ team: homeName, minute: randomMinute() });
      }
      for (let i = 0; i < match.awayGoals; i++) {
        allGoals.push({ team: awayName, minute: randomMinute() });
      }
      allGoals.sort((a, b) => a.minute - b.minute);

      for (const goal of allGoals) {
        const ev = document.createElement('div');
        ev.className = 'match-event';
        ev.textContent = `${goal.minute}' ⚽ ${goal.team}`;
        events.appendChild(ev);
      }
      content.appendChild(events);
    }

    // Next match button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'match-next-button';

    if (currentMatchIndex < allResults.length - 1) {
      nextBtn.textContent = 'PRÓXIMO JOGO →';
    } else {
      nextBtn.textContent = 'VER CLASSIFICAÇÃO →';
    }

    nextBtn.addEventListener('click', () => {
      currentMatchIndex++;
      renderCurrentMatch();
    });
    content.appendChild(nextBtn);

    // Skip to end button
    const skipBtn = document.createElement('button');
    skipBtn.className = 'match-skip-button';
    skipBtn.textContent = 'Pular para classificação';
    skipBtn.addEventListener('click', () => {
      currentMatchIndex = allResults.length;
      renderCurrentMatch();
    });
    content.appendChild(skipBtn);
  }

  /**
   * Renders final standings after all matches.
   */
  function renderFinalStandings() {
    content.innerHTML = '';

    // Compute standings from results
    const table = new Map();
    for (const team of teams) {
      table.set(team.id, {
        teamId: team.id,
        name: team.name,
        played: 0, won: 0, drawn: 0, lost: 0,
        gf: 0, ga: 0, gd: 0, points: 0,
      });
    }

    for (const match of allResults) {
      const h = table.get(match.home);
      const a = table.get(match.away);
      if (!h || !a) continue;

      h.played++; a.played++;
      h.gf += match.homeGoals; h.ga += match.awayGoals;
      a.gf += match.awayGoals; a.ga += match.homeGoals;

      if (match.homeGoals > match.awayGoals) {
        h.won++; h.points += 3; a.lost++;
      } else if (match.homeGoals < match.awayGoals) {
        a.won++; a.points += 3; h.lost++;
      } else {
        h.drawn++; a.drawn++; h.points += 1; a.points += 1;
      }
    }

    for (const row of table.values()) {
      row.gd = row.gf - row.ga;
    }

    const standings = [...table.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    });

    const champion = standings[0];
    const userPos = standings.findIndex(r => r.name === userTeamName) + 1;

    // Champion announcement
    const announce = document.createElement('div');
    announce.className = 'league-champion-announce';
    announce.innerHTML = `
      <div class="champion-trophy">🏆</div>
      <div class="champion-label">CAMPEÃO DA ELITE CUP</div>
      <div class="champion-name">${champion.name}</div>
      <div class="champion-stats">${champion.points} pts · ${champion.won}V ${champion.drawn}E ${champion.lost}D</div>
      ${userPos > 1 ? `<div class="user-position">Seu time: ${userPos}º lugar</div>` : ''}
    `;
    content.appendChild(announce);

    // Table
    const tableEl = document.createElement('table');
    tableEl.className = 'league-table';
    tableEl.innerHTML = `
      <thead>
        <tr>
          <th class="col-pos">#</th>
          <th class="col-team">Time</th>
          <th class="col-num">J</th>
          <th class="col-num">V</th>
          <th class="col-num">E</th>
          <th class="col-num">D</th>
          <th class="col-num">GP</th>
          <th class="col-num">GC</th>
          <th class="col-num">SG</th>
          <th class="col-num col-pts">PTS</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');
    for (let i = 0; i < standings.length; i++) {
      const row = standings[i];
      const tr = document.createElement('tr');
      if (row.name === userTeamName) tr.classList.add('is-user-team');
      if (i === 0) tr.classList.add('is-champion');

      tr.innerHTML = `
        <td class="col-pos">${i + 1}</td>
        <td class="col-team">${row.name}</td>
        <td class="col-num">${row.played}</td>
        <td class="col-num">${row.won}</td>
        <td class="col-num">${row.drawn}</td>
        <td class="col-num">${row.lost}</td>
        <td class="col-num">${row.gf}</td>
        <td class="col-num">${row.ga}</td>
        <td class="col-num">${row.gd > 0 ? '+' : ''}${row.gd}</td>
        <td class="col-num col-pts">${row.points}</td>
      `;
      tbody.appendChild(tr);
    }
    tableEl.appendChild(tbody);
    content.appendChild(tableEl);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'league-final-buttons';

    const againBtn = document.createElement('button');
    againBtn.className = 'league-restart-button';
    againBtn.textContent = '🔄 SIMULAR NOVAMENTE';
    againBtn.addEventListener('click', startSimulation);
    btnRow.appendChild(againBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'league-close-button';
    closeBtn.textContent = '✕ FECHAR';
    closeBtn.addEventListener('click', () => {
      container.style.display = 'none';
      startBtn.style.display = 'block';
    });
    btnRow.appendChild(closeBtn);

    content.appendChild(btnRow);
  }

  // Utils
  function randomMinute() {
    return Math.floor(Math.random() * 90) + 1;
  }

  // Events
  startBtn.addEventListener('click', startSimulation);

  // Also listen for the inline button's custom event
  document.addEventListener('elite-cup:start-league', startSimulation);

  // Check team completeness — hide the external startBtn (we use inline now)
  function checkTeamComplete(state) {
    startBtn.style.display = 'none'; // always hidden, we use inline button
    if (!state.team || !state.team.assignments) return;
    const count = Object.values(state.team.assignments).filter(v => v != null).length;
    if (count < 11) container.style.display = 'none';
  }

  store.subscribe(checkTeamComplete);
  checkTeamComplete(store.getState());

  return { container, startBtn };
}
