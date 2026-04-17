/**
 * Story: Lineage New Smoke
 *
 * Safety-net smoke for the lineage view. Confirms the route loads, React
 * Flow renders with at least one node, and there are no console errors.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

test.describe('Lineage New Smoke', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });

    await page.goto('/lineage');
    await page.waitForLoadState('networkidle');
    await page.locator('.react-flow').waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: React Flow renderer is mounted', async () => {
    await expect(page.locator('.react-flow')).toBeVisible();
    await expect(page.locator('.react-flow__renderer')).toBeVisible();
  });

  test('Step 2: At least one lineage node renders', async () => {
    const nodes = page.locator('.react-flow__node');
    await expect(nodes.first()).toBeVisible({ timeout: WAIT_FOR_PAGE });
    expect(await nodes.count()).toBeGreaterThan(0);
  });

  test('Step 3: No console errors during load', async () => {
    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('Download the React DevTools')
    );
    expect(realErrors).toHaveLength(0);
  });
});
