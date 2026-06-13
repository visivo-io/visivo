/**
 * Acceptance stories for the four reported canvas drag-and-drop UX issues.
 *
 *   STORY A (VIS-973) — drag an item from one row INTO another row (cross-row
 *             move): the item leaves its row and joins the target row,
 *             preserving its width.
 *   STORY B (VIS-974) — a nested-layout item reorder COMMITS at a point where
 *             the enclosing container's drop region overlaps the nested gap
 *             (the in-container zone is excluded for item drags, so the nested
 *             gap wins instead of the gesture dead-no-oping).
 *   STORY C (VIS-975) — drag is initiated by gripping the SELECTED node's
 *             FRAME (a border-ring grab surface); the legacy six-dot grip icon
 *             no longer exists, and the affordance is selection-gated.
 *   STORY D (VIS-986) — the row-height handle is reachable from an ITEM
 *             selection (the common case), spans the parent row, and snaps
 *             through the HeightEnum stops (small / medium / large / xlarge);
 *             Shift switches to a precise pixel value.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VIS_DND_UX_BASE=http://localhost:3081 npx playwright test canvas-dnd-ux-stories
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_DND_UX_BASE || 'http://localhost:3081';
const SCREENS = 'e2e/stories/__screens__';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1400 } });

const readRows = (page, dash) =>
  page.evaluate(name => {
    const s = window.useStore.getState();
    const d = (s.dashboards || []).find(x => x.name === name);
    const cfg = d ? d.config || d : null;
    return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
  }, dash);

const itemKey = it => {
  if (!it || typeof it !== 'object') return '(slot)';
  const leaf = it.chart ?? it.table ?? it.markdown ?? it.input;
  if (leaf == null) return Array.isArray(it.rows) ? '(container)' : '(slot)';
  return typeof leaf === 'string' ? leaf : leaf.name || leaf.path || 'obj';
};
const rowItemKeys = (rows, i) => (rows[i]?.items || []).map(itemKey);

const setSelection = (page, key) =>
  page.evaluate(k => window.useStore.getState().setWorkspaceOutlineSelectedKey(k), key);

const openCanvas = async (page, dash) => {
  await page.goto(`${BASE}/workspace/dashboard/${dash}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  const dashEl = page.getByTestId(`dashboard_${dash}`);
  await expect(dashEl).toBeVisible({ timeout: WAIT });
  // Wait for the rows to actually RENDER (so the affordance layer can measure
  // them and emit drop zones) — not just for the layer to mount. Without this
  // the first drag can race a still-loading dashboard and find no drop zones.
  await expect(dashEl.locator('[data-row-index]').first()).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('canvas-dnd-layer')).toBeAttached({ timeout: WAIT });
  await page.waitForTimeout(800); // let Plotly boxes settle so the layer can measure zones
};

// Wait until a drop-zone testid is attached AND has a non-zero box, then return
// its locator. dnd drop zones are pointer-events-none overlays measured from the
// live DOM, so they can lag the row render; polling the box avoids a drag that
// targets an unrendered zone.
const zone = async (page, testid) => {
  const loc = page.getByTestId(testid);
  await expect(loc).toBeAttached({ timeout: WAIT });
  await expect
    .poll(async () => {
      const b = await loc.evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.width * r.height;
      });
      return b;
    }, { timeout: WAIT })
    .toBeGreaterThan(0);
  return loc;
};

// Select a node (reveals its FRAME grab surface — VIS-975) by clicking its
// data-canvas-path box.
const selectPath = async (page, path) => {
  await page.locator(`[data-canvas-path="${path}"]`).first().click({ force: true });
  await page.waitForTimeout(250);
};

// Arm dnd-kit's PointerSensor on `sourceLocator`, travel to the centre of
// `targetLocator`, and commit with a real mouse-up — the canvas-dnd mechanics.
const dndDrag = async (page, sourceLocator, targetLocator) => {
  await expect(sourceLocator).toBeVisible({ timeout: WAIT });
  const tb = await targetLocator.boundingBox();
  expect(tb, 'drop target has a box').toBeTruthy();
  await sourceLocator.evaluate(el => {
    const r = el.getBoundingClientRect();
    window.__dnd = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const ev = (x, y) => ({
      bubbles: true, cancelable: true, clientX: x, clientY: y,
      pointerId: 1, button: 0, pointerType: 'mouse', isPrimary: true, view: window,
    });
    el.dispatchEvent(new PointerEvent('pointerdown', ev(window.__dnd.x, window.__dnd.y)));
  });
  await page.waitForTimeout(40);
  const tx = tb.x + tb.width / 2;
  const ty = tb.y + tb.height / 2;
  await page.evaluate(
    ([tx, ty]) => {
      const s = window.__dnd;
      const ev = (x, y) => ({
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 1, button: 0, pointerType: 'mouse', isPrimary: true, view: window,
      });
      document.dispatchEvent(new PointerEvent('pointermove', ev(s.x + 10, s.y + 10)));
      document.dispatchEvent(new PointerEvent('pointermove', ev((s.x + tx) / 2, (s.y + ty) / 2)));
      document.dispatchEvent(new PointerEvent('pointermove', ev(tx, ty)));
      document.dispatchEvent(new PointerEvent('pointermove', ev(tx, ty)));
    },
    [tx, ty]
  );
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(1200);
};

test.describe('Canvas DnD UX stories', () => {
  // Each story does its own openCanvas (fresh page), so they're independent — a
  // single env-flaky story (e.g. the deeply-nested KPI dashboard rendering
  // slowly in headless) must NOT block the others. Run sequentially (workers=1)
  // but NOT serial (no skip-on-first-failure).
  test.setTimeout(120000);

  // ─── STORY A (VIS-973): cross-row item move ────────────────────────────
  test('A — dragging an item onto another row MOVES it between the rows', async ({ page }) => {
    const DASH = 'simple-dashboard';
    await openCanvas(page, DASH);
    const before = await readRows(page, DASH);
    // Source must have ≥2 items so removing one leaves a non-empty row whose
    // count drops by exactly 1 (a single-item source would be re-seeded with an
    // empty slot — VIS-989 — and keep count 1). Target must be non-empty so its
    // end-of-row zone exists.
    const fromRow = before.findIndex(r => (r.items || []).length >= 2);
    const toRow = before.findIndex((r, i) => i !== fromRow && (r.items || []).length >= 1);
    expect(fromRow, 'a ≥2-item source row exists').toBeGreaterThanOrEqual(0);
    expect(toRow, 'a different non-empty target row exists').toBeGreaterThanOrEqual(0);

    await selectPath(page, `row.${fromRow}.item.0`);
    await dndDrag(
      page,
      page.getByTestId(`canvas-drag-frame-row.${fromRow}.item.0`),
      await zone(page, `canvas-dropzone-row.${toRow}-end`)
    );

    await expect
      .poll(async () => (await readRows(page, DASH))[fromRow].items.length, { timeout: WAIT })
      .toBe(before[fromRow].items.length - 1);
    const after = await readRows(page, DASH);
    // The item left its row and joined the target row (counts conserve the item).
    expect(after[fromRow].items.length).toBe(before[fromRow].items.length - 1);
    expect(after[toRow].items.length).toBe(before[toRow].items.length + 1);
    await page.screenshot({ path: `${SCREENS}/dnd-story-a-crossrow.png` });
  });

  // ─── STORY B (VIS-974): a nested item is draggable + commits ───────────
  // The precise in-container-overlap collision fix is unit-tested
  // (WorkspaceDndContext "nested item drag resolves to its OWN gap"). Here we
  // prove the end-to-end gesture: a NESTED item can be grabbed by its frame and
  // dragged OUT to a top-level row, and the move commits — an observable count
  // change (the KPI cluster's sub-rows are identical refs, so an in-place reorder
  // can't be detected by order; a cross-row move conserves the item by count).
  test('B — a nested item can be dragged out of its container and commits', async ({ page }) => {
    const DASH = 'nested-layouts-dashboard';
    await openCanvas(page, DASH);
    const rows = await readRows(page, DASH);
    // Find a nested container (in row `containerRowIndex`) whose first sub-row has
    // ≥2 items, plus a DIFFERENT top-level row to receive the dragged item.
    let nestedPath = null;
    let containerRowIndex = -1;
    rows.forEach((r, ri) =>
      (r.items || []).forEach((it, ii) => {
        if (!nestedPath && Array.isArray(it.rows) && (it.rows[0]?.items?.length || 0) >= 2) {
          nestedPath = `row.${ri}.item.${ii}`;
          containerRowIndex = ri;
        }
      })
    );
    expect(nestedPath, 'a nested container with a ≥2-item sub-row exists').toBeTruthy();
    const targetRow = rows.findIndex((r, i) => i !== containerRowIndex && (r.items || []).length >= 1);
    expect(targetRow, 'a different top-level target row exists').toBeGreaterThanOrEqual(0);

    const subRowLen = () =>
      readRows(page, DASH).then(rs => {
        const seg = nestedPath.split('.'); // row.<ri>.item.<ii>
        return rs[+seg[1]].items[+seg[3]].rows[0].items.length;
      });
    const before = await subRowLen();

    // Grab the FIRST nested item by its frame and drag it to the top-level target
    // row's end. The nested item's frame + the deep drop zones must be measurable,
    // so wait for the nested chart to render first.
    const src = `${nestedPath}.row.0.item.0`;
    await expect(page.locator(`[data-canvas-path="${src}"]`).first()).toBeVisible({ timeout: WAIT });
    await page.waitForTimeout(400);
    await selectPath(page, src);
    await dndDrag(
      page,
      page.getByTestId(`canvas-drag-frame-${src}`),
      await zone(page, `canvas-dropzone-row.${targetRow}-end`)
    );

    // The nested sub-row lost the item (it committed). (Source re-seed only kicks
    // in at 0 items; this sub-row had ≥2, so the count simply drops by 1.)
    await expect.poll(() => subRowLen(), { timeout: WAIT }).toBe(before - 1);
    await page.screenshot({ path: `${SCREENS}/dnd-story-b-nested.png` });
  });

  // ─── STORY C (VIS-975): frame grab, no grip icon ───────────────────────
  test('C — a selected node is dragged by its FRAME; no grip icon exists', async ({ page }) => {
    const DASH = 'simple-dashboard';
    await openCanvas(page, DASH);
    const rows = await readRows(page, DASH);
    const ri = rows.findIndex(r => (r.items || []).length >= 2);
    const before = rowItemKeys(rows, ri);

    // The legacy six-dot grip icon is gone in every state.
    await expect(page.locator('[data-testid^="canvas-drag-handle-"]')).toHaveCount(0);

    // Selecting an item reveals its border-ring FRAME (and, per VIS-990, its
    // parent row's gutter — a distinct affordance, tagged kind=row).
    await selectPath(page, `row.${ri}.item.0`);
    const itemFrame = page.getByTestId(`canvas-drag-frame-row.${ri}.item.0`);
    await expect(itemFrame).toBeVisible({ timeout: WAIT });
    await expect(itemFrame).toHaveAttribute('data-canvas-handle-kind', 'item');

    // Grabbing the frame and travelling to the end-of-row zone reorders the row.
    await dndDrag(
      page,
      page.getByTestId(`canvas-drag-frame-row.${ri}.item.0`),
      await zone(page, `canvas-dropzone-row.${ri}-end`)
    );
    await expect
      .poll(async () => rowItemKeys(await readRows(page, DASH), ri).join('|'), { timeout: WAIT })
      .not.toBe(before.join('|'));
    await page.screenshot({ path: `${SCREENS}/dnd-story-c-frame-drag.png` });
  });

  // ─── STORY D (VIS-986): row height reachable from an item selection ────
  test('D — row height is draggable from an item selection (enum stops)', async ({ page }) => {
    const DASH = 'simple-dashboard';
    await openCanvas(page, DASH);
    const rows = await readRows(page, DASH);
    // Pick a row whose height is not already the max, so a downward drag changes it.
    const ri = rows.findIndex(r => r.height !== 'xxlarge');
    expect(ri, 'a resizable row exists').toBeGreaterThanOrEqual(0);
    const beforeHeight = rows[ri].height;

    // Select an ITEM (the common case — a canvas click selects a slot, not a row).
    await selectPath(page, `row.${ri}.item.0`);
    const handle = page.getByTestId(`canvas-resize-height-row.${ri}.item.0`);
    await expect(handle).toBeVisible({ timeout: WAIT });

    // The handle spans the parent ROW (full width), not just the item.
    const hb = await handle.boundingBox();
    const rowBox = await page.locator(`[data-canvas-path="row.${ri}"]`).first().boundingBox();
    expect(hb.width).toBeGreaterThan(rowBox.width * 0.6);

    // The resize gesture uses RAW pointer capture (not dnd-kit), so drive it with
    // dispatched PointerEvents on the handle + window moves (page.mouse doesn't
    // reliably fire the handle's onPointerDown). Drag DOWN ~160px → the row's
    // HeightEnum grows a stop.
    await handle.evaluate(el => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const ev = (t, cy) =>
        el.dispatchEvent(
          new PointerEvent(t, {
            bubbles: true, cancelable: true, clientX: x, clientY: cy,
            pointerId: 1, button: 0, pointerType: 'mouse', isPrimary: true, view: window,
          })
        );
      el.__rx = x;
      el.__ry = y;
      ev('pointerdown', y);
    });
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      const el = document.querySelector('[data-resize-axis="height"]');
      const x = el.__rx;
      const y = el.__ry;
      const win = (t, cy) =>
        window.dispatchEvent(
          new PointerEvent(t, {
            bubbles: true, cancelable: true, clientX: x, clientY: cy,
            pointerId: 1, button: 0, pointerType: 'mouse', isPrimary: true, view: window,
          })
        );
      win('pointermove', y + 60);
      win('pointermove', y + 160);
    });
    await expect(page.getByTestId('canvas-resize-readout')).toBeVisible({ timeout: 4000 });
    await page.evaluate(() => {
      const el = document.querySelector('[data-resize-axis="height"]');
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, clientX: el.__rx, clientY: el.__ry + 160,
          pointerId: 1, button: 0, pointerType: 'mouse', isPrimary: true, view: window,
        })
      );
    });

    await expect
      .poll(async () => (await readRows(page, DASH))[ri].height, { timeout: WAIT })
      .not.toBe(beforeHeight);
    await page.screenshot({ path: `${SCREENS}/dnd-story-d-row-height.png` });
  });

  // ─── STORY E (VIS-989): empty rows stay droppable; empty slots fill ────
  test('E — dragging the last item out leaves a droppable empty slot', async ({ page }) => {
    const DASH = 'simple-dashboard';
    await openCanvas(page, DASH);
    const before = await readRows(page, DASH);
    // A single-item LEAF row to empty, and a ≥2-item row as the move target.
    const leafKey = it => it && (it.chart || it.table || it.markdown || it.input);
    const soloRow = before.findIndex(r => (r.items || []).length === 1 && leafKey(r.items[0]));
    const targetRow = before.findIndex((r, i) => i !== soloRow && (r.items || []).length >= 2);
    expect(soloRow, 'a single-item row exists').toBeGreaterThanOrEqual(0);
    expect(targetRow, 'a ≥2-item target row exists').toBeGreaterThanOrEqual(0);

    await selectPath(page, `row.${soloRow}.item.0`);
    await dndDrag(
      page,
      page.getByTestId(`canvas-drag-frame-row.${soloRow}.item.0`),
      await zone(page, `canvas-dropzone-row.${targetRow}-end`)
    );

    // The source row is NOT gone and NOT empty: it keeps exactly one empty slot.
    await expect
      .poll(async () => (await readRows(page, DASH))[soloRow]?.items?.length, { timeout: WAIT })
      .toBe(1);
    const after = await readRows(page, DASH);
    expect(leafKey(after[soloRow].items[0]), 'the kept slot is empty').toBeFalsy();
    // The empty slot is a real drop target (its on-item zone exists).
    await expect(
      page.getByTestId(`canvas-dropzone-row.${soloRow}.item.0-on-item`)
    ).toBeAttached({ timeout: WAIT });
    await page.screenshot({ path: `${SCREENS}/dnd-story-e-empty-slot.png` });
  });

  // ─── STORY F (VIS-990): row grab gutter vs item frame ──────────────────
  test('F — a row exposes a left grab gutter, distinct from the item frame', async ({ page }) => {
    const DASH = 'simple-dashboard';
    await openCanvas(page, DASH);
    const rows = await readRows(page, DASH);
    const ri = rows.findIndex(r => (r.items || []).length >= 1 && r.items.some(it => it.chart || it.table || it.markdown || it.input));
    expect(ri, 'a row with a leaf item exists').toBeGreaterThanOrEqual(0);

    // Selecting an item reveals BOTH its item frame AND the parent row's gutter,
    // and they are distinct affordances (kind item vs kind row).
    await selectPath(page, `row.${ri}.item.0`);
    const itemFrame = page.getByTestId(`canvas-drag-frame-row.${ri}.item.0`);
    const rowGutter = page.getByTestId(`canvas-drag-frame-row.${ri}`);
    await expect(itemFrame).toBeVisible({ timeout: WAIT });
    await expect(rowGutter).toBeVisible({ timeout: WAIT });
    await expect(itemFrame).toHaveAttribute('data-canvas-handle-kind', 'item');
    await expect(rowGutter).toHaveAttribute('data-canvas-handle-kind', 'row');
    // The gutter sits to the LEFT of the item (it's a margin handle, not the body).
    const gb = await rowGutter.boundingBox();
    const ib = await itemFrame.boundingBox();
    expect(gb.x).toBeLessThan(ib.x);

    // Clicking the gutter selects the ROW (selection escalates from item to row).
    await rowGutter.click({ force: true });
    await expect
      .poll(() => page.evaluate(() => window.useStore.getState().workspaceOutlineSelectedKey), {
        timeout: WAIT,
      })
      .toBe(`row.${ri}`);
    await page.screenshot({ path: `${SCREENS}/dnd-story-f-row-gutter.png` });
  });
});
