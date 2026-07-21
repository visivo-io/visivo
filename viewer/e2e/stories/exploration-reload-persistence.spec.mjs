/**
 * Story: reload no longer discards recent edits (Explore 2.0 Phase 6c-T5 —
 * ux-audit.md's "⚠ conflicts-with-e2e Reload silently discards recent SQL
 * edits (autosave debounce race)" finding and its duplicates "Edits made
 * seconds before closing the browser are silently lost" / "⚠
 * conflicts-with-e2e x mapping silently lost after page reload").
 *
 * ROOT CAUSE (see `ExplorationPane.jsx`'s "flush-on-page-leaving" effect
 * docstring): the pane's own live-sync debounce (600ms) stacks with the
 * exploration slice's backend-persist debounce (~1s,
 * `workspaceExplorationsStore.js`) into a combined ~1.6s window where a
 * just-made edit — typed SQL, or a freshly-dropped x/y pill — sits in
 * memory only. A reload inside that window used to lose it silently. THE
 * FIX flushes both debounces immediately on `visibilitychange`→'hidden' /
 * `pagehide` / `beforeunload` — this story reloads the page for REAL
 * (`page.reload()`, a genuine navigation, not a store-level simulation) well
 * inside the old loss window and asserts against the BACKEND record
 * (feedback_backend_diffing.md — never a frontend string comparison) that
 * the edit survived.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=reloadPersistence VISIVO_SANDBOX_BACKEND_PORT=8059 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3059 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3059 npx playwright test exploration-reload-persistence
 *
 * Mints/mutates real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), never
 * `parallel`. See the DOUBLE-REGISTRATION RULE note in
 * playwright.config.mjs: this filename must appear in BOTH
 * `exploration-mutations`'s `testMatch` and `parallel`'s `testIgnore`.
 */

import { test, expect } from '@playwright/test';
import { typeSql, runQuery } from '../helpers/explorer.mjs';
import { BASE_URL, apiBase } from '../helpers/sandbox.mjs';

test.use({ viewport: { width: 1280, height: 1600 } });

const SOURCE = 'local-duckdb';
const TABLE = 'test_table';

async function dragAndDrop(page, sourceLocator, targetLocator) {
  const sourceBox = await sourceLocator.boundingBox();
  const targetBox = await targetLocator.boundingBox();
  expect(sourceBox && targetBox, 'both drag endpoints have a box').toBeTruthy();

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 10, sourceY, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.move(targetX, targetY, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
}

async function startFromSourceTile(page) {
  const tile = page.getByTestId(`explorer-home-source-tile-${SOURCE}`);
  await expect(tile).toBeVisible({ timeout: 20000 });
  await tile.click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  return new URL(page.url()).pathname.split('/').pop();
}

async function fetchExplorationDraftSql(page, id) {
  const res = await page.request.get(`${apiBase}/api/explorations/${id}/`);
  expect(res.ok()).toBe(true);
  const exploration = await res.json();
  const modelStates = exploration.draft?.legacy_state?.modelStates || {};
  return Object.values(modelStates).map(m => m.sql);
}

test.describe('Reload no longer discards recent edits (Phase 6c-T5)', () => {
  test.describe.configure({ timeout: 90000 });

  const createdIds = [];

  test.afterEach(async ({ page }) => {
    for (const id of createdIds.splice(0)) {
      await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('typing SQL then reloading almost immediately does not discard the edit', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await startFromSourceTile(page);
    createdIds.push(id);

    const marker = `select 99 as z -- unsaved_edit_${Date.now()}`;
    await typeSql(page, marker);

    // Deliberately SHORT — well inside the old combined ~1.6s debounce
    // window the audit reproduced ("reloaded ~1s later"). If the flush
    // fix weren't in place, this is exactly the window that used to lose
    // the edit.
    await page.waitForTimeout(400);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });

    // Assert against the real, rendered editor content (what the user sees)…
    await expect(page.locator('.view-lines')).toContainText('unsaved_edit', { timeout: 10000 });

    // …AND against the backend record directly (feedback_backend_diffing.md
    // — never trust a frontend string comparison alone for persistence
    // claims).
    await expect(async () => {
      const sqls = await fetchExplorationDraftSql(page, id);
      expect(sqls.some(sql => (sql || '').includes('unsaved_edit'))).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test('binding BOTH x and y then reloading almost immediately keeps both pills, not just one', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await startFromSourceTile(page);
    createdIds.push(id);

    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);

    const sourceHeader = page.getByTestId('library-subsection-source-header');
    const sourceBody = page.getByTestId('library-subsection-source-body');
    if (!(await sourceBody.isVisible().catch(() => false))) await sourceHeader.click();
    await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
    const tableRow = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
    await expect(tableRow).toBeVisible({ timeout: 15000 });
    await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();

    const columns = page.locator('[data-testid^="library-source-column-"]');
    await expect(columns.first()).toBeVisible({ timeout: 10000 });
    const columnCount = await columns.count();
    expect(columnCount).toBeGreaterThanOrEqual(2);

    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    const ySlot = page.locator('[data-testid*="droppable-property-y"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });
    await expect(ySlot).toBeVisible({ timeout: 15000 });

    await dragAndDrop(page, columns.nth(0), xSlot);
    await dragAndDrop(page, columns.nth(1), ySlot);

    // Both pills landed before reload — Essentials should read 2/2. If
    // either drop missed, the reload assertion below would trivially pass
    // for the wrong reason, so this pre-condition matters.
    await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });
    await expect(ySlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });

    // Deliberately short — the same debounce-race window as the SQL test
    // above, and the exact reproduction the audit gave ("Immediately after
    // the drop, Essentials showed 2/2 ... After reload, x was empty").
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });

    // Re-locate the slots after reload (fresh DOM) and assert BOTH still
    // carry a pill — not just y (the finding's exact failure mode: x
    // vanished, y survived).
    const xSlotAfter = page.locator('[data-testid*="droppable-property-x"]').first();
    const ySlotAfter = page.locator('[data-testid*="droppable-property-y"]').first();
    await expect(xSlotAfter.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 15000 });
    await expect(ySlotAfter.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 15000 });
  });
});
