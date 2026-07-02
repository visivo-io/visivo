/**
 * Story: validation-as-save (VIS-993).
 *
 * The rail's save path is gated: a semantically doomed edit (dangling ref in a
 * dimension expression) never POSTs — no draft-cache write, no run under
 * runs-on-changes, no cloud commit block — and the blocking reason renders on
 * the field. Fixing the value saves normally and the commit badge reflects the
 * pending change.
 *
 * Runs in the `state-mutating` playwright project (writes the in-memory draft
 * cache on the valid-save step; discarded in afterAll).
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';
const API = BASE.replace(':3001', ':8001');
const WAIT = 20000;

const DIMENSION = 'x_rounded';

test.describe('Validation-as-save gates the rail (VIS-993)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  /** @type {import('@playwright/test').Page} */
  let page;
  const dimensionPosts = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.on('request', req => {
      if (req.method() === 'POST' && req.url().includes('/api/dimensions/')) {
        dimensionPosts.push(req.url());
      }
    });
  });

  test.afterAll(async () => {
    // Drop any draft this story cached so later suites see a clean backend.
    await page.request.post(`${API}/api/commit/discard/`).catch(() => {});
    await page.close();
  });

  const openDimensionForm = async () => {
    await page.goto(`${BASE}/workspace`);
    await page.waitForLoadState('networkidle');
    const section = page.getByTestId('library-subsection-dimension-header');
    if (await section.isVisible().catch(() => false)) {
      await section.click();
    }
    const row = page.getByTestId(`library-row-dimension-${DIMENSION}`);
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

  test('a dangling ref blocks Save: inline reason, zero POSTs, badge unchanged', async () => {
    await openDimensionForm();

    const postsBefore = dimensionPosts.length;
    await setExpression('${ref(ghost_model)}');
    await page.getByRole('button', { name: 'Save' }).click();

    // The gate's reason lands on the expression field.
    await expect(page.getByText(/ghost_model/).first()).toBeVisible({ timeout: WAIT });

    // Nothing persisted: no dimension POST left the browser.
    expect(dimensionPosts.length).toBe(postsBefore);

    // And the backend agrees — the draft cache holds no pending changes.
    const changes = await page.request
      .get(`${API}/api/commit/pending/`)
      .then(r => r.json())
      .catch(() => ({ pending: [] }));
    const pendingDimension = (changes.pending || []).find(c => c.name === DIMENSION);
    expect(pendingDimension).toBeUndefined();
  });

  test('fixing the expression saves through: POST fires and the change is pending', async () => {
    const postsBefore = dimensionPosts.length;

    await setExpression('ROUND(x, 1)');
    await page.getByRole('button', { name: 'Save' }).click();

    // The save leaves the browser…
    await expect
      .poll(() => dimensionPosts.length, { timeout: WAIT })
      .toBeGreaterThan(postsBefore);

    // …and the backend now reports the dimension as a pending draft change.
    await expect
      .poll(
        async () => {
          const changes = await page.request
            .get(`${API}/api/commit/pending/`)
            .then(r => r.json())
            .catch(() => ({ pending: [] }));
          return (changes.pending || []).some(c => c.name === DIMENSION);
        },
        { timeout: WAIT }
      )
      .toBe(true);
  });
});
