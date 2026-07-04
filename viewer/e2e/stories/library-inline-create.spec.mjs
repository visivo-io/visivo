/**
 * Story: Library inline create — "+ New" header menu + per-type "+ New X"
 * (user-reported: "no way to create a new object in the editor").
 *
 * The Library header's "+ New" menu and every creatable subsection's
 * "+ New X" button draft a minimal valid config into the backend cache via
 * the shared inline-create flow, then open the new object as a workspace tab
 * so the right-rail Edit form is the editing surface. No modals.
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
    // Every creatable type is listed; relation (untemplatable) is not.
    for (const t of ['chart', 'table', 'markdown', 'input', 'dashboard', 'source', 'model', 'dimension', 'metric', 'insight']) {
      await expect(page.getByTestId(`library-new-object-${t}`)).toBeVisible();
    }
    await expect(page.getByTestId('library-new-object-relation')).toHaveCount(0);
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

  test('a data-layer subsection "+ New Insight" drafts and opens an insight', async () => {
    const header = page.getByTestId('library-subsection-insight-header');
    await header.scrollIntoViewIfNeeded();
    await header.click();
    const create = page.getByTestId('library-subsection-insight-create');
    await create.scrollIntoViewIfNeeded();
    await create.hover();
    await create.click();

    await expect
      .poll(() => readStore(page, "s.workspaceActiveObject && s.workspaceActiveObject.type"), {
        timeout: WAIT,
      })
      .toBe('insight');
    const name = await readStore(page, 's.workspaceActiveObject.name');
    expect(name).toMatch(/^new-insight/);
  });

  test('no console errors across the create gestures', async () => {
    const NOISE = ['favicon', 'DevTools', 'ResizeObserver', 'WebSocket', 'websocket', 'xhr poll'];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real, `console errors:\n${real.join('\n')}`).toHaveLength(0);
  });
});
