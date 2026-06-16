// src/data/repository.mjs
//
// Repositório indexado em memória: recebe o payload já validado por
// `validateIntegrity` e constrói índices `Map<id, value>` para consultas
// O(1)/O(log n) pelas camadas superiores (state/store, UI).
//
// Responsabilidades:
//   - Construir os índices declarados no design.md, seção
//     "data/repository.mjs".
//   - Derivar o `InscricaoId` de cada registro via `deriveRegistrationId`,
//     já que o payload bruto não traz o campo `id` em `Inscricao_Jogador`.
//   - Preservar a ordem original das `Inscricao_Jogador` por par
//     `(clubId, editionId)` — a ordenação por Nota/nome é responsabilidade
//     da camada `domain/filter.mjs` (Requirement 3.3).
//   - Ordenar `editionsByLeague[leagueId]` cronologicamente por temporada.
//   - Repassar a `coverage` produzida pelo validador sem re-cálculo.
//   - Pré-computar um `Set<\`${clubId}|${editionId}\`>` para participação
//     em O(1), exposto como `repo._clubEditionPairs` (uso interno; consumir
//     pelo helper `clubParticipated`).
//
// Imutabilidade:
//   - O objeto retornado e cada array dentro dos índices são congelados
//     (`Object.freeze`).
//   - Os `Map`s não são congelados (limitação do `Object.freeze` em coleções
//     iteráveis); a aplicação trata-os por convenção como leitura-apenas.
//
// Validates: Requirements 3.1, 3.2, 3.5, 7.7, 7.8, 8.6.

import { deriveRegistrationId } from './ids.mjs';
import { seasonToYearStart } from './integrity.mjs';

/**
 * Array vazio congelado, reutilizado pelos helpers para evitar alocação.
 * @type {ReadonlyArray<never>}
 */
const EMPTY = Object.freeze([]);

/**
 * Constrói um repositório indexado a partir do payload já validado.
 *
 * `validatedData` é o objeto `data` retornado por
 * `validateIntegrity(payload)` em sucesso, ou seja:
 *
 *   { leagues, editions, clubs, clubEditions, players, registrations, coverage }
 *
 * onde todas as coleções já passaram por verificação estrutural e
 * referencial, e `coverage` agrega os indicadores de cobertura.
 *
 * @param {{
 *   leagues: ReadonlyArray<{ id: string }>,
 *   editions: ReadonlyArray<{ id: string, leagueId: string, season: string }>,
 *   clubs: ReadonlyArray<{ id: string }>,
 *   clubEditions: ReadonlyArray<{ clubId: string, editionId: string, finalStage: string }>,
 *   players: ReadonlyArray<{ id: string }>,
 *   registrations: ReadonlyArray<{ playerId: string, clubId: string, editionId: string }>,
 *   coverage: unknown,
 * }} validatedData
 * @returns {Readonly<{
 *   leaguesById: Map<string, object>,
 *   editionsById: Map<string, object>,
 *   editionsByLeague: Map<string, ReadonlyArray<object>>,
 *   clubsById: Map<string, object>,
 *   clubEditionsByEdition: Map<string, ReadonlyArray<object>>,
 *   clubEditionsByClub: Map<string, ReadonlyArray<object>>,
 *   playersById: Map<string, object>,
 *   registrationsById: Map<string, object>,
 *   registrationsByClubEdition: Map<string, ReadonlyArray<object>>,
 *   coverage: unknown,
 *   _clubEditionPairs: Set<string>,
 * }>}
 */
export function buildRepository(validatedData) {
  if (validatedData === null || typeof validatedData !== 'object') {
    throw new TypeError(
      `buildRepository: validatedData must be an object, received ${describeType(validatedData)}`,
    );
  }

  const leagues = asArray(validatedData.leagues);
  const editions = asArray(validatedData.editions);
  const clubs = asArray(validatedData.clubs);
  const clubEditions = asArray(validatedData.clubEditions);
  const players = asArray(validatedData.players);
  const registrations = asArray(validatedData.registrations);
  const coverage = validatedData.coverage ?? null;

  // ---- Entidades simples indexadas por id. ------------------------------
  const leaguesById = indexById(leagues);
  const editionsById = indexById(editions);
  const clubsById = indexById(clubs);
  const playersById = indexById(players);

  // ---- editionsByLeague: agrupa por leagueId e ordena por temporada. ----
  /** @type {Map<string, object[]>} */
  const editionsByLeagueRaw = new Map();
  for (const e of editions) {
    let bucket = editionsByLeagueRaw.get(e.leagueId);
    if (!bucket) {
      bucket = [];
      editionsByLeagueRaw.set(e.leagueId, bucket);
    }
    bucket.push(e);
  }
  /** @type {Map<string, ReadonlyArray<object>>} */
  const editionsByLeague = new Map();
  for (const [leagueId, list] of editionsByLeagueRaw) {
    const sorted = [...list].sort(compareBySeasonAsc);
    editionsByLeague.set(leagueId, Object.freeze(sorted));
  }

  // ---- clubEditions agrupados em duas direções + Set de pares. ----------
  /** @type {Map<string, object[]>} */
  const clubEditionsByEditionRaw = new Map();
  /** @type {Map<string, object[]>} */
  const clubEditionsByClubRaw = new Map();
  /** @type {Set<string>} */
  const clubEditionPairs = new Set();

  for (const ce of clubEditions) {
    let byEdition = clubEditionsByEditionRaw.get(ce.editionId);
    if (!byEdition) {
      byEdition = [];
      clubEditionsByEditionRaw.set(ce.editionId, byEdition);
    }
    byEdition.push(ce);

    let byClub = clubEditionsByClubRaw.get(ce.clubId);
    if (!byClub) {
      byClub = [];
      clubEditionsByClubRaw.set(ce.clubId, byClub);
    }
    byClub.push(ce);

    clubEditionPairs.add(pairKey(ce.clubId, ce.editionId));
  }

  /** @type {Map<string, ReadonlyArray<object>>} */
  const clubEditionsByEdition = new Map();
  for (const [k, v] of clubEditionsByEditionRaw) {
    clubEditionsByEdition.set(k, Object.freeze(v));
  }
  /** @type {Map<string, ReadonlyArray<object>>} */
  const clubEditionsByClub = new Map();
  for (const [k, v] of clubEditionsByClubRaw) {
    clubEditionsByClub.set(k, Object.freeze(v));
  }

  // ---- registrations: id derivado + agrupamento por (club, edition). ----
  /** @type {Map<string, object>} */
  const registrationsById = new Map();
  /** @type {Map<string, object[]>} */
  const registrationsByClubEditionRaw = new Map();

  for (const r of registrations) {
    const id = deriveRegistrationId(r.playerId, r.clubId, r.editionId);
    registrationsById.set(id, r);

    const key = pairKey(r.clubId, r.editionId);
    let bucket = registrationsByClubEditionRaw.get(key);
    if (!bucket) {
      bucket = [];
      registrationsByClubEditionRaw.set(key, bucket);
    }
    bucket.push(r);
  }

  /** @type {Map<string, ReadonlyArray<object>>} */
  const registrationsByClubEdition = new Map();
  for (const [k, v] of registrationsByClubEditionRaw) {
    registrationsByClubEdition.set(k, Object.freeze(v));
  }

  const repo = {
    leaguesById,
    editionsById,
    editionsByLeague,
    clubsById,
    clubEditionsByEdition,
    clubEditionsByClub,
    playersById,
    registrationsById,
    registrationsByClubEdition,
    coverage,
    _clubEditionPairs: clubEditionPairs,
  };

  return Object.freeze(repo);
}

/**
 * Lista as `Edicao_Liga` em que `clubId` participou (existe pelo menos uma
 * `ClubEdition` para o par), ordenadas cronologicamente por temporada
 * ascendente. Devolve um array congelado vazio para `clubId` desconhecido.
 *
 * @param {ReturnType<typeof buildRepository> | null | undefined} repo
 * @param {unknown} clubId
 * @returns {ReadonlyArray<object>}
 */
export function listEditionsForClub(repo, clubId) {
  if (!isRepo(repo)) return EMPTY;
  if (typeof clubId !== 'string' || clubId.length === 0) return EMPTY;

  const entries = repo.clubEditionsByClub.get(clubId);
  if (!entries || entries.length === 0) return EMPTY;

  /** @type {Set<string>} */
  const seen = new Set();
  const list = [];
  for (const ce of entries) {
    if (seen.has(ce.editionId)) continue;
    seen.add(ce.editionId);
    const e = repo.editionsById.get(ce.editionId);
    if (e) list.push(e);
  }
  list.sort(compareBySeasonAsc);
  return Object.freeze(list);
}

/**
 * Lista as `Inscricao_Jogador` registradas para o par `(clubId, editionId)`.
 * Preserva a ordem de inserção do payload (a ordenação por Nota/nome é
 * aplicada pela camada de domínio em `filter.mjs`). Devolve um array
 * congelado vazio quando o par não existe ou quando os argumentos são
 * inválidos.
 *
 * @param {ReturnType<typeof buildRepository> | null | undefined} repo
 * @param {unknown} clubId
 * @param {unknown} editionId
 * @returns {ReadonlyArray<object>}
 */
export function getRegistrations(repo, clubId, editionId) {
  if (!isRepo(repo)) return EMPTY;
  if (typeof clubId !== 'string' || clubId.length === 0) return EMPTY;
  if (typeof editionId !== 'string' || editionId.length === 0) return EMPTY;

  const list = repo.registrationsByClubEdition.get(pairKey(clubId, editionId));
  return list ?? EMPTY;
}

/**
 * Lista TODAS as `Edicao_Liga` do repositório, ordenadas cronologicamente
 * por temporada ascendente, de forma estável (entre temporadas iguais a
 * ordem de inserção do payload é preservada). Devolve um array congelado.
 *
 * @param {ReturnType<typeof buildRepository> | null | undefined} repo
 * @returns {ReadonlyArray<object>}
 */
export function listAllEditions(repo) {
  if (!isRepo(repo)) return EMPTY;
  const list = [...repo.editionsById.values()];
  list.sort(compareBySeasonAsc);
  return Object.freeze(list);
}

/**
 * Indica se `clubId` participou de `editionId`, isto é, se existe uma
 * `ClubEdition` para o par. Consulta O(1) sobre o `Set` pré-computado.
 *
 * @param {ReturnType<typeof buildRepository> | null | undefined} repo
 * @param {unknown} clubId
 * @param {unknown} editionId
 * @returns {boolean}
 */
export function clubParticipated(repo, clubId, editionId) {
  if (!isRepo(repo)) return false;
  if (typeof clubId !== 'string' || clubId.length === 0) return false;
  if (typeof editionId !== 'string' || editionId.length === 0) return false;
  return repo._clubEditionPairs.has(pairKey(clubId, editionId));
}

// ---------------------------------------------------------------------------
// Utilitários internos.
// ---------------------------------------------------------------------------

/**
 * Indexa uma coleção por `id`, ignorando entradas que não tenham `id`
 * string (em payload validado isso não acontece, mas o helper se mantém
 * defensivo para uso direto em testes).
 *
 * @template {{ id: string }} T
 * @param {ReadonlyArray<T>} entities
 * @returns {Map<string, T>}
 */
function indexById(entities) {
  /** @type {Map<string, T>} */
  const m = new Map();
  for (const e of entities) {
    if (e && typeof e.id === 'string' && e.id.length > 0) {
      m.set(e.id, e);
    }
  }
  return m;
}

/**
 * Comparador estável (Array.prototype.sort é estável a partir de ES2019)
 * que ordena por `season` ascendente usando `seasonToYearStart`.
 *
 * @param {{ season: string }} a
 * @param {{ season: string }} b
 * @returns {number}
 */
function compareBySeasonAsc(a, b) {
  return seasonToYearStart(a.season) - seasonToYearStart(b.season);
}

/**
 * Chave canônica para o par `(clubId, editionId)`.
 *
 * @param {string} clubId
 * @param {string} editionId
 * @returns {string}
 */
function pairKey(clubId, editionId) {
  return `${clubId}|${editionId}`;
}

/**
 * Confere defensivamente que `repo` tem o shape esperado de um repositório
 * construído por `buildRepository`. Usado pelos helpers para tolerar
 * chamadas com `null`/`undefined` sem lançar.
 *
 * @param {unknown} repo
 * @returns {repo is ReturnType<typeof buildRepository>}
 */
function isRepo(repo) {
  return (
    repo !== null &&
    typeof repo === 'object' &&
    /** @type {any} */ (repo).editionsById instanceof Map &&
    /** @type {any} */ (repo).clubEditionsByClub instanceof Map &&
    /** @type {any} */ (repo).registrationsByClubEdition instanceof Map &&
    /** @type {any} */ (repo)._clubEditionPairs instanceof Set
  );
}

/**
 * Garante que o valor é um array; caso contrário lança `TypeError`.
 *
 * @template T
 * @param {unknown} value
 * @returns {ReadonlyArray<T>}
 */
function asArray(value) {
  if (!Array.isArray(value)) {
    throw new TypeError(
      `buildRepository: expected array, received ${describeType(value)}`,
    );
  }
  return /** @type {ReadonlyArray<T>} */ (value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
