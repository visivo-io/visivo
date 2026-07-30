/**
 * Sandbox address resolution for e2e specs.
 *
 * Specs drive the browser at the FRONTEND (`PLAYWRIGHT_BASE_URL`) but assert
 * against the BACKEND directly via `page.request.*` — including `afterEach`
 * cleanup that DELETEs records it created. Those two addresses have to belong
 * to the same sandbox.
 *
 * They used to be derived per-file, and 34 of the 47 files that need a backend
 * address hardcoded port 8001 in the derivation:
 *
 *     const apiBase = `${u.protocol}//${u.hostname}:8001`;   // port pinned
 *     const API = BASE_URL.replace(':3001', ':8001');        // no-op off :3001
 *
 * So an agent running `PLAYWRIGHT_BASE_URL=http://localhost:3062` against its
 * own isolated sandbox pointed the browser at :3062 while every backend call —
 * reads, writes, and the cleanup DELETEs — went to :8001, another sandbox
 * entirely. That silently corrupts both runs: the foreign sandbox loses records
 * mid-test, and the local run's "backend-asserted" claims are about a project
 * it never touched. It was diagnosed from a gate run whose five failures were
 * all a concurrent agent's cleanup deleting the gate's own explorations.
 *
 * Resolution order (first match wins):
 *   1. `VISIVO_API_BASE`                 — explicit full origin, e.g. http://localhost:8062
 *   2. `VISIVO_SANDBOX_BACKEND_PORT`     — the same var `scripts/sandbox.sh` takes
 *   3. the frontend port with its leading `3` swapped for `8` (3001→8001, 3062→8062),
 *      which is the pairing convention every sandbox in this repo follows
 *   4. `http://localhost:8001`           — the standard shared sandbox
 */

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';

export const apiBase = (() => {
  if (process.env.VISIVO_API_BASE) {
    return process.env.VISIVO_API_BASE.replace(/\/+$/, '');
  }
  try {
    const u = new URL(BASE_URL);
    const port =
      process.env.VISIVO_SANDBOX_BACKEND_PORT ||
      (u.port ? u.port.replace(/^3/, '8') : '8001');
    return `${u.protocol}//${u.hostname}:${port}`;
  } catch {
    return 'http://localhost:8001';
  }
})();

/** Alias — several specs named this constant `API` rather than `apiBase`. */
export const API = apiBase;
