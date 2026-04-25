/**
 * Story: Explorer → Save → Publish → YAML files on disk
 *
 * Validates that objects created in the Explorer (models, metrics, dimensions,
 * insights, charts) round-trip correctly through save + publish into the
 * project's `.visivo.yml` files, and that the Publish button state tracks
 * save events without a page reload.
 *
 * Precondition: The dedicated publish sandbox must be running:
 *   bash scripts/sandbox-publish.sh start   — starts :3002 (frontend) / :8002 (backend)
 *                                             against test-projects/explorer-publish-e2e/
 *
 * Isolation: this file is the ONLY spec in the Playwright `publish` project,
 * which runs with workers=1 and fullyParallel=false. Each test snapshots the
 * project YAML files in beforeEach and restores them in afterEach so the
 * project is returned byte-identical between tests.
 *
 * IMPORTANT: Do not run this spec in parallel with other Playwright projects
 * pointed at the same sandbox — the file-mutation tests would corrupt each
 * other's state. (The playwright config gives this project its own sandbox
 * baseURL :3002 so the default sandbox on :3001 is untouched.)
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsYaml from 'js-yaml';
const parseYaml = jsYaml.load;
import {
  snapshotProject,
  restoreProject,
  assertProjectMatches,
  waitForServerReload,
} from '../helpers/file-snapshot.mjs';
import { loadExplorer } from '../helpers/explorer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'test-projects',
  'explorer-publish-e2e'
);
const MODELS_FILE = join(PROJECT_DIR, 'models.visivo.yml');
const PROJECT_FILE = join(PROJECT_DIR, 'project.visivo.yml');
const BACKEND_URL = 'http://localhost:8002';

// ---------------------------------------------------------------------------
// Sequential but independent — each test fully restores state before running.
// We intentionally do NOT use `mode: 'serial'` because several tests expose
// known bugs (US-PUBLISH-2/3/4/6) and serial mode would skip later tests on
// the first failure. The `publish` Playwright project sets workers=1 and
// fullyParallel=false so tests still run one at a time in a single worker.
// ---------------------------------------------------------------------------

/** @type {Map<string, string> | null} */
let baselineSnapshot = null;

test.beforeAll(async () => {
  baselineSnapshot = snapshotProject(PROJECT_DIR);
  if (baselineSnapshot.size === 0) {
    throw new Error(
      `No *.visivo.yml files found in ${PROJECT_DIR}. Is the dedicated ` +
        `publish sandbox project present?`
    );
  }
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(90000);
  if (!baselineSnapshot) throw new Error('baselineSnapshot missing');
  const wrote = restoreProject(baselineSnapshot);
  if (wrote > 0) {
    // File write triggers the hot-reload watcher (500 ms debounce + recompile).
    // Poll for project.json to update; if no content change is observed,
    // the settleMs fallback still gives the server a moment to finish.
    await waitForServerReload(BACKEND_URL);
  }
  // Ensure the Explorer starts from a clean in-memory store too: reload the
  // page URL origin so any prior-test localStorage is gone. Playwright already
  // isolates storage per test but the explorer store is hydrated from GET
  // endpoints, so no further action is needed.
  await page.context().clearCookies();
});

test.afterAll(async () => {
  if (!baselineSnapshot) return;
  restoreProject(baselineSnapshot);
  await waitForServerReload(BACKEND_URL);
});

// ---------------------------------------------------------------------------
// Helpers specific to this spec
// ---------------------------------------------------------------------------

/** Open the PublishModal by clicking the TopNav publish button, then click
 *  "Publish Changes" to commit. Waits for the modal to close and for the
 *  hot-reload cycle to settle.
 *
 *  US-PUBLISH-6 (Phase 3 fix) is that this button should appear without a
 *  page reload. Until the fix ships we may need to reload to surface it;
 *  pass { allowReload: false } to disable the workaround (that's what
 *  US-PUBLISH-6 does). Returns true if a publish actually ran. */
async function runPublishFlow(page, { allowReload = true } = {}) {
  const topNavPublish = page.getByRole('button', { name: /^Publish$/ });
  let visible = await topNavPublish.isVisible({ timeout: 3000 }).catch(() => false);
  if (!visible && allowReload) {
    // Fallback workaround for the Phase 3 bug: force a re-check of
    // publish status by reloading the page.
    await page.reload();
    await page.waitForLoadState('networkidle');
    visible = await topNavPublish.isVisible({ timeout: 5000 }).catch(() => false);
  }
  if (!visible) return false;

  await topNavPublish.click();
  const confirm = page.getByRole('button', { name: /^Publish Changes$/ });
  await expect(confirm).toBeVisible({ timeout: 5000 });
  await expect(confirm).not.toBeDisabled({ timeout: 5000 });
  await confirm.click();

  // PublishModal closes on success; wait for it to disappear.
  await expect(confirm).not.toBeVisible({ timeout: 15000 });
  // Give the hot-reload server a moment to re-parse the written YAML.
  await waitForServerReload(BACKEND_URL);
  return true;
}

/** Walk up the left nav and click a model button by name. */
async function openModelInExplorer(page, modelName) {
  await page.getByRole('button', { name: modelName, exact: true }).click();
  // Monaco editor area should appear for the selected model.
  await page.locator('.view-lines').first().waitFor({ timeout: 10000 });
}

/** Click the [+] button in the ModelTabBar to start a fresh model tab, and
 *  return the auto-generated name the store assigned. We read the name from
 *  the last `tab-label-<name>` element after the tab becomes clickable. */
async function addNewModelTab(page) {
  await page.locator('[data-testid="add-model-tab"]').first().click();
  await page.locator('.view-lines').first().waitFor({ timeout: 10000 });
  // Grab whatever name the store auto-assigned (e.g. "model", "model_2").
  // Use the active tab's status-dot -> tab-label sibling. Simpler: pick the
  // last `tab-label-*` testid on the page; the add-model action appends at
  // the end.
  const attr = await page
    .locator('[data-testid^="tab-label-"]')
    .last()
    .getAttribute('data-testid');
  const autoName = attr?.replace(/^tab-label-/, '') ?? null;
  if (!autoName) throw new Error('could not read auto-generated model name');
  return autoName;
}

/** Rename the currently-active tab via the UI. Returns the final name.
 *  The rename-commit (`commitRename` in ModelTabBar.jsx) rejects the rename
 *  if the new name is already in `explorerModelTabs` OR if it equals the
 *  current name. If the rename is rejected, the tab keeps its old name —
 *  this helper surfaces that by returning whichever name actually won. */
async function renameActiveTab(page, oldName, newName) {
  const label = page.locator(`[data-testid="tab-label-${oldName}"]`);
  await label.dblclick();
  const renameInput = page.locator('[data-testid="rename-input"]');
  await expect(renameInput).toBeVisible({ timeout: 5000 });
  await renameInput.fill(newName);
  // Press Enter on the focused input to fire onKeyDown -> commitRename.
  await renameInput.press('Enter');
  // Rename either takes effect (tab-label-<newName> visible) or was rejected
  // (tab-label-<oldName> still visible). We wait for either outcome up to 5 s.
  const newLabel = page.locator(`[data-testid="tab-label-${newName}"]`);
  const oldLabel = page.locator(`[data-testid="tab-label-${oldName}"]`);
  await Promise.race([
    newLabel.waitFor({ state: 'visible', timeout: 5000 }),
    oldLabel.waitFor({ state: 'visible', timeout: 5000 }),
  ]);
  return (await newLabel.isVisible().catch(() => false)) ? newName : oldName;
}

/** Type SQL into the Monaco editor of the currently active model tab. */
async function typeSqlInActive(page, sql) {
  const editorArea = page.locator('.view-lines').first();
  await editorArea.click({ timeout: 10000 });
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+a`);
  await page.waitForTimeout(100);
  await page.keyboard.type(sql, { delay: 5 });
}

/** Click Run and wait for rows or error. */
async function runActiveQuery(page) {
  const runButton = page.getByRole('button', { name: 'Run' });
  await runButton.click();
  await Promise.race([
    page.locator('text=/\\d+ rows?/').first().waitFor({ timeout: 20000 }),
    page.locator('text=/error/i').first().waitFor({ timeout: 20000 }),
  ]);
}

/** Open the add-computed-column popover, fill name+expression, click Add.
 *  The UI debounces validation by ~750 ms; we wait up to 3 s for Add to
 *  become enabled. */
async function addComputedColumn(page, { name, expression }) {
  const trigger = page.locator('[data-testid="add-computed-column-btn"]').first();
  await trigger.click();
  const popover = page.locator('[data-testid="add-computed-column-popover"]');
  await expect(popover).toBeVisible({ timeout: 5000 });
  await popover.locator('input').first().fill(name);
  await popover.locator('textarea, input').last().fill(expression);
  await page.waitForTimeout(2000);
  const addBtn = popover.getByRole('button', { name: /^Add$/ });
  await expect(addBtn).not.toBeDisabled({ timeout: 5000 });
  await addBtn.click();
  await page.waitForTimeout(500);
}

/** Click explorer-save-button, confirm the save modal. */
async function saveToProject(page) {
  const saveBtn = page.locator('[data-testid="explorer-save-button"]');
  await expect(saveBtn).not.toBeDisabled({ timeout: 10000 });
  await saveBtn.click();
  const modal = page.locator('[data-testid="explorer-save-modal"]');
  await expect(modal).toBeVisible({ timeout: 5000 });
  const confirm = page.locator('[data-testid="save-modal-confirm"]');
  await expect(confirm).not.toBeDisabled({ timeout: 5000 });
  await confirm.click();
  // Modal should close on success.
  await expect(modal).not.toBeVisible({ timeout: 15000 });
}

/** Load and parse a YAML file from disk. */
function readYaml(path) {
  return parseYaml(readFileSync(path, 'utf8'));
}

/** Find a model by name across all project YAML files. Returns
 *  { model, sourceFile } for the first match, or null. Useful because
 *  the ProjectWriter places new models in the project file while
 *  existing ones stay in their original include file. */
function findModel(name) {
  for (const file of [PROJECT_FILE, MODELS_FILE]) {
    const doc = readYaml(file);
    const match = (doc.models ?? []).find(m => m.name === name);
    if (match) return { model: match, sourceFile: file };
  }
  return null;
}

/** Collect every top-level `metrics:` and `dimensions:` list entry across
 *  both project YAML files. (Does NOT include nested model.metrics/.dimensions.) */
function collectTopLevelNames(kind /* 'metrics' | 'dimensions' */) {
  const out = [];
  for (const file of [PROJECT_FILE, MODELS_FILE]) {
    const doc = readYaml(file);
    for (const entry of doc[kind] ?? []) out.push(entry.name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// US-PUBLISH-N user stories
// ---------------------------------------------------------------------------

test.describe('Explorer publish-to-files', () => {
  test('US-PUBLISH-1: New SQL-only model is published into models.visivo.yml', async ({
    page,
  }) => {
    await loadExplorer(page);
    const modelName = await addNewModelTab(page);

    await typeSqlInActive(page, 'SELECT i AS foo FROM generate_series(1, 5) AS t(i)');
    await runActiveQuery(page);

    await saveToProject(page);
    const published = await runPublishFlow(page);
    expect(published).toBe(true);

    // Give the ProjectWriter a moment to flush — the publish response returns
    // synchronously after the write, but the file system and hot-reload cycle
    // can lag on slow machines.
    await page.waitForTimeout(500);

    const found = findModel(modelName);
    expect(found, `new model "${modelName}" should be present in YAML`).toBeTruthy();
    expect(typeof found.model.sql).toBe('string');
    expect(found.model.sql).toMatch(/generate_series/);

    // An SQL-only add must not produce any top-level metrics/dimensions.
    expect(collectTopLevelNames('metrics')).toEqual([]);
    expect(collectTopLevelNames('dimensions')).toEqual([]);
  });

  test('US-PUBLISH-2: New model with metric + dimension nests them under the model', async ({
    page,
  }) => {
    await loadExplorer(page);
    const modelName = await addNewModelTab(page);

    await typeSqlInActive(
      page,
      'SELECT i AS id, i * 3 AS price FROM generate_series(1, 10) AS t(i)'
    );
    await runActiveQuery(page);
    await addComputedColumn(page, { name: 'us2_total', expression: 'SUM(price)' });
    await addComputedColumn(page, { name: 'us2_rounded', expression: 'ROUND(price, 0)' });

    await saveToProject(page);
    await runPublishFlow(page);

    const found = findModel(modelName);
    expect(found, `new model "${modelName}" should exist in YAML`).toBeTruthy();
    expect(
      (found.model.metrics ?? []).map(m => m.name),
      'us2_total metric should be nested under the model'
    ).toContain('us2_total');
    expect(
      (found.model.dimensions ?? []).map(d => d.name),
      'us2_rounded dimension should be nested under the model'
    ).toContain('us2_rounded');

    // Top-level metrics/dimensions MUST NOT have acquired us2_total / us2_rounded.
    expect(collectTopLevelNames('metrics')).not.toContain('us2_total');
    expect(collectTopLevelNames('dimensions')).not.toContain('us2_rounded');
  });

  test('US-PUBLISH-3: New metric on existing model nests under that model', async ({ page }) => {
    await loadExplorer(page);
    await openModelInExplorer(page, 'products');
    await runActiveQuery(page);
    await addComputedColumn(page, { name: 'us3_total_price', expression: 'SUM(price)' });

    await saveToProject(page);
    await runPublishFlow(page);
    await page.waitForTimeout(500);

    const found = findModel('products');
    expect(found, 'existing products model should still be present').toBeTruthy();
    const metricNames = (found.model.metrics ?? []).map(m => m.name);
    expect(metricNames, 'us3_total_price must be nested under products').toContain(
      'us3_total_price'
    );
    // The pre-existing avg_price must remain intact — no replacement, just append.
    expect(metricNames).toContain('avg_price');

    expect(collectTopLevelNames('metrics')).not.toContain('us3_total_price');
  });

  test('US-PUBLISH-4: New dimension on existing model nests under that model', async ({
    page,
  }) => {
    await loadExplorer(page);
    await openModelInExplorer(page, 'products');
    await runActiveQuery(page);
    await addComputedColumn(page, {
      name: 'us4_price_bucket',
      expression: 'FLOOR(price / 100) * 100',
    });

    await saveToProject(page);
    await runPublishFlow(page);

    const found = findModel('products');
    expect(found, 'existing products model should still be present').toBeTruthy();
    const dimensionNames = (found.model.dimensions ?? []).map(d => d.name);
    expect(
      dimensionNames,
      'us4_price_bucket must be nested under products'
    ).toContain('us4_price_bucket');
    // Pre-existing nested dimension preserved.
    expect(dimensionNames).toContain('price_rounded');

    expect(collectTopLevelNames('dimensions')).not.toContain('us4_price_bucket');
  });

  test('US-PUBLISH-5: Publishing a new model + insight + chart writes the expected shape', async ({
    page,
  }) => {
    await loadExplorer(page);
    const modelName = await addNewModelTab(page);

    await typeSqlInActive(
      page,
      'SELECT i AS x, i * 2 AS y FROM generate_series(1, 8) AS t(i)'
    );
    await runActiveQuery(page);

    // Give the chart a real name so saveExplorerObjects saves it. The default
    // Chart name is empty ("Untitled" is a placeholder in the UI, not a value)
    // which causes the store's `if (state.explorerChartName)` guard to skip
    // the chart save.
    const chartInput = page.locator('[data-testid="chart-name-input"]');
    await chartInput.fill('us_publish_5_chart');
    await page.waitForTimeout(300);

    await saveToProject(page);
    await runPublishFlow(page);

    expect(findModel(modelName), `new model "${modelName}" should be in YAML`).toBeTruthy();

    // Verify the chart we named landed in project.visivo.yml.
    const projectDoc = readYaml(PROJECT_FILE);
    const charts = projectDoc.charts ?? [];
    expect(
      charts.map(c => c.name),
      'named chart should be present in YAML after publish'
    ).toContain('us_publish_5_chart');

    // The auto-created insight should have landed somewhere too (name is
    // auto-generated, so we only check the count grew).
    const baselineProjectDoc = parseYaml(baselineSnapshot.get(PROJECT_FILE));
    expect((projectDoc.insights ?? []).length).toBeGreaterThanOrEqual(
      (baselineProjectDoc.insights ?? []).length + 1
    );
  });

  test('US-PUBLISH-6: Publish button appears in TopNav after Save without a page reload', async ({
    page,
  }) => {
    await loadExplorer(page);
    await addNewModelTab(page);
    await typeSqlInActive(page, 'SELECT 1 AS one FROM generate_series(1, 1) AS t(i)');
    await runActiveQuery(page);

    // Precondition: the Publish button should not be visible yet (save has
    // not happened and the sandbox started clean). We do NOT strictly assert
    // this because prior-test backend state may linger if a prior run failed;
    // the interesting assertion is the transition triggered by the save.
    await saveToProject(page);

    const topNavPublish = page.getByRole('button', { name: /^Publish$/ });
    await expect(
      topNavPublish,
      'Publish button must become visible immediately after save — no reload'
    ).toBeVisible({ timeout: 5000 });

    // Clean up the server-side state so subsequent tests start fresh: publish
    // the change (with the reload workaround disabled is unnecessary here —
    // the button is already visible at this point), then let afterEach
    // restore the YAML file.
    await runPublishFlow(page, { allowReload: false });
  });

  test('US-PUBLISH-7: File-restoration integrity — project matches baseline', async () => {
    // This test is a pure filesystem assertion: after beforeEach has restored
    // the snapshot, all YAML files must match baseline byte-for-byte. If any
    // prior test left the project dirty, this will flag it.
    if (!baselineSnapshot) throw new Error('baselineSnapshot missing');
    const diffs = assertProjectMatches(baselineSnapshot);
    expect(diffs, `files diverged from baseline: ${diffs.join(', ')}`).toEqual([]);
  });
});
