// src/domain/filter.mjs
//
// Filtragem e ordenação de Inscricao_Jogador para exibição no
// Painel_Jogadores. Módulo puro: sem DOM, sem estado, sem efeitos
// colaterais.
//
// API:
//   - filterCandidates(registrations, clubId, editionId)
//       → Inscricao_Jogador[]
//   - compareCandidates(a, b)
//       → number   (consumível por Array.prototype.sort)
//   - withNamesFromRepo(registrations, playersById)
//       → { rating, name, registration }[]
//   - sortCandidates(candidates)
//       → { rating, name, registration }[]   (cópia ordenada e estável)
//
// Decisão de design:
//   `compareCandidates` opera sobre projeções `{ rating, name }` para ficar
//   desacoplado da forma do repositório. O helper `withNamesFromRepo` faz o
//   join entre Inscricao_Jogador (que só conhece `playerId`) e o catálogo
//   de Jogadores, produzindo objetos prontos para ordenação.
//
// Validates: Requirements 3.2, 3.3, 3.4, 3.6

/**
 * Filtra a lista de inscrições retornando apenas aquelas cujo `clubId` e
 * `editionId` correspondem aos valores dados.
 *
 * Comportamento:
 *   - Se `clubId` ou `editionId` for `null`/`undefined`, retorna `[]`
 *     (Requirement 3.6: ambos os filtros são necessários para listar
 *     candidatos).
 *   - Caso contrário, retorna um NOVO array com as inscrições que casam,
 *     preservando a ordem original e sem mutar a entrada.
 *   - Multiset: se houver duplicatas na entrada (cenário rejeitado pela
 *     camada de integridade, mas tratado de forma total aqui), todas
 *     aparecem na saída.
 *
 * @param {ReadonlyArray<{ clubId: string, editionId: string }>} registrations
 * @param {string | null | undefined} clubId
 * @param {string | null | undefined} editionId
 * @returns {Array<object>}
 */
export function filterCandidates(registrations, clubId, editionId) {
  if (clubId == null || editionId == null) {
    return [];
  }
  if (!Array.isArray(registrations)) {
    return [];
  }

  const out = [];
  for (let i = 0; i < registrations.length; i += 1) {
    const r = registrations[i];
    if (r != null && r.clubId === clubId && r.editionId === editionId) {
      out.push(r);
    }
  }
  return out;
}

/**
 * Normaliza um `rating` para comparação numérica.
 *
 * Notas ausentes (`null`/`undefined`/`NaN`/não numéricas) são tratadas como
 * `-Infinity`, fazendo com que sempre percam para qualquer valor numérico
 * em ordenação descendente.
 *
 * @param {unknown} rating
 * @returns {number}
 */
function normalizeRating(rating) {
  return typeof rating === 'number' && Number.isFinite(rating)
    ? rating
    : Number.NEGATIVE_INFINITY;
}

/**
 * Normaliza um `name` para comparação alfabética. Valores ausentes viram
 * string vazia, garantindo que `localeCompare` funcione sem lançar.
 *
 * @param {unknown} name
 * @returns {string}
 */
function normalizeName(name) {
  return typeof name === 'string' ? name : '';
}

/**
 * Comparador estável para candidatos exibidos no Painel_Jogadores.
 *
 * Critérios:
 *   1. Nota (rating) decrescente. Notas ausentes ficam após todas as
 *      numéricas.
 *   2. Em empate, nome do Jogador em ordem alfabética crescente, usando
 *      `localeCompare` com locale `pt-BR` e `sensitivity: 'base'` para
 *      tratar acentos/maiúsculas de forma consistente em português.
 *   3. Em empate total (mesma nota e mesmo nome), retorna 0 para que o
 *      `Array.prototype.sort` (estável desde ES2019) preserve a ordem
 *      original da entrada.
 *
 * Espera projeções `{ rating, name }`. Use `withNamesFromRepo` para
 * construí-las a partir de inscrições e do índice de jogadores.
 *
 * @param {{ rating: number | null | undefined, name?: string }} a
 * @param {{ rating: number | null | undefined, name?: string }} b
 * @returns {number}
 */
export function compareCandidates(a, b) {
  const ra = normalizeRating(a == null ? undefined : a.rating);
  const rb = normalizeRating(b == null ? undefined : b.rating);

  if (ra !== rb) {
    // Descendente: maior rating primeiro.
    return rb - ra;
  }

  const na = normalizeName(a == null ? undefined : a.name);
  const nb = normalizeName(b == null ? undefined : b.name);

  return na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Lookup tolerante para o índice de jogadores.
 * Aceita um `Map<playerId, Jogador>` ou um objeto plano `{ [id]: Jogador }`.
 *
 * @param {Map<string, { name?: string }> | Record<string, { name?: string }> | null | undefined} playersById
 * @param {string} playerId
 * @returns {{ name?: string } | undefined}
 */
function lookupPlayer(playersById, playerId) {
  if (playersById == null) return undefined;
  if (typeof playersById.get === 'function') {
    return playersById.get(playerId);
  }
  if (Object.prototype.hasOwnProperty.call(playersById, playerId)) {
    return playersById[playerId];
  }
  return undefined;
}

/**
 * Enriquece uma lista de inscrições com o nome do Jogador correspondente,
 * produzindo as projeções esperadas por `compareCandidates`.
 *
 * Saída: `[{ rating, name, registration }, ...]`, na mesma ordem das
 * inscrições recebidas. Quando o jogador não é encontrado no índice, `name`
 * fica como string vazia (compare cairá no caso de empate alfabético).
 *
 * @param {ReadonlyArray<{ playerId: string, rating: number | null }>} registrations
 * @param {Map<string, { name?: string }> | Record<string, { name?: string }>} playersById
 * @returns {Array<{ rating: number | null, name: string, registration: object }>}
 */
export function withNamesFromRepo(registrations, playersById) {
  if (!Array.isArray(registrations)) return [];
  const out = new Array(registrations.length);
  for (let i = 0; i < registrations.length; i += 1) {
    const r = registrations[i];
    const player = r != null ? lookupPlayer(playersById, r.playerId) : undefined;
    out[i] = {
      rating: r != null ? r.rating : null,
      name: normalizeName(player != null ? player.name : ''),
      registration: r,
    };
  }
  return out;
}

/**
 * Conveniência: retorna uma cópia ordenada de `candidates` aplicando
 * `compareCandidates`. Não muta a entrada.
 *
 * @template T
 * @param {ReadonlyArray<T & { rating?: number | null, name?: string }>} candidates
 * @returns {Array<T>}
 */
export function sortCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.slice().sort(compareCandidates);
}
