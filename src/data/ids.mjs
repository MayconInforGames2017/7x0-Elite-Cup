// src/data/ids.mjs
//
// Derivação determinística de identificadores compostos do Banco_Dados.
//
// Regras (conforme design.md, seção "Invariantes de dados"):
//   - EdicaoLigaId  === `edicao:${ligaIdSlug}:${season}` , onde ligaIdSlug é o
//     leagueId sem o prefixo opcional `liga:`.
//   - InscricaoId   === `${playerId}|${clubId}|${editionId}`.
//
// As duas funções são puras: as mesmas entradas produzem exatamente a mesma
// string de saída, sem efeitos colaterais nem dependências de tempo,
// aleatoriedade ou ambiente.
//
// Validação de entrada: qualquer argumento que não seja uma string não vazia
// resulta em `TypeError` com mensagem descritiva. Strings só de espaços em
// branco também são consideradas inválidas, pois não constituem um
// identificador significativo.
//
// Validates: Requirements 7.4, 7.5

const LEAGUE_ID_PREFIX = 'liga:';

/**
 * Garante que `value` é uma string não vazia. Caso contrário, lança um
 * `TypeError` identificando o argumento inválido.
 *
 * @param {unknown} value
 * @param {string} argName
 * @returns {string}
 */
function requireNonEmptyString(value, argName) {
  if (typeof value !== 'string') {
    throw new TypeError(
      `${argName} must be a non-empty string, received ${typeof value}`,
    );
  }
  if (value.length === 0 || value.trim().length === 0) {
    throw new TypeError(
      `${argName} must be a non-empty string, received an empty or whitespace-only string`,
    );
  }
  return value;
}

/**
 * Remove o prefixo `liga:` do `leagueId`, quando presente, devolvendo o slug
 * usado na composição do `EdicaoLigaId`. Se o `leagueId` não estiver
 * prefixado, é devolvido como está.
 *
 * @param {string} leagueId
 * @returns {string}
 */
function leagueIdSlug(leagueId) {
  if (leagueId.startsWith(LEAGUE_ID_PREFIX)) {
    return leagueId.slice(LEAGUE_ID_PREFIX.length);
  }
  return leagueId;
}

/**
 * Deriva o `EdicaoLigaId` a partir de `leagueId` e `season` de forma
 * determinística.
 *
 * Exemplo:
 *   deriveEditionId('liga:champions-league', '1955-56')
 *     === 'edicao:champions-league:1955-56'
 *
 * @param {string} leagueId
 * @param {string} season
 * @returns {string}
 */
export function deriveEditionId(leagueId, season) {
  requireNonEmptyString(leagueId, 'leagueId');
  requireNonEmptyString(season, 'season');
  return `edicao:${leagueIdSlug(leagueId)}:${season}`;
}

/**
 * Deriva o `InscricaoId` a partir da tripla `(playerId, clubId, editionId)`
 * de forma determinística.
 *
 * Exemplo:
 *   deriveRegistrationId(
 *     'jogador:alfredo-di-stefano',
 *     'clube:real-madrid',
 *     'edicao:champions-league:1955-56',
 *   ) === 'jogador:alfredo-di-stefano|clube:real-madrid|edicao:champions-league:1955-56'
 *
 * @param {string} playerId
 * @param {string} clubId
 * @param {string} editionId
 * @returns {string}
 */
export function deriveRegistrationId(playerId, clubId, editionId) {
  requireNonEmptyString(playerId, 'playerId');
  requireNonEmptyString(clubId, 'clubId');
  requireNonEmptyString(editionId, 'editionId');
  return `${playerId}|${clubId}|${editionId}`;
}
