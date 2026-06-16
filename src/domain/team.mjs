// src/domain/team.mjs
//
// Operações puras sobre o `Time_Usuario`. Toda função deste módulo é
// referencialmente transparente: não toca o DOM, não muta as entradas e
// produz um novo objeto a cada transição. Os times retornados são
// `Object.freeze`ados (junto com seu `assignments` interno) para evitar
// mutações acidentais por consumidores.
//
// Shape do time:
//
//   {
//     formationId: FormationId,
//     assignments: { [slotId: string]: registrationId | null },
//   }
//
// As chaves de `assignments` são exatamente os `slotId`s da formação
// referenciada por `formationId`, na ordem em que aparecem no catálogo
// (`FORMATIONS[formationId].slots`). Mantemos essa ordem propagando o
// objeto via spread (que preserva a ordem de inserção em JavaScript) e
// nunca apagando chaves: slots vazios ficam com `null`.
//
// Esta camada NÃO valida compatibilidade de Posição, duplicidade de
// `playerId`, nem capacidade do time. Isso é responsabilidade de
// `domain/validation.mjs` (task 6.1). Aqui mantemos apenas as invariantes
// estruturais (slot precisa existir; valor é registrationId não-vazio
// ou null) e sinalizamos violações com `TypeError` / `RangeError` para
// detectar bugs de chamadores cedo.
//
// Validates: Requirements 5.1, 5.4, 5.5, 5.6, 6.1, 6.3

import { getFormation } from './formations.mjs';

/**
 * Cria um time vazio para a formação `formationId`. Todas as chaves de
 * `assignments` são inicializadas com `null`, na ordem dos slots do
 * catálogo da formação.
 *
 * @param {string} formationId
 * @returns {Readonly<{ formationId: string, assignments: Readonly<Record<string, string | null>> }>}
 * @throws {TypeError} quando `formationId` não corresponde a uma formação registrada
 */
export function emptyTeam(formationId) {
  const formation = getFormation(formationId);
  if (formation === undefined) {
    throw new TypeError(
      `emptyTeam: unknown formationId ${JSON.stringify(formationId)}`,
    );
  }

  const assignments = {};
  for (const slot of formation.slots) {
    assignments[slot.id] = null;
  }

  return Object.freeze({
    formationId: formation.id,
    assignments: Object.freeze(assignments),
  });
}

/**
 * Verifica se `slotId` é uma chave conhecida do `assignments` do time.
 *
 * @param {{ assignments: Record<string, unknown> }} team
 * @param {string} slotId
 * @returns {boolean}
 */
function hasSlot(team, slotId) {
  return (
    team != null
    && team.assignments != null
    && Object.prototype.hasOwnProperty.call(team.assignments, slotId)
  );
}

/**
 * Retorna um NOVO time com `slotId` apontando para `registrationId`.
 *
 * Esta é a primitiva de baixo nível: apenas substitui o valor do slot.
 * Regras de domínio (compatibilidade de posição, duplicidade de
 * `playerId`, capacidade do time) ficam em `domain/validation.mjs`
 * (task 6.1) e a action da store deve combinar `canAssign` + `assign`.
 *
 * Se `slotId` não existe no time, retorna o time inalterado (no-op).
 * O caller (`canAssign` em validation.mjs) garante validade — esta
 * função faz apenas a substituição mecânica.
 *
 * @param {Readonly<{ formationId: string, assignments: Readonly<Record<string, string | null>> }>} team
 * @param {string} slotId
 * @param {string} registrationId
 * @returns {Readonly<{ formationId: string, assignments: Readonly<Record<string, string | null>> }>}
 */
export function assign(team, slotId, registrationId) {
  if (!hasSlot(team, slotId)) {
    return team;
  }

  const nextAssignments = { ...team.assignments, [slotId]: registrationId };
  return Object.freeze({
    formationId: team.formationId,
    assignments: Object.freeze(nextAssignments),
  });
}

/**
 * Retorna um NOVO time com `slotId` desocupado (`null`).
 *
 * Se `slotId` não existe no time ou já está vazio (`null`), retorna o
 * time inalterado (identidade — Property 16).
 *
 * @param {Readonly<{ formationId: string, assignments: Readonly<Record<string, string | null>> }>} team
 * @param {string} slotId
 * @returns {Readonly<{ formationId: string, assignments: Readonly<Record<string, string | null>> }>}
 */
export function unassign(team, slotId) {
  if (!hasSlot(team, slotId)) {
    return team;
  }

  // Identity on empty: se o slot já está vazio, retorna o time sem
  // criar cópia desnecessária.
  if (team.assignments[slotId] === null) {
    return team;
  }

  const nextAssignments = { ...team.assignments, [slotId]: null };
  return Object.freeze({
    formationId: team.formationId,
    assignments: Object.freeze(nextAssignments),
  });
}

/**
 * Consulta o ocupante de `slotId`. Retorna o `registrationId` quando
 * o slot está ocupado, `null` quando vazio ou quando o `slotId` não
 * existe na formação. Esta é uma operação de leitura pura.
 *
 * @param {Readonly<{ assignments: Record<string, string | null> }> | null | undefined} team
 * @param {string} slotId
 * @returns {string | null}
 */
export function getOccupant(team, slotId) {
  if (team == null || team.assignments == null) return null;
  if (!Object.prototype.hasOwnProperty.call(team.assignments, slotId)) {
    return null;
  }
  return team.assignments[slotId];
}

/**
 * Conta quantos slots possuem ocupante (valor não-nulo). Defensivo
 * contra `null`/`undefined` (retorna 0).
 *
 * @param {Readonly<{ assignments: Record<string, string | null> }> | null | undefined} team
 * @returns {number}
 */
export function countAssigned(team) {
  if (team == null || team.assignments == null) return 0;
  let n = 0;
  for (const key in team.assignments) {
    if (Object.prototype.hasOwnProperty.call(team.assignments, key)) {
      if (team.assignments[key] != null) n += 1;
    }
  }
  return n;
}

/**
 * Lookup tolerante para o índice de inscrições. Aceita:
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

/**
 * Lista os `playerId`s de todos os slots ocupados, na ordem dos slots
 * da formação ativa (`FORMATIONS[team.formationId].slots`). Slots
 * vazios são ignorados; inscrições não encontradas no índice também
 * são ignoradas defensivamente.
 *
 * Usado por `domain/validation.mjs` (task 6.1) para detectar
 * `AlreadyInTeam`.
 *
 * @param {Readonly<{ formationId: string, assignments: Record<string, string | null> }> | null | undefined} team
 * @param {Map<string, { playerId?: string }> | Array<{ id: string, playerId?: string }> | Record<string, { playerId?: string }>} registrations
 * @returns {string[]}
 */
export function listAssignedPlayerIds(team, registrations) {
  if (team == null || team.assignments == null) return [];

  // Iterar pela ordem canônica dos slots da formação. Se a formação
  // não estiver registrada (situação anômala), cair na ordem de
  // inserção das chaves de `assignments`.
  const formation = getFormation(team.formationId);
  const slotIds = formation !== undefined
    ? formation.slots.map((s) => s.id)
    : Object.keys(team.assignments);

  const out = [];
  for (const slotId of slotIds) {
    const registrationId = team.assignments[slotId];
    if (registrationId == null) continue;

    const registration = lookupRegistration(registrations, registrationId);
    if (registration == null) continue;

    const playerId = registration.playerId;
    if (typeof playerId !== 'string' || playerId.length === 0) continue;

    out.push(playerId);
  }
  return out;
}

/**
 * Resultado de uma transição entre formações.
 *
 * - `team`: NOVO `Time_Usuario` na formação alvo, com `assignments` em
 *   estado consistente (chaves = slotIds da nova formação, valores =
 *   `registrationId | null`).
 * - `preserved`: lista de atribuições reaproveitadas. Cada item tem o
 *   shape `{ slotId, registrationId, position }`, onde `slotId` é o
 *   slot da NOVA formação que recebeu o jogador e `position` é a
 *   `Posicao` base compartilhada entre o slot antigo e o novo.
 * - `removed`: lista de `registrationId`s descartados porque sua
 *   `Posicao` base não existe na nova formação ou porque a capacidade
 *   da nova posição foi excedida.
 */

/**
 * Transita um `Time_Usuario` da formação atual para `newFormationId`.
 *
 * Regra de preservação (Requirements 1.5 e 1.6): para cada Slot ocupado
 * na formação anterior, se a `Posicao` base do Slot existir na nova
 * formação e ainda houver capacidade nessa posição, o jogador é
 * reatribuído ao próximo Slot disponível da nova formação com aquela
 * mesma `Posicao` base, em ordem determinística pelos `slotId`s
 * declarados no catálogo (`FORMATIONS[newFormationId].slots`).
 * Caso contrário, a atribuição é descartada e o `registrationId` vai
 * para `removed`.
 *
 * Quando `newFormationId === oldTeam.formationId`, a função é
 * efetivamente identidade: o time atual é retornado tal qual, com
 * todos os ocupantes listados em `preserved` (cada um no seu próprio
 * slot original) e `removed` vazio. Isso satisfaz trivialmente
 * Requirement 1.6 quando o usuário "re-seleciona" a formação ativa.
 *
 * Defensivo: quando `oldTeam` é `null`/`undefined` ou sua formação
 * não pode ser resolvida, retorna `emptyTeam(newFormationId)` com
 * `preserved: []` e `removed: []`.
 *
 * `registrations` é aceito por simetria com `listAssignedPlayerIds`
 * (futuras heurísticas podem precisar do `playerId` por
 * `registrationId`); a posição base por slot é tomada do catálogo da
 * formação anterior, não do registro de inscrição.
 *
 * @param {Readonly<{ formationId: string, assignments: Record<string, string | null> }> | null | undefined} oldTeam
 * @param {string} newFormationId
 * @param {Map<string, { playerId?: string }> | Array<{ id: string, playerId?: string }> | Record<string, { playerId?: string }>} [registrations]
 * @returns {Readonly<{
 *   team: Readonly<{ formationId: string, assignments: Readonly<Record<string, string | null>> }>,
 *   preserved: ReadonlyArray<Readonly<{ slotId: string, registrationId: string, position: string }>>,
 *   removed: ReadonlyArray<string>,
 * }>}
 * @throws {TypeError} quando `newFormationId` não corresponde a uma formação registrada
 */
export function transitionTeam(oldTeam, newFormationId, registrations) {
  // Resolve a nova formação primeiro: id desconhecido é erro de
  // programação do chamador.
  const newFormation = getFormation(newFormationId);
  if (newFormation === undefined) {
    throw new TypeError(
      `transitionTeam: unknown newFormationId ${JSON.stringify(newFormationId)}`,
    );
  }

  // Caso defensivo: sem time anterior coerente, retorna time vazio na
  // nova formação. Não tentamos preservar nada.
  if (oldTeam == null || oldTeam.assignments == null) {
    return Object.freeze({
      team: emptyTeam(newFormation.id),
      preserved: Object.freeze([]),
      removed: Object.freeze([]),
    });
  }

  const oldFormation = getFormation(oldTeam.formationId);
  if (oldFormation === undefined) {
    return Object.freeze({
      team: emptyTeam(newFormation.id),
      preserved: Object.freeze([]),
      removed: Object.freeze([]),
    });
  }

  // Identidade: re-seleção da mesma formação. Retorna o time tal qual
  // (ele já é congelado pela API pública) e lista todos os ocupantes
  // em `preserved`, cada um no seu próprio slot.
  if (newFormation.id === oldFormation.id) {
    const preserved = [];
    for (const slot of oldFormation.slots) {
      const registrationId = oldTeam.assignments[slot.id];
      if (registrationId == null) continue;
      preserved.push(Object.freeze({
        slotId: slot.id,
        registrationId,
        position: slot.position,
      }));
    }
    return Object.freeze({
      team: oldTeam,
      preserved: Object.freeze(preserved),
      removed: Object.freeze([]),
    });
  }

  // Indexa os slots da NOVA formação por Posicao base, na ordem
  // declarada. Cada bucket é uma fila de slotIds disponíveis para
  // claim em ordem determinística.
  /** @type {Map<string, string[]>} */
  const newSlotsByPosition = new Map();
  for (const slot of newFormation.slots) {
    let bucket = newSlotsByPosition.get(slot.position);
    if (bucket === undefined) {
      bucket = [];
      newSlotsByPosition.set(slot.position, bucket);
    }
    bucket.push(slot.id);
  }

  const preserved = [];
  const removed = [];

  // Itera os slots da formação ANTIGA na ordem declarada para reproduzir
  // a ordem em que os jogadores foram considerados.
  for (const oldSlot of oldFormation.slots) {
    const registrationId = oldTeam.assignments[oldSlot.id];
    if (registrationId == null) continue;

    const bucket = newSlotsByPosition.get(oldSlot.position);
    if (bucket === undefined || bucket.length === 0) {
      // Posicao base inexistente na nova formação ou capacidade
      // esgotada por jogadores anteriores da mesma posição.
      removed.push(registrationId);
      continue;
    }

    // Próximo slot disponível na ordem declarada da nova formação.
    const newSlotId = bucket.shift();
    preserved.push(Object.freeze({
      slotId: newSlotId,
      registrationId,
      position: oldSlot.position,
    }));
  }

  // Constrói o `assignments` do novo time: começa vazio (todos os
  // slotIds da nova formação com `null`, na ordem do catálogo) e
  // preenche os preservados.
  const nextAssignments = {};
  for (const slot of newFormation.slots) {
    nextAssignments[slot.id] = null;
  }
  for (const entry of preserved) {
    nextAssignments[entry.slotId] = entry.registrationId;
  }

  // `registrations` é deliberadamente ignorado neste momento (vide
  // JSDoc). Mantemos o parâmetro para evolução futura sem quebra de
  // assinatura.
  void registrations;

  const newTeam = Object.freeze({
    formationId: newFormation.id,
    assignments: Object.freeze(nextAssignments),
  });

  return Object.freeze({
    team: newTeam,
    preserved: Object.freeze(preserved),
    removed: Object.freeze(removed),
  });
}
