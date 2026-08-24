/**
 * Story: Canvas editing → explicit Save → persists to the BACKEND (#46).
 *
 * #46: a dashboard is edited as ONE working copy — canvas gestures update it
 * optimistically but nothing persists until an explicit Save. This story drives
 * each real gesture, then flushes the working copy via the dashboard Save
 * (`commitDashboardEdits` — the same store action the Delete · Discard · Save
 * footer's Save button calls), and asserts the change reached the BACKEND draft
 * cache (`/api/dashboards/` GET) and survives a full reload. (Pre-#46 this was a
 * VIS-993 regression guard: gestures auto-saved but a blocked gate silently
 * dropped the persist; now the persist is explicit, so the guard is the Save.)
 *
 * Real gestures covered:
 *   (a) row-height handle drag  → height changes visually, Save, survives reload;
 *   (b) item-width handle drag  → width persists after Save;
 *   (c) item reorder within row → order persists after Save;
 *   (d) item move across rows   → persists after Save;
 *   (e) Library chart → canvas  → new item persists after Save.
 *
 * Runs in the `state-mutating` playwright project (standard sandbox :3001/:8001,
 * serial; the draft cache is discarded in afterAll).
 */
import { test, expect } from '@playwright/test';
import { API } from '../helpers/sandbox.mjs';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

// A wide viewport keeps the canvas ≥768px so rows lay out side-by-side and the
// item slots get real pixel boxes for the edge handles.
test.use({ viewport: { width: 1600, height: 1400 } });

// ── Backend truth ────────────────────────────────────────────────────────────
// The regression's blind spot: the store's optimistic copy diverges from the
// draft cache when the gate blocks. These helpers read the BACKEND state.
const apiRows = async page => {
  const res = await page.request.get(`${API}/api/dashboards/`);
  const data = await res.json().catch(() => ({ dashboards: [] }));
  const d = (data.dashboards || []).find(x => x.name === DASHBOARD);
  const cfg = d ? d.config || d : null;
  return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
};

const storeRows = page =>
  page.evaluate(name => {
    const s = window.useStore.getState();
    const d = (s.dashboards || []).find(x => x.name === name);
    const cfg = d ? d.config || d : null;
    return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
  }, DASHBOARD);

// A STABLE per-item signature for order comparison (items carry either a ref
// string or an embedded leaf object with a name — both survive a save →
// refetch round-trip).
const itemKey = it => {
  if (!it || typeof it !== 'object') return '(slot)';
  const leaf = it.chart ?? it.table ?? it.markdown ?? it.input;
  if (leaf == null) return Array.isArray(it.rows) ? '(container)' : '(slot)';
  if (typeof leaf === 'string') return leaf;
  return leaf.name || leaf.path || JSON.stringify(leaf).slice(0, 64);
};

const selectKey = (page, key) =>
  page.evaluate(k => window.useStore.getState().setWorkspaceOutlineSelectedKey(k), key);

// #46: the dashboard is edited as one working copy — flush it to the draft cache
// through the explicit Save (the same store action the footer's Save calls).
// Canvas gestures no longer auto-persist, so each backend assertion follows a Save.
const saveEdits = page =>
  page.evaluate(name => window.useStore.getState().commitDashboardEdits(name), DASHBOARD);

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  const dash = page.getByTestId(`dashboard_${DASHBOARD}`);
  await expect(dash).toBeVisible({ timeout: WAIT });
  await expect(dash.locator('[data-row-index]').first()).toBeVisible({ timeout: WAIT });
};

// ── Resize harness (real mouse drag on the raw-pointer handles) ─────────────
const dragHandle = async (page, handle, dx, dy, { shift = false } = {}) => {
  await handle.scrollIntoViewIfNeeded();
  const b = await handle.boundingBox();
  expect(b, 'the resize handle has a box').toBeTruthy();
  const sx = b.x + b.width / 2;
  const sy = b.y + b.height / 2;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + Math.sign(dx) * 4, sy + Math.sign(dy) * 4, { steps: 4 });
  await page.mouse.move(sx + dx, sy + dy, { steps: 20 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
};

// ── DnD harness (dnd-kit PointerSensor) ──────────────────────────────────────
// pointerdown is dispatched on the grip element directly (the grip overlay is
// occluded for hit-testing by the dashboard's z-40 item wrappers — see
// canvas-dnd.spec.mjs for the full rationale); travel is document-level
// pointermoves and the COMMIT is a real page.mouse.up().
const dndDrag = async (page, source, target) => {
  await expect(source).toBeVisible();
  await page.waitForTimeout(150);
  const sb = await source.boundingBox();
  const tb = await target.boundingBox();
  expect(sb && tb, 'both drag endpoints have a box').toBeTruthy();
  const tx = tb.x + tb.width / 2;
  const ty = tb.y + tb.height / 2;
  await source.evaluate(el => {
    const r = el.getBoundingClientRect();
    window.__canvasEditSrc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: window.__canvasEditSrc.x,
        clientY: window.__canvasEditSrc.y,
        pointerId: 1,
        button: 0,
        pointerType: 'mouse',
        isPrimary: true,
        view: window,
      })
    );
  });
  await page.waitForTimeout(40);
  await page.evaluate(
    ([txx, tyy]) => {
      const s = window.__canvasEditSrc;
      const ev = (x, y) =>
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          button: 0,
          pointerType: 'mouse',
          isPrimary: true,
          view: window,
        });
      document.dispatchEvent(ev(s.x + 10, s.y + 10));
      document.dispatchEvent(ev((s.x + txx) / 2, (s.y + tyy) / 2));
      document.dispatchEvent(ev(txx, tyy));
      document.dispatchEvent(ev(txx, tyy));
    },
    [tx, ty]
  );
  await page.waitForTimeout(40);
};

const revealItemHandle = async (page, itemPath) => {
  await page
    .locator(`[data-canvas-path="${itemPath}"]`)
    .first()
    .click({ position: { x: 6, y: 6 }, force: true });
  const handle = page.getByTestId(`canvas-drag-frame-${itemPath}`);
  await expect(handle).toBeVisible({ timeout: WAIT });
  return handle;
};

test.describe('Canvas editing persists to the backend (VIS-993 regression)', () => {
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
    // Drop the drafts this story cached so later suites see a clean backend.
    await page.request.post(`${API}/api/commit/discard/`).catch(() => {});
    await page.close();
  });

  test('(a) row-height drag: visual change + retained through a full reload', async () => {
    await openCanvas(page);
    const before = await storeRows(page);
    const beforeHeight = before[0].height;

    // The row's rendered box before the resize (visual baseline).
    const rowEl = page.locator('[data-canvas-path="row.0"]').first();
    const boxBefore = await rowEl.boundingBox();

    await selectKey(page, 'row.0');
    const handle = page.getByTestId('canvas-resize-height-row.0');
    await expect(handle).toBeVisible({ timeout: WAIT });

    // Drag DOWN far enough to cross at least one HeightEnum stop.
    await dragHandle(page, handle, 0, 160);

    // The selection SURVIVES the gesture (regression: the drag's terminal
    // click used to fall through the selection overlay's chrome branch and
    // deselect — hiding the handles after every single resize).
    await expect
      .poll(() => page.evaluate(() => window.useStore.getState().workspaceOutlineSelectedKey))
      .toBe('row.0');
    await expect(handle).toBeVisible();

    // Visual: the rendered row box grew.
    await expect
      .poll(async () => (await rowEl.boundingBox())?.height, { timeout: WAIT })
      .toBeGreaterThan(boxBefore.height + 40);

    // #46: explicit Save flushes the working copy to the draft cache.
    await saveEdits(page);

    // Backend: the draft cache holds the new height (after Save — a working copy
    // that was never saved would leave the API at the old value).
    await expect
      .poll(async () => (await apiRows(page))[0]?.height, { timeout: WAIT })
      .not.toBe(beforeHeight);
    const apiHeight = (await apiRows(page))[0].height;

    // Reload: the height is retained (served back from the draft cache).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
    await expect
      .poll(async () => (await storeRows(page))[0]?.height, { timeout: WAIT })
      .toBe(apiHeight);
  });

  test('(b) item-width drag persists to /api/dashboards/', async () => {
    await openCanvas(page);
    const rows = await storeRows(page);
    const ri = rows.findIndex(r => (r.items || []).length >= 2);
    expect(ri, 'a row with ≥2 items exists').toBeGreaterThanOrEqual(0);
    const beforeWidth = rows[ri].items[0].width || 1;

    const itemKeyPath = `row.${ri}.item.0`;
    await selectKey(page, itemKeyPath);
    const handle = page.getByTestId(`canvas-resize-width-${itemKeyPath}`);
    await expect(handle).toBeVisible({ timeout: WAIT });

    const rowBox = await page.locator(`[data-canvas-path="row.${ri}"]`).first().boundingBox();
    const colPx = rowBox.width / (rows[ri].items.reduce((s, it) => s + (it.width || 1), 0) || 1);
    const dir = beforeWidth > 1 ? -1 : 1;
    await dragHandle(page, handle, dir * Math.round(colPx * 2), 0);
    await saveEdits(page);

    // Backend truth: the width change reached the draft cache after Save.
    await expect
      .poll(async () => (await apiRows(page))[ri]?.items?.[0]?.width, { timeout: WAIT })
      .not.toBe(beforeWidth);
    const after = (await apiRows(page))[ri].items[0].width;
    expect(Number.isInteger(after)).toBe(true);
    expect(after).toBeGreaterThanOrEqual(1);
    expect(after).toBeLessThanOrEqual(12);
  });

  test('(c) item reorder within a row persists to /api/dashboards/', async () => {
    await openCanvas(page);
    const rows = await storeRows(page);
    const ri = rows.findIndex(r => (r.items || []).length >= 2);
    const before = rows[ri].items.map(itemKey);

    const handle = await revealItemHandle(page, `row.${ri}.item.0`);
    const endZone = page.getByTestId(`canvas-dropzone-row.${ri}-end`);
    await dndDrag(page, handle, endZone);
    await expect(page.getByTestId('library-drag-preview')).toBeVisible({ timeout: 4000 });
    await page.mouse.up();
    await saveEdits(page);

    // Backend truth: the first item moved to the end IN THE DRAFT CACHE (after Save).
    await expect
      .poll(
        async () => {
          const r = await apiRows(page);
          const items = r[ri]?.items || [];
          return items.length ? itemKey(items[items.length - 1]) : null;
        },
        { timeout: WAIT }
      )
      .toBe(before[0]);
  });

  test('(d) item move ACROSS rows persists to /api/dashboards/', async () => {
    await openCanvas(page);
    const rows = await storeRows(page);
    const fromRi = rows.findIndex(r => (r.items || []).length >= 2);
    const toRi = rows.findIndex((r, i) => i !== fromRi && Array.isArray(r.items));
    expect(fromRi, 'a source row exists').toBeGreaterThanOrEqual(0);
    expect(toRi, 'a target row exists').toBeGreaterThanOrEqual(0);

    const movedKey = itemKey(rows[fromRi].items[0]);
    const targetCountBefore = (rows[toRi].items || []).length;

    const handle = await revealItemHandle(page, `row.${fromRi}.item.0`);
    const endZone = page.getByTestId(`canvas-dropzone-row.${toRi}-end`);
    await endZone.waitFor({ timeout: WAIT });
    await dndDrag(page, handle, endZone);
    await expect(page.getByTestId('library-drag-preview')).toBeVisible({ timeout: 4000 });
    await page.mouse.up();
    await saveEdits(page);

    // Backend truth: the item left its row and landed at the target row's end (after Save).
    await expect
      .poll(
        async () => {
          const r = await apiRows(page);
          const target = r[toRi]?.items || [];
          return (
            target.length === targetCountBefore + 1 &&
            itemKey(target[target.length - 1]) === movedKey
          );
        },
        { timeout: WAIT }
      )
      .toBe(true);
  });

  test('(e) Library chart dropped on the canvas persists a new item', async () => {
    await openCanvas(page);
    const rowsBefore = await apiRows(page);
    const totalBefore = rowsBefore.reduce((n, r) => n + (r.items || []).length, 0);

    // Expand the Charts subsection in the Library and grab a chart row.
    const chartHeader = page.getByTestId('library-subsection-chart-header');
    await chartHeader.waitFor({ timeout: WAIT });
    const anyChartRow = page.locator('[data-testid^="library-row-chart-"]').first();
    if (!(await anyChartRow.count())) {
      await chartHeader.click();
    }
    await anyChartRow.waitFor({ timeout: WAIT });
    const chartName = await anyChartRow.evaluate(el =>
      (el.getAttribute('data-testid') || '').replace('library-row-chart-', '')
    );
    expect(chartName).toBeTruthy();

    const endZone = page.getByTestId('canvas-dropzone-row.0-end');
    await endZone.waitFor({ timeout: WAIT });
    await dndDrag(page, anyChartRow, endZone);
    await expect(page.getByTestId('library-drag-preview')).toBeVisible({ timeout: 4000 });
    await page.mouse.up();
    await saveEdits(page);

    // Backend truth: a new item referencing the chart is IN THE DRAFT CACHE (after Save).
    await expect
      .poll(
        async () => {
          const rows = await apiRows(page);
          const total = rows.reduce((n, r) => n + (r.items || []).length, 0);
          const hasRef = rows.some(r =>
            (r.items || []).some(
              it => typeof it.chart === 'string' && it.chart.includes(chartName)
            )
          );
          return total > totalBefore && hasRef;
        },
        { timeout: WAIT }
      )
      .toBe(true);
  });

  test('no console errors and no save 400s across the gestures', async () => {
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
    expect(saveFailures, 'canvas edits must persist backend-valid configs').toHaveLength(0);
    expect(real).toHaveLength(0);
  });
});
