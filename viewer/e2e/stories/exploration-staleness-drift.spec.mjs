/**
 * Story: staleness DRIFT detection — the underlying insight is edited
 * elsewhere after an exploration copied it (Explore 2.0 Phase 6c-T1 —
 * ux-audit.md's "no staleness indication after the underlying insight is
 * edited elsewhere" finding, ⚠ conflicts-with-e2e, existing-objects #8).
 *
 * `exploration-staleness.spec.mjs` already proves the DANGLING-REF case
 * (a copy references an object that's been DELETED) works end-to-end — but
 * that is a different, narrower check than what the audit's auditor
 * expected: "I edited aggregated-bar-insight's description in the project
 * editor, reopened the exploration that copied it, and got no signal at
 * all." A ref that still RESOLVES but whose CONTENT changed was a genuine,
 * documented scope gap (`explorationStaleness.js`'s old "Scope" note) — the
 * dangling-ref check can never catch it. This story reaches the FIX
 * (`seededFrom.contentSignature` captured at seed time,
 * `computeSeedContentSignature` compared on resume) the way a user does:
 *
 *   1. Publish a real insight via the ordinary "Save to Project" flow.
 *   2. "Explore this" from the insight's Library row — a real copy-until-
 *      promote exploration, seeded provenance captured for real.
 *   3. The ORIGINAL insight is edited (simulating "someone/something else
 *      touched it") through the exact same `/api/insights/<name>/` endpoint
 *      the project editor's own Save button calls — never a frontend store
 *      shortcut.
 *   4. Reopening the copy (Explorer Home -> card -> Open, mirroring
 *      exploration-staleness.spec.mjs's own park/reopen convention) shows
 *      the drift line, naming the insight.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=stalenessDrift VISIVO_SANDBOX_BACKEND_PORT=8056 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3056 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3056 npx playwright test exploration-staleness-drift
 *
 * Mutates real backend records (explorations, models, insights, charts) —
 * runs in the serial `exploration-mutations` playwright project
 * (playwright.config.mjs), never `parallel`. See the DOUBLE-REGISTRATION
 * RULE note in playwright.config.mjs: this filename must appear in BOTH
 * `exploration-mutations`'s `testMatch` AND `parallel`'s `testIgnore`.
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
  return col;
}

async function bindXSlotToNumericColumn(page) {
  await typeSql(page, `SELECT * FROM ${TABLE}`);
  await runQuery(page);
  const tableRow = await expandSourceTable(page);
  const column = await firstNumericColumn(page, tableRow);
  const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
  await expect(xSlot).toBeVisible({ timeout: 15000 });
  await dragAndDrop(page, column, xSlot);
  await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });
}

async function fetchExploration(page, id) {
  const res = await page.request.get(`${apiBase}/api/explorations/${id}/`);
  expect(res.ok()).toBe(true);
  return res.json();
}

async function fetchInsight(page, name) {
  const res = await page.request.get(`${apiBase}/api/insights/${encodeURIComponent(name)}/`);
  expect(res.ok()).toBe(true);
  return res.json();
}

/** Edits the PUBLISHED insight through the exact same `/api/insights/<name>/`
 * endpoint the project editor's own InsightEditForm "Save" button calls
 * (`saveInsight` -> `insightsApi.saveInsight` -> `POST /api/insights/<name>/`
 * with the full config as the body) — never a frontend store shortcut. This
 * is the "someone/something else touched the source object" half of the
 * story; every OTHER step in this file is a real UI gesture. */
async function editInsightElsewhere(page, name) {
  const current = await fetchInsight(page, name);
  const nextConfig = {
    ...current.config,
    props: { ...(current.config.props || {}), name: `edited_elsewhere_${Date.now()}` },
  };
  const res = await page.request.post(`${apiBase}/api/insights/${encodeURIComponent(name)}/`, {
    data: nextConfig,
  });
  expect(res.ok()).toBe(true);
}

test.describe('Exploration staleness — drift detection (Explore 2.0 Phase 6c-T1)', () => {
  test.describe.configure({ timeout: 90000 });

  let idsBeforeTest = [];
  const createdObjects = [];

  test.beforeEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    idsBeforeTest = res && res.ok() ? (await res.json()).map(e => e.id) : [];
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    const idsAfter = res && res.ok() ? (await res.json()).map(e => e.id) : [];
    for (const id of idsAfter.filter(i => !idsBeforeTest.includes(i))) {
      await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
    }
    for (const { segment, name } of createdObjects.splice(0)) {
      await page.request.delete(`${apiBase}/api/${segment}/${encodeURIComponent(name)}/`).catch(() => {});
    }
  });

  test('editing the seeded-from insight elsewhere surfaces the drift banner on reopen, naming the insight', async ({
    page,
  }) => {
    // --- Step 1: publish a real insight (+ its model + chart) via the
    // ordinary Save-to-Project flow. ---
    await gotoExplorerHome(page);
    await newExploration(page);
    await bindXSlotToNumericColumn(page);

    const chartName = `e2e_drift_chart_${Date.now()}`;
    const nameInput = page.getByTestId('chart-name-input');
    await nameInput.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type(chartName, { delay: 5 });
    await nameInput.blur();

    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('exploration-promote-submit').click();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName },
      { segment: 'charts', name: chartName }
    );

    // --- Step 2: "Explore this" from the insight's Library row. ---
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.useStore.getState().fetchInsights?.());

    const insightHeader = page.getByTestId('library-subsection-insight-header');
    const insightBody = page.getByTestId('library-subsection-insight-body');
    if (!(await insightBody.isVisible().catch(() => false))) await insightHeader.click();
    const insightRow = page.getByTestId(`library-row-insight-${insightName}`);
    await expect(insightRow).toBeVisible({ timeout: 15000 });
    await insightRow.click({ button: 'right' });
    const ctxMenu = page.getByTestId(`library-row-insight-${insightName}-context-menu`);
    await expect(ctxMenu).toBeVisible({ timeout: 5000 });
    await ctxMenu.getByText('Explore this').click();

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
    const copyId = new URL(page.url()).pathname.split('/').pop();

    // Pins the fix's seed-time capture: a real content_signature was
    // recorded, not just the bare {type, name} provenance.
    await expect(async () => {
      const exploration = await fetchExploration(page, copyId);
      expect(exploration.seeded_from).toMatchObject({ type: 'insight', name: insightName });
      expect(typeof exploration.seeded_from.content_signature).toBe('string');
      expect(exploration.seeded_from.content_signature.length).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    // No drift yet — the copy was JUST seeded from the current content.
    await page.getByTestId('workspace-view-switcher-project').click();
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId(`exploration-card-${copyId}-name`)).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId(`exploration-card-${copyId}-stale`)).not.toBeVisible();

    // --- Step 3: the ORIGINAL insight is edited elsewhere (real backend
    // save, same endpoint the project editor's Save button hits). ---
    await editInsightElsewhere(page, insightName);
    await page.evaluate(() => window.useStore.getState().fetchInsights());

    // --- Step 4: reopening the copy shows the drift banner, naming the
    // insight — the audit's exact missing signal. ---
    await page.getByTestId(`exploration-card-${copyId}-open`).click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    const banner = page.getByTestId('exploration-staleness-banner');
    await expect(banner).toBeVisible({ timeout: 15000 });
    const drift = page.getByTestId('exploration-staleness-drift');
    await expect(drift).toBeVisible();
    await expect(drift).toContainText(insightName);
    // D11 / plain language — never the save-to-project pipeline's internal
    // vocabulary leaking onto an unrelated banner.
    await expect(banner).not.toContainText('promoted');

    // Dismiss hides it without touching the draft (same UX contract the
    // dangling-ref case already has).
    await page.getByTestId('exploration-staleness-dismiss').click();
    await expect(banner).not.toBeVisible();
  });
});
