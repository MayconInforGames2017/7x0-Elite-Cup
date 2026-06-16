// src/data/loader.mjs
//
// Carregador estático dos arquivos JSON em `data/`.
//
// Garantias:
// - Nunca lança. Toda falha é capturada e devolvida como `{ ok: false, reason }`.
// - Distingue 4 motivos de falha por recurso:
//     - 'network': erro antes da resposta HTTP (DNS, conexão, etc.)
//     - 'http'   : resposta HTTP com status >= 400 (`detail` contém o status)
//     - 'parse'  : resposta recebida mas `response.json()` rejeitou
//     - 'timeout': `AbortController` disparou após `timeoutMs` ms
// - Não valida o conteúdo dos JSONs (isso é tarefa do módulo de integridade).
//
// Requirements: 3.7, 9.4

/**
 * Lista canônica dos 6 recursos estáticos do Banco_Dados.
 * `name` é a chave usada no objeto `results` retornado por `loadAll`.
 * `url` é resolvido relativo ao documento que carrega o módulo.
 */
export const RESOURCES = Object.freeze([
  Object.freeze({ name: 'leagues',       url: './data/leagues.json' }),
  Object.freeze({ name: 'editions',      url: './data/editions.json' }),
  Object.freeze({ name: 'clubs',         url: './data/clubs.json' }),
  Object.freeze({ name: 'clubEditions',  url: './data/club-editions.json' }),
  Object.freeze({ name: 'players',       url: './data/players.json' }),
  Object.freeze({ name: 'registrations', url: './data/registrations.json' }),
]);

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Carrega um único recurso JSON com timeout via AbortController.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<
 *   | { ok: true,  data: unknown }
 *   | { ok: false, reason: 'network' | 'http' | 'parse' | 'timeout', detail?: string }
 * >}
 */
export async function loadResource(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'network', detail: 'fetch is not available in this environment' };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (timedOut || isAbortError(err)) {
      return { ok: false, reason: 'timeout', detail: `timed out after ${timeoutMs}ms` };
    }
    return { ok: false, reason: 'network', detail: errorMessage(err) };
  }

  // A resposta chegou; cancelamos o timer antes de ler o corpo para evitar
  // abortos espúrios durante a leitura/parse.
  clearTimeout(timer);

  if (!response.ok) {
    return { ok: false, reason: 'http', detail: `status ${response.status}` };
  }

  try {
    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, reason: 'parse', detail: errorMessage(err) };
  }
}

/**
 * Carrega em paralelo os 6 recursos estáticos do Banco_Dados.
 *
 * Nunca lança. Cada falha individual é capturada como um `Result` com motivo.
 * O `ok` no nível superior é o AND lógico dos `ok` por recurso.
 *
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   results: {
 *     leagues:       LoadResult,
 *     editions:      LoadResult,
 *     clubs:         LoadResult,
 *     clubEditions:  LoadResult,
 *     players:       LoadResult,
 *     registrations: LoadResult,
 *   }
 * }>}
 *
 * @typedef {{ ok: true, data: unknown } | { ok: false, reason: 'network' | 'http' | 'parse' | 'timeout', detail?: string }} LoadResult
 */
export async function loadAll(options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const settled = await Promise.all(
    RESOURCES.map((res) => loadResource(res.url, { timeoutMs, fetchImpl })),
  );

  const results = {};
  let allOk = true;
  for (let i = 0; i < RESOURCES.length; i += 1) {
    const name = RESOURCES[i].name;
    const result = settled[i];
    results[name] = result;
    if (!result.ok) allOk = false;
  }

  return { ok: allOk, results };
}

/**
 * Recarrega apenas o recurso `registrations`, usado pelo botão
 * "Tentar novamente" do Painel_Jogadores quando o carregamento original falhou.
 *
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<LoadResult>}
 */
export async function reloadRegistrations(options = {}) {
  const resource = RESOURCES.find((r) => r.name === 'registrations');
  return loadResource(resource.url, options);
}

/**
 * Reduz o resultado de `loadAll` (ou seu campo `.results`) a uma lista de
 * falhas amigáveis para apresentação na UI.
 *
 * Função pura e total: retorna `[]` quando nada falhou.
 *
 * @param {{ ok?: boolean, results?: Record<string, LoadResult> } | Record<string, LoadResult>} loadResults
 * @returns {{ resource: string, reason: 'network' | 'http' | 'parse' | 'timeout' }[]}
 */
export function summarizeLoadFailure(loadResults) {
  if (!loadResults || typeof loadResults !== 'object') return [];
  const results = ('results' in loadResults && loadResults.results)
    ? loadResults.results
    : loadResults;
  if (!results || typeof results !== 'object') return [];

  const failures = [];
  for (const [resource, result] of Object.entries(results)) {
    if (result && result.ok === false) {
      failures.push({ resource, reason: result.reason });
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Helpers internos

function isAbortError(err) {
  if (!err) return false;
  // Em ambientes modernos, fetch aborta com DOMException name === 'AbortError'.
  return err.name === 'AbortError' || err.code === 20;
}

function errorMessage(err) {
  if (err && typeof err.message === 'string') return err.message;
  try {
    return String(err);
  } catch {
    return 'unknown error';
  }
}
