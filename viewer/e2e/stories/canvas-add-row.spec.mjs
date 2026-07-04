/**
 * Story: Canvas "+ Add Row" template menu + inline-create (VIS-794 / Track D D-7 + D-8).
 *
 * The Workspace dashboard canvas (<ProjectCanvas>) mounts a "+ Add Row"
 * affordance layer (<CanvasAddRow>) over the render-only <Dashboard>:
 *
 *   - An end-of-canvas dashed "+ Add row" button (always present with ≥1 row).
 *   - A between-rows "+ Add row" pill on hover in each top-level row gap.
 *   - The empty-canvas CTA (D-8) when the dashboard has zero rows.
 *
 * Each trigger opens <RowTemplateMenu> (the five D-7 templates). Picking a
 * template inserts a new top-level row of N empty slots at the trigger's target
 * index and persists it through the shell's shared commitCanvasConfig
 * (sanitize → optimistic → save). Inline-create (+ New chart/table/markdown)
 * routes to the Explorer (full round-trip is VIS-J2).
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8046 VISIVO_SANDBOX_FRONTEND_PORT=3046 \
 *   VISIVO_SANDBOX_NAME=vis794 bash scripts/sandbox.sh start
 *   # then: VIS_CANVAS_ADD_ROW_BASE=http://localhost:3046 npx playwright test canvas-add-row
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_CANVAS_ADD_ROW_BASE || 'http://localhost:3046';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

// A wide viewport keeps the canvas ≥768px so flat dashboards lay rows out
// side-by-side and the affordances measure real boxes.
test.use({ viewport: { width: 1600, height: 1400 } });

const readRows = page =>
  page.evaluate(name => {
    const s = window.useStore.getState();
    const d = (s.dashboards || []).find(x => x.name === name);
    const cfg = d ? d.config || d : null;
    return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
  }, DASHBOARD);

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  const dash = page.getByTestId(`dashboard_${DASHBOARD}`);
  await expect(dash).toBeVisible({ timeout: WAIT });
  await expect(dash.locator('[data-row-index]').first()).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('canvas-add-row')).toBeAttached({ timeout: WAIT });
};

test.describe('Canvas + Add Row (VIS-794 / D-7 + D-8)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the end-of-canvas "+ Add row" trigger is present', async () => {
    await openCanvas(page);
    await expect(page.getByTestId('canvas-add-row-end-button')).toBeVisible({ timeout: WAIT });
    await page.screenshot({ path: `${SCREENS}/vis794-01-add-row-affordance.png`, fullPage: true });
  });

  test('open the menu → it shows five templates', async () => {
    await openCanvas(page);
    await page.getByTestId('canvas-add-row-end-button').click();
    await expect(page.getByTestId('row-template-menu')).toBeVisible({ timeout: WAIT });
    for (const key of ['blank', 'kpi', '2up', '3up', 'mix']) {
      await expect(page.getByTestId(`row-template-${key}`)).toBeVisible();
    }
    await page.screenshot({ path: `${SCREENS}/vis794-02-template-menu.png`, fullPage: true });
  });

  test('pick the 3-up template → a new row of 3 empty slots appends + persists', async () => {
    await openCanvas(page);
    const before = await readRows(page);

    await page.getByTestId('canvas-add-row-end-button').click();
    await expect(page.getByTestId('row-template-menu')).toBeVisible({ timeout: WAIT });
    await page.getByTestId('row-template-3up').click();

    // The config grows by one top-level row whose items are 3 empty slots.
    await expect
      .poll(async () => (await readRows(page)).length, { timeout: WAIT })
      .toBe(before.length + 1);

    const after = await readRows(page);
    const newRow = after[after.length - 1];
    expect(newRow.items).toHaveLength(3);
    // Empty slots — width only, NO leaf ref (backend-valid after sanitize).
    expect(newRow.items.every(it => it.width === 4)).toBe(true);
    expect(
      newRow.items.every(it => !it.chart && !it.table && !it.markdown && !it.input && !it.rows)
    ).toBe(true);

    await page.screenshot({ path: `${SCREENS}/vis794-03-row-inserted.png`, fullPage: true });
  });

  test('a between-rows "+ Add row" pill appears on hover and opens the menu', async () => {
    await openCanvas(page);
    const rows = await readRows(page);
    expect(rows.length, 'dashboard has ≥2 rows for a gap').toBeGreaterThanOrEqual(2);

    // Hover the gap before row 1 to reveal its pill, then open the menu.
    const gap = page.getByTestId('canvas-add-row-gap-1');
    await gap.scrollIntoViewIfNeeded();
    await gap.hover();
    const gapButton = page.getByTestId('canvas-add-row-gap-button-1');
    await expect(gapButton).toBeVisible({ timeout: WAIT });
    await gapButton.click();
    await expect(page.getByTestId('row-template-menu')).toBeVisible({ timeout: WAIT });
    await page.screenshot({ path: `${SCREENS}/vis794-04-between-rows-menu.png`, fullPage: true });
  });

  test('no console errors AND no auto-save 400 across the add-row gestures', async () => {
    const NOISE = ['favicon', 'DevTools', 'react-cool', 'ResizeObserver', 'Download the React DevTools'];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    const saveFailures = page._consoleErrors.filter(
      e => e.includes('400') || e.toLowerCase().includes('bad request')
    );
    expect(saveFailures, 'add-row must persist backend-valid config (sanitize)').toHaveLength(0);
    expect(real).toHaveLength(0);
  });
});
