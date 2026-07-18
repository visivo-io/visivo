import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  // 2 retries absorb transient flakes from concurrent sandbox job-polling races
  // (insight-jobs, model-query-jobs) and mouse-coordinate flakes (US-REF-11)
  // without hiding real regressions.
  retries: 2,
  workers: '75%',
  use: {
    // Defaults to the standard sandbox (:3001). An isolated hardening sandbox
    // (e.g. :3022) can be targeted via PLAYWRIGHT_BASE_URL without editing this
    // file, so parallel agents don't collide on ports.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Three projects:
  //   parallel        — read-only specs, sandbox on :3001 (integration project)
  //   state-mutating  — in-memory save specs, sandbox on :3001, runs after parallel
  //   publish         — file-mutating specs, isolated sandbox on :3002
  //                     (test-projects/explorer-publish-e2e) — runs serially
  //                     within itself but concurrently with the others.
  projects: [
    {
      name: 'parallel',
      testIgnore: [
        '**/explorer-crud-save.spec.mjs',
        '**/explorer-library-reactivity.spec.mjs',
        '**/explorer-publish-to-files.spec.mjs',
        '**/build-mode-publish.spec.mjs',
        '**/external-edit-banner.spec.mjs',
        '**/library-inline-create.spec.mjs',
        '**/validation-as-save.spec.mjs',
        // VIS-993 regression: canvas edits must persist to the DRAFT CACHE
        // (backend), so this story writes state and runs serially.
        '**/canvas-editing.spec.mjs',
        // Phase 2 e2e gate (VIS-1050): explorations live in ONE file-backed
        // repository shared by every worker (`.visivo/explorations/`, no
        // per-worker isolation like localStorage-scoped Phase 0 state) — see
        // the 'exploration-mutations' project below.
        '**/explorer-home.spec.mjs',
        '**/exploration-lifecycle.spec.mjs',
        // Phase 3a (VIS-1053/1054): both create/delete real backend
        // exploration records via the same shared `.visivo/explorations/`
        // repository (query-chip CRUD mutates the draft directly; the DnD
        // pull-in specs each mint + clean up an exploration) — same
        // isolation need as the two specs above, same project.
        '**/exploration-dnd-pull-in.spec.mjs',
        '**/exploration-query-chips.spec.mjs',
        // Docs specs run against the docs sandbox (:8003) via
        // playwright.docs.config.mjs — never against the viewer sandbox.
        '**/e2e/docs/**',
      ],
    },
    {
      name: 'state-mutating',
      testMatch: [
        '**/explorer-crud-save.spec.mjs',
        // J-4: saves a chart from Explorer, asserts the Library reflects it.
        '**/explorer-library-reactivity.spec.mjs',
        // Drafts objects into the backend cache via the Library create flow.
        '**/library-inline-create.spec.mjs',
        // VIS-993: the valid-save step drafts a dimension into the cache.
        '**/validation-as-save.spec.mjs',
        // VIS-993 regression: canvas resize/DnD edits draft dashboard changes
        // into the cache and assert them via /api/dashboards/ + reload.
        '**/canvas-editing.spec.mjs',
      ],
      dependencies: ['parallel'],
    },
    {
      name: 'publish',
      testMatch: ['**/explorer-publish-to-files.spec.mjs'],
      use: { baseURL: 'http://localhost:3002' },
      fullyParallel: false,
      workers: 1,
      // Retries would run against polluted backend cache from the failed
      // attempt, so they give no useful signal. Fail fast instead.
      retries: 0,
    },
    {
      // Track H stories (VIS-806/808) — both mutate the integration project's
      // YAML on disk (publish writes / external-edit simulation), so they get
      // the same isolation as 'publish': serial, no retries (a retry would
      // race the file-watcher recompile triggered by the previous attempt's
      // YAML restore and see phantom pending changes). Targets its own
      // sandbox via VIS_PUBLISH_BASE.
      name: 'workspace-publish',
      testMatch: ['**/build-mode-publish.spec.mjs', '**/external-edit-banner.spec.mjs'],
      fullyParallel: false,
      workers: 1,
      retries: 0,
    },
    {
      // Explore 2.0 Phase 2 e2e gate: explorations are S3'd to ONE JSON
      // repository under `.visivo/explorations/` (ExplorationRepository),
      // shared by every worker against the same :3001 sandbox — unlike Phase
      // 0's tab/view-switcher stories, which only ever touch per-worker
      // in-memory Zustand state. Running these concurrently means one
      // worker's create/rename/delete races another's list fetch (e.g. a
      // fresh page's "lazily seed Scratch" firing against a directory another
      // worker just emptied), so — same precedent as 'publish' /
      // 'workspace-publish' — they get their own serial, no-retry project.
      //
      // Deliberately NO `dependencies: ['parallel']` here (unlike
      // 'state-mutating'): a Playwright project dependency always runs the
      // ENTIRE dependency project, ignoring any file-name filter on the CLI
      // invocation — `npx playwright test explorer-home.spec.mjs` would
      // silently balloon into running all ~150 'parallel' spec files first.
      // 'exploration-mutations' runs CONCURRENTLY with 'parallel' (same as
      // 'publish'/'workspace-publish'); a single observed flake under
      // combined 5-worker load (a slow round-trip missing a 15s timeout) was
      // not reproducible across 7+ repeated runs and wasn't worth the
      // dependency's cost.
      name: 'exploration-mutations',
      testMatch: [
        '**/explorer-home.spec.mjs',
        '**/exploration-lifecycle.spec.mjs',
        // Phase 3a additions (VIS-1053/1054) — see the 'parallel' project's
        // testIgnore entry for the same two files for why.
        '**/exploration-dnd-pull-in.spec.mjs',
        '**/exploration-query-chips.spec.mjs',
      ],
      fullyParallel: false,
      workers: 1,
      retries: 0,
    },
  ],
  // No webServer config — sandbox must be started separately
  // via `visivo serve --port 8001` + `yarn start:sandbox`
  // This keeps Claude's tests fully isolated from user's :3000/:8000
});
