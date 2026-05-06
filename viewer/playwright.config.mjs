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
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Four projects:
  //   parallel        — read-only specs, sandbox on :3001 (integration project)
  //   state-mutating  — in-memory save specs, sandbox on :3001, runs after parallel
  //   publish         — file-mutating specs, isolated sandbox on :3002
  //                     (test-projects/explorer-publish-e2e) — runs serially
  //                     within itself but concurrently with the others.
  //   save-flow       — Branch 9 immediate-write specs, isolated sandbox on
  //                     :3019 against test-projects/save-flow-immediate-write.
  //                     Started via `bash scripts/sandbox-save-flow.sh start`.
  projects: [
    {
      name: 'parallel',
      testIgnore: [
        '**/explorer-crud-save.spec.mjs',
        '**/explorer-publish-to-files.spec.mjs',
        '**/source-save-immediate-write.spec.mjs',
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
      use: { baseURL: 'http://localhost:3002' },
      fullyParallel: false,
      workers: 1,
      // Retries would run against polluted backend cache from the failed
      // attempt, so they give no useful signal. Fail fast instead.
      retries: 0,
    },
    {
      name: 'save-flow',
      testMatch: ['**/source-save-immediate-write.spec.mjs'],
      use: { baseURL: 'http://localhost:3019' },
      fullyParallel: false,
      workers: 1,
      retries: 0,
    },
  ],
  // No webServer config — sandbox must be started separately
  // via `visivo serve --port 8001` + `yarn start:sandbox`
  // This keeps Claude's tests fully isolated from user's :3000/:8000
});
