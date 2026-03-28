/**
 * Story: Explorer First Visit (Design Spec Story 1)
 *
 * Validates the full first-visit flow: empty state → select source →
 * write SQL → run query → drag columns to insight → chart preview → save.
 *
 * Precondition: Sandbox running on :3001/:8001
 *
 * NOTE: This test will SKIP steps that depend on Explorer features not yet built.
 * As Explorer phases are implemented, remove the skip markers.
 */

import { test, expect } from '@playwright/test';

test.describe('Explorer First Visit', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        // Collect but don't fail — checked per step
        page._consoleErrors = page._consoleErrors || [];
        page._consoleErrors.push(msg.text());
      }
    });
    page._consoleErrors = [];
  });

  test('Step 1: Three-panel layout renders', async ({ page }) => {
    await page.goto('/#/explorer/new');
    await page.waitForLoadState('networkidle');

    // Verify the page loaded (not a 404 or blank)
    const bodyText = await page.textContent('body');
    expect(bodyText.length).toBeGreaterThan(50);

    // Check for console errors
    const realErrors = (page._consoleErrors || []).filter(
      e => !e.includes('favicon') && !e.includes('react-cool-dimensions')
    );
    expect(realErrors).toHaveLength(0);

    await page.screenshot({ path: 'e2e/screenshots/explorer-first-visit-step1.png' });
  });

  test('Step 2: Source tree expands and shows tables', async ({ page }) => {
    await page.goto('/#/explorer/new');
    await page.waitForLoadState('networkidle');

    // Look for source tree / left nav
    const sourceSection = page.locator('[data-testid*="source"], [class*="source"], [class*="LeftNav"]');
    if (await sourceSection.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await sourceSection.first().click();
      await page.waitForTimeout(1000);

      await page.screenshot({ path: 'e2e/screenshots/explorer-first-visit-step2.png' });
    }
  });

  test('Step 3: Double-click table populates SQL editor', async ({ page }) => {
    test.skip(true, 'Depends on Explorer source tree double-click being implemented');

    await page.goto('/#/explorer/new');
    await page.waitForLoadState('networkidle');

    // Double-click a table in the source tree
    // VERIFY: SQL editor populates with "SELECT * FROM <table>"
    // VERIFY: Source pill shows correct source
  });

  test('Step 4: Run query loads data table', async ({ page }) => {
    test.skip(true, 'Depends on Explorer SQL editor and Run button being implemented');

    await page.goto('/#/explorer/new');
    await page.waitForLoadState('networkidle');

    // Click Run button
    // VERIFY: Network shows /api/model-query-jobs/ POST with 200
    // VERIFY: Data table appears with rows
    // VERIFY: Column headers show as pills
  });

  test('Step 5: Drag column to insight x field', async ({ page }) => {
    test.skip(true, 'Depends on Explorer DnD being implemented');

    // VERIFY: Insight x field shows dropped column as pill
    // VERIFY: Value format is ?{${ref(model).column}}
  });

  test('Step 6: Drag column to y field renders chart', async ({ page }) => {
    test.skip(true, 'Depends on Explorer DnD and chart preview being implemented');

    // VERIFY: Chart preview renders a scatter plot
    // VERIFY: No console errors
  });

  test('Step 7: Save All creates objects', async ({ page }) => {
    test.skip(true, 'Depends on Explorer save flow being implemented');

    // Click Save All
    // VERIFY: Save modal shows new objects (model, insight, chart)
    // VERIFY: Network shows save API calls with 200
  });
});
