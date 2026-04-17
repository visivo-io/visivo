/**
 * Story: Editor New Smoke
 *
 * Safety-net smoke for the editor-new view. Confirms the route loads, the
 * object list renders sources and models, and there are no console errors.
 * Targets `/editor-new` pre-rename; flips to `/editor` in the rename phase.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

test.describe('Editor New Smoke', () => {
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

    await page.goto('/editor-new');
    await page.waitForLoadState('networkidle');
    await page.getByText(/^Sources \(\d+\)/).first().waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: Object list header shows Sources section', async () => {
    await expect(page.getByText(/^Sources \(\d+\)/).first()).toBeVisible();
  });

  test('Step 2: Object list header shows Models section', async () => {
    await expect(page.getByText(/^Models \(\d+\)/).first()).toBeVisible();
  });

  test('Step 3: Search-by-name input renders', async () => {
    await expect(page.getByPlaceholder(/search by name/i).first()).toBeVisible();
  });

  test('Step 4: Empty state prompts selection', async () => {
    await expect(page.getByText(/Select an object to edit/i)).toBeVisible();
  });

  test('Step 5: No console errors during load', async () => {
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
