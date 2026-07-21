/**
 * Story: validation-as-save (VIS-993).
 *
 * The rail is AUTO-SAVE with a gated backbone: there is no Save button in edit
 * mode — every field change debounces through useRecordSave, where a
 * semantically doomed edit (dangling ref, unparseable SQL expression) never
 * POSTs — no draft-cache write, no run under runs-on-changes, no cloud commit
 * block — and the blocking reason renders on the field. Fixing the value
 * auto-saves and the change lands in the backend pending set.
 *
 * Runs in the `state-mutating` playwright project (the valid-save steps write
 * the in-memory draft cache; discarded in afterAll).
 */
import { test, expect } from '@playwright/test';
import { API } from '../helpers/sandbox.mjs';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';
const WAIT = 20000;
// The backbone debounces 500ms, then the async gate (schema + refs + backend
// sqlglot) must run before any POST could fire. 1500ms comfortably covers it.
const SETTLE = 1500;

const DIMENSION = 'x_rounded';
const METRIC = 'avg_value';

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

  const openForm = async (type, name) => {
    await page.goto(`${BASE}/workspace`);
    await page.waitForLoadState('networkidle');
    const section = page.getByTestId(`library-subsection-${type}-header`);
    if (await section.isVisible().catch(() => false)) {
      await section.click();
    }
    const row = page.getByTestId(`library-row-${type}-${name}`);
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await expect(page.getByTestId('ref-textarea-editable')).toBeVisible({ timeout: WAIT });
  };

  const setExpression = async text => {
    const editable = page.getByTestId('ref-textarea-editable');
    await editable.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Backspace');
    await editable.pressSequentially(text, { delay: 10 });
  };

  const backendPending = async name => {
    const changes = await page.request
      .get(`${API}/api/commit/pending/`)
      .then(r => r.json())
      .catch(() => ({ pending: [] }));
    return (changes.pending || []).some(c => c.name === name);
  };

  test('there is no Save button — the rail is auto-save', async () => {
    await openForm('dimension', DIMENSION);
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
  });

  test('a dangling ref blocks the auto-save: inline reason, zero POSTs', async () => {
    const postsBefore = posts.dimensions.length;
    await setExpression('${ref(ghost_model)}');
    await page.waitForTimeout(SETTLE);

    // The gate's reason lands on the expression field.
    await expect(page.getByText(/ghost_model/).first()).toBeVisible({ timeout: WAIT });

    // Nothing persisted: no dimension POST left the browser, backend agrees.
    expect(posts.dimensions.length).toBe(postsBefore);
    expect(await backendPending(DIMENSION)).toBe(false);
  });

  test('fixing the expression auto-saves: POST fires without any Save click', async () => {
    const postsBefore = posts.dimensions.length;

    await setExpression('ROUND(x, 1)');

    await expect
      .poll(() => posts.dimensions.length, { timeout: WAIT })
      .toBeGreaterThan(postsBefore);
    await expect.poll(() => backendPending(DIMENSION), { timeout: WAIT }).toBe(true);
  });

  test("an unparseable metric expression blocks: the user's AVG(value)} repro", async () => {
    await openForm('metric', METRIC);

    const postsBefore = posts.metrics.length;
    await setExpression('AVG(value)}');
    await page.waitForTimeout(SETTLE);

    // The backend sqlglot parse error surfaces on the expression field.
    await expect(
      page.getByText(/Expecting|Invalid expression|parse/i).first()
    ).toBeVisible({ timeout: WAIT });

    expect(posts.metrics.length).toBe(postsBefore);
    expect(await backendPending(METRIC)).toBe(false);
  });

  test('fixing the metric expression auto-saves through', async () => {
    const postsBefore = posts.metrics.length;

    await setExpression('AVG(value)');

    await expect
      .poll(() => posts.metrics.length, { timeout: WAIT })
      .toBeGreaterThan(postsBefore);
    await expect.poll(() => backendPending(METRIC), { timeout: WAIT }).toBe(true);
  });
});
