/**
 * Story: Lineage New Smoke
 *
 * Safety-net smoke for the lineage view. Confirms the lens loads, React
 * Flow renders with at least one node, and there are no console errors.
 *
 * The standalone `/lineage` page was removed in VIS-772 (Track B): `/lineage`
 * now redirects to `/workspace?view=lineage`, and the universal Lineage lens
 * renders inside the Workspace middle pane scoped to a selected object. With no
 * scope the middle pane defaults to the project view, so this smoke selects a
 * chart from the Library and switches the middle pane to the Lineage lens to
 * exercise the React Flow renderer.
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

    await page.goto('/workspace');
    await page.waitForLoadState('networkidle');

    // Library per-type subsections are collapsed by default (VIS-828); expand
    // Charts, then select the first chart to scope the middle pane to it.
    await page.getByTestId('library-subsection-chart-header').click();
    const chartRow = page
      .getByTestId('library-subsection-chart-rows')
      .locator('[data-testid^="library-row-chart-"]')
      .first();
    await chartRow.waitFor({ timeout: WAIT_FOR_PAGE });
    await chartRow.click();

    // Switch the middle pane to the Lineage lens and wait for React Flow.
    await page.getByTestId('workspace-lens-picker-option-lineage').click();
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
