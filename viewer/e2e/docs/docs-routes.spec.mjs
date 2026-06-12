/**
 * Docs routes smoke suite.
 *
 * Validates that the core docs page types render correctly:
 *   - the home / quick-start page (hand-written)
 *   - a generated configuration-reference page (from write_mkdocs_markdown_files.py)
 *   - a topics page (hand-written prose)
 *   - the installation page
 *
 * Each page must render an h1, expose the Material header nav + search,
 * and produce ZERO console errors (third-party analytics noise excluded).
 *
 * Precondition: docs sandbox running on :8003 (or $VISIVO_DOCS_PORT)
 *   bash scripts/docs_sandbox.sh start
 */

import { test, expect } from '@playwright/test';

const ROUTES = [
  { name: 'home (quick start)', path: '/' },
  { name: 'generated reference (Dashboard)', path: '/reference/configuration/Dashboards/Dashboard/' },
  { name: 'topics (sources)', path: '/topics/sources/' },
  { name: 'installation', path: '/installation/' },
];

// Errors from third-party analytics (gtag/GA) are environmental, not docs bugs.
const isThirdPartyNoise = text =>
  /googletagmanager|google-analytics|gtag|doubleclick/i.test(text);

for (const route of ROUTES) {
  test.describe(`docs route: ${route.name}`, () => {
    test(`${route.path} renders with h1, Material nav + search, no console errors`, async ({
      page,
    }) => {
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', err => consoleErrors.push(String(err)));

      const response = await page.goto(route.path);
      expect(response.status(), `${route.path} should respond 200`).toBe(200);
      await page.waitForLoadState('domcontentloaded');

      // A single h1 with real content
      const h1 = page.locator('article h1, .md-content h1').first();
      await expect(h1).toBeVisible();
      expect((await h1.innerText()).trim().length).toBeGreaterThan(0);

      // Material chrome: header, primary nav, and search are present.
      // (On mobile the nav/search live behind toggles, so assert attachment,
      // not visibility.)
      await expect(page.locator('header.md-header')).toBeAttached();
      await expect(page.locator('nav.md-nav--primary')).toBeAttached();
      await expect(page.locator('[data-md-component="search"]')).toBeAttached();

      const realErrors = consoleErrors.filter(e => !isThirdPartyNoise(e));
      expect(realErrors, `console errors on ${route.path}:\n${realErrors.join('\n')}`).toEqual(
        []
      );
    });
  });
}

test('unknown docs path serves the 404 page', async ({ page }) => {
  const response = await page.goto('/this/page/does/not/exist/');
  expect(response.status()).toBe(404);
});
