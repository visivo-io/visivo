/**
 * Story: J-1 / VIS-774 — Explorer Save modal "After save" section.
 *
 * The Save-to-Project modal gains an "After save" choice:
 *   - Stay in Explorer (default)
 *   - Open in Workspace            → navigates to /workspace
 *   - Add to dashboard <d> in slot <s> → navigates to
 *     /workspace/dashboard/<d>?slot=...&newItem=<chart>
 *
 * Precondition: sandbox on :3001/:8001 (integration project — has dashboards).
 *
 * Uses the lightweight "type SQL into a fresh model" flow to dirty the diff so
 * the save button enables — far more reliable than loading a heavy chart.
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, createModelWithSource, typeSql, runQuery } from '../helpers/explorer.mjs';

// Create a fresh model with SQL so the Explorer diff registers a change and the
// save button enables, then open the Save modal.
async function dirtyAndOpenSaveModal(page) {
  await loadExplorer(page);
  await createModelWithSource(page);
  await typeSql(page, 'SELECT 1 AS n');
  await runQuery(page).catch(() => {});
  const saveButton = page.locator('[data-testid="explorer-save-button"]');
  await expect(saveButton).toBeEnabled({ timeout: 15000 });
  await saveButton.click();
  await expect(page.locator('[data-testid="explorer-save-modal"]')).toBeVisible({ timeout: 5000 });
}

test.describe('J-1 — Explorer "After save" section', () => {
  test.setTimeout(120000);

  test('renders the three After-save radios, Stay in Explorer default', async ({ page }) => {
    await dirtyAndOpenSaveModal(page);
    await expect(page.locator('[data-testid="after-save-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="after-save-stay"]')).toBeChecked();
    await expect(page.locator('[data-testid="after-save-workspace"]')).toBeVisible();
    await expect(page.locator('[data-testid="after-save-dashboard"]')).toBeVisible();
    await page.locator('[data-testid="save-modal-cancel"]').click();
  });

  test('option 3 pickers enable when "Add to dashboard" is selected (dashboards exist)', async ({
    page,
  }) => {
    await dirtyAndOpenSaveModal(page);
    // Dashboards are fetched on modal mount; option 3 becomes enabled.
    await expect(page.locator('[data-testid="after-save-dashboard"]')).toBeEnabled({
      timeout: 10000,
    });
    await page.locator('[data-testid="after-save-dashboard"]').check();
    await expect(page.locator('[data-testid="after-save-dashboard-select"]')).toBeEnabled();
    await expect(page.locator('[data-testid="after-save-slot-select"]')).toBeEnabled();
    await page.locator('[data-testid="save-modal-cancel"]').click();
  });

  test('"Open in Workspace" + Save navigates to /workspace', async ({ page }) => {
    await dirtyAndOpenSaveModal(page);
    await page.locator('[data-testid="after-save-workspace"]').check();
    await page.locator('[data-testid="save-modal-confirm"]').click();
    await page.waitForURL(/\/workspace(\?|$)/, { timeout: 15000 });
    expect(page.url()).toContain('/workspace');
  });
});
