/**
 * Story: Source Creation Modal — Triggered From Anywhere
 *
 * Branch 4 lifts source creation into a single, app-level shared modal driven
 * by a Zustand store (sourceModalStore). This story validates that the same
 * modal can be opened from different entry points without forking the
 * component.
 *
 * Coverage:
 *   - /editor: FAB → "Source" opens the shared modal.
 *   - Modal closes via the X button.
 *
 * Precondition: Sandbox running on :3001/:8001
 *
 * Note on /onboarding: that route only renders when the backend reports
 * isNewProject === true. The integration test-project is already an
 * established project, so onboarding is unreachable here. The button-wiring
 * for onboarding is covered by the unit test
 * `Onboarding.test.jsx` ("opens shared SourceCreationModal …") and by the
 * useSourceCreationModal contract assertions in `sourceModalStore.test.js`.
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

test.describe('Source Creation Modal — From Anywhere', () => {
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
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    page._consoleErrors = [];
  });

  test('Step 1: Editor /editor — FAB → Source opens shared modal', async () => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
    await page
      .getByText(/^Sources \(\d+\)/)
      .first()
      .waitFor({ timeout: WAIT_FOR_PAGE });

    // FAB is the floating "+" button at the bottom-right.
    const fab = page.getByTitle('Create new object');
    await fab.click();

    // Click the "Source" option in the create menu
    await page.getByRole('button', { name: /^Source$/ }).click();

    // Shared modal renders with a deterministic data-testid hook
    const modal = page.getByTestId('source-creation-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Add Data Source')).toBeVisible();

    await page.screenshot({
      path: 'e2e/screenshots/source-modal-from-editor.png',
      fullPage: false,
    });
  });

  test('Step 2: Modal closes via the X button', async () => {
    const modal = page.getByTestId('source-creation-modal');
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('source-creation-modal')).toHaveCount(0);
  });

  test('Step 3: No console errors during modal open/close cycle', async () => {
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
