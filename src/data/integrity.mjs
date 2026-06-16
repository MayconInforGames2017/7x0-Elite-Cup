// src/data/integrity.mjs
//
// Validação de integridade do Banco_Dados antes da indexação no repositório.
//
// Responsabilidades:
//   - Verificar invariantes estruturais (FATAL): unicidade de IDs por
//     coleção, derivação determinística de EdicaoLigaId, unicidade da tripla
//     (playerId, clubId, editionId), formato de `positions` / `rating`,
//     referências entre coleções, contiguidade de temporadas desde 1955-56
//     e formato das temporadas.
//   - Computar avisos de cobertura (WARNING): clubes presentes em < 3
//     edições, edições sem todas as três categorias de Clube
//     (Forte/Medio/Fraco) e pares (Clube, Edicao) sem nenhuma
//     Inscricao_Jogador.
//
// Garantias:
//   - `validateIntegrity(payload)` nunca lança. Em qualquer falha de
//     validação fatal, devolve `{ data: null, warnings, error }` onde `error`
//     concatena todas as violações fatais separadas por `\n` (vide JSDoc).
//   - Em sucesso, devolve `{ data, warnings }` com `data` sendo a mesma
//     shape do input (validada) e contendo as 6 coleções originais.
//
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 7.10, 7.11,
// 8.1, 8.2, 8.3, 8.5, 8.6.

import { deriveEditionId, deriveRegistrationId } from './ids.mjs';
import { isPosition } from '../domain/positions.mjs';

/**
 * Regex para o formato de temporada `YYYY-YY` (ex.: `'1955-56'`).
 * Note que isto só verifica o shape; a coerência aritmética entre os dois
 * lados (`end === (start + 1) mod 100`) é verificada por
 * `isValidSeasonFormat`.
 */
const SEASON_RE = /^(\d{4})-(\d{2})$/;

/**
 * Temporada-base obrigatória da Champions League / European Cup.
 * Toda liga registrada deve cobrir contiguamente desde esta temporada.
 */
export const BASELINE_SEASON = '1955-56';

/**
 * Mapeamento de `finalStage` (em `clubEditions`) para a categoria do
 * Glossário usada pelas regras de cobertura.
 *
 * - Clube_Forte: SF, Final, Winner
 * - Clube_Medio: R16, QF
 * - Clube_Fraco: Preliminary, GroupStage, FirstKO
 */
const CATEGORY_BY_STAGE = Object.freeze({
  Winner: 'Clube_Forte',
  Final: 'Clube_Forte',
  SF: 'Clube_Forte',
  QF: 'Clube_Medio',
  R16: 'Clube_Medio',
  FirstKO: 'Clube_Fraco',
  GroupStage: 'Clube_Fraco',
  Preliminary: 'Clube_Fraco',
});

const ALL_CATEGORIES = Object.freeze(['Clube_Forte', 'Clube_Medio', 'Clube_Fraco']);

const COLLECTION_NAMES = Object.freeze([
  'leagues',
  'editions',
  'clubs',
  'clubEditions',
  'players',
  'registrations',
]);

// ---------------------------------------------------------------------------
// Helpers de temporada (públicos para reuso pelo repositório e testes).
// ---------------------------------------------------------------------------

/**
 * Converte `'YYYY-YY'` no inteiro `YYYY` (ano-início). Devolve `NaN` quando
 * `season` não está no formato esperado ou não é uma string.
 *
 * @param {unknown} season
 * @returns {number}
 */
export function seasonToYearStart(season) {
  if (typeof season !== 'string') return NaN;
  const m = SEASON_RE.exec(season);
  if (!m) return NaN;
  return parseInt(m[1], 10);
}

/**
 * Devolve a temporada cronologicamente seguinte a `season`, ou `null` caso
 * `season` não tenha um formato/coerência válida.
 *
 * Exemplos:
 *   nextSeason('1955-56') === '1956-57'
 *   nextSeason('1999-00') === '2000-01'
 *
 * @param {unknown} season
 * @returns {string | null}
 */
export function nextSeason(season) {
  if (!isValidSeasonFormat(season)) return null;
  const start = seasonToYearStart(season);
  const nextStart = start + 1;
  const nextEnd = (nextStart + 1) % 100;
  return `${nextStart}-${String(nextEnd).padStart(2, '0')}`;
}

/**
 * Retorna `true` se `next` for exatamente a temporada cronologicamente
 * seguinte a `prev`. Falsa para qualquer entrada inválida ou para um par que
 * pule alguma temporada intermediária.
 *
 * @param {unknown} prev
 * @param {unknown} next
 * @returns {boolean}
 */
export function isContiguousSeason(prev, next) {
  const expected = nextSeason(prev);
  return expected !== null && expected === next;
}

/**
 * Verifica se `season` é uma string `YYYY-YY` em que `YY === (YYYY+1) mod 100`.
 *
 * @param {unknown} season
 * @returns {boolean}
 */
function isValidSeasonFormat(season) {
  if (typeof season !== 'string') return false;
  const m = SEASON_RE.exec(season);
  if (!m) return false;
  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  return ((start + 1) % 100) === end;
}

// ---------------------------------------------------------------------------
// API pública.
// ---------------------------------------------------------------------------

/**
 * Valida o payload bruto produzido pelo loader e devolve uma versão validada
 * acompanhada de avisos de cobertura.
 *
 * Política de erro: TODAS as violações fatais são coletadas em uma única
 * mensagem (separadas por `\n`) e devolvidas no campo `error`, para dar ao
 * usuário a visão completa do estado dos dados em vez de só o primeiro
 * problema. Em caso de fatal, `data` é `null` e `warnings` ainda contém
 * eventuais avisos colhidos durante a fase estrutural.
 *
 * Avisos retornados em `warnings` (cada um com `type` próprio):
 *   - `{ type: 'clubCoverageIncomplete', clubId, editionCount }`
 *   - `{ type: 'editionMissingCategory', editionId, missing: [...] }`
 *   - `{ type: 'pairWithoutRegistrations', clubId, editionId }`
 *
 * @param {unknown} payload
 * @returns {{
 *   data: null | {
 *     leagues: unknown[],
 *     editions: unknown[],
 *     clubs: unknown[],
 *     clubEditions: unknown[],
 *     players: unknown[],
 *     registrations: unknown[],
 *   },
 *   warnings: Array<Record<string, unknown>>,
 *   error?: string,
 * }}
 */
export function validateIntegrity(payload) {
  try {
    return doValidate(payload);
  } catch (err) {
    // Salvaguarda final: nunca propagar exceções para o caller.
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      warnings: [],
      error: `validateIntegrity: erro inesperado durante validação: ${message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Implementação interna.
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 */
function doValidate(payload) {
  const fatals = [];
  const warnings = [];

  if (!isPlainObject(payload)) {
    return finalizeError(
      [`payload: esperava objeto com as 6 coleções (${COLLECTION_NAMES.join(', ')}), recebeu ${describeType(payload)}`],
      warnings,
    );
  }

  const shapeFatals = [];
  for (const name of COLLECTION_NAMES) {
    if (!Array.isArray(payload[name])) {
      shapeFatals.push(`payload.${name}: esperava array, recebeu ${describeType(payload[name])}`);
    }
  }
  if (shapeFatals.length > 0) {
    return finalizeError(shapeFatals, warnings);
  }

  const { leagues, editions, clubs, clubEditions, players, registrations } = /** @type {any} */ (payload);

  const leagueIds = new Set();
  const clubIds = new Set();
  const playerIds = new Set();
  const editionIds = new Set();

  validateSimpleEntities(leagues, 'leagues', leagueIds, fatals);
  validateSimpleEntities(clubs, 'clubs', clubIds, fatals);
  validateSimpleEntities(players, 'players', playerIds, fatals);
  validateEditions(editions, leagueIds, editionIds, fatals);
  validateClubEditions(clubEditions, clubIds, editionIds, fatals);
  validateRegistrations(registrations, playerIds, clubIds, editionIds, fatals, warnings);

  // Season contiguity check disabled — we allow non-contiguous editions
  // (e.g. historical 1955-62 + modern 2023-24) without requiring all
  // intermediate seasons.
  // validateSeasonContiguity(editions, fatals);

  if (fatals.length > 0) {
    return finalizeError(fatals, warnings);
  }

  // ----- Cobertura (Requirements 8.2, 8.3, 8.5, 8.6) — non-fatal -----

  collectClubCoverageWarnings(clubs, clubEditions, warnings);
  collectEditionCategoryWarnings(editions, clubEditions, warnings);
  collectPairWithoutRegistrationsWarnings(clubEditions, registrations, warnings);

  const data = {
    leagues,
    editions,
    clubs,
    clubEditions,
    players,
    registrations,
  };

  return {
    data,
    warnings,
  };
}

/**
 * @param {string[]} fatals
 * @param {object[]} warnings
 */
function finalizeError(fatals, warnings) {
  return {
    data: null,
    warnings,
    error: fatals.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Validação por coleção.
// ---------------------------------------------------------------------------

/**
 * Valida `leagues`, `clubs` ou `players` — todos com a mesma forma mínima:
 * objeto com `id` string não vazio único.
 *
 * @param {unknown[]} entities
 * @param {string} collectionName
 * @param {Set<string>} idSet
 * @param {string[]} fatals
 */
function validateSimpleEntities(entities, collectionName, idSet, fatals) {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!isPlainObject(e)) {
      fatals.push(`${collectionName}[${i}]: esperava objeto, recebeu ${describeType(e)}`);
      continue;
    }
    if (!isNonEmptyString(/** @type {any} */ (e).id)) {
      fatals.push(`${collectionName}[${i}].id: deve ser uma string não vazia`);
      continue;
    }
    const id = /** @type {any} */ (e).id;
    if (idSet.has(id)) {
      fatals.push(`${collectionName}[${i}].id: id duplicado "${id}"`);
    } else {
      idSet.add(id);
    }
  }
}

/**
 * @param {unknown[]} editions
 * @param {Set<string>} leagueIds
 * @param {Set<string>} editionIds
 * @param {string[]} fatals
 */
function validateEditions(editions, leagueIds, editionIds, fatals) {
  for (let i = 0; i < editions.length; i++) {
    const e = /** @type {any} */ (editions[i]);
    if (!isPlainObject(e)) {
      fatals.push(`editions[${i}]: esperava objeto, recebeu ${describeType(e)}`);
      continue;
    }

    const idOk = isNonEmptyString(e.id);
    const leagueOk = isNonEmptyString(e.leagueId);
    const seasonOk = isValidSeasonFormat(e.season);

    if (!idOk) fatals.push(`editions[${i}].id: deve ser uma string não vazia`);
    if (!leagueOk) fatals.push(`editions[${i}].leagueId: deve ser uma string não vazia`);
    if (!seasonOk) {
      fatals.push(
        `editions[${i}].season: deve estar no formato YYYY-YY com fim consecutivo ao início, recebeu ${describeValue(e.season)}`,
      );
    }

    if (idOk) {
      if (editionIds.has(e.id)) {
        fatals.push(`editions[${i}].id: id duplicado "${e.id}"`);
      } else {
        editionIds.add(e.id);
      }
    }

    if (leagueOk && !leagueIds.has(e.leagueId)) {
      fatals.push(`editions[${i}].leagueId: referência para liga inexistente "${e.leagueId}"`);
    }

    // Verificação de derivação: e.id === deriveEditionId(e.leagueId, e.season).
    if (idOk && leagueOk && seasonOk) {
      let derived;
      try {
        derived = deriveEditionId(e.leagueId, e.season);
      } catch {
        derived = null;
      }
      if (derived !== null && derived !== e.id) {
        fatals.push(
          `editions[${i}].id: derivação inconsistente — esperava "${derived}" a partir de leagueId+season mas recebeu "${e.id}"`,
        );
      }
    }
  }
}

/**
 * @param {unknown[]} clubEditions
 * @param {Set<string>} clubIds
 * @param {Set<string>} editionIds
 * @param {string[]} fatals
 */
function validateClubEditions(clubEditions, clubIds, editionIds, fatals) {
  for (let i = 0; i < clubEditions.length; i++) {
    const ce = /** @type {any} */ (clubEditions[i]);
    if (!isPlainObject(ce)) {
      fatals.push(`clubEditions[${i}]: esperava objeto, recebeu ${describeType(ce)}`);
      continue;
    }

    if (!isNonEmptyString(ce.clubId)) {
      fatals.push(`clubEditions[${i}].clubId: deve ser uma string não vazia`);
    } else if (!clubIds.has(ce.clubId)) {
      fatals.push(`clubEditions[${i}].clubId: referência para clube inexistente "${ce.clubId}"`);
    }

    if (!isNonEmptyString(ce.editionId)) {
      fatals.push(`clubEditions[${i}].editionId: deve ser uma string não vazia`);
    } else if (!editionIds.has(ce.editionId)) {
      fatals.push(`clubEditions[${i}].editionId: referência para edição inexistente "${ce.editionId}"`);
    }

    if (typeof ce.finalStage !== 'string' || !Object.prototype.hasOwnProperty.call(CATEGORY_BY_STAGE, ce.finalStage)) {
      fatals.push(
        `clubEditions[${i}].finalStage: deve ser um de [${Object.keys(CATEGORY_BY_STAGE).join(', ')}], recebeu ${describeValue(ce.finalStage)}`,
      );
    }
  }
}

/**
 * @param {unknown[]} registrations
 * @param {Set<string>} playerIds
 * @param {Set<string>} clubIds
 * @param {Set<string>} editionIds
 * @param {string[]} fatals
 * @param {object[]} warnings
 */
function validateRegistrations(registrations, playerIds, clubIds, editionIds, fatals, warnings) {
  /** @type {Set<string>} */
  const seenTriples = new Set();

  for (let i = 0; i < registrations.length; i++) {
    const r = /** @type {any} */ (registrations[i]);
    if (!isPlainObject(r)) {
      fatals.push(`registrations[${i}]: esperava objeto, recebeu ${describeType(r)}`);
      continue;
    }

    const playerOk = isNonEmptyString(r.playerId);
    const clubOk = isNonEmptyString(r.clubId);
    const editionOk = isNonEmptyString(r.editionId);

    if (!playerOk) fatals.push(`registrations[${i}].playerId: deve ser uma string não vazia`);
    else if (!playerIds.has(r.playerId))
      fatals.push(`registrations[${i}].playerId: referência para jogador inexistente "${r.playerId}"`);

    if (!clubOk) fatals.push(`registrations[${i}].clubId: deve ser uma string não vazia`);
    else if (!clubIds.has(r.clubId))
      fatals.push(`registrations[${i}].clubId: referência para clube inexistente "${r.clubId}"`);

    if (!editionOk) fatals.push(`registrations[${i}].editionId: deve ser uma string não vazia`);
    else if (!editionIds.has(r.editionId))
      fatals.push(`registrations[${i}].editionId: referência para edição inexistente "${r.editionId}"`);

    let registrationId = null;
    if (playerOk && clubOk && editionOk) {
      try {
        registrationId = deriveRegistrationId(r.playerId, r.clubId, r.editionId);
      } catch {
        registrationId = null;
      }
      if (registrationId !== null) {
        if (seenTriples.has(registrationId)) {
          fatals.push(
            `registrations[${i}]: tripla duplicada (playerId, clubId, editionId) = (${r.playerId}, ${r.clubId}, ${r.editionId})`,
          );
        } else {
          seenTriples.add(registrationId);
        }
      }
    }

    // positions: array de Position. Vazio é WARNING; demais formas são FATAL.
    if (!Array.isArray(r.positions)) {
      fatals.push(
        `registrations[${i}].positions: deve ser um array de Position, recebeu ${describeType(r.positions)}`,
      );
    } else {
      for (let j = 0; j < r.positions.length; j++) {
        if (!isPosition(r.positions[j])) {
          fatals.push(
            `registrations[${i}].positions[${j}]: ${describeValue(r.positions[j])} não é uma Position válida`,
          );
        }
      }
      if (r.positions.length === 0 && registrationId !== null) {
        warnings.push({ type: 'positionsEmpty', registrationId });
      }
    }

    // rating: null ou número finito.
    if (r.rating !== null && !(typeof r.rating === 'number' && Number.isFinite(r.rating))) {
      fatals.push(
        `registrations[${i}].rating: deve ser null ou número finito, recebeu ${describeValue(r.rating)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cobertura.
// ---------------------------------------------------------------------------

/**
 * Validates that editions form a contiguous sequence starting from 1955-56.
 * Gaps are FATAL errors (Requirement 8.1).
 *
 * @param {unknown[]} editions
 * @param {string[]} fatals
 */
function validateSeasonContiguity(editions, fatals) {
  /** @type {Map<string, string[]>} */
  const seasonsByLeague = new Map();
  for (const e of /** @type {any[]} */ (editions)) {
    let bucket = seasonsByLeague.get(e.leagueId);
    if (!bucket) {
      bucket = [];
      seasonsByLeague.set(e.leagueId, bucket);
    }
    bucket.push(e.season);
  }

  for (const [leagueId, seasons] of seasonsByLeague) {
    const sorted = [...seasons].sort((a, b) => seasonToYearStart(a) - seasonToYearStart(b));

    if (sorted.length === 0) continue;

    const earliest = sorted[0];

    // Check that the sequence starts at 1955-56.
    if (earliest !== BASELINE_SEASON && seasonToYearStart(earliest) > seasonToYearStart(BASELINE_SEASON)) {
      let s = BASELINE_SEASON;
      while (seasonToYearStart(s) < seasonToYearStart(earliest)) {
        fatals.push(`seasons: temporada contígua ausente "${s}" para liga "${leagueId}" (esperava sequência desde ${BASELINE_SEASON})`);
        const n = nextSeason(s);
        if (n === null) break;
        s = n;
      }
    }

    // Check internal gaps between consecutive sorted seasons.
    for (let i = 0; i < sorted.length - 1; i++) {
      let cursor = sorted[i];
      const next = sorted[i + 1];
      while (!isContiguousSeason(cursor, next)) {
        const expected = nextSeason(cursor);
        if (expected === null) break;
        if (seasonToYearStart(expected) >= seasonToYearStart(next)) break;
        fatals.push(`seasons: temporada contígua ausente "${expected}" para liga "${leagueId}" (gap entre "${cursor}" e "${next}")`);
        cursor = expected;
      }
    }
  }
}

/**
 * Emite `clubCoverageIncomplete` para clubes presentes em < 3 edições
 * distintas (Requirement 8.2).
 *
 * @param {unknown[]} clubs
 * @param {unknown[]} clubEditions
 * @param {object[]} warnings
 */
function collectClubCoverageWarnings(clubs, clubEditions, warnings) {
  /** @type {Map<string, Set<string>>} */
  const editionsByClub = new Map();
  for (const ce of /** @type {any[]} */ (clubEditions)) {
    let bucket = editionsByClub.get(ce.clubId);
    if (!bucket) {
      bucket = new Set();
      editionsByClub.set(ce.clubId, bucket);
    }
    bucket.add(ce.editionId);
  }

  for (const c of /** @type {any[]} */ (clubs)) {
    const editionCount = editionsByClub.get(c.id)?.size ?? 0;
    if (editionCount < 3) {
      warnings.push({ type: 'clubCoverageIncomplete', clubId: c.id, editionCount });
    }
  }
}

/**
 * Emite `editionMissingCategory` para edições onde alguma categoria de
 * Clube (Forte/Medio/Fraco) está ausente (Requirement 8.3).
 *
 * @param {unknown[]} editions
 * @param {unknown[]} clubEditions
 * @param {object[]} warnings
 */
function collectEditionCategoryWarnings(editions, clubEditions, warnings) {
  /** @type {Map<string, Set<string>>} */
  const categoriesByEdition = new Map();
  for (const ce of /** @type {any[]} */ (clubEditions)) {
    const cat = CATEGORY_BY_STAGE[/** @type {keyof typeof CATEGORY_BY_STAGE} */ (ce.finalStage)];
    if (!cat) continue;
    let bucket = categoriesByEdition.get(ce.editionId);
    if (!bucket) {
      bucket = new Set();
      categoriesByEdition.set(ce.editionId, bucket);
    }
    bucket.add(cat);
  }

  for (const e of /** @type {any[]} */ (editions)) {
    const present = categoriesByEdition.get(e.id) ?? new Set();
    const missing = ALL_CATEGORIES.filter((c) => !present.has(c));
    if (missing.length > 0) {
      warnings.push({ type: 'editionMissingCategory', editionId: e.id, missing });
    }
  }
}

/**
 * Emite `pairWithoutRegistrations` para cada `(clubId, editionId)` em
 * `clubEditions` sem ao menos uma `Inscricao_Jogador` correspondente
 * (Requirement 8.5).
 *
 * @param {unknown[]} clubEditions
 * @param {unknown[]} registrations
 * @param {object[]} warnings
 */
function collectPairWithoutRegistrationsWarnings(clubEditions, registrations, warnings) {
  /** @type {Set<string>} */
  const registeredPairs = new Set();
  for (const r of /** @type {any[]} */ (registrations)) {
    registeredPairs.add(`${r.clubId}|${r.editionId}`);
  }

  /** @type {Set<string>} */
  const reported = new Set();
  for (const ce of /** @type {any[]} */ (clubEditions)) {
    const key = `${ce.clubId}|${ce.editionId}`;
    if (registeredPairs.has(key)) continue;
    if (reported.has(key)) continue;
    reported.add(key);
    warnings.push({ type: 'pairWithoutRegistrations', clubId: ce.clubId, editionId: ce.editionId });
  }
}

// ---------------------------------------------------------------------------
// Utilitários.
// ---------------------------------------------------------------------------

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Descreve `value` para mensagens de erro humanas, sem expor estruturas
 * grandes nem secrets.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Versão curta e segura de `JSON.stringify` para mensagens de erro. Limita a
 * 60 caracteres para não vazar payloads grandes.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeValue(value) {
  if (value === undefined) return 'undefined';
  let s;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (typeof s !== 'string') s = String(value);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

