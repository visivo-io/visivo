/**
 * Story: Home Navigation (safety-net smoke)
 *
 * Locks down the four home page nav cards. Each card must be visible with
 * the expected label, and clicking each must change the URL away from the
 * root. Phase-agnostic: does not assert landing-page content (which shifts
 * as Phase 1 rewires and Phase 6 renames). Dedicated smoke specs
 * (lineage-new-smoke, editor-new-smoke, explorer-*) cover landing content.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

test.describe('Home Navigation', () => {
  test.setTimeout(60000);

  test('Step 1: Home renders four nav cards with labels', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const label of ['Lineage', 'Explorer', 'Editor', 'Project']) {
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible({
        timeout: 10000,
      });
    }

    const realErrors = consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('Download the React DevTools')
    );
    expect(realErrors).toHaveLength(0);
  });

  for (const label of ['Lineage', 'Explorer', 'Editor', 'Project']) {
    test(`Clicking ${label} card navigates away from root`, async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.getByRole('heading', { name: label, exact: true }).click();
      await page.waitForURL(url => url.pathname !== '/', { timeout: WAIT_FOR_PAGE });
      expect(new URL(page.url()).pathname).not.toBe('/');
    });
  }
});
