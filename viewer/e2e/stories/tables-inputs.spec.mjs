/**
 * Story: Tables react to inputs, show plain column names, and refuse two
 * sources at compile time (VIS-1462: T1, T6, T7a).
 *
 * T1  A column-select table and a pivot table over an input-filtered insight
 *     (`filter-nonaggregate-input-test-insight`, filter `x > ${min_x_value}`)
 *     must re-run when the input changes: their "N total rows" footers change
 *     between min_x_value=0 and min_x_value=5. They used to query the raw
 *     parquet and ignored inputs (a pivot over a dynamic insight even errored,
 *     since the hashed prop columns only exist in the post-query result).
 * T6  Every header text in both tables is a plain name: no `props_mapping`
 *     hash and no parquet `name_hash` appears anywhere in the header block.
 * T7a A separate fixture project (e2e/fixtures/two-model-table) whose table
 *     mixes refs to two unrelated models fails `visivo compile` with a message
 *     naming both models.
 *
 * Precondition: an isolated sandbox serving test-projects/integration, e.g.
 *   VISIVO_SANDBOX_BACKEND_PORT=8035 VISIVO_SANDBOX_FRONTEND_PORT=3035 \
 *   VISIVO_SANDBOX_NAME=vis1462 bash scripts/sandbox.sh start
 *   cd viewer && PLAYWRIGHT_BASE_URL=http://localhost:3035 \
 *   npx playwright test e2e/stories/tables-inputs.spec.mjs --reporter=list
 */

import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'new-tables-dashboard';
const INSIGHT = 'filter-nonaggregate-input-test-insight';
const COLUMNS_TABLE = 'filter-input-columns-table';
const PIVOT_TABLE = 'filter-input-pivot-table';
const WAIT = 30000;

// A hashed identifier in this codebase is a long run of lowercase letters with
// no separators (props_mapping values are 15 chars, name_hash 29). No plain
// English header has a 14+ letter word, so this also catches hashes we did not
// read out of the store.
const HASH_LIKE = /[a-z]{14,}/;

test.use({ viewport: { width: 1600, height: 1200 } });

const openDashboard = async page => {
  await page.goto(`/project/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  for (const id of [COLUMNS_TABLE, PIVOT_TABLE]) {
    const container = page.locator(`#${id}`);
    await container.scrollIntoViewIfNeeded();
    await expect(container, `${id} rendered`).toBeVisible({ timeout: WAIT });
    await expect(container.getByText(/total rows/i), `${id} has a row footer`).toBeVisible({
      timeout: WAIT,
    });
  }
};

/** Parse "N total rows" out of a table container. */
const readRowCount = async (page, id) => {
  const text = (await page.locator(`#${id}`).innerText()) || '';
  const match = text.match(/([\d,]+)\s+total rows/i);
  return match ? Number(match[1].replace(/,/g, '')) : null;
};

const setInput = async (page, value) => {
  await page.evaluate(
    ({ v }) => window.useStore.getState().setInputJobValue('min_x_value', v, 'single-select'),
    { v: value }
  );
};

const waitForRowCount = async (page, id, predicate) => {
  const deadline = Date.now() + WAIT;
  let last = await readRowCount(page, id);
  while (Date.now() < deadline && !predicate(last)) {
    await page.waitForTimeout(200);
    last = await readRowCount(page, id);
  }
  expect(predicate(last), `${id} row count settled to ${last}`).toBe(true);
  return last;
};

/** All header texts in a DataTable (the sticky header block, one text per cell). */
const readHeaderTexts = async (page, id) =>
  page.evaluate(containerId => {
    const container = document.getElementById(containerId);
    if (!container) return null;
    const header = container.querySelector('.sticky.top-0');
    if (!header) return null;
    return (header.innerText || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
  }, id);

test.describe('VIS-1462 tables: inputs, plain headers, single source', () => {
  test.setTimeout(180000);

  test('T1: column-select and pivot row counts change with the input', async ({ page }) => {
    await openDashboard(page);

    // Neither table may be sitting on a render error (a pivot over a dynamic
    // insight used to fail with a binder error on the hashed column).
    for (const id of [COLUMNS_TABLE, PIVOT_TABLE]) {
      const text = (await page.locator(`#${id}`).innerText()) || '';
      expect(text, `${id} rendered without an error`).not.toMatch(/(Pivot|Table) error/i);
    }

    // x > 0 keeps the most rows (8 of 9); x > 5 keeps the fewest (3 of 9).
    await setInput(page, '0');
    const columnsLow = await waitForRowCount(page, COLUMNS_TABLE, n => n === 8);
    const pivotLow = await waitForRowCount(page, PIVOT_TABLE, n => n === 8);

    await page.screenshot({ path: `${SCREENS}/vis1462-tables-min-x-0.png`, fullPage: true });

    await setInput(page, '5');
    const columnsHigh = await waitForRowCount(page, COLUMNS_TABLE, n => n === 3);
    const pivotHigh = await waitForRowCount(page, PIVOT_TABLE, n => n === 3);

    expect(columnsLow).toBe(8);
    expect(pivotLow).toBe(8);
    expect(columnsHigh).toBe(3);
    expect(pivotHigh).toBe(3);

    // The tables track the chart path's result set exactly: the insight job
    // the charts read has the same row count.
    const insightRows = await page.evaluate(
      name => (window.useStore.getState().insightJobs || {})[name]?.data?.length ?? null,
      INSIGHT
    );
    expect(insightRows).toBe(3);

    await page.screenshot({ path: `${SCREENS}/vis1462-tables-min-x-5.png`, fullPage: true });
  });

  test('T6: every header is a plain name, never a hashed column', async ({ page }) => {
    await openDashboard(page);
    await setInput(page, '0');
    await waitForRowCount(page, COLUMNS_TABLE, n => n === 8);
    await waitForRowCount(page, PIVOT_TABLE, n => n === 8);

    const hashes = await page.evaluate(name => {
      const job = (window.useStore.getState().insightJobs || {})[name] || {};
      return [
        ...Object.values(job.props_mapping || {}),
        ...(job.files || []).map(f => f.name_hash),
      ];
    }, INSIGHT);
    expect(hashes.length, 'insight job exposes its hashed names').toBeGreaterThan(0);

    const columnsHeaders = await readHeaderTexts(page, COLUMNS_TABLE);
    const pivotHeaders = await readHeaderTexts(page, PIVOT_TABLE);
    expect(columnsHeaders, 'column-select header block found').not.toBeNull();
    expect(pivotHeaders, 'pivot header block found').not.toBeNull();

    // Column-select: unaliased `x` -> "X"; aliased `y as "Y Value"` -> verbatim.
    expect(columnsHeaders).toEqual(expect.arrayContaining(['X', 'Y Value']));
    // Pivot: the row column is the plain prop name and the banner names plain fields.
    expect(pivotHeaders).toEqual(expect.arrayContaining(['Y']));
    expect(pivotHeaders.join(' ')).toMatch(/SUM of Y/i);
    expect(pivotHeaders.join(' ')).toMatch(/Columns:\s*X/i);

    for (const text of [...columnsHeaders, ...pivotHeaders]) {
      expect(text, `header "${text}" is hash-free`).not.toMatch(HASH_LIKE);
      for (const hash of hashes) {
        expect(text, `header "${text}" does not contain ${hash}`).not.toContain(hash);
      }
    }

    await page.locator(`#${PIVOT_TABLE}`).screenshot({
      path: `${SCREENS}/vis1462-pivot-headers.png`,
    });
  });

  test('both tables fit a ~900px viewport without overflowing it', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1200 });
    await openDashboard(page);
    await setInput(page, '0');
    await waitForRowCount(page, COLUMNS_TABLE, n => n === 8);
    await waitForRowCount(page, PIVOT_TABLE, n => n === 8);

    for (const id of [COLUMNS_TABLE, PIVOT_TABLE]) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box, `${id} has a box`).not.toBeNull();
      expect(box.x, `${id} starts inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${id} ends inside the viewport`).toBeLessThanOrEqual(900);
      expect(box.width, `${id} is not collapsed`).toBeGreaterThan(200);
    }
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth, 'no horizontal page scroll').toBeLessThanOrEqual(900);

    await page.locator(`#${COLUMNS_TABLE}`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENS}/vis1462-tables-900px.png` });
  });

  test('T7a: a table over two unrelated models fails `visivo compile` naming both', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixture = path.resolve(here, '../fixtures/two-model-table');
    const repoRoot = path.resolve(here, '../../..');
    const candidates = [
      process.env.VISIVO_BIN,
      path.join(repoRoot, '.venv/bin/visivo'),
      path.join(repoRoot, 'venv14/bin/visivo'),
    ].filter(Boolean);
    const visivo = candidates.find(p => existsSync(p)) || 'visivo';
    const outDir = mkdtempSync(path.join(tmpdir(), 'vis1462-two-model-'));

    const run = spawnSync(visivo, ['compile', '-o', outDir], {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 120000,
    });
    const output = `${run.stdout || ''}\n${run.stderr || ''}`;

    expect(run.status, `compile must fail\n${output}`).not.toBe(0);
    expect(output).toContain("Table 'orders-and-users'");
    expect(output).toContain("'orders'");
    expect(output).toContain("'users'");
    expect(output).toMatch(/no relationship/i);
  });
});
