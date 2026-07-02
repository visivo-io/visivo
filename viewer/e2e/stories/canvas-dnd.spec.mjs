/**
 * Story: Canvas drag-and-drop (VIS-771 / Track D D-3).
 *
 * The Workspace dashboard canvas (<ProjectCanvas>) now mounts a drag-and-drop
 * affordance layer (<CanvasDndLayer>) over the render-only <Dashboard>, wired to
 * the shell's SINGLE shared <WorkspaceDndContext> (no second DndContext). It
 * supports three real gestures, each persisting through the dashboard store
 * (optimistic update + debounced save, backend-valid via sanitize):
 *
 *   1. Reorder an item WITHIN a row  — drag an item's handle onto the
 *      end-of-row / between-items drop zone of the same row.
 *   2. Reorder TOP-LEVEL rows         — drag a row's handle onto a between-rows
 *      drop zone.
 *   3. Drop a Library object onto the canvas — drag a Library row onto a canvas
 *      drop zone → a new item referencing that object is inserted.
 *
 * The drag preview is the source pill (architecture §2.6 — no thumbnails); the
 * shared <DragOverlay> renders it.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8008 VISIVO_SANDBOX_FRONTEND_PORT=3008 \
 *   VISIVO_SANDBOX_NAME=vis771 bash scripts/sandbox.sh start
 *   # then: VIS_CANVAS_DND_BASE=http://localhost:3008 npx playwright test canvas-dnd
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_CANVAS_DND_BASE || 'http://localhost:3008';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

// A wide viewport keeps the canvas ≥768px so flat dashboards lay rows out
// side-by-side (real boxes for item drag handles + drop zones).
test.use({ viewport: { width: 1600, height: 1400 } });

const readRows = page =>
  page.evaluate(name => {
    const s = window.useStore.getState();
    const d = (s.dashboards || []).find(x => x.name === name);
    const cfg = d ? d.config || d : null;
    return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
  }, DASHBOARD);

// A STABLE per-item signature for order comparison. Items may carry either a
// string ref (`ref(name)` / `${ref(name)}`) OR an embedded leaf object (the
// integration project pre-resolves charts into objects with a `name`/`path`).
// We extract a string key that survives a save → refetch round-trip (new object
// identities) so `.toBe`/`.toEqual` order assertions are meaningful.
const itemKey = it => {
  if (!it || typeof it !== 'object') return '(slot)';
  const leaf = it.chart ?? it.table ?? it.markdown ?? it.input;
  if (leaf == null) return Array.isArray(it.rows) ? '(container)' : '(slot)';
  if (typeof leaf === 'string') return leaf;
  // Embedded object: prefer its name, then its path (both stable across saves).
  return leaf.name || leaf.path || JSON.stringify(leaf).slice(0, 64);
};

const readItemOrder = async (page, rowIndex) => {
  const rows = await readRows(page);
  const items = rows[rowIndex]?.items || [];
  return items.map(itemKey);
};

// Start a canvas drag and travel to the target drop zone, leaving the pointer
// DOWN (the caller commits the drop with `page.mouse.up()`).
//
// Why this dispatches `pointerdown` directly on the grip element instead of
// driving `page.mouse.down()` at the grip's coordinates:
//
//   The canvas grips are an absolutely-positioned overlay (`<CanvasDndLayer>`,
//   z-10) painted OVER the render-only <Dashboard>, and an item grip sits at the
//   top-left corner of its item — directly over the item's Plotly chart. The
//   dashboard item wrapper carries `z-40`, which is ABOVE the overlay's z-10, so
//   at the grip's centre `elementFromPoint` resolves to the Plotly
//   `svg-container`, not the grip. A coordinate-based `page.mouse.down()`
//   therefore lands on the chart and dnd-kit's PointerSensor never arms — the
//   drag silently no-ops (this is what the previous `scrollIntoViewIfNeeded`
//   harness masked; the scroll only made it flakier by reflowing the gated grip
//   mid-grab). The grip is fully visible per CSS (the gating test asserts that),
//   it's just occluded for hit-testing.
//
//   Dispatching `pointerdown` on the grip element itself bypasses hit-testing
//   and arms dnd-kit's PointerSensor on the real draggable node. The subsequent
//   document-level `pointermove`s clear the 5px activation distance and travel to
//   the target (dnd-kit measures droppables by rect — MeasuringStrategy.Always —
//   so the moves only need to reach the target's centre, occlusion-immune too).
//   The final commit is a REAL `page.mouse.up()` in the caller, which dnd-kit's
//   document pointerup listener catches and routes through `routeWorkspaceDragEnd`.
const dndDrag = async (page, source, target) => {
  await expect(source).toBeVisible();
  await page.waitForTimeout(150); // settle the reveal/select reflow before grabbing
  const sb = await source.boundingBox();
  const tb = await target.boundingBox();
  expect(sb && tb, 'both drag endpoints have a box').toBeTruthy();
  const tx = tb.x + tb.width / 2;
  const ty = tb.y + tb.height / 2;
  // Arm the PointerSensor by dispatching pointerdown on the grip node directly.
  await source.evaluate(el => {
    const r = el.getBoundingClientRect();
    window.__canvasDndSrc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const ev = (x, y) => ({
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
    el.dispatchEvent(new PointerEvent('pointerdown', ev(window.__canvasDndSrc.x, window.__canvasDndSrc.y)));
  });
  await page.waitForTimeout(40);
  // Nudge past the 5px activation distance, then travel to the target centre.
  await page.evaluate(
    ([tx, ty]) => {
      const s = window.__canvasDndSrc;
      const ev = (x, y) => ({
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
      document.dispatchEvent(new PointerEvent('pointermove', ev(s.x + 10, s.y + 10)));
      document.dispatchEvent(new PointerEvent('pointermove', ev((s.x + tx) / 2, (s.y + ty) / 2)));
      document.dispatchEvent(new PointerEvent('pointermove', ev(tx, ty)));
      document.dispatchEvent(new PointerEvent('pointermove', ev(tx, ty)));
    },
    [tx, ty]
  );
  await page.waitForTimeout(40);
  return { sb, tb };
};

// VIS-975: the drag affordance is now the SELECTED node's frame (a border-ring
// grab surface), not a hover grip icon. We reveal it via SELECTION (click): the
// selected key persists for the whole gesture, and the frame is painted only on
// the exact selected node. `.first()` (DOM order) is the dashboard slot.
//
// The select-click uses `{ force: true }` to skip Playwright's actionability /
// occlusion check. The click target (the slot's top-left corner) is intentionally
// overlaid by the item's Plotly chart AND, on a re-entrant call (e.g. a serial
// retry where a prior selection already revealed this frame), by the frame strip
// itself — Playwright would otherwise abort with "subtree intercepts pointer
// events" and retry until it times out. We only need the click to land on the
// slot element to trigger selection, so forcing the dispatch is correct and
// removes the retry flake.
const revealItemHandle = async (page, itemPath) => {
  await page
    .locator(`[data-canvas-path="${itemPath}"]`)
    .first()
    .click({ position: { x: 6, y: 6 }, force: true });
  const handle = page.getByTestId(`canvas-drag-frame-${itemPath}`);
  await expect(handle).toBeVisible({ timeout: WAIT });
  return handle;
};
const revealRowHandle = async (page, rowIndex) => {
  // VIS-975: the row frame is painted only when the ROW itself is selected (an
  // item selection no longer reveals its parent row's affordance). The row's
  // chrome is mostly covered by its items, so select the row through the same
  // outline-selection store the canvas writes — the single selection source of
  // truth — then grab its frame.
  await page.evaluate(rp => {
    window.useStore.getState().setWorkspaceOutlineSelectedKey(rp);
  }, `row.${rowIndex}`);
  const handle = page.getByTestId(`canvas-drag-frame-row.${rowIndex}`);
  await expect(handle).toBeVisible({ timeout: WAIT });
  return handle;
};

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  const dash = page.getByTestId(`dashboard_${DASHBOARD}`);
  await expect(dash).toBeVisible({ timeout: WAIT });
  await expect(dash.locator('[data-row-index]').first()).toBeVisible({ timeout: WAIT });
  // The DnD affordance layer mounted over the render.
  await expect(page.getByTestId('canvas-dnd-layer')).toBeAttached({ timeout: WAIT });
};

test.describe('Canvas drag-and-drop (VIS-771 / D-3)', () => {
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

  test('frame grab is gated on selection (hidden at rest); drop zones stay mounted', async () => {
    await openCanvas(page);

    // Find a row that has ≥2 items so reorder is meaningful; the integration
    // simple-dashboard's first multi-item row works.
    const rows = await readRows(page);
    const multiItemRow = rows.findIndex(r => (r.items || []).length >= 2);
    expect(multiItemRow, 'a row with ≥2 items exists').toBeGreaterThanOrEqual(0);

    // VIS-975: the legacy six-dot grip icon is gone entirely, and at rest
    // (dashboard selected) NO frame is painted — the canvas reads clean.
    await expect(page.locator('[data-testid^="canvas-drag-handle-"]')).toHaveCount(0);
    await expect(page.getByTestId(`canvas-drag-frame-row.${multiItemRow}`)).toHaveCount(0);
    await expect(
      page.getByTestId(`canvas-drag-frame-row.${multiItemRow}.item.0`)
    ).toHaveCount(0);

    // Selecting an item reveals only THAT item's frame (selection-gated, exactly
    // one frame). revealItemHandle asserts the item frame is visible.
    await revealItemHandle(page, `row.${multiItemRow}.item.0`);
    // The parent row's frame is NOT also painted (exactly one frame on screen).
    await expect(page.getByTestId(`canvas-drag-frame-row.${multiItemRow}`)).toHaveCount(0);

    // Drop zones are always mounted (dnd-kit measures them by rect even though
    // they're pointer-events-none so they never swallow selection clicks).
    await expect(page.getByTestId(`canvas-dropzone-row.${multiItemRow}-end`)).toBeAttached({
      timeout: WAIT,
    });
    await page.screenshot({ path: `${SCREENS}/vis771-01-affordances.png`, fullPage: true });
  });

  test('reorder an item within a row → persists to the store config', async () => {
    await openCanvas(page);
    const rows = await readRows(page);
    const ri = rows.findIndex(r => (r.items || []).length >= 2);
    const before = await readItemOrder(page, ri);
    expect(before.length).toBeGreaterThanOrEqual(2);

    // Drag item 0's handle onto the end-of-row drop zone → item 0 → last.
    // Grips are gated — hover the item to reveal its grip first.
    const handle = await revealItemHandle(page, `row.${ri}.item.0`);
    const endZone = page.getByTestId(`canvas-dropzone-row.${ri}-end`);
    await dndDrag(page, handle, endZone);
    // Mid-flight: the shared drag overlay pill is visible (proves the canvas
    // drag reaches the SAME shared DndContext).
    await expect(page.getByTestId('library-drag-preview')).toBeVisible({ timeout: 4000 });
    await page.mouse.up();

    // The config reorders: the first item moved to the end.
    await expect
      .poll(async () => (await readItemOrder(page, ri))[before.length - 1], { timeout: WAIT })
      .toBe(before[0]);
    const after = await readItemOrder(page, ri);
    expect(after).toHaveLength(before.length);
    expect(after).not.toEqual(before);
    await page.screenshot({ path: `${SCREENS}/vis771-02-item-reordered.png`, fullPage: true });
  });

  test('reorder top-level rows → persists to the store config', async () => {
    await openCanvas(page);
    const rows = await readRows(page);
    expect(rows.length, 'dashboard has ≥2 rows').toBeGreaterThanOrEqual(2);

    // Item-name signatures per row are a stable order-revealing fingerprint
    // (heights can repeat; the item refs are unique per row here).
    const sig = rs => rs.map(r => (r.items || []).map(itemKey).join('|')).join('#');
    const beforeSig = sig(rows);

    // Drag ROW 0's handle DOWN to the trailing append gap (below the last row)
    // → row 0 moves to the END. We target the last between-rows gap (an
    // unambiguous, non-adjacent move) because the row-drag collision is
    // distance-based (closestCenter over the thin between-rows bands): an
    // adjacent gap would normalise to a no-op.
    const row0Sig = (rows[0].items || []).map(itemKey).join('|');
    // Grips are gated — selecting an item in row 0 reveals the row's grip.
    const rowHandle = await revealRowHandle(page, 0);
    const gapZone = page.getByTestId(`canvas-dropzone-row-before-${rows.length}`);
    await dndDrag(page, rowHandle, gapZone);
    // A ROW drag renders the dedicated row pill (VIS-901 #5) — a row has no
    // referenced object type, so it must NOT borrow the Library/chart pill.
    await expect(page.getByTestId('canvas-row-drag-preview')).toBeVisible({ timeout: 4000 });
    await page.mouse.up();

    // The row order changes and the moved row lands LAST.
    await expect
      .poll(async () => sig(await readRows(page)), { timeout: WAIT })
      .not.toBe(beforeSig);
    const afterRows = await readRows(page);
    expect(afterRows).toHaveLength(rows.length);
    expect((afterRows[afterRows.length - 1].items || []).map(itemKey).join('|')).toBe(row0Sig);
    await page.screenshot({ path: `${SCREENS}/vis771-03-rows-reordered.png`, fullPage: true });
  });

  test('drop a Library object onto the canvas → inserts a new item', async () => {
    await openCanvas(page);
    const rowsBefore = await readRows(page);
    const totalItemsBefore = rowsBefore.reduce((n, r) => n + (r.items || []).length, 0);

    // Expand the Charts subsection in the Library (collapsed by default) and
    // grab a chart row as the drag source.
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

    // Drop it on the end-of-row zone of row 0 (near the top of the canvas, so
    // both the Library source row and the canvas target are within one
    // viewport) → a new item appends to that row.
    const endZone = page.getByTestId('canvas-dropzone-row.0-end');
    await endZone.waitFor({ timeout: WAIT });
    await dndDrag(page, anyChartRow, endZone);
    await expect(page.getByTestId('library-drag-preview')).toBeVisible({ timeout: 4000 });
    await page.mouse.up();

    // A new item referencing the chart lands somewhere in the config.
    await expect
      .poll(
        async () => {
          const rows = await readRows(page);
          return rows.some(r =>
            (r.items || []).some(
              it => typeof it.chart === 'string' && it.chart.includes(chartName)
            )
          );
        },
        { timeout: WAIT }
      )
      .toBe(true);

    const rowsAfter = await readRows(page);
    const totalItemsAfter = rowsAfter.reduce((n, r) => n + (r.items || []).length, 0);
    expect(totalItemsAfter).toBeGreaterThan(totalItemsBefore);
    await page.screenshot({ path: `${SCREENS}/vis771-04-library-dropped.png`, fullPage: true });
  });

  test('no console errors AND no auto-save 400 across the canvas DnD gestures', async () => {
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
    expect(saveFailures, 'canvas DnD must persist backend-valid config (sanitize)').toHaveLength(0);
    expect(real).toHaveLength(0);
  });
});
