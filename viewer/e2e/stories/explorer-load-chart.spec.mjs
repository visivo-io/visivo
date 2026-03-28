/**
 * Story: Load Existing Chart (Design Spec Story 3)
 *
 * Validates loading an existing chart into the Explorer: model tabs populate
 * from lineage, insights populate, chart preview renders, and editing works.
 *
 * Precondition: Sandbox running on :3001/:8001 with a project that has saved charts.
 *
 * NOTE: Steps are skipped until Explorer chart-loading is implemented.
 */

import { test, expect } from '@playwright/test';

test.describe('Explorer Load Existing Chart', () => {
  test('Step 1: Click chart in left nav populates model tabs', async ({ page }) => {
    test.skip(true, 'Depends on Explorer chart loading being implemented');

    await page.goto('/#/explorer/new');
    await page.waitForLoadState('networkidle');

    // Click a chart in left nav Charts section
    // VERIFY: Model tabs populate from chart lineage
    // VERIFY: SQL editor shows first model's SQL
    // VERIFY: Right panel shows insights from the chart
  });

  test('Step 2: Switch model tab updates editor', async ({ page }) => {
    test.skip(true, 'Depends on Explorer chart loading being implemented');

    // Click second model tab
    // VERIFY: SQL editor switches to second model's SQL
    // VERIFY: Data table updates if query was previously run
  });

  test('Step 3: Expand collapsed insight shows properties', async ({ page }) => {
    test.skip(true, 'Depends on Explorer insight CRUD being implemented');

    // Click collapsed insight header
    // VERIFY: Properties show filled values
    // VERIFY: Other insights collapse
  });

  test('Step 4: Edit insight property updates chart preview', async ({ page }) => {
    test.skip(true, 'Depends on Explorer reactive chart preview being implemented');

    // Edit an insight property value
    // VERIFY: Chart preview updates reactively
    // VERIFY: No console errors
  });
});
