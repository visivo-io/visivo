/**
 * Story: Keyboard-driven tab/view switch mid-promote does not race
 * record-promotion's append against a concurrent draft-sync write (Explore
 * 2.0 Phase 4 delta review, finding P4-D1 — HIGH).
 *
 * `promoteExploration` (workspaceExplorationsStore.js) loops promotable rows
 * SEQUENTIALLY, awaiting each row's `saveFn` then its own
 * `recordExplorationPromotion` POST (`/api/explorations/:id/record-promotion/`).
 * `ExplorationPromoteModal`'s backdrop already blocks a MOUSE-driven close
 * mid-promote (its own `onClick` checks `!promoting`) — but before this fix,
 * `useWorkspaceTabShortcuts.js`'s keyboard shortcuts (Cmd+1/2/3, Cmd+4-9,
 * Cmd+W, Cmd+T) had no equivalent guard: a keyboard-driven destination/tab
 * switch while a row's `record-promotion` POST was still in flight would
 * unmount `ExplorationPane`, whose deactivate cleanup fires a generic
 * `update()` draft-sync POST against the SAME unlocked backend JSON document
 * (`exploration_repository.py`'s `update()`/`record_promotion()` are both
 * bare `_read()` -> patch -> `_write()`, no lock). Whichever write's
 * `_read()` landed first but `_write()` landed LAST could silently clobber
 * the other — including wiping the just-appended `promoted[]` entry.
 *
 * THE FIX (this PR, VIS-1082-1086 hardening):
 *   1. `useWorkspaceTabShortcuts.js`'s `hasBlockingModal()` guard suppresses
 *      every shortcut in this hook while any `[aria-modal="true"]` element
 *      is in the DOM (ExplorationPromoteModal now carries it) — the
 *      keyboard path that used to bypass the modal's mouse-backdrop guard is
 *      closed entirely.
 *   2. `workspaceExplorationsStore.js`'s `recordExplorationPromotion` is
 *      enqueued onto the SAME per-id write queue as the draft sync / rename
 *      / discard revert (`enqueueWrite`) — belt-and-suspenders: even a write
 *      that reaches the backend through some OTHER path (a different
 *      browser tab/session) can never interleave with this session's writes
 *      for the same id.
 *
 * This story proves BOTH halves against the real backend: (a) the shortcut
 * is inert while the promote modal is open — no navigation, no unmount; (b)
 * once promotion completes, `promoted[]` has BOTH entries and the draft is
 * intact — read from the backend, never asserted from UI state alone.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationPromoteRace VISIVO_SANDBOX_BACKEND_PORT=8050 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3050 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3050 npx playwright test exploration-promote-tab-race
 *
 * Mutates real backend records (explorations AND promoted project objects)
 * — runs in the serial `exploration-mutations` playwright project
 * (playwright.config.mjs), never `parallel`.
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

async function newExploration(page) {
  await page.getByTestId('explorer-home-new-exploration').click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  return new URL(page.url()).pathname.split('/').pop();
}

async function expandSourceTable(page) {
  const sourceHeader = page.getByTestId('library-subsection-source-header');
  const sourceBody = page.getByTestId('library-subsection-source-body');
  if (!(await sourceBody.isVisible().catch(() => false))) await sourceHeader.click();
  await expect(sourceBody).toBeVisible({ timeout: 5000 });

  await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
  const tableRow = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
  await expect(tableRow).toBeVisible({ timeout: 15000 });
  return tableRow;
}

async function firstNumericColumn(page, tableRow) {
  await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
  const col = page.locator('[data-testid^="library-source-column-"]').first();
  await expect(col).toBeVisible({ timeout: 10000 });
  const name = await col
    .getAttribute('data-testid')
    .then(t => t.replace(`library-source-column-${SOURCE}-${TABLE}-`, ''));
  return { locator: col, name };
}

/** Same helper as exploration-promote.spec.mjs — binds the x-slot to a real
 * numeric column so BOTH the model and insight rows are valid/promotable
 * (`buildPromoteChecklist` drops a model with no `sql`, and an insight with
 * no data props beyond `type`). */
async function bindXSlotToNumericColumn(page) {
  await typeSql(page, `SELECT * FROM ${TABLE}`);
  await runQuery(page);
  const tableRow = await expandSourceTable(page);
  const { locator: column, name: columnName } = await firstNumericColumn(page, tableRow);
  const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
  await expect(xSlot).toBeVisible({ timeout: 15000 });
  await dragAndDrop(page, column, xSlot);
  await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });
  return columnName;
}

async function openPromoteModal(page) {
  await page.getByTestId('explorer-save-button').click();
  await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
}

async function fetchExploration(page, id) {
  const res = await page.request.get(`${apiBase}/api/explorations/${id}/`);
  expect(res.ok()).toBe(true);
  return res.json();
}

test.describe('Keyboard shortcut suppression + write serialization mid-promote (P4-D1)', () => {
  let explorationIdsBefore = [];
  const createdObjects = []; // {segment, name} — best-effort cleanup

  test.beforeEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    explorationIdsBefore = res && res.ok() ? (await res.json()).map(e => e.id) : [];
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    const idsAfter = res && res.ok() ? (await res.json()).map(e => e.id) : [];
    for (const id of idsAfter.filter(i => !explorationIdsBefore.includes(i))) {
      await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
    }
    for (const { segment, name } of createdObjects.splice(0)) {
      await page.request.delete(`${apiBase}/api/${segment}/${encodeURIComponent(name)}/`).catch(() => {});
    }
  });

  test('Cmd+2 pressed mid-promote does not navigate away, and promoted[] + the draft are both intact once promotion completes', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    await bindXSlotToNumericColumn(page);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    // Delay the record-promotion POST so there's a real, deterministic
    // window to fire the shortcut mid-flight — the multi-row promote loop
    // (promoteExploration) is otherwise too fast for a keydown to reliably
    // land inside it.
    let releaseRecordPromotion = () => {};
    const recordPromotionGate = new Promise(resolve => {
      releaseRecordPromotion = resolve;
    });
    await page.route('**/record-promotion/', async route => {
      await recordPromotionGate;
      await route.continue();
    });

    await openPromoteModal(page);
    await expect(page.getByTestId(`promote-row-model-${queryName}-checkbox`)).toBeChecked();
    await expect(page.getByTestId(`promote-row-insight-${insightName}-checkbox`)).toBeChecked();
    await page.getByTestId('exploration-promote-submit').click();

    // The FIRST row's record-promotion POST is now held by the route gate —
    // the modal is open and a promotion is genuinely in flight. Fire the
    // keyboard shortcut a real user could reach for: Cmd+2 (Semantic Layer).
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+2`);

    // Give the (suppressed) shortcut a moment to have taken effect if it
    // were going to, then assert NOTHING navigated: the promote modal is
    // still open, the exploration tab is still active, and the URL never
    // changed to the Semantic Layer destination.
    await page.waitForTimeout(300);
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible();
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(new URL(page.url()).pathname).toBe(`/workspace/exploration/${id}`);

    // Release the gate — let the promote loop actually finish. Unroute only
    // AFTER the success indicator confirms every record-promotion request
    // (there are two — one per promoted row) has actually resolved through
    // our handler's own `route.continue()` — `releaseRecordPromotion()`
    // only resolves the gate promise, it doesn't wait for the handler(s)
    // still suspended on it to actually resume and call `continue()`.
    // Unrouting while one is still mid-resolution races Playwright's own
    // unroute cleanup against our handler's continue() call ("Route is
    // already handled"), which fails the promotion request and cascades
    // into leaked, uncleaned-up backend objects for the next spec to trip
    // over.
    releaseRecordPromotion();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    await page.unroute('**/record-promotion/');
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName }
    );

    // Backend-asserted: BOTH rows actually promoted (no row silently lost to
    // the race), and the exploration's own draft is intact (never clobbered
    // by an interleaved draft-sync write racing record-promotion).
    const record = await fetchExploration(page, id);
    const promotedKeys = record.promoted.map(p => `${p.type}:${p.name}`);
    expect(promotedKeys).toContain(`model:${queryName}`);
    expect(promotedKeys).toContain(`insight:${insightName}`);
    expect(record.draft.queries?.[0]?.name).toBe(queryName);
  });

  test('the shortcut resumes working normally once the promote modal is closed', async ({ page }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    await bindXSlotToNumericColumn(page);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await openPromoteModal(page);
    await page.getByTestId('exploration-promote-submit').click();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    // This test promotes too (submit -> success, same as the first test) —
    // without registering the promoted objects for cleanup, this leaks a
    // real "model"/"insight" pair (the exploration's own default auto-names)
    // that then collides with every OTHER spec's own fresh explorations,
    // which auto-name their first query/insight the exact same way. Root-
    // caused live: this exact leak cascaded into 3/4 of exploration-promote.spec.mjs's
    // OWN tests failing on an unrelated run.
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName }
    );
    await page.getByTestId('exploration-promote-cancel').click();
    await expect(page.getByTestId('exploration-promote-modal')).not.toBeVisible({ timeout: 5000 });

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+2`);
    await expect(page.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true',
      { timeout: 5000 }
    );
  });
});
