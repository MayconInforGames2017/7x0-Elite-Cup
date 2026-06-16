/**
 * Central observable store for the Champions Team Builder.
 *
 * Validates: Requirements 1.7, 9.4
 * Validates: Requirements 1.2, 1.5, 1.6, 1.8, 3.2, 3.4, 3.6 (task 15.2 actions)
 * Validates: Requirements 3.7, 5.1, 5.2, 5.3, 5.4, 5.7, 6.1, 6.3 (task 15.3 actions)
 *
 * The store owns a single immutable state object plus a closed set of
 * actions that compute the next state from pure-domain functions.
 * UI components (tasks 16+) call `subscribe` to react to state
 * changes and dispatch actions to drive transitions.
 *
 * Design contract:
 *   - The state object is deep-frozen on every replacement; consumers
 *     cannot mutate it. Attempts to assign properties on the returned
 *     state throw in strict mode and are silently ignored otherwise.
 *   - `replaceState(updater)` calls `updater(currentState)` to compute
 *     the next state. The returned object is deep-frozen and stored
 *     as the new current state.
 *   - Listeners are notified only when the top-level reference
 *     identity changes. If the updater returns the same state
 *     reference it received, no listener is invoked.
 *   - A listener registered via `subscribe` is NOT invoked
 *     synchronously during `subscribe`; it fires only on subsequent
 *     state changes.
 *
 * Actions live alongside `getState` / `subscribe` / `replaceState` in
 * the returned object so the store is self-contained. The data
 * repository is injected via `deps.repo`; when omitted, action methods
 * still exist but candidate recomputation falls back to an empty list
 * (no source of registrations is available).
 */

/**
 * @typedef {Object} Filter
 * @property {string|null} clubId
 * @property {string|null} editionId
 *
 * @typedef {Object} LoadError
 * @property {string} resource
 * @property {string} reason
 *
 * @typedef {Object} AppState
 * @property {'loading'|'ready'|'error'} status
 * @property {LoadError|null} loadError
 * @property {string|null} activeFormationId
 * @property {object|null} team
 * @property {Filter} filter
 * @property {Array<object>} candidates
 * @property {Array<object>} notifications
 *
 * @typedef {Object} StoreDeps
 * @property {object|null} [repo]
 *   Repository built by `data/repository.mjs#buildRepository`. When
 *   absent, candidate recomputation returns an empty list and team
 *   transitions ignore the registrations index parameter.
 */

import { getFormation } from '../domain/formations.mjs';
import { emptyTeam, transitionTeam, assign, unassign, getOccupant } from '../domain/team.mjs';
import { canAssign, AssignErrorReason } from '../domain/validation.mjs';
import { getRegistrations } from '../data/repository.mjs';
import { withNamesFromRepo, sortCandidates } from '../domain/filter.mjs';
import { reloadRegistrations } from '../data/loader.mjs';

/**
 * Builds a fresh canonical initial state. The returned object is
 * NOT frozen: callers (e.g. `createStore`) may merge overrides
 * before sealing it. Each call returns a new object so tests and
 * action modules can use it as a starting reference without
 * sharing references between independent stores.
 *
 * @returns {AppState}
 */
export function createInitialState() {
  return {
    status: 'loading',
    loadError: null,
    activeFormationId: null,
    tacticalStyle: 'balanced', // 'defensive' | 'balanced' | 'offensive'
    pendingAssignment: null, // { registrationId, positions: string[] } when picking a slot
    team: null,
    filter: { clubId: null, editionId: null },
    candidates: [],
    notifications: [],
  };
}

/**
 * Recursively freezes plain objects and arrays. Primitives, frozen
 * values, and non-object entries are returned untouched. Used
 * internally to seal state snapshots so consumers cannot mutate
 * them in place.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/**
 * Creates a new store instance.
 *
 * @param {Partial<AppState>} [initialOverrides]
 *   Shallow overrides merged onto the canonical initial state. The
 *   merged result is deep-frozen before being stored. Typical use
 *   is in tests that need a non-default starting status or filter.
 * @param {StoreDeps} [deps]
 *   External dependencies wired to action methods. Currently only
 *   `deps.repo` is read; when omitted, action methods still exist
 *   but cannot recompute candidates (a missing repo is treated as a
 *   no-source state and yields an empty candidate list whenever the
 *   filter changes).
 * @returns {{
 *   getState: () => AppState,
 *   subscribe: (listener: (state: AppState) => void) => () => void,
 *   replaceState: (updater: (state: AppState) => AppState) => AppState,
 *   setActiveFormation: (id: unknown) => AppState,
 *   setFilterClub: (clubId: unknown) => AppState,
 *   setFilterEdition: (editionId: unknown) => AppState,
 * }}
 */
export function createStore(initialOverrides, deps) {
  let currentState = deepFreeze({
    ...createInitialState(),
    ...(initialOverrides ?? {}),
  });

  // Resolve the repository dependency. We accept any object exposing
  // the public repo shape (`getRegistrations` reads `playersById` and
  // `registrationsByClubEdition`); we trust the caller to pass a
  // value built by `buildRepository`.
  const repo = deps != null && typeof deps === 'object' && deps.repo != null
    ? deps.repo
    : null;

  /** @type {Set<(state: AppState) => void>} */
  const listeners = new Set();

  /**
   * Returns the current frozen state snapshot.
   * @returns {AppState}
   */
  function getState() {
    return currentState;
  }

  /**
   * Registers a listener that is invoked after every state change
   * in which the top-level reference identity of state changes.
   * The listener is NOT invoked synchronously by `subscribe`.
   *
   * @param {(state: AppState) => void} listener
   * @returns {() => void} unsubscribe function (idempotent)
   */
  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('subscribe expects a function listener.');
    }
    listeners.add(listener);
    let active = true;
    return function unsubscribe() {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  }

  /**
   * Internal state-transition primitive consumed by action modules.
   * Calls `updater(currentState)` and treats its return value as
   * the next state. Listeners fire only when reference identity
   * changes, so updaters can return the same state to signal a
   * no-op (e.g. re-selecting the active formation, Requirement 1.8).
   *
   * @param {(state: AppState) => AppState} updater
   * @returns {AppState} the (possibly unchanged) current state
   */
  function replaceState(updater) {
    if (typeof updater !== 'function') {
      throw new TypeError('replaceState expects an updater function.');
    }
    const next = updater(currentState);
    if (next === currentState) {
      return currentState;
    }
    if (next === null || typeof next !== 'object') {
      throw new TypeError(
        'replaceState updater must return the new state object.'
      );
    }
    currentState = deepFreeze(next);
    // Snapshot listeners so unsubscribes triggered during
    // notification do not perturb the current dispatch loop.
    const snapshot = Array.from(listeners);
    for (const listener of snapshot) {
      listener(currentState);
    }
    return currentState;
  }

  // -------------------------------------------------------------------
  // Actions (task 15.2): formation selection and filter mutation.
  // -------------------------------------------------------------------

  /**
   * Recomputes the candidates list given the current filter values.
   *
   * Behavior:
   *   - When either filter is missing (`null`), returns an empty list
   *     (Requirement 3.6: both filters are necessary to list
   *     candidates).
   *   - When no `repo` was wired, returns an empty list — the store
   *     has no other source of registrations to fall back to.
   *   - Otherwise, fetches the registrations for the
   *     `(clubId, editionId)` pair via the repository, enriches each
   *     entry with the player's name, and returns a sorted projection
   *     ready for rendering by the Painel_Jogadores
   *     (Requirements 3.2, 3.4: rating desc, name asc, stable).
   *
   * The returned array contains projection objects of shape
   * `{ rating, name, registration }` so that downstream UI can render
   * the player's name without a second lookup against the repository.
   *
   * @param {string|null} clubId
   * @param {string|null} editionId
   * @returns {Array<{ rating: number|null, name: string, registration: object }>}
   */
  function recomputeCandidates(clubId, editionId) {
    if (clubId == null || editionId == null) return [];
    if (repo == null) return [];
    const registrations = getRegistrations(repo, clubId, editionId);
    const enriched = withNamesFromRepo(registrations, repo.playersById);
    return sortCandidates(enriched);
  }

  /**
   * Activates a formation by id.
   *
   * Behavior:
   *   - Unknown formation id → no-op (state reference preserved).
   *   - Re-selecting the currently active formation → no-op,
   *     satisfying Requirement 1.8 (re-clicking the active button
   *     keeps the team and slots untouched).
   *   - First selection (no previous active formation) → installs an
   *     empty team for the chosen formation.
   *   - Transition between formations → calls `transitionTeam`, which
   *     preserves occupants whose base position also exists in the
   *     new formation and drops the rest, satisfying Requirements
   *     1.5 and 1.6. Notifications for removed players are deferred
   *     to task 15.3.
   *
   * @param {unknown} id
   * @returns {AppState} the (possibly unchanged) current state
   */
  function setActiveFormation(id) {
    return replaceState((state) => {
      const formation = getFormation(id);
      if (formation === undefined) return state;
      if (state.activeFormationId === id) return state;

      let nextTeam;
      if (state.activeFormationId === null) {
        // First selection. Start with an empty team for the new
        // formation; nothing to preserve from a non-existent prior
        // assignment set.
        nextTeam = emptyTeam(/** @type {string} */ (id));
      } else {
        // Transition from a previous formation. The third argument
        // is forwarded for forward-compat with `transitionTeam`'s
        // future heuristics; today the function does not consume it.
        const result = transitionTeam(
          state.team,
          /** @type {string} */ (id),
          repo != null ? repo.registrationsById : undefined,
        );
        nextTeam = result.team;
      }

      return {
        ...state,
        activeFormationId: /** @type {string} */ (id),
        team: nextTeam,
      };
    });
  }

  /**
   * Sets the Clube filter, recomputing `candidates`.
   *
   * Accepts `null` (clears the filter) or a non-empty string. Any
   * other value is treated as a programming error and the call is a
   * no-op so the state reference is preserved (avoiding spurious
   * listener notifications). When the new value equals the current
   * one, the call is also a no-op.
   *
   * Validates: Requirements 3.2, 3.4, 3.6.
   *
   * @param {unknown} clubId
   * @returns {AppState}
   */
  function setFilterClub(clubId) {
    return replaceState((state) => {
      if (clubId !== null && typeof clubId !== 'string') return state;
      if (clubId === state.filter.clubId) return state;
      const candidates = recomputeCandidates(clubId, state.filter.editionId);
      return {
        ...state,
        filter: { ...state.filter, clubId },
        candidates,
      };
    });
  }

  /**
   * Sets the Edicao_Liga filter, recomputing `candidates`.
   *
   * Mirrors `setFilterClub`. See its documentation for input
   * validation and semantics.
   *
   * Validates: Requirements 3.2, 3.4, 3.6.
   *
   * @param {unknown} editionId
   * @returns {AppState}
   */
  function setFilterEdition(editionId) {
    return replaceState((state) => {
      if (editionId !== null && typeof editionId !== 'string') return state;
      if (editionId === state.filter.editionId) return state;
      const candidates = recomputeCandidates(state.filter.clubId, editionId);
      return {
        ...state,
        filter: { ...state.filter, editionId },
        candidates,
      };
    });
  }

  // -------------------------------------------------------------------
  // Actions (task 15.3): assignment, removal, notifications.
  // -------------------------------------------------------------------

  /**
   * Maps `AssignErrorReason` values to user-facing messages (pt-BR).
   * @type {Record<string, string>}
   */
  const ASSIGN_ERROR_MESSAGES = {
    [AssignErrorReason.PositionMismatch]: 'Posição incompatível',
    [AssignErrorReason.AlreadyInTeam]: 'Jogador já está no time',
    [AssignErrorReason.TeamFull]: 'Time já está completo',
    [AssignErrorReason.UnknownSlot]: 'Slot desconhecido',
    [AssignErrorReason.UnknownRegistration]: 'Inscrição desconhecida',
  };

  /**
   * Generates a unique notification id. Uses `crypto.randomUUID` when
   * available, otherwise falls back to a timestamp + random combo.
   * @returns {string}
   */
  function generateNotificationId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Creates a notification object.
   * @param {string} message
   * @param {'error'|'info'} type
   * @returns {{ id: string, message: string, type: 'error'|'info', timestamp: number }}
   */
  function createNotification(message, type) {
    return {
      id: generateNotificationId(),
      message,
      type,
      timestamp: Date.now(),
    };
  }

  /**
   * Assigns a registration to a slot.
   *
   * Validates the assignment via `canAssign`. On rejection, emits an
   * error notification with the mapped message and returns state
   * unchanged (except for the added notification). On success, updates
   * `state.team` with the new assignment.
   *
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.7.
   *
   * @param {string} slotId
   * @param {string} registrationId
   * @returns {AppState}
   */
  function assignPlayer(slotId, registrationId) {
    return replaceState((state) => {
      if (state.team == null || state.activeFormationId == null) {
        const notification = createNotification('Slot desconhecido', 'error');
        return {
          ...state,
          notifications: [...state.notifications, notification],
        };
      }

      // Resolve the slot from the active formation.
      const formation = getFormation(state.activeFormationId);
      if (formation === undefined) {
        const notification = createNotification('Slot desconhecido', 'error');
        return {
          ...state,
          notifications: [...state.notifications, notification],
        };
      }

      const slot = formation.slots.find((s) => s.id === slotId);

      // Resolve the registration from the repo.
      const registration = repo != null && repo.registrationsById != null
        ? (repo.registrationsById instanceof Map
          ? repo.registrationsById.get(registrationId)
          : repo.registrationsById[registrationId])
        : undefined;

      // Build the registrations index for canAssign (needed for
      // AlreadyInTeam detection).
      const registrations = repo != null ? repo.registrationsById : undefined;

      const result = canAssign({
        team: state.team,
        slot: slot ?? null,
        registration: registration ?? null,
        registrations,
      });

      if (!result.ok) {
        const message = ASSIGN_ERROR_MESSAGES[result.reason] ?? 'Erro desconhecido';
        const notification = createNotification(message, 'error');
        return {
          ...state,
          notifications: [...state.notifications, notification],
        };
      }

      // Assignment is valid. Apply it.
      const nextTeam = assign(state.team, slotId, registrationId);
      return {
        ...state,
        team: nextTeam,
      };
    });
  }

  /**
   * Removes the occupant from a slot.
   *
   * If the slot is already empty, emits an informational notification
   * ("Slot já está vazio") and returns state unchanged (except for the
   * notification). Otherwise calls `unassign` to free the slot.
   *
   * Validates: Requirements 6.1, 6.3.
   *
   * @param {string} slotId
   * @returns {AppState}
   */
  function unassignSlot(slotId) {
    return replaceState((state) => {
      if (state.team == null) {
        const notification = createNotification('Slot já está vazio', 'info');
        return {
          ...state,
          notifications: [...state.notifications, notification],
        };
      }

      const occupant = getOccupant(state.team, slotId);
      if (occupant === null) {
        const notification = createNotification('Slot já está vazio', 'info');
        return {
          ...state,
          notifications: [...state.notifications, notification],
        };
      }

      const nextTeam = unassign(state.team, slotId);
      return {
        ...state,
        team: nextTeam,
      };
    });
  }

  /**
   * Dismisses a notification by id.
   *
   * Filters out the notification with the matching `id` from
   * `state.notifications`. If no notification matches, returns state
   * unchanged.
   *
   * @param {string} id
   * @returns {AppState}
   */
  function dismissNotification(id) {
    return replaceState((state) => {
      const filtered = state.notifications.filter((n) => n.id !== id);
      if (filtered.length === state.notifications.length) {
        return state;
      }
      return {
        ...state,
        notifications: filtered,
      };
    });
  }

  /**
   * Retries loading the registrations resource.
   *
   * On success, updates the repository's registrations index and
   * recomputes candidates. On failure, emits an error notification.
   *
   * Validates: Requirements 3.7.
   *
   * @returns {Promise<AppState>}
   */
  async function retryRegistrationsLoad() {
    const result = await reloadRegistrations();

    if (!result.ok) {
      return replaceState((state) => {
        const notification = createNotification(
          `Falha ao recarregar inscrições: ${result.reason}`,
          'error',
        );
        return {
          ...state,
          notifications: [...state.notifications, notification],
        };
      });
    }

    // On success, update the repo's registrations data and recompute
    // candidates based on the current filter state.
    if (repo != null && typeof repo.updateRegistrations === 'function') {
      repo.updateRegistrations(result.data);
    }

    return replaceState((state) => {
      const candidates = recomputeCandidates(
        state.filter.clubId,
        state.filter.editionId,
      );
      return {
        ...state,
        candidates,
      };
    });
  }

  /**
   * Sets the tactical style ('defensive' | 'balanced' | 'offensive').
   * This affects how slot coordinates are shifted on the field view.
   *
   * @param {string} style
   * @returns {AppState}
   */
  function setTacticalStyle(style) {
    const valid = ['defensive', 'balanced', 'offensive'];
    return replaceState((state) => {
      if (!valid.includes(style)) return state;
      if (state.tacticalStyle === style) return state;
      return { ...state, tacticalStyle: style };
    });
  }

  /**
   * Enters slot-picking mode: highlights compatible slots on the field.
   */
  function startAssignment(registrationId, positions) {
    return replaceState((state) => {
      return { ...state, pendingAssignment: { registrationId, positions: positions || [] } };
    });
  }

  /**
   * Cancels slot-picking mode.
   */
  function cancelAssignment() {
    return replaceState((state) => {
      if (state.pendingAssignment === null) return state;
      return { ...state, pendingAssignment: null };
    });
  }

  /**
   * Confirms assignment of the pending player to a specific slot.
   */
  function confirmAssignment(slotId) {
    return replaceState((state) => {
      if (state.pendingAssignment == null) return state;
      const { registrationId } = state.pendingAssignment;
      const stateCleared = { ...state, pendingAssignment: null };

      if (stateCleared.team == null || stateCleared.activeFormationId == null) {
        return stateCleared;
      }

      const formation = getFormation(stateCleared.activeFormationId);
      if (formation === undefined) return stateCleared;

      const slot = formation.slots.find((s) => s.id === slotId);
      const registration = repo != null && repo.registrationsById != null
        ? (repo.registrationsById instanceof Map
          ? repo.registrationsById.get(registrationId)
          : repo.registrationsById[registrationId])
        : undefined;

      const registrations = repo != null ? repo.registrationsById : undefined;
      const result = canAssign({
        team: stateCleared.team,
        slot: slot ?? null,
        registration: registration ?? null,
        registrations,
      });

      if (!result.ok) {
        const message = ASSIGN_ERROR_MESSAGES[result.reason] ?? 'Erro desconhecido';
        const notification = createNotification(message, 'error');
        return { ...stateCleared, notifications: [...stateCleared.notifications, notification] };
      }

      const nextTeam = assign(stateCleared.team, slotId, registrationId);
      return { ...stateCleared, team: nextTeam };
    });
  }

  return {
    getState,
    subscribe,
    replaceState,
    setActiveFormation,
    setFilterClub,
    setFilterEdition,
    setTacticalStyle,
    startAssignment,
    cancelAssignment,
    confirmAssignment,
    assignPlayer,
    unassignSlot,
    dismissNotification,
    retryRegistrationsLoad,
  };
}
