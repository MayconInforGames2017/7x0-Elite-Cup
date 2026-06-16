// src/ui/fieldView.mjs
//
// Renders the green field with slot circles positioned according to the
// active formation. Each circle shows either the player name (when
// occupied) or the position name (when empty), truncated per the
// formatSlotLabel contract.
//
// Validates: Requirements 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.4, 6.1, 6.2

import { formatSlotLabel, slotClassName, abbreviatePosition } from './formatters.mjs';
import { getFormation } from '../domain/formations.mjs';
import { getOccupant } from '../domain/team.mjs';

/**
 * Creates the FieldView component. Subscribes to the store and
 * re-renders slot circles whenever the active formation or team
 * changes.
 *
 * @param {ReturnType<import('../state/store.mjs').createStore>} store
 * @param {{ repo?: { playersById?: Map<string, { name: string }> | Record<string, { name: string }> } }} [deps]
 * @returns {HTMLElement}
 */
export function createFieldView(store, deps) {
  const container = document.createElement('div');
  container.className = 'field';

  /**
   * Resolves a player name from the repo given a registrationId.
   * Returns null when the player cannot be resolved.
   *
   * @param {string} registrationId
   * @returns {string|null}
   */
  function resolvePlayerName(registrationId) {
    if (deps == null || deps.repo == null) return null;

    const repo = deps.repo;

    // Look up the registration to get playerId.
    let registration = null;
    if (repo.registrationsById != null) {
      if (repo.registrationsById instanceof Map) {
        registration = repo.registrationsById.get(registrationId) ?? null;
      } else {
        registration = repo.registrationsById[registrationId] ?? null;
      }
    }

    if (registration == null || registration.playerId == null) return null;

    // Look up the player to get the name.
    const playersById = repo.playersById;
    if (playersById == null) return null;

    let player = null;
    if (playersById instanceof Map) {
      player = playersById.get(registration.playerId) ?? null;
    } else {
      player = playersById[registration.playerId] ?? null;
    }

    return player != null && typeof player.name === 'string' ? player.name : null;
  }

  /**
   * Computes the Y offset based on tactical style.
   * Defensive pushes slots down (toward own goal), offensive pushes up.
   * The GK (yPct >= 90) is excluded from shifting.
   *
   * @param {number} originalYPct
   * @param {string} style - 'defensive' | 'balanced' | 'offensive'
   * @returns {number}
   */
  function applyTacticalOffset(originalYPct, style) {
    // Don't shift the goalkeeper
    if (originalYPct >= 88) return originalYPct;
    const offset = style === 'defensive' ? 6 : style === 'offensive' ? -6 : 0;
    return Math.max(5, Math.min(85, originalYPct + offset));
  }

  /**
   * Renders the field content based on the current store state.
   */
  function render() {
    const state = store.getState();
    const tacticalStyle = state.tacticalStyle || 'balanced';
    container.innerHTML = '';

    // No active formation: show empty placeholder (Requirement 1.7).
    if (state.activeFormationId === null) {
      const placeholder = document.createElement('div');
      placeholder.className = 'field-empty';
      placeholder.textContent = 'Selecione uma formação';
      container.appendChild(placeholder);
      return;
    }

    // Active formation: render one circle per slot.
    const formation = getFormation(state.activeFormationId);
    if (formation === undefined) return;

    for (let i = 0; i < formation.slots.length; i++) {
      const slot = formation.slots[i];
      const slotNumber = i + 1; // 1-based numbering
      const occupantId = getOccupant(state.team, slot.id);

      // Label: number when occupied, position abbreviation when empty.
      const abbrev = abbreviatePosition(slot.position);
      let labelText;
      let tooltipText = null;

      if (occupantId !== null) {
        labelText = String(slotNumber);
        const playerName = resolvePlayerName(occupantId);
        if (playerName != null) {
          tooltipText = `${slotNumber}. ${playerName}`;
        } else {
          tooltipText = `${slotNumber}. ${abbrev}`;
        }
      } else {
        labelText = abbrev;
      }

      const displayLabel = formatSlotLabel(labelText);
      const className = slotClassName(slot, occupantId);

      // Create the slot element.
      const circle = document.createElement('div');
      circle.className = className;
      circle.style.left = `${slot.coords.xPct}%`;
      circle.style.top = `${applyTacticalOffset(slot.coords.yPct, tacticalStyle)}%`;
      circle.dataset.slotId = slot.id;

      // Tooltip
      if (tooltipText != null) {
        circle.title = tooltipText;
      }

      // Pending assignment: highlight compatible empty slots
      const pending = state.pendingAssignment;
      if (pending != null && occupantId === null) {
        const isCompatible = pending.positions.includes(slot.position);
        if (isCompatible) {
          circle.classList.add('is-pick-target');
        }
      }

      // Label span.
      const labelSpan = document.createElement('span');
      labelSpan.className = 'slot-label';
      labelSpan.textContent = displayLabel;
      circle.appendChild(labelSpan);

      // Remove button for occupied slots.
      // Removed: no more X button on slots. Use box score or re-click to manage.

      // Click to confirm assignment when in picking mode
      circle.addEventListener('click', () => {
        const currentState = store.getState();
        if (currentState.pendingAssignment != null) {
          store.confirmAssignment(slot.id);
        }
      });

      container.appendChild(circle);
    }

    // If in picking mode, listen for escape or click-outside to cancel
    if (state.pendingAssignment != null) {
      container.classList.add('is-picking');
    } else {
      container.classList.remove('is-picking');
    }
  }

  // Initial render.
  render();

  // Subscribe to store changes.
  store.subscribe(render);

  // Escape key cancels picking mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      store.cancelAssignment();
    }
  });

  return container;
}
