// formatters.mjs — Pure UI formatting helpers (no DOM access).
//
// These helpers underpin the field rendering and are designed to be trivial
// to property-test: each function is a pure mapping from primitive inputs
// to a primitive output, with no side effects.
//
// Validates:
//   - Property 4 (Slot label truncation)        — Requirements 2.2, 2.3
//   - Property 6 (Empty vs occupied slot class) — Requirements 2.4, 6.2

/** Maximum number of characters allowed in a slot label before truncation. */
export const SLOT_LABEL_MAX_LENGTH = 20;

/** Single Unicode ellipsis character used as truncation suffix. */
export const ELLIPSIS = '\u2026'; // …

/**
 * Format a label for display inside a slot circle.
 *
 * Contract (Property 4):
 *   - The output length is always ≤ SLOT_LABEL_MAX_LENGTH (20).
 *   - When `s.length <= 20`, the output is exactly `s` (identity).
 *   - When `s.length > 20`, the output is `s.slice(0, 19) + '…'`,
 *     which has length exactly 20 and ends with the single-char ellipsis.
 *
 * Non-string inputs are coerced to string defensively so the function never
 * throws when called from rendering code that may pass an undefined/null
 * placeholder.
 *
 * @param {string} s
 * @returns {string}
 */
export function formatSlotLabel(s) {
  const str = typeof s === 'string' ? s : s == null ? '' : String(s);
  if (str.length <= SLOT_LABEL_MAX_LENGTH) {
    return str;
  }
  return str.slice(0, SLOT_LABEL_MAX_LENGTH - 1) + ELLIPSIS;
}

/**
 * Compute the CSS class string for a slot circle.
 *
 * Contract (Property 6):
 *   - Returns a class with the `is-empty` modifier when `occupant === null`.
 *   - Returns a class with the `is-occupied` modifier when the slot has any
 *     occupant (a registrationId string or a registration-shaped object).
 *   - The two outputs are observably distinct, satisfying Requirement 2.4
 *     (visual differentiation between empty and occupied slot states).
 *
 * The `slot` argument is accepted for API symmetry with future styling needs
 * (e.g., per-position variants) but is not currently used to compose extra
 * classes; keeping the output minimal makes Property 6 easy to verify.
 *
 * @param {{ id?: string, position?: string } | null | undefined} _slot
 * @param {string | object | null | undefined} occupant
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
export function slotClassName(_slot, occupant) {
  return occupant === null || occupant === undefined
    ? 'slot is-empty'
    : 'slot is-occupied';
}

/**
 * Map of full position names to short abbreviations for field display.
 */
const POSITION_ABBREVIATIONS = Object.freeze({
  Goleiro: 'GOL',
  Zagueiro: 'ZAG',
  Lateral_Esquerdo: 'LE',
  Lateral_Direito: 'LD',
  Volante: 'VOL',
  Meia_Central: 'MC',
  Meia_Ofensivo: 'MEI',
  Ponta_Esquerda: 'PE',
  Ponta_Direita: 'PD',
  Atacante: 'ATA',
});

/**
 * Returns the short abbreviation for a position name.
 * Falls back to the first 3 characters uppercase if not found.
 *
 * @param {string} position
 * @returns {string}
 */
export function abbreviatePosition(position) {
  if (typeof position !== 'string') return '';
  return POSITION_ABBREVIATIONS[position] ?? position.slice(0, 3).toUpperCase();
}
