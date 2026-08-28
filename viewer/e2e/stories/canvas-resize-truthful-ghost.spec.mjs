/**
 * Story: the canvas resize ghost tells the truth (M26 / W7).
 *
 * `Item.width` is a RELATIVE weight, not a column index in a fixed 12-column
 * grid: <Dashboard> lays a row out as `repeat(Σ widths, minmax(0, 1fr))` with a
 * `0.7rem` gap, so growing one item grows the row's denominator too. The resize
 * overlay used to preview against a hardcoded `COLS = 12` and scale the item's
 * start box by `live / start`, which promised a size the drop could not deliver
 * (a 1000px 6/6 row previewed 667px and committed 571px) and printed an `N / 12`
 * readout on rows that were never 12 wide.
 *
 * What this story proves, by MEASURING the DOM rather than eyeballing it:
 *
 *   1. TRUTHFUL PREVIEW — the ghost's box at release and the slot the drop
 *      actually renders agree within 2px, on a row whose widths do NOT sum to 12.
 *   2. HONEST READOUT — the readout's denominator is the live row total.
 *   3. DIRECT MANIPULATION — exactly ONE emphasized outline is on screen during
 *      the gesture, and the card being resized is faded underneath it.
 *   4. ABORT — Escape drops the gesture: nothing commits and the card un-fades.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8060 VISIVO_SANDBOX_FRONTEND_PORT=3060 \
 *   VISIVO_SANDBOX_NAME=m26ghost bash scripts/sandbox.sh start
 *   # then: VIS_GHOST_BASE=http://localhost:3060 npx playwright test canvas-resize-truthful-ghost
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_GHOST_BASE || 'http://localhost:3060';

// Requires the DEDICATED isolated sandbox documented above (:8060/:3060). This
// story REWRITES a dashboard row's widths to a deliberately non-12 shape, so it
// must never be pointed at the shared :3001 sandbox. Without VIS_GHOST_BASE the
// target does not exist and every test here would fail on
// ERR_CONNECTION_REFUSED — skip loudly instead of going vacuously red. This is
// an env-var opt-in gate, not a result-dependent skip.
test.skip(
  !process.env.VIS_GHOST_BASE,
  'requires the isolated VIS_GHOST_BASE sandbox (see header) — not the shared :3001 sandbox'
);

const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

// Wide enough that the row lays out side-by-side (below the stack breakpoint the
// renderer switches to a column and there is no relative grid to preview).
test.use({ viewport: { width: 1600, height: 1200 } });

const readRows = page =>
  page.evaluate(name => {
    const s = window.useStore.getState();
    const d = (s.dashboards || []).find(x => x.name === name);
    const cfg = d ? d.config || d : null;
    return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
  }, DASHBOARD);

const selectKey = (page, key) =>
  page.evaluate(k => window.useStore.getState().setWorkspaceOutlineSelectedKey(k), key);

// Force row 0 into a shape whose widths do NOT total 12 — the case the old
// hardcoded grid got wrong on every drag.
const setRowWidths = (page, widths) =>
  page.evaluate(
    ({ name, ws }) => {
      const s = window.useStore.getState();
      const entry = (s.dashboards || []).find(d => d.name === name);
      const cfg = JSON.parse(JSON.stringify(entry.config || entry));
      cfg.rows[0].items = cfg.rows[0].items
        .slice(0, ws.length)
        .map((item, i) => ({ ...item, width: ws[i] }));
      s.updateDashboardConfigOptimistic(name, cfg);
    },
    { name: DASHBOARD, ws: widths }
  );

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  const dash = page.getByTestId(`dashboard_${DASHBOARD}`);
  await expect(dash).toBeVisible({ timeout: WAIT });
  await expect(dash.locator('[data-row-index]').first()).toBeVisible({ timeout: WAIT });
};

// Press the handle and travel to (centre + dx) WITHOUT releasing, so the caller
// can measure the live ghost mid-gesture.
const pressAndDrag = async (page, handle, dx) => {
  await handle.scrollIntoViewIfNeeded();
  const b = await handle.boundingBox();
  expect(b, 'the resize handle has a box').toBeTruthy();
  const sx = b.x + b.width / 2;
  const sy = b.y + b.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + Math.sign(dx) * 4, sy, { steps: 4 });
  await page.mouse.move(sx + dx, sy, { steps: 20 });
  await page.mouse.move(sx + dx, sy, { steps: 4 });
  return { sx, sy };
};

const countEmphasizedOutlines = page =>
  page.evaluate(() => document.querySelectorAll('[data-canvas-outline="emphasized"]').length);

const opacityOf = (page, canvasPath) =>
  page.evaluate(
    p => document.querySelector(`[data-canvas-path="${p}"]`)?.style.opacity ?? null,
    canvasPath
  );

test.describe('canvas resize ghost == drop (M26 / W7)', () => {
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

  test('the ghost at release is the slot the drop renders (row total ≠ 12)', async () => {
    await openCanvas(page);
    const rows = await readRows(page);
    expect(rows[0].items.length, 'row 0 has ≥2 items').toBeGreaterThanOrEqual(2);

    // A 1 + 2 row: three grid columns, nothing like twelve.
    await setRowWidths(page, [1, 2]);
    await expect
      .poll(async () => (await readRows(page))[0].items.map(i => i.width).join(','), {
        timeout: WAIT,
      })
      .toBe('1,2');

    const itemKey = 'row.0.item.0';
    await selectKey(page, itemKey);
    const handle = page.getByTestId(`canvas-resize-width-${itemKey}`);
    await expect(handle).toBeVisible({ timeout: WAIT });

    const rowBox = await page.locator('[data-canvas-path="row.0"]').first().boundingBox();
    // Ask for roughly half the row — on a 1/3 slot that is a real change.
    await pressAndDrag(page, handle, Math.round(rowBox.width * 0.17));

    const ghost = page.getByTestId('canvas-resize-ghost');
    await expect(ghost).toBeVisible({ timeout: 4000 });
    const ghostBox = await ghost.boundingBox();
    await page.screenshot({ path: `${SCREENS}/m26-01-truthful-ghost.png`, fullPage: true });
    await page.mouse.up();

    // The commit re-lays the row out; wait for the width to land, then MEASURE
    // the slot the renderer produced and compare it to the ghost we just saw.
    await expect
      .poll(async () => (await readRows(page))[0].items[0].width, { timeout: WAIT })
      .not.toBe(1);
    const slot = await page.locator(`[data-canvas-path="${itemKey}"]`).first().boundingBox();
    expect(
      Math.abs(slot.width - ghostBox.width),
      `ghost ${ghostBox.width.toFixed(1)}px vs rendered ${slot.width.toFixed(1)}px`
    ).toBeLessThan(2);
    expect(Math.abs(slot.x - ghostBox.x)).toBeLessThan(2);
  });

  test('the readout denominator is the live row total, never a hardcoded 12', async () => {
    await openCanvas(page);
    await setRowWidths(page, [1, 2]);
    const itemKey = 'row.0.item.0';
    await selectKey(page, itemKey);
    const handle = page.getByTestId(`canvas-resize-width-${itemKey}`);
    await expect(handle).toBeVisible({ timeout: WAIT });

    const rowBox = await page.locator('[data-canvas-path="row.0"]').first().boundingBox();
    await pressAndDrag(page, handle, Math.round(rowBox.width * 0.17));

    const readout = page.getByTestId('canvas-resize-readout');
    await expect(readout).toBeVisible({ timeout: 4000 });
    const text = (await readout.textContent()).trim();
    await page.mouse.up();

    // `N / <row total>`: the total this drag rebalances TO — 2 + 2 = 4 here.
    const [, span, total] = text.match(/(\d+)\s*\/\s*(\d+)/) || [];
    expect(span, `readout was "${text}"`).toBeTruthy();
    const rowsAfter = await readRows(page);
    const liveTotal = rowsAfter[0].items.reduce((s, i) => s + (i.width || 1), 0);
    expect(Number(span)).toBe(rowsAfter[0].items[0].width);
    expect(Number(total)).toBe(liveTotal);
  });

  test('exactly one emphasized outline, and the card under it is faded', async () => {
    await openCanvas(page);
    await setRowWidths(page, [1, 2]);
    const itemKey = 'row.0.item.0';
    await selectKey(page, itemKey);
    const handle = page.getByTestId(`canvas-resize-width-${itemKey}`);
    await expect(handle).toBeVisible({ timeout: WAIT });

    expect(await countEmphasizedOutlines(page)).toBe(0);
    expect(await opacityOf(page, itemKey)).toBe('');

    const rowBox = await page.locator('[data-canvas-path="row.0"]').first().boundingBox();
    await pressAndDrag(page, handle, Math.round(rowBox.width * 0.17));

    expect(await countEmphasizedOutlines(page)).toBe(1);
    expect(await opacityOf(page, itemKey)).toBe('0.35');
    await page.screenshot({ path: `${SCREENS}/m26-02-single-outline.png`, fullPage: true });

    await page.mouse.up();
    await expect.poll(() => countEmphasizedOutlines(page), { timeout: 4000 }).toBe(0);
    await expect.poll(() => opacityOf(page, itemKey), { timeout: 4000 }).toBe('');
  });

  test('Escape aborts the gesture: nothing commits and the card un-fades', async () => {
    await openCanvas(page);
    await setRowWidths(page, [1, 2]);
    const itemKey = 'row.0.item.0';
    await selectKey(page, itemKey);
    const before = (await readRows(page))[0].items.map(i => i.width).join(',');

    const handle = page.getByTestId(`canvas-resize-width-${itemKey}`);
    await expect(handle).toBeVisible({ timeout: WAIT });
    const rowBox = await page.locator('[data-canvas-path="row.0"]').first().boundingBox();
    await pressAndDrag(page, handle, Math.round(rowBox.width * 0.17));
    expect(await countEmphasizedOutlines(page)).toBe(1);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-resize-ghost')).toBeHidden({ timeout: 4000 });
    await page.mouse.up();

    expect(await opacityOf(page, itemKey)).toBe('');
    await page.waitForTimeout(500);
    expect((await readRows(page))[0].items.map(i => i.width).join(',')).toBe(before);
  });

  test('no console errors AND no auto-save 400 across the gestures', async () => {
    const NOISE = [
      'favicon',
      'DevTools',
      'react-cool',
      'ResizeObserver',
      'Download the React DevTools',
    ];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    const saveFailures = page._consoleErrors.filter(
      e => e.includes('400') || e.toLowerCase().includes('bad request')
    );
    expect(saveFailures, 'resize must persist backend-valid config (sanitize)').toHaveLength(0);
    expect(real).toHaveLength(0);
  });
});
