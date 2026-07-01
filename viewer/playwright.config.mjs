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
  ],
  // No webServer config — sandbox must be started separately
  // via `visivo serve --port 8001` + `yarn start:sandbox`
  // This keeps Claude's tests fully isolated from user's :3000/:8000
});
