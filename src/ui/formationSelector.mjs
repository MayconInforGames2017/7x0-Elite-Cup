/**
 * Left Sidebar UI — Two-phase flow:
 *
 * Phase 1 (Setup): Formation + Style + "COMEÇAR" button
 * Phase 2 (Drafting): Club + Edition selectors + Candidate list
 */

import { listFormations } from '../domain/formations.mjs';
import { createPlayerCard } from './playerCard.mjs';
import { deriveRegistrationId } from '../data/ids.mjs';
import { clubParticipated, listAllEditions } from '../data/repository.mjs';
import { listAssignedPlayerIds } from '../domain/team.mjs';
import { abbreviatePosition } from './formatters.mjs';

/** Position sort priority: GOL first, ATA last */
const POSITION_ORDER = {
  Goleiro: 0,
  Zagueiro: 1,
  Lateral_Esquerdo: 2,
  Lateral_Direito: 3,
  Volante: 4,
  Meia_Central: 5,
  Meia_Ofensivo: 6,
  Ponta_Esquerda: 7,
  Ponta_Direita: 8,
  Atacante: 9,
};

function getPositionPriority(positions) {
  if (!positions || positions.length === 0) return 99;
  return Math.min(...positions.map(p => POSITION_ORDER[p] ?? 50));
}

const TACTICAL_STYLES = [
  { id: 'defensive', label: 'Defensivo' },
  { id: 'balanced', label: 'Equilibrado' },
  { id: 'offensive', label: 'Ofensivo' },
];

/**
 * Creates the left sidebar with two-phase flow.
 *
 * @param {object} store
 * @param {object} repo
 * @returns {HTMLDivElement}
 */
export function createFormationSelector(store, repo) {
  const container = document.createElement('div');
  container.className = 'sidebar-controls';

  // ===================== PHASE 1: SETUP =====================
  const phase1 = document.createElement('div');
  phase1.className = 'sidebar-phase phase-setup';

  // Formation title + grid
  const formationTitle = document.createElement('h3');
  formationTitle.className = 'sidebar-title';
  formationTitle.textContent = 'Formação';
  phase1.appendChild(formationTitle);

  const formationGrid = document.createElement('div');
  formationGrid.className = 'formation-buttons';

  const formations = listFormations();
  const formationBtns = new Map();

  for (const formation of formations) {
    const button = document.createElement('button');
    button.className = 'formation-button';
    button.textContent = formation.label;
    button.addEventListener('click', () => {
      store.setActiveFormation(formation.id);
    });
    formationBtns.set(formation.id, button);
    formationGrid.appendChild(button);
  }
  phase1.appendChild(formationGrid);

  // Style title + grid
  const styleTitle = document.createElement('h3');
  styleTitle.className = 'sidebar-title';
  styleTitle.textContent = 'Estilo';
  phase1.appendChild(styleTitle);

  const styleGrid = document.createElement('div');
  styleGrid.className = 'style-buttons';

  const styleBtns = new Map();
  for (const style of TACTICAL_STYLES) {
    const button = document.createElement('button');
    button.className = 'style-button';
    button.textContent = style.label;
    button.addEventListener('click', () => {
      store.setTacticalStyle(style.id);
    });
    styleBtns.set(style.id, button);
    styleGrid.appendChild(button);
  }
  phase1.appendChild(styleGrid);

  // "COMEÇAR" button
  const startBtn = document.createElement('button');
  startBtn.className = 'start-button';
  startBtn.textContent = 'COMEÇAR';
  startBtn.disabled = true;
  startBtn.addEventListener('click', () => {
    phase1.style.display = 'none';
    phase2.style.display = 'flex';
  });
  phase1.appendChild(startBtn);

  container.appendChild(phase1);

  // ===================== PHASE 2: DRAFTING =====================
  const phase2 = document.createElement('div');
  phase2.className = 'sidebar-phase phase-draft';
  phase2.style.display = 'none';

  // Back button to return to setup
  const backBtn = document.createElement('button');
  backBtn.className = 'back-button';
  backBtn.textContent = '← Configuração';
  backBtn.addEventListener('click', () => {
    phase2.style.display = 'none';
    phase1.style.display = 'flex';
  });
  phase2.appendChild(backBtn);

  // Current config summary
  const configSummary = document.createElement('div');
  configSummary.className = 'config-summary';
  phase2.appendChild(configSummary);

  // Club select
  const clubTitle = document.createElement('h3');
  clubTitle.className = 'sidebar-title';
  clubTitle.textContent = 'Clube';
  phase2.appendChild(clubTitle);

  const clubSelect = document.createElement('select');
  clubSelect.classList.add('panel-select');
  const clubPlaceholder = document.createElement('option');
  clubPlaceholder.value = '';
  clubPlaceholder.textContent = 'Selecione um clube';
  clubSelect.appendChild(clubPlaceholder);

  const clubs = repo ? [...repo.clubsById.values()].sort((a, b) => a.name.localeCompare(b.name)) : [];
  for (const club of clubs) {
    const opt = document.createElement('option');
    opt.value = club.id;
    opt.textContent = club.name;
    clubSelect.appendChild(opt);
  }
  phase2.appendChild(clubSelect);

  // Edition select
  const editionTitle = document.createElement('h3');
  editionTitle.className = 'sidebar-title';
  editionTitle.textContent = 'Edição';
  phase2.appendChild(editionTitle);

  const editionSelect = document.createElement('select');
  editionSelect.classList.add('panel-select');
  phase2.appendChild(editionSelect);

  // Candidate list
  const candidateTitle = document.createElement('h3');
  candidateTitle.className = 'sidebar-title';
  candidateTitle.textContent = 'Escolha um jogador';
  phase2.appendChild(candidateTitle);

  const candidateList = document.createElement('div');
  candidateList.classList.add('candidate-list');
  phase2.appendChild(candidateList);

  container.appendChild(phase2);

  // ===================== HELPERS =====================

  function renderEditionOptions() {
    editionSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione uma edição';
    editionSelect.appendChild(placeholder);

    if (!repo) return;
    const allEditions = listAllEditions(repo);
    const selectedClubId = clubSelect.value || null;

    for (const edition of allEditions) {
      const opt = document.createElement('option');
      opt.value = edition.id;
      opt.textContent = edition.label || edition.season || edition.id;
      if (selectedClubId) {
        if (!clubParticipated(repo, selectedClubId, edition.id)) {
          opt.disabled = true;
          opt.classList.add('is-unavailable');
        }
      }
      editionSelect.appendChild(opt);
    }

    const state = store.getState();
    if (state.filter.editionId) {
      editionSelect.value = state.filter.editionId;
    }
  }

  function renderCandidates() {
    const state = store.getState();
    candidateList.innerHTML = '';

    if (!repo) return;

    // Check if team is complete (11/11) — hide the list
    if (state.team && state.team.assignments) {
      const assignedCount = Object.values(state.team.assignments).filter(v => v != null).length;
      if (assignedCount >= 11) {
        const completeMsg = document.createElement('div');
        completeMsg.classList.add('candidate-instruction');
        completeMsg.innerHTML = '✅ <strong>Time completo!</strong><br>Use o botão abaixo para iniciar a liga.';
        candidateList.appendChild(completeMsg);
        return;
      }
    }

    const { clubId, editionId } = state.filter;

    if (clubId == null || editionId == null) {
      const instruction = document.createElement('div');
      instruction.classList.add('candidate-instruction');
      instruction.textContent = 'Selecione um clube e uma edição';
      candidateList.appendChild(instruction);
      return;
    }

    if (state.candidates.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.classList.add('candidate-empty');
      emptyMsg.textContent = 'Nenhum jogador para essa combinação';
      candidateList.appendChild(emptyMsg);
      return;
    }

    const assignedPlayerIds = new Set(
      listAssignedPlayerIds(state.team, repo.registrationsById)
    );

    // Sort candidates by position priority (GOL→ZAG→...→ATA), then by rating desc
    const sorted = [...state.candidates].sort((a, b) => {
      const posA = getPositionPriority(a.registration.positions);
      const posB = getPositionPriority(b.registration.positions);
      if (posA !== posB) return posA - posB;
      const rA = a.registration.rating ?? 0;
      const rB = b.registration.rating ?? 0;
      return rB - rA;
    });

    let index = 0;
    for (const candidate of sorted) {
      index++;
      const player = repo.playersById.get(candidate.registration.playerId);
      const registrationId = deriveRegistrationId(
        candidate.registration.playerId,
        candidate.registration.clubId,
        candidate.registration.editionId,
      );

      const card = createPlayerCard({
        registration: candidate.registration,
        player: player || { id: candidate.registration.playerId, name: candidate.name },
        registrationId,
        index,
        store,
      });

      const isInTeam = assignedPlayerIds.has(candidate.registration.playerId);
      if (isInTeam) {
        card.classList.add('is-assigned');
        card.setAttribute('aria-disabled', 'true');
      }

      if (state.pendingAssignment && state.pendingAssignment.registrationId === registrationId) {
        card.classList.add('is-selecting');
      }

      candidateList.appendChild(card);
    }
  }

  function updateConfigSummary() {
    const state = store.getState();
    const formationLabel = state.activeFormationId || '—';
    const styleLabel = TACTICAL_STYLES.find(s => s.id === (state.tacticalStyle || 'balanced'))?.label || 'Equilibrado';
    configSummary.textContent = `${formationLabel} · ${styleLabel}`;
  }

  // ===================== EVENTS =====================

  clubSelect.addEventListener('change', () => {
    store.setFilterClub(clubSelect.value || null);
    renderEditionOptions();
  });

  editionSelect.addEventListener('change', () => {
    store.setFilterEdition(editionSelect.value || null);
  });

  // ===================== SYNC STATE =====================

  function syncState(state) {
    // Phase 1 buttons
    for (const [id, btn] of formationBtns) {
      btn.classList.toggle('is-active', id === state.activeFormationId);
    }
    const activeStyle = state.tacticalStyle || 'balanced';
    for (const [id, btn] of styleBtns) {
      btn.classList.toggle('is-active', id === activeStyle);
    }

    // Enable "COMEÇAR" only when formation is selected
    startBtn.disabled = state.activeFormationId === null;

    // Phase 2 updates
    updateConfigSummary();
    renderCandidates();
  }

  syncState(store.getState());
  store.subscribe(syncState);

  // Initial edition options
  renderEditionOptions();

  return container;
}
