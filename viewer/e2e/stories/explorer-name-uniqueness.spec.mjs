/**
 * Story: Cross-Object-Type Name Uniqueness
 *
 * Per Decision #2 of the insight-crud solution: names must be unique across
 * ALL object types in the project, because refs like `ref(foo)` are untyped
 * and the DAG resolver cannot distinguish a model `foo` from an insight `foo`.
 * Create/rename actions enforce this at the UI level; collisions produce
 * an inline error instead of silent auto-disambiguation.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import {
  loadExplorer,
  loadExplorerWithChart,
} from '../helpers/explorer.mjs';

test.describe('Name Uniqueness — Cross-Type Enforcement', () => {
  test.setTimeout(60000);

  test('renaming a new insight to match a cached insight shows inline error', async ({
    page,
  }) => {
    // Load a chart that has at least one insight and the chart already exists
    // (so we get an insight working-copy in the right panel).
    await loadExplorer(page);

    // The integration project ships with insights we can collide against.
    // Create a new empty insight via the right-panel "Add insight" flow
    // (or, simpler: click the Add insight + button in the chart CRUD section).
    // For this test we assume the explorer starts with an auto-created insight
    // and we can click its name to enter rename mode.

    // Wait for the auto-created insight section to appear
    const insightSection = page.locator('[data-testid^="insight-crud-section-"]').first();
    await insightSection.waitFor({ timeout: 10000 });

    // Find the insight name (the clickable span); rename mode is triggered by click
    const insightHeader = insightSection.locator('[data-testid^="insight-header-"]').first();
    const nameSpan = insightHeader.locator('span.cursor-pointer').first();
    await expect(nameSpan).toBeVisible({ timeout: 5000 });
    await nameSpan.click();

    // Type a name that collides with an existing cached insight name.
    // Use a known-existing insight from the integration project.
    const renameInput = insightSection
      .locator('input[data-testid^="insight-rename-input-"]')
      .first();
    await renameInput.waitFor({ timeout: 5000 });
    await renameInput.fill('sort-input-test-insight');
    // Commit via Enter (NOT Escape — that would cancel rename without collision check)
    await renameInput.press('Enter');

    // Inline error should appear and the rename should NOT have succeeded
    const errorEl = insightSection.locator('[data-testid^="insight-rename-error-"]');
    await expect(errorEl).toBeVisible({ timeout: 3000 });
    await expect(errorEl).toContainText(/already in use/i);
  });

  test('renaming a new chart to match a cached model shows inline error', async ({
    page,
  }) => {
    await loadExplorer(page);

    // The auto-created chart in a fresh explorer has a blank/default name
    // and is clickable for rename (isLoadedChart === false).
    const chartHeader = page.locator('[data-testid="chart-header"]');
    await chartHeader.waitFor({ timeout: 10000 });

    // Click the chart name to enter rename mode
    const chartNameSpan = chartHeader.locator('[data-testid="chart-name-input"]').first();
    await chartNameSpan.click();

    // Enter rename mode — now the input appears
    const renameInput = chartHeader.locator('input[data-testid="chart-name-input"]');
    await expect(renameInput).toBeVisible({ timeout: 5000 });

    // Try to name it after a cached model from the integration project
    await renameInput.fill('another_local_test_table');
    await renameInput.press('Enter');

    // Inline error should appear
    const errorEl = chartHeader.locator('[data-testid="chart-rename-error"]');
    await expect(errorEl).toBeVisible({ timeout: 3000 });
    await expect(errorEl).toContainText(/already in use/i);
  });

  test('Escape cancels rename without triggering collision error', async ({ page }) => {
    await loadExplorer(page);

    const chartHeader = page.locator('[data-testid="chart-header"]');
    await chartHeader.waitFor({ timeout: 10000 });

    const chartNameSpan = chartHeader.locator('[data-testid="chart-name-input"]').first();
    await chartNameSpan.click();

    const renameInput = chartHeader.locator('input[data-testid="chart-name-input"]');
    await expect(renameInput).toBeVisible({ timeout: 5000 });

    // Type a colliding name, then Escape — should exit rename mode cleanly
    await renameInput.fill('another_local_test_table');
    await renameInput.press('Escape');

    // Error should NOT be visible; input should be gone; span should be back
    const errorEl = chartHeader.locator('[data-testid="chart-rename-error"]');
    await expect(errorEl).not.toBeVisible();
  });
});
