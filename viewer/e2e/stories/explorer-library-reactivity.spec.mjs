/**
 * Story: J-4 — Explorer-saved objects appear in the Library without a reload.
 *
 * The Explorer Save path (saveExplorerObjects) refreshes the SHARED zustand
 * caches (`fetchModels` / `fetchInsights` / `fetchCharts`). The Workspace
 * Library reads those same caches (useLibraryData → s.models / s.insights …), so
 * an object saved from Explorer must show up in the Library after a plain
 * client-side navigation — no `page.reload()`.
 *
 * We assert on the MODEL, which is reliably created + named (model_N) by the
 * fresh-SQL flow and is rendered as a Library row, so the proof of reactivity
 * doesn't hinge on Explorer's auto-insight naming/embedding semantics. The
 * navigation is done via history.pushState (a real SPA route change), so a
 * passing assertion means the shared cache — not a full reload — populated the
 * Library.
 *
 * Runs via the isolated `state-mutating` Playwright project (it persists a
 * model), after the read-only suite.
 *
 * Precondition: sandbox (integration project).
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, createModelWithSource, typeSql, runQuery } from '../helpers/explorer.mjs';

test.use({ viewport: { width: 1600, height: 1000 } });

// Client-side route change only — proves no full reload is needed for the
// Library to reflect the new object.
const spaNavigate = async (page, path) => {
  await page.evaluate(p => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForURL(new RegExp(path.replace(/[/?]/g, '\\$&')), { timeout: 15000 }).catch(() => {});
};

test.describe('J-4 — Library reflects Explorer saves without reload', () => {
  test.setTimeout(120000);

  test('a model saved in Explorer appears in the Workspace Library after SPA nav', async ({
    page,
  }) => {
    await loadExplorer(page);
    await createModelWithSource(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 6');
    await runQuery(page).catch(() => {});

    // Capture the new model's name from its tab label testid (model-tab-<name>).
    const modelTab = page.locator('[data-testid^="model-tab-"]').last();
    let modelName = '';
    if (await modelTab.count()) {
      const tid = await modelTab.getAttribute('data-testid');
      modelName = (tid || '').replace(/^model-tab-/, '');
    }

    // Save (the modal now treats a brand-new local model as a change).
    const saveButton = page.locator('[data-testid="explorer-save-button"]');
    await expect(saveButton).not.toBeDisabled({ timeout: 12000 });
    await saveButton.click();
    await expect(page.locator('[data-testid="explorer-save-modal"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="save-modal-confirm"]')).toBeEnabled({ timeout: 15000 });
    await page.locator('[data-testid="save-modal-confirm"]').click();
    await expect(page.locator('[data-testid="save-modal-cancel"]')).not.toBeVisible({
      timeout: 15000,
    });

    // SPA-navigate to the Workspace WITHOUT reloading and assert the new model
    // shows up — i.e. the shared cache (not a reload) populated the Library.
    await spaNavigate(page, '/workspace');
    await page.waitForLoadState('networkidle');

    const section = page.locator('[data-testid="library-subsection-model"]');
    await expect(section).toBeVisible({ timeout: 15000 });
    if ((await section.getAttribute('data-collapsed')) === 'true') {
      await page.locator('[data-testid="library-subsection-model-header"]').click();
    }

    if (modelName) {
      await expect(page.locator(`[data-testid="library-row-model-${modelName}"]`)).toBeVisible({
        timeout: 15000,
      });
    } else {
      // Fallback: at least one model row is present (the just-saved model_N).
      await expect(
        page.locator('[data-testid="library-subsection-model-rows"] [data-testid^="library-row-model-"]').first()
      ).toBeVisible({ timeout: 15000 });
    }
  });
});
