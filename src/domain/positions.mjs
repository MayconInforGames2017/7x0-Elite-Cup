/**
 * Domain enum of valid playing positions.
 *
 * Source of truth for the 10 positions defined in the Glossary
 * (requirements.md):
 *   Goleiro, Zagueiro, Lateral_Esquerdo, Lateral_Direito, Volante,
 *   Meia_Central, Meia_Ofensivo, Ponta_Esquerda, Ponta_Direita, Atacante.
 *
 * Validates: Requirements 1.4, 7.6
 */

export const Position = Object.freeze({
  Goleiro: 'Goleiro',
  Zagueiro: 'Zagueiro',
  Lateral_Esquerdo: 'Lateral_Esquerdo',
  Lateral_Direito: 'Lateral_Direito',
  Volante: 'Volante',
  Meia_Central: 'Meia_Central',
  Meia_Ofensivo: 'Meia_Ofensivo',
  Ponta_Esquerda: 'Ponta_Esquerda',
  Ponta_Direita: 'Ponta_Direita',
  Atacante: 'Atacante',
});

/**
 * Frozen array containing the 10 position string values, in the order
 * declared in the Glossary.
 */
export const ALL_POSITIONS = Object.freeze([
  Position.Goleiro,
  Position.Zagueiro,
  Position.Lateral_Esquerdo,
  Position.Lateral_Direito,
  Position.Volante,
  Position.Meia_Central,
  Position.Meia_Ofensivo,
  Position.Ponta_Esquerda,
  Position.Ponta_Direita,
  Position.Atacante,
]);

// Internal Set for O(1) lookup. Frozen array above is preserved for
// callers that need ordered iteration.
const POSITION_SET = new Set(ALL_POSITIONS);

/**
 * Returns true only when `value` is a string equal to one of the
 * 10 valid positions. Returns false for any non-string input
 * (null, undefined, numbers, objects, arrays, booleans, symbols, etc.).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPosition(value) {
  return typeof value === 'string' && POSITION_SET.has(value);
}
