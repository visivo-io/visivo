import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  // 1 retry absorbs transient flakes from concurrent sandbox job-polling races
  // (insight-jobs, model-query-jobs) without hiding real regressions.
  retries: 1,
  workers: '75%',
  use: {
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Two projects so state-mutating specs don't race with read-only specs.
  // Read-only specs run first in parallel; state-mutating specs run afterwards.
  projects: [
    {
      name: 'parallel',
      testIgnore: ['**/explorer-crud-save.spec.mjs'],
    },
    {
      name: 'state-mutating',
      testMatch: ['**/explorer-crud-save.spec.mjs'],
      dependencies: ['parallel'],
    },
  ],
  // No webServer config — sandbox must be started separately
  // via `visivo serve --port 8001` + `yarn start:sandbox`
  // This keeps Claude's tests fully isolated from user's :3000/:8000
});
