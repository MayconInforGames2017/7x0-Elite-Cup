// src/domain/validation.mjs
//
// Regra pura de validação para a ação "atribuir Inscricao_Jogador a Slot".
// Não toca o DOM, não muta entradas e não lança em entradas mal-formadas:
// retorna sempre `{ ok: true }` ou `{ ok: false, reason }`.
//
// Esta camada é o ÚNICO lugar onde as regras de negócio do Requirement 5
// são consultadas. As primitivas estruturais (`assign`, `unassign`,
// `getOccupant`, `countAssigned`, `listAssignedPlayerIds`) ficam em
// `domain/team.mjs` e propositalmente NÃO conhecem essas regras.
//
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.7

import {
  countAssigned,
  getOccupant,
  listAssignedPlayerIds,
} from './team.mjs';

/**
 * Conjunto fechado de razões de rejeição reportadas por `canAssign`.
 *
 * - `PositionMismatch`: a Posicao base do Slot não está em
 *   `registration.positions` (Requirement 5.2).
 * - `AlreadyInTeam`: o `playerId` da Inscricao_Jogador já ocupa outro
 *   Slot do Time_Usuario (Requirement 5.3).
 * - `TeamFull`: o Time_Usuario já tem 11 jogadores e o Slot alvo está
 *   vazio (Requirement 5.7). Substituição em Slot já ocupado NÃO é
 *   considerada adição (Requirement 5.4).
 * - `UnknownSlot`: o Slot informado não pertence à Formacao ativa do
 *   time (proteção defensiva — chamadores devem garantir o pareamento).
 * - `UnknownRegistration`: a Inscricao_Jogador informada é nula ou
 *   ausente (proteção defensiva).
 *
 * @typedef {'PositionMismatch' | 'AlreadyInTeam' | 'TeamFull' | 'UnknownSlot' | 'UnknownRegistration'} AssignErrorReasonValue
 */
export const AssignErrorReason = Object.freeze({
  PositionMismatch: 'PositionMismatch',
  AlreadyInTeam: 'AlreadyInTeam',
  TeamFull: 'TeamFull',
  UnknownSlot: 'UnknownSlot',
  UnknownRegistration: 'UnknownRegistration',
});

/**
 * Verifica se `slot` pertence à Formacao do `team`. Considera o
 * pareamento válido quando `slot` não é nulo, possui `id` e esse `id`
 * é uma chave conhecida em `team.assignments`.
 *
 * @param {{ assignments?: Record<string, unknown> } | null | undefined} team
 * @param {{ id?: unknown } | null | undefined} slot
 * @returns {boolean}
 */
function slotBelongsToTeam(team, slot) {
  if (slot == null) return false;
  if (team == null || team.assignments == null) return false;
  const slotId = slot.id;
  if (typeof slotId !== 'string' || slotId.length === 0) return false;
  return Object.prototype.hasOwnProperty.call(team.assignments, slotId);
}

/**
 * Decide se a `registration` pode ser atribuída ao `slot` no `team`,
 * dado o índice de inscrições `registrations` (usado para mapear
 * `registrationId` ocupante → `playerId` ao detectar duplicatas).
 *
 * Ordem das verificações:
 *   1. `slot` pertence ao `team`            → senão `UnknownSlot`.
 *   2. `registration` foi fornecida         → senão `UnknownRegistration`.
 *   3. `registration.positions` é um array
 *      contendo `slot.position`             → senão `PositionMismatch`.
 *   4. `registration.playerId` não ocupa
 *      outro Slot do `team`                 → senão `AlreadyInTeam`.
 *   5. Se o Slot está vazio e o `team` já
 *      tem 11 ocupantes                     → `TeamFull`.
 *      (Substituição em Slot ocupado NÃO conta como adição.)
 *
 * @param {{
 *   team: Readonly<{ formationId: string, assignments: Readonly<Record<string, string | null>> }> | null | undefined,
 *   slot: Readonly<{ id: string, position: string }> | null | undefined,
 *   registration: Readonly<{ id?: string, playerId?: string, positions?: readonly string[] }> | null | undefined,
 *   registrations: Map<string, { playerId?: string }> | Array<{ id: string, playerId?: string }> | Record<string, { playerId?: string }> | null | undefined,
 * }} input
 * @returns {{ ok: true } | { ok: false, reason: AssignErrorReasonValue }}
 */
export function canAssign({ team, slot, registration, registrations } = {}) {
  // 1. Slot conhecido na formação ativa do time.
  if (!slotBelongsToTeam(team, slot)) {
    return { ok: false, reason: AssignErrorReason.UnknownSlot };
  }

  // 2. Inscrição fornecida.
  if (registration == null) {
    return { ok: false, reason: AssignErrorReason.UnknownRegistration };
  }

  // 3. Compatibilidade de Posição.
  const positions = registration.positions;
  if (!Array.isArray(positions) || !positions.includes(slot.position)) {
    return { ok: false, reason: AssignErrorReason.PositionMismatch };
  }

  // 4. Duplicidade de playerId em outro Slot. Comparar com o
  //    `playerId` de cada ocupante atual, EXCETO o do próprio
  //    `slot.id` (substituir o ocupante de um slot é permitido).
  const incomingPlayerId = registration.playerId;
  if (typeof incomingPlayerId === 'string' && incomingPlayerId.length > 0) {
    const currentOccupantId = getOccupant(team, slot.id);
    const occupantPlayerIds = listAssignedPlayerIds(team, registrations);

    // `listAssignedPlayerIds` percorre os slots em ordem e devolve um
    // `playerId` por ocupante. Para excluir o ocupante atual do
    // `slot.id`, removemos uma única ocorrência do `playerId` que ele
    // mapeia (se o lookup conseguir resolver).
    let excludePlayerId = null;
    if (currentOccupantId != null) {
      const currentReg = lookupRegistration(registrations, currentOccupantId);
      if (currentReg != null && typeof currentReg.playerId === 'string') {
        excludePlayerId = currentReg.playerId;
      }
    }

    let excluded = false;
    for (const pid of occupantPlayerIds) {
      if (!excluded && excludePlayerId !== null && pid === excludePlayerId) {
        excluded = true;
        continue;
      }
      if (pid === incomingPlayerId) {
        return { ok: false, reason: AssignErrorReason.AlreadyInTeam };
      }
    }
  }

  // 5. Capacidade do time. Apenas dispara quando estamos ADICIONANDO
  //    a um slot vazio. Substituições preservam o head count.
  const slotIsEmpty = getOccupant(team, slot.id) == null;
  if (slotIsEmpty && countAssigned(team) >= 11) {
    return { ok: false, reason: AssignErrorReason.TeamFull };
  }

  return { ok: true };
}

/**
 * Lookup tolerante para o índice de inscrições. Espelha a função
 * homônima usada em `domain/team.mjs` (mantida privada lá) para
 * permitir que `canAssign` mapeie o ocupante atual de um slot a seu
 * `playerId` ao excluí-lo da checagem de `AlreadyInTeam`.
 *
 * Aceita:
 *   - `Map<registrationId, Inscricao_Jogador>`
 *   - `Array<Inscricao_Jogador>` (com campo `id`)
 *   - objeto plano `{ [registrationId]: Inscricao_Jogador }`
 *
 * Retorna `undefined` quando o índice é nulo ou o id não está presente.
 *
 * @param {unknown} registrations
 * @param {string} registrationId
 * @returns {{ playerId?: string } | undefined}
 */
function lookupRegistration(registrations, registrationId) {
  if (registrations == null) return undefined;

  if (registrations instanceof Map) {
    return registrations.get(registrationId);
  }

  if (Array.isArray(registrations)) {
    for (const r of registrations) {
      if (r != null && r.id === registrationId) return r;
    }
    return undefined;
  }

  if (typeof registrations === 'object') {
    if (Object.prototype.hasOwnProperty.call(registrations, registrationId)) {
      return registrations[registrationId];
    }
  }

  return undefined;
}
