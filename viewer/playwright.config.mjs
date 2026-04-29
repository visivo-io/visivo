import { defineConfig } from '@playwright/test';

// Sandbox ports default to :3001 (default sandbox) and :3002 (publish sandbox).
// Parallel worktrees can override via env vars to point at their own sandbox
// instances without colliding with the user's primary checkout.
//   VISIVO_SANDBOX_FRONTEND_PORT       — overrides the default sandbox port
//   VISIVO_PUBLISH_SANDBOX_FRONTEND_PORT — overrides the publish sandbox port
const SANDBOX_PORT = process.env.VISIVO_SANDBOX_FRONTEND_PORT || '3001';
const PUBLISH_SANDBOX_PORT =
  process.env.VISIVO_PUBLISH_SANDBOX_FRONTEND_PORT || '3002';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  // 2 retries absorb transient flakes from concurrent sandbox job-polling races
  // (insight-jobs, model-query-jobs) and mouse-coordinate flakes (US-REF-11)
  // without hiding real regressions.
  retries: 2,
  workers: '75%',
  use: {
    baseURL: `http://localhost:${SANDBOX_PORT}`,
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
        '**/explorer-publish-to-files.spec.mjs',
      ],
    },
    {
      name: 'state-mutating',
      testMatch: ['**/explorer-crud-save.spec.mjs'],
      dependencies: ['parallel'],
    },
    {
      name: 'publish',
      testMatch: ['**/explorer-publish-to-files.spec.mjs'],
      use: { baseURL: `http://localhost:${PUBLISH_SANDBOX_PORT}` },
      fullyParallel: false,
      workers: 1,
      // Retries would run against polluted backend cache from the failed
      // attempt, so they give no useful signal. Fail fast instead.
      retries: 0,
    },
  ],
  // No webServer config — sandbox must be started separately
  // via `visivo serve --port 8001` + `yarn start:sandbox`
  // This keeps Claude's tests fully isolated from user's :3000/:8000
});
