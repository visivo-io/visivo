/**
 * Story: Library inline create — the "+ New" header menu
 * (user-reported: "no way to create a new object in the editor").
 *
 * The Library header's "+ New" menu drafts a minimal valid config into the
 * backend cache via the shared inline-create flow, then opens the new object
 * as a workspace tab so the right-rail Edit form is the editing surface. No
 * modals.
 *
 * Mutates the backend draft cache (in-memory only, no YAML) — registered in
 * the 'state-mutating' playwright project so it runs after the read-only
 * sweep. Drafts persist until the sandbox restarts; names are unique per run
 * via the store's generateUniqueName, so reruns don't collide.
 *
 * Port: absolute URL, default :3003 (override with PROJECT_EDITOR_BASE_URL —
 * shares the Project Editor specs' sandbox).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PROJECT_EDITOR_BASE_URL || 'http://localhost:3003';
const SCREENS = 'e2e/stories/__screens__';
const WAIT = 20000;

const readStore = (page, expr) =>
  page.evaluate(
    e => Function('s', `return (${e})`)(window.useStore.getState()),
    expr
  );

test.describe('Library inline create', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: WAIT });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the header "+ New" menu drafts a model and opens its tab', async () => {
    await page.getByTestId('library-new-object-button').hover();
    await page.getByTestId('library-new-object-button').click();
    await expect(page.getByTestId('library-new-object-menu')).toBeVisible();
    // Every creatable type is listed — relation included (VIS-1237): it used
    // to be listed but wired to open the Semantic Layer instead of creating
    // anything, which read as a dead menu item.
    for (const t of ['chart', 'table', 'markdown', 'input', 'dashboard', 'source', 'model', 'dimension', 'metric', 'insight', 'relation']) {
      await expect(page.getByTestId(`library-new-object-${t}`)).toBeVisible();
    }
    await page.screenshot({ path: `${SCREENS}/inline-create-01-menu.png` });

    await page.getByTestId('library-new-object-model').click();
    await expect(page.getByTestId('library-new-object-menu')).toHaveCount(0);

    // The draft exists and is the active workspace object (right rail binds it).
    await expect
      .poll(() => readStore(page, "s.workspaceActiveObject && s.workspaceActiveObject.type"), {
        timeout: WAIT,
      })
      .toBe('model');
    const name = await readStore(page, 's.workspaceActiveObject.name');
    expect(name).toMatch(/^new-model/);
    await expect
      .poll(() => readStore(page, `(s.models || []).some(m => m.name === '${name}')`), {
        timeout: WAIT,
      })
      .toBe(true);
    await page.screenshot({ path: `${SCREENS}/inline-create-02-model-tab.png` });
  });

  test('the header "+ New" menu drafts and opens an insight', async () => {
    await page.getByTestId('library-new-object-button').click();
    await expect(page.getByTestId('library-new-object-menu')).toBeVisible();
    await page.getByTestId('library-new-object-insight').click();

    await expect
      .poll(() => readStore(page, "s.workspaceActiveObject && s.workspaceActiveObject.type"), {
        timeout: WAIT,
      })
      .toBe('insight');
    const name = await readStore(page, 's.workspaceActiveObject.name');
    expect(name).toMatch(/^new-insight/);
  });

  // VIS-1237: the reported bug — picking Relation created nothing.
  test('the header "+ New" menu drafts a relation joining two real models', async () => {
    await page.getByTestId('library-new-object-button').click();
    await expect(page.getByTestId('library-new-object-menu')).toBeVisible();
    await page.getByTestId('library-new-object-relation').click();

    await expect
      .poll(() => readStore(page, "s.workspaceActiveObject && s.workspaceActiveObject.type"), {
        timeout: WAIT,
      })
      .toBe('relation');
    const name = await readStore(page, 's.workspaceActiveObject.name');
    expect(name).toMatch(/^new_relation/);

    // It really landed in the draft cache, with a condition referencing two
    // real models (what the backend validator requires).
    await expect
      .poll(() => readStore(page, `(s.relations || []).some(r => r.name === '${name}')`), {
        timeout: WAIT,
      })
      .toBe(true);
    const condition = await readStore(
      page,
      `(() => { const r = (s.relations || []).find(x => x.name === '${name}'); const c = r && (r.config || r); return c && c.condition; })()`
    );
    expect(condition).toMatch(/ref\([^)]+\).*=.*ref\([^)]+\)/);
  });

  test('a new dashboard does not inherit unsaved edits from a deleted one with the same name', async () => {
    const createDashboard = async () => {
      await page.getByTestId('library-new-object-button').click();
      await page.getByTestId('library-new-object-dashboard').click();
      await expect
        .poll(() => readStore(page, "s.workspaceActiveObject && s.workspaceActiveObject.type"), {
          timeout: WAIT,
        })
        .toBe('dashboard');
      return readStore(page, 's.workspaceActiveObject.name');
    };
    const rowCount = name =>
      readStore(page, `(s.dashboards.find(d => d.name === '${name}') || {}).config?.rows?.length`);
    const rail = page.getByTestId('workspace-right-rail-edit');
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: WAIT });

    const first = await createDashboard();
    await expect.poll(() => rowCount(first), { timeout: WAIT }).toBe(1);
    await page.getByTestId('right-rail-edit-add-row').click();
    await expect.poll(() => rowCount(first), { timeout: WAIT }).toBe(2);
    expect(await readStore(page, `s.isDashboardDirty('${first}')`)).toBe(true);

    await rail.getByTitle('Delete').click();
    await rail.getByRole('button', { name: 'Confirm Delete' }).click();
    await expect
      .poll(() => readStore(page, `s.dashboards.some(d => d.name === '${first}')`), { timeout: WAIT })
      .toBe(false);

    const second = await createDashboard();
    expect(second).toBe(first);
    await expect.poll(() => rowCount(second), { timeout: WAIT }).toBe(1);
    expect(await readStore(page, `s.isDashboardDirty('${second}')`)).toBe(false);
    await expect(rail).toContainText('1 row');
    await page.screenshot({ path: `${SCREENS}/inline-create-03-dashboard-name-reuse.png` });
  });

  test('no console errors across the create gestures', async () => {
    const NOISE = ['favicon', 'DevTools', 'ResizeObserver', 'WebSocket', 'websocket', 'xhr poll'];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real, `console errors:\n${real.join('\n')}`).toHaveLength(0);
  });
});
