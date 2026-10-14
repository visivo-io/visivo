/**
 * Story: validation-as-save (VIS-993).
 *
 * The rail persists on an explicit Save through a gated backbone: Save flushes
 * through useRecordSave, where a semantically doomed edit (dangling ref,
 * unparseable SQL expression) never POSTs — no draft-cache write, no run under
 * runs-on-changes, no cloud commit block — and the blocking reason renders on
 * the field. Fixing the value and saving lands the change in the backend
 * pending set.
 *
 * Runs in the `state-mutating` playwright project (the valid-save steps write
 * the in-memory draft cache; discarded in afterAll).
 */
import { test, expect } from '@playwright/test';
import { API } from '../helpers/sandbox.mjs';
import { selectLibraryObject } from '../helpers/workspace.mjs';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';
const WAIT = 20000;
// After the Save click the async gate (schema + refs + backend sqlglot) must run
// before any POST could fire. 1500ms comfortably covers it.
const SETTLE = 1500;

// Both are defined inside a model, so the Library lists them under it.
const DIMENSION = { name: 'x_rounded', model: 'local_test_table' };
const METRIC = { name: 'avg_value', model: 'daily_metrics' };

test.describe('Validation-as-save gates the rail (VIS-993)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  /** @type {import('@playwright/test').Page} */
  let page;
  const posts = { dimensions: [], metrics: [] };

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.on('request', req => {
      if (req.method() !== 'POST') return;
      if (req.url().includes('/api/dimensions/')) posts.dimensions.push(req.url());
      if (req.url().includes('/api/metrics/')) posts.metrics.push(req.url());
    });
  });

  test.afterAll(async () => {
    // Drop any draft this story cached so later suites see a clean backend.
    await page.request.post(`${API}/api/commit/discard/`).catch(() => {});
    await page.close();
  });

  const openForm = async (type, { name, model }) => {
    await page.goto(`${BASE}/workspace`);
    await page.waitForLoadState('networkidle');
    await selectLibraryObject(page, type, name, { model });
    await expect(page.getByTestId('plain-sql-input')).toBeVisible({ timeout: WAIT });
  };

  const setExpression = async text => {
    await page.getByTestId('plain-sql-input').fill(text);
  };

  // Save is gated on real edits; an edit enables it, then it flushes the config
  // through the gated backbone.
  const clickSave = async () => {
    const save = page.getByTestId('form-footer-save');
    await expect(save).toBeEnabled({ timeout: WAIT });
    await save.click();
  };

  const backendPending = async name => {
    const changes = await page.request
      .get(`${API}/api/commit/pending/`)
      .then(r => r.json())
      .catch(() => ({ pending: [] }));
    return (changes.pending || []).some(c => c.name === name);
  };

  test('the rail has an explicit Save, gated until an edit is made', async () => {
    await openForm('dimension', DIMENSION);
    const save = page.getByTestId('form-footer-save');
    await expect(save).toBeVisible();
    // Untouched edit form → nothing to save.
    await expect(save).toBeDisabled();
  });

  test('a dangling ref blocks the save: inline reason, zero POSTs', async () => {
    const postsBefore = posts.dimensions.length;
    await setExpression('${ref(ghost_model)}');
    await clickSave();
    await page.waitForTimeout(SETTLE);

    // The gate's reason lands on the expression field.
    await expect(page.getByText(/ghost_model/).first()).toBeVisible({ timeout: WAIT });

    // Nothing persisted: no dimension POST left the browser, backend agrees.
    expect(posts.dimensions.length).toBe(postsBefore);
    expect(await backendPending(DIMENSION.name)).toBe(false);
  });

  test('fixing the expression and saving persists: POST fires', async () => {
    const postsBefore = posts.dimensions.length;

    await setExpression('ROUND(x, 1)');
    await clickSave();

    await expect
      .poll(() => posts.dimensions.length, { timeout: WAIT })
      .toBeGreaterThan(postsBefore);
    await expect.poll(() => backendPending(DIMENSION.name), { timeout: WAIT }).toBe(true);
  });

  test("an unparseable metric expression blocks: the user's AVG(value)} repro", async () => {
    await openForm('metric', METRIC);

    const postsBefore = posts.metrics.length;
    await setExpression('AVG(value)}');
    await clickSave();
    await page.waitForTimeout(SETTLE);

    // The backend sqlglot parse error surfaces on the expression field.
    await expect(
      page.getByText(/Expecting|Invalid expression|parse/i).first()
    ).toBeVisible({ timeout: WAIT });

    expect(posts.metrics.length).toBe(postsBefore);
    expect(await backendPending(METRIC.name)).toBe(false);
  });

  test('fixing the metric expression and saving persists', async () => {
    const postsBefore = posts.metrics.length;

    // Not the original AVG(value): saving an unchanged expression is not a change.
    await setExpression('MAX(value)');
    await clickSave();

    await expect
      .poll(() => posts.metrics.length, { timeout: WAIT })
      .toBeGreaterThan(postsBefore);
    await expect.poll(() => backendPending(METRIC.name), { timeout: WAIT }).toBe(true);
  });
});
