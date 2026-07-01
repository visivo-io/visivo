import { defineConfig, devices } from '@playwright/test';

// Docs sandbox port — keep in sync with scripts/docs_sandbox.sh (default 8003).
const DOCS_PORT = process.env.VISIVO_DOCS_PORT || '8003';

export default defineConfig({
  testDir: './e2e/docs',
  timeout: 30000,
  retries: 2,
  workers: '75%',
  use: {
    baseURL: `http://localhost:${DOCS_PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Two projects so docs regressions that only show on small screens
  // (overflow, hidden nav) are caught — mirrors www's desktop+mobile gating.
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  // No webServer config — the docs sandbox must be started separately via
  // `bash scripts/docs_sandbox.sh start` (same philosophy as playwright.config.mjs:
  // keeps Claude's tests isolated from the user's dev servers).
});
