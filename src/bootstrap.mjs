// src/bootstrap.mjs
//
// Application entry point. Orchestrates the load → integrity → repository
// pipeline and mounts UI components into their respective DOM containers.
//
// Loaded as `<script type="module">` from index.html, so top-level await
// is available.
//
// Validates: Requirements 1.7, 9.1, 9.2, 9.4

import { loadAll, summarizeLoadFailure } from './data/loader.mjs';
import { validateIntegrity } from './data/integrity.mjs';
import { buildRepository } from './data/repository.mjs';
import { createStore } from './state/store.mjs';
import { createFormationSelector } from './ui/formationSelector.mjs';
import { createFieldView } from './ui/fieldView.mjs';
import { createPlayerPanel } from './ui/playerPanel.mjs';
import { createNotifications } from './ui/notifications.mjs';
import { createLeagueView } from './ui/leagueView.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders a blocking error overlay in the document body indicating which
 * resource(s) failed to load or which integrity error occurred.
 *
 * @param {string} title — short heading for the overlay
 * @param {string} detail — longer description (may be multi-line)
 */
function renderErrorOverlay(title, detail) {
  const overlay = document.createElement('div');
  overlay.className = 'load-error-overlay';
  overlay.setAttribute('role', 'alert');

  const heading = document.createElement('h2');
  heading.textContent = title;
  overlay.appendChild(heading);

  const message = document.createElement('pre');
  message.className = 'load-error-detail';
  message.textContent = detail;
  overlay.appendChild(message);

  document.body.appendChild(overlay);
}

/**
 * Safely mounts a DOM element into a container identified by id.
 * If the container doesn't exist (e.g. task 21.2 hasn't run yet),
 * the mount is silently skipped.
 *
 * @param {string} containerId
 * @param {HTMLElement} element
 */
function mount(containerId, element) {
  const container = document.getElementById(containerId);
  if (container == null) return;
  container.appendChild(element);
}

// ---------------------------------------------------------------------------
// Bootstrap pipeline
// ---------------------------------------------------------------------------

// Step 1: Load all static data files.
const loadResult = await loadAll();

if (!loadResult.ok) {
  // Summarize which resources failed.
  const failures = summarizeLoadFailure(loadResult);
  const detail = failures
    .map((f) => `• ${f.resource}: ${f.reason}`)
    .join('\n');

  renderErrorOverlay(
    'Falha ao carregar dados',
    detail || 'Erro desconhecido durante o carregamento.',
  );

  // Create a store in error state so notifications can still render.
  const errorStore = createStore({
    status: 'error',
    loadError: failures.length > 0 ? failures[0] : null,
  });

  // Mount only the notifications component (still useful for errors).
  const notificationsEl = createNotifications(errorStore);
  mount('notifications', notificationsEl);

  // Block remaining UI — do NOT mount formationSelector, fieldView,
  // or playerPanel.
} else {
  // Step 2: Extract raw data from each successful result.
  const rawData = {
    leagues: loadResult.results.leagues.data,
    editions: loadResult.results.editions.data,
    clubs: loadResult.results.clubs.data,
    clubEditions: loadResult.results.clubEditions.data,
    players: loadResult.results.players.data,
    registrations: loadResult.results.registrations.data,
  };

  // Step 3: Validate data integrity.
  const integrityResult = validateIntegrity(rawData);

  if (integrityResult.error) {
    // Integrity failure is treated as a fatal load error.
    renderErrorOverlay(
      'Erro de integridade nos dados',
      integrityResult.error,
    );

    const errorStore = createStore({
      status: 'error',
      loadError: { resource: 'integrity', reason: integrityResult.error },
    });

    const notificationsEl = createNotifications(errorStore);
    mount('notifications', notificationsEl);

    // Block remaining UI.
  } else {
    // Step 4: Build the indexed repository from validated data.
    const repo = buildRepository(integrityResult.data);

    // Step 5: Create the central store in 'ready' state.
    const store = createStore({ status: 'ready' }, { repo });

    // Step 6: Mount all UI components.
    const formationSelectorEl = createFormationSelector(store, repo);
    mount('formation-selector', formationSelectorEl);

    const fieldViewEl = createFieldView(store, { repo });
    mount('field-view', fieldViewEl);

    const playerPanelEl = createPlayerPanel(store, repo);
    mount('player-panel', playerPanelEl);

    const notificationsEl = createNotifications(store);
    mount('notifications', notificationsEl);

    // League view: start button goes into the sidebar, overlay into #league-view
    const { container: leagueContainer, startBtn: leagueStartBtn } = createLeagueView(store, repo);
    mount('league-view', leagueContainer);
    // Append start button to the formation selector sidebar
    const sidebarEl = document.getElementById('formation-selector');
    if (sidebarEl) {
      sidebarEl.appendChild(leagueStartBtn);
    }
  }
}
