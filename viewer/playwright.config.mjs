import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // No webServer config — sandbox must be started separately
  // via `visivo serve --port 8001` + `yarn start:sandbox`
  // This keeps Claude's tests fully isolated from user's :3000/:8000
});
