// src/ui/playerCard.mjs
//
// Compact player card with click-to-assign flow.
// Clicking a card enters slot-picking mode on the field.

import { abbreviatePosition } from './formatters.mjs';

/**
 * Creates a player card DOM element.
 *
 * @param {object} params
 * @param {object} params.registration
 * @param {object} params.player
 * @param {string} params.registrationId
 * @param {number} [params.index]
 * @param {object} [params.store] - store instance for click-to-assign
 * @returns {HTMLElement}
 */
export function createPlayerCard({ registration, player, registrationId, index, store }) {
  const card = document.createElement('div');
  card.classList.add('player-card');

  // --- Number ---
  if (index != null) {
    const numEl = document.createElement('span');
    numEl.classList.add('player-number');
    numEl.textContent = `#${index}`;
    card.appendChild(numEl);
  }

  // --- Player name ---
  const nameEl = document.createElement('span');
  nameEl.classList.add('player-name');
  nameEl.textContent = player.name;
  card.appendChild(nameEl);

  // --- Position chips (abbreviated) ---
  const positionsEl = document.createElement('span');
  positionsEl.classList.add('player-positions');

  const positions = registration.positions;
  if (!positions || positions.length === 0) {
    positionsEl.classList.add('positions-missing');
  } else {
    for (const pos of positions) {
      const posSpan = document.createElement('span');
      posSpan.classList.add('pos', `pos-${pos}`);
      posSpan.textContent = abbreviatePosition(pos);
      positionsEl.appendChild(posSpan);
    }
  }
  card.appendChild(positionsEl);

  // --- Rating ---
  const ratingEl = document.createElement('span');
  ratingEl.classList.add('player-rating');
  if (registration.rating == null) {
    ratingEl.textContent = '—';
    ratingEl.classList.add('rating-missing');
  } else {
    ratingEl.textContent = String(registration.rating);
  }
  card.appendChild(ratingEl);

  // --- Click to start assignment ---
  card.addEventListener('click', () => {
    if (store && typeof store.startAssignment === 'function') {
      store.startAssignment(registrationId, positions || []);
    }
  });

  return card;
}
