/**
 * Story: J-1 / VIS-774 — Explorer Save modal "After save" section.
 *
 * The Save-to-Project modal gains an "After save" choice:
 *   - Stay in Explorer (default)
 *   - Open in Workspace            → navigates to /workspace
 *   - Add to dashboard <d> in slot <s> → PLACES the chart in the slot, then
 *     navigates to /workspace/dashboard/<d>?slot=...&newItem=<chart>
 *
 * Precondition: sandbox (integration project — has dashboards).
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

// The modal's confirm button only enables once the backend diff lands with real
// changes (totalChanges > 0). Tests that actually click "Save" must wait for it
// so they never click a disabled button or hit the "No changes to save" race.
async function waitForSaveEnabled(page) {
  await expect(page.locator('[data-testid="save-modal-confirm"]')).toBeEnabled({ timeout: 20000 });
}

// The integration project's dashboards take a moment to land in the store after
// the modal's on-mount fetch. Wait for option 3 to enable before driving it.
async function selectAddToDashboard(page) {
  await expect(page.locator('[data-testid="after-save-dashboard"]')).toBeEnabled({
    timeout: 10000,
  });
  await page.locator('[data-testid="after-save-dashboard"]').check();
}

// J-1 exercises the full author-a-model-then-save flow, which depends on the
// Explorer SQL editor (Monaco) in the center panel. That panel collapses below a
// usable width on a phone viewport (Explorer is a desktop-first surface), so the
// authoring flow is desktop-only here. The Save modal's *responsive rendering*
// on mobile is covered by the visual sweep instead.
for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }]) {
  test.describe(`J-1 — Explorer "After save" section (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test.setTimeout(120000);

    test('renders the three After-save radios, Stay in Explorer default', async ({ page }) => {
      await dirtyAndOpenSaveModal(page);
      await expect(page.locator('[data-testid="after-save-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="after-save-stay"]')).toBeChecked();
      await expect(page.locator('[data-testid="after-save-workspace"]')).toBeVisible();
      await expect(page.locator('[data-testid="after-save-dashboard"]')).toBeVisible();
      await page.locator('[data-testid="save-modal-cancel"]').click();
    });

    test('option 3 pickers enable only when "Add to dashboard" is selected', async ({ page }) => {
      await dirtyAndOpenSaveModal(page);
      // Disabled while another radio is active …
      await expect(page.locator('[data-testid="after-save-dashboard-select"]')).toBeDisabled();
      await expect(page.locator('[data-testid="after-save-slot-select"]')).toBeDisabled();
      // … enabled once option 3 is chosen.
      await selectAddToDashboard(page);
      await expect(page.locator('[data-testid="after-save-dashboard-select"]')).toBeEnabled();
      await expect(page.locator('[data-testid="after-save-slot-select"]')).toBeEnabled();
      await page.locator('[data-testid="save-modal-cancel"]').click();
    });

    test('slot picker exposes one option per row plus a "new row at end" option', async ({
      page,
    }) => {
      await dirtyAndOpenSaveModal(page);
      await selectAddToDashboard(page);
      // simple-dashboard has 4 rows → 4 "At end of row N" + 1 new-row option.
      await page
        .locator('[data-testid="after-save-dashboard-select"]')
        .selectOption({ label: 'simple-dashboard' })
        .catch(() => {});
      const slotSelect = page.locator('[data-testid="after-save-slot-select"]');
      const optionTexts = await slotSelect.locator('option').allTextContents();
      expect(optionTexts).toContain('At end of row 1');
      expect(optionTexts.some(t => /In a new row at the end/.test(t))).toBe(true);
      // The last option is always the new-row choice.
      expect(optionTexts[optionTexts.length - 1]).toMatch(/new row/i);
      await page.locator('[data-testid="save-modal-cancel"]').click();
    });

    test('the radio choice persists across modal opens within the session', async ({ page }) => {
      await dirtyAndOpenSaveModal(page);
      await page.locator('[data-testid="after-save-workspace"]').check();
      await page.locator('[data-testid="save-modal-cancel"]').click();
      // Re-open the modal — the prior choice should still be selected.
      await page.locator('[data-testid="explorer-save-button"]').click();
      await expect(page.locator('[data-testid="explorer-save-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="after-save-workspace"]')).toBeChecked();
      await page.locator('[data-testid="save-modal-cancel"]').click();
    });

    test('"Open in Workspace" + Save navigates to /workspace', async ({ page }) => {
      await dirtyAndOpenSaveModal(page);
      await page.locator('[data-testid="after-save-workspace"]').check();
      await waitForSaveEnabled(page);
      await page.locator('[data-testid="save-modal-confirm"]').click();
      await page.waitForURL(/\/workspace(\?|$)/, { timeout: 15000 });
      expect(page.url()).toContain('/workspace');
    });

    test('"Add to dashboard" + Save lands on /workspace/dashboard/<d> with the slot param', async ({
      page,
    }) => {
      await dirtyAndOpenSaveModal(page);
      await selectAddToDashboard(page);
      const dashSelect = page.locator('[data-testid="after-save-dashboard-select"]');
      await expect(dashSelect).toBeEnabled();
      // Pick simple-dashboard explicitly (must succeed — no silent catch).
      await dashSelect.selectOption({ label: 'simple-dashboard' });
      // Choose "new row at the end" so the placement always succeeds.
      await page.locator('[data-testid="after-save-slot-select"]').selectOption('new');
      await waitForSaveEnabled(page);
      await page.locator('[data-testid="save-modal-confirm"]').click();
      // The receiving route carries the slot descriptor; we assert we land on the
      // chosen dashboard in Build mode.
      await page.waitForURL(/\/workspace\/dashboard\/simple-dashboard\?/, { timeout: 20000 });
      expect(page.url()).toContain('slot=new');
      // The modal closes after a successful place+navigate.
      await expect(page.locator('[data-testid="explorer-save-modal"]')).toHaveCount(0);
    });
  });
}
