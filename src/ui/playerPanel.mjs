// src/ui/playerPanel.mjs
//
// Right panel: BOX SCORE only.
// Club/edition selectors and candidate list moved to the left sidebar.

import { getOccupant } from '../domain/team.mjs';
import { getFormation } from '../domain/formations.mjs';
import { abbreviatePosition } from './formatters.mjs';

/**
 * Creates the right panel with box score.
 */
export function createPlayerPanel(store, repo) {
  const panel = document.createElement('div');
  panel.classList.add('panel');

  // ===================== BOX SCORE =====================
  const boxScoreSection = document.createElement('div');
  boxScoreSection.classList.add('box-score');

  const boxTitle = document.createElement('div');
  boxTitle.classList.add('box-score-header');
  boxTitle.innerHTML = '<span class="box-score-title">BOX SCORE</span><span class="box-score-count">0/11</span>';
  boxScoreSection.appendChild(boxTitle);

  const boxList = document.createElement('div');
  boxList.classList.add('box-score-list');
  boxScoreSection.appendChild(boxList);

  panel.appendChild(boxScoreSection);

  // ===================== RENDER =====================

  function renderBoxScore() {
    const state = store.getState();
    boxList.innerHTML = '';

    const formation = state.activeFormationId ? getFormation(state.activeFormationId) : null;
    if (!formation) {
      boxList.innerHTML = '<div class="box-score-empty">Selecione uma formação</div>';
      boxTitle.querySelector('.box-score-count').textContent = '0/11';
      return;
    }

    let count = 0;
    for (let i = 0; i < formation.slots.length; i++) {
      const slot = formation.slots[i];
      const occupantId = getOccupant(state.team, slot.id);
      const row = document.createElement('div');
      row.classList.add('box-score-row');

      const posLabel = document.createElement('span');
      posLabel.classList.add('box-score-pos');
      posLabel.textContent = abbreviatePosition(slot.position);

      const nameLabel = document.createElement('span');
      nameLabel.classList.add('box-score-name');

      const ratingLabel = document.createElement('span');
      ratingLabel.classList.add('box-score-rating');

      if (occupantId != null) {
        count++;
        let registration = null;
        if (repo.registrationsById instanceof Map) {
          registration = repo.registrationsById.get(occupantId) ?? null;
        } else if (repo.registrationsById) {
          registration = repo.registrationsById[occupantId] ?? null;
        }

        if (registration) {
          const player = repo.playersById instanceof Map
            ? repo.playersById.get(registration.playerId)
            : repo.playersById[registration.playerId];
          nameLabel.textContent = player ? player.name : '—';
          ratingLabel.textContent = registration.rating != null ? String(registration.rating) : '—';
        } else {
          nameLabel.textContent = '—';
          ratingLabel.textContent = '—';
        }
        row.classList.add('is-filled');
      } else {
        nameLabel.textContent = '—';
        ratingLabel.textContent = '';
      }

      row.appendChild(posLabel);
      row.appendChild(nameLabel);
      row.appendChild(ratingLabel);
      boxList.appendChild(row);
    }

    boxTitle.querySelector('.box-score-count').textContent = `${count}/11`;
  }

  // Subscribe
  store.subscribe(renderBoxScore);
  renderBoxScore();

  return panel;
}
