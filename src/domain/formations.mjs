/**
 * Formation catalog: the five tactical schemes offered by the
 * `Seletor_Formacao`, each composed of exactly 11 Slots.
 *
 * Each Slot carries:
 *   - `id`: stable identifier, unique within the formation.
 *   - `position`: base `Position` from the Glossary.
 *   - `coords`: `{ xPct, yPct }` in the [0, 100] range, where (0, 0) is
 *     the top-left corner of the field area. Goalkeeper sits near the
 *     bottom (`yPct` close to 92) and forwards near the top.
 *
 * Validates: Requirements 1.1, 1.3, 1.4, 2.1
 */

import { Position } from './positions.mjs';

/**
 * Helper that freezes a slot, including its nested `coords` object,
 * so callers cannot mutate the catalog at runtime.
 */
function freezeSlot(slot) {
  Object.freeze(slot.coords);
  return Object.freeze(slot);
}

/**
 * Builds and freezes a Formacao definition.
 */
function freezeFormation({ id, label, slots }) {
  const frozenSlots = Object.freeze(slots.map(freezeSlot));
  return Object.freeze({ id, label, slots: frozenSlots });
}

const FORMATION_4_4_2 = freezeFormation({
  id: '4-4-2',
  label: '4-4-2',
  slots: [
    { id: 'GK',  position: Position.Goleiro,          coords: { xPct: 50, yPct: 92 } },
    { id: 'LB',  position: Position.Lateral_Esquerdo, coords: { xPct: 15, yPct: 75 } },
    { id: 'CB1', position: Position.Zagueiro,         coords: { xPct: 37, yPct: 78 } },
    { id: 'CB2', position: Position.Zagueiro,         coords: { xPct: 63, yPct: 78 } },
    { id: 'RB',  position: Position.Lateral_Direito,  coords: { xPct: 85, yPct: 75 } },
    { id: 'LM',  position: Position.Ponta_Esquerda,   coords: { xPct: 15, yPct: 50 } },
    { id: 'CM1', position: Position.Volante,          coords: { xPct: 37, yPct: 52 } },
    { id: 'CM2', position: Position.Volante,          coords: { xPct: 63, yPct: 52 } },
    { id: 'RM',  position: Position.Ponta_Direita,    coords: { xPct: 85, yPct: 50 } },
    { id: 'ST1', position: Position.Atacante,         coords: { xPct: 37, yPct: 20 } },
    { id: 'ST2', position: Position.Atacante,         coords: { xPct: 63, yPct: 20 } },
  ],
});

const FORMATION_4_3_3 = freezeFormation({
  id: '4-3-3',
  label: '4-3-3',
  slots: [
    { id: 'GK',  position: Position.Goleiro,          coords: { xPct: 50, yPct: 92 } },
    { id: 'LB',  position: Position.Lateral_Esquerdo, coords: { xPct: 15, yPct: 75 } },
    { id: 'CB1', position: Position.Zagueiro,         coords: { xPct: 37, yPct: 78 } },
    { id: 'CB2', position: Position.Zagueiro,         coords: { xPct: 63, yPct: 78 } },
    { id: 'RB',  position: Position.Lateral_Direito,  coords: { xPct: 85, yPct: 75 } },
    { id: 'DM',  position: Position.Volante,          coords: { xPct: 50, yPct: 58 } },
    { id: 'CM1', position: Position.Meia_Central,     coords: { xPct: 32, yPct: 45 } },
    { id: 'CM2', position: Position.Meia_Central,     coords: { xPct: 68, yPct: 45 } },
    { id: 'LW',  position: Position.Ponta_Esquerda,   coords: { xPct: 18, yPct: 22 } },
    { id: 'ST',  position: Position.Atacante,         coords: { xPct: 50, yPct: 15 } },
    { id: 'RW',  position: Position.Ponta_Direita,    coords: { xPct: 82, yPct: 22 } },
  ],
});

const FORMATION_3_5_2 = freezeFormation({
  id: '3-5-2',
  label: '3-5-2',
  slots: [
    { id: 'GK',  position: Position.Goleiro,          coords: { xPct: 50, yPct: 92 } },
    { id: 'CB1', position: Position.Zagueiro,         coords: { xPct: 25, yPct: 78 } },
    { id: 'CB2', position: Position.Zagueiro,         coords: { xPct: 50, yPct: 80 } },
    { id: 'CB3', position: Position.Zagueiro,         coords: { xPct: 75, yPct: 78 } },
    { id: 'LWB', position: Position.Lateral_Esquerdo, coords: { xPct: 10, yPct: 50 } },
    { id: 'CM1', position: Position.Meia_Central,     coords: { xPct: 32, yPct: 45 } },
    { id: 'DM',  position: Position.Volante,          coords: { xPct: 50, yPct: 55 } },
    { id: 'CM2', position: Position.Meia_Central,     coords: { xPct: 68, yPct: 45 } },
    { id: 'RWB', position: Position.Lateral_Direito,  coords: { xPct: 90, yPct: 50 } },
    { id: 'ST1', position: Position.Atacante,         coords: { xPct: 37, yPct: 20 } },
    { id: 'ST2', position: Position.Atacante,         coords: { xPct: 63, yPct: 20 } },
  ],
});

const FORMATION_4_2_3_1 = freezeFormation({
  id: '4-2-3-1',
  label: '4-2-3-1',
  slots: [
    { id: 'GK',  position: Position.Goleiro,          coords: { xPct: 50, yPct: 92 } },
    { id: 'LB',  position: Position.Lateral_Esquerdo, coords: { xPct: 15, yPct: 75 } },
    { id: 'CB1', position: Position.Zagueiro,         coords: { xPct: 37, yPct: 78 } },
    { id: 'CB2', position: Position.Zagueiro,         coords: { xPct: 63, yPct: 78 } },
    { id: 'RB',  position: Position.Lateral_Direito,  coords: { xPct: 85, yPct: 75 } },
    { id: 'DM1', position: Position.Volante,          coords: { xPct: 37, yPct: 58 } },
    { id: 'DM2', position: Position.Volante,          coords: { xPct: 63, yPct: 58 } },
    { id: 'LW',  position: Position.Ponta_Esquerda,   coords: { xPct: 18, yPct: 35 } },
    { id: 'AM',  position: Position.Meia_Ofensivo,    coords: { xPct: 50, yPct: 35 } },
    { id: 'RW',  position: Position.Ponta_Direita,    coords: { xPct: 82, yPct: 35 } },
    { id: 'ST',  position: Position.Atacante,         coords: { xPct: 50, yPct: 15 } },
  ],
});

const FORMATION_5_3_2 = freezeFormation({
  id: '5-3-2',
  label: '5-3-2',
  slots: [
    { id: 'GK',  position: Position.Goleiro,          coords: { xPct: 50, yPct: 92 } },
    { id: 'LWB', position: Position.Lateral_Esquerdo, coords: { xPct: 10, yPct: 70 } },
    { id: 'CB1', position: Position.Zagueiro,         coords: { xPct: 28, yPct: 78 } },
    { id: 'CB2', position: Position.Zagueiro,         coords: { xPct: 50, yPct: 80 } },
    { id: 'CB3', position: Position.Zagueiro,         coords: { xPct: 72, yPct: 78 } },
    { id: 'RWB', position: Position.Lateral_Direito,  coords: { xPct: 90, yPct: 70 } },
    { id: 'CM1', position: Position.Meia_Central,     coords: { xPct: 28, yPct: 48 } },
    { id: 'DM',  position: Position.Volante,          coords: { xPct: 50, yPct: 55 } },
    { id: 'CM2', position: Position.Meia_Central,     coords: { xPct: 72, yPct: 48 } },
    { id: 'ST1', position: Position.Atacante,         coords: { xPct: 37, yPct: 20 } },
    { id: 'ST2', position: Position.Atacante,         coords: { xPct: 63, yPct: 20 } },
  ],
});

/**
 * Catalog of formations indexed by their public `FormationId`.
 *
 * Order of declaration matches the order presented to the user in the
 * `Seletor_Formacao` (Requirement 1.1).
 */
export const FORMATIONS = Object.freeze({
  '4-4-2':   FORMATION_4_4_2,
  '4-3-3':   FORMATION_4_3_3,
  '3-5-2':   FORMATION_3_5_2,
  '4-2-3-1': FORMATION_4_2_3_1,
  '5-3-2':   FORMATION_5_3_2,
});

// Stable iteration order used by `listFormations`. Matches the button
// order required by Requirement 1.1.
const FORMATION_ORDER = Object.freeze([
  FORMATION_4_4_2,
  FORMATION_4_3_3,
  FORMATION_3_5_2,
  FORMATION_4_2_3_1,
  FORMATION_5_3_2,
]);

/**
 * Returns the Formacao with the given id, or `undefined` when the id
 * does not match any registered formation. Returns `undefined` for any
 * non-string input as well.
 *
 * @param {unknown} id
 * @returns {Readonly<Formacao> | undefined}
 */
export function getFormation(id) {
  if (typeof id !== 'string') return undefined;
  return Object.prototype.hasOwnProperty.call(FORMATIONS, id)
    ? FORMATIONS[id]
    : undefined;
}

/**
 * Returns all five formations in their declared order.
 *
 * @returns {ReadonlyArray<Readonly<Formacao>>}
 */
export function listFormations() {
  return FORMATION_ORDER;
}
