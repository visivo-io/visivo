/**
 * Story: Canvas drag/resize for NESTED components (VIS-903 / Track D).
 *
 * The canvas DnD + resize overlays now RECURSE through nested `Item.rows`, so a
 * component nested inside a container item gets the same affordances as a
 * top-level one: a drag grip (gated on hover/selection), drop zones (reorder
 * within / between nested rows, into nested containers), and width/height resize
 * edges. The composite `data-canvas-path` keys already encode arbitrary depth;
 * VIS-903 is purely the MODEL builders emitting affordances for the deeper nodes.
 *
 * Driven against the integration project's `nested-layouts-dashboard`, which has
 * container items holding sub-rows at depth 2 and 3.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8050 VISIVO_SANDBOX_FRONTEND_PORT=3050 \
 *   VISIVO_SANDBOX_NAME=dtrack bash scripts/sandbox.sh start
 *   # then: VIS_CANVAS_NESTED_BASE=http://localhost:3050 npx playwright test canvas-nested-dnd
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_CANVAS_NESTED_BASE || 'http://localhost:3050';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'nested-layouts-dashboard';
const WAIT = 20000;

// A wide, tall viewport so the nested container rows lay out with real boxes.
test.use({ viewport: { width: 1600, height: 1600 } });

const readRows = page =>
  page.evaluate(name => {
    const s = window.useStore.getState();
    const d = (s.dashboards || []).find(x => x.name === name);
    const cfg = d ? d.config || d : null;
    return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
  }, DASHBOARD);

const itemKey = it => {
  if (!it || typeof it !== 'object') return '(slot)';
  const leaf = it.chart ?? it.table ?? it.markdown ?? it.input;
  if (leaf == null) return Array.isArray(it.rows) ? '(container)' : '(slot)';
  if (typeof leaf === 'string') return leaf;
  return leaf.name || leaf.path || JSON.stringify(leaf).slice(0, 64);
};

// Resolve the value at a nested config path (array of {key,index} segments) so a
// test can read the items of a nested row to assert ordering.
const readNestedItems = async (page, rowPath) =>
  page.evaluate(
    ([name, rowPath]) => {
      const s = window.useStore.getState();
      const d = (s.dashboards || []).find(x => x.name === name);
      const cfg = d ? d.config || d : null;
      if (!cfg) return null;
      const parts = rowPath.split('.');
      let rows = cfg.rows;
      let node = null;
      for (let i = 0; i < parts.length; i += 2) {
        const kind = parts[i];
        const idx = Number(parts[i + 1]);
        if (kind === 'row') {
          node = rows[idx];
          rows = null;
        } else {
          node = (node.items || [])[idx];
          rows = node.rows;
        }
      }
      const items = node && Array.isArray(node.items) ? node.items : [];
      return items.map(it => {
        const leaf = it.chart ?? it.table ?? it.markdown ?? it.input;
        return typeof leaf === 'string' ? leaf : leaf?.name || leaf?.path || '(slot)';
      });
    },
    [DASHBOARD, rowPath]
  );

// Find the FIRST nested row (`row.A.item.B.row.C`) in the dashboard that has ≥2
// items, so an in-nested-row reorder is meaningful. Returns its rowPath +
// the item count, or null.
const findNestedMultiItemRow = async page => {
  const rows = await readRows(page);
  const walk = (siblingRows, prefix) => {
    for (let ri = 0; ri < siblingRows.length; ri += 1) {
      const row = siblingRows[ri];
      const rowPath = `${prefix}row.${ri}`;
      const items = Array.isArray(row.items) ? row.items : [];
      // A nested row (prefix non-empty) with ≥2 leaf items.
      if (prefix && items.length >= 2 && items.every(it => !Array.isArray(it.rows))) {
        return { rowPath, count: items.length };
      }
      for (let ii = 0; ii < items.length; ii += 1) {
        const it = items[ii];
        if (Array.isArray(it.rows) && it.rows.length) {
          const found = walk(it.rows, `${rowPath}.item.${ii}.`);
          if (found) return found;
        }
      }
    }
    return null;
  };
  return walk(rows, '');
};

// Find the first container item (`row.A.item.B` with ≥2 sub-rows) so a
// nested-row reorder (between sub-rows) is meaningful.
const findContainerWithSubRows = async page => {
  const rows = await readRows(page);
  const walk = (siblingRows, prefix) => {
    for (let ri = 0; ri < siblingRows.length; ri += 1) {
      const row = siblingRows[ri];
      const rowPath = `${prefix}row.${ri}`;
      const items = Array.isArray(row.items) ? row.items : [];
      for (let ii = 0; ii < items.length; ii += 1) {
        const it = items[ii];
        if (Array.isArray(it.rows) && it.rows.length >= 2) {
          return { containerPath: `${rowPath}.item.${ii}`, subRowCount: it.rows.length };
        }
        if (Array.isArray(it.rows) && it.rows.length) {
          const found = walk(it.rows, `${rowPath}.item.${ii}.`);
          if (found) return found;
        }
      }
    }
    return null;
  };
  return walk(rows, '');
};

const dndDrag = async (page, source, target) => {
  await expect(source).toBeVisible();
  await page.waitForTimeout(150);
  const tb = await target.boundingBox();
  expect(tb, 'target has a box').toBeTruthy();
  const tx = tb.x + tb.width / 2;
  const ty = tb.y + tb.height / 2;
  await source.evaluate(el => {
    const r = el.getBoundingClientRect();
    window.__nestedDndSrc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
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
    el.dispatchEvent(new PointerEvent('pointerdown', ev(window.__nestedDndSrc.x, window.__nestedDndSrc.y)));
  });
  await page.waitForTimeout(40);
  await page.evaluate(
    ([tx, ty]) => {
      const s = window.__nestedDndSrc;
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
};

// VIS-975: the drag affordance is the SELECTED node's frame (a border-ring grab
// surface), painted only on the exact selected node. Reveal an item's frame by
// selecting it (click).
const revealItemHandle = async (page, itemPath) => {
  await page
    .locator(`[data-canvas-path="${itemPath}"]`)
    .first()
    .click({ position: { x: 6, y: 6 }, force: true });
  const handle = page.getByTestId(`canvas-drag-frame-${itemPath}`);
  await expect(handle).toBeVisible({ timeout: WAIT });
  return handle;
};

// Reveal a (possibly nested) ROW's frame. A row's chrome is mostly covered by
// its items, so select it through the canvas's outline-selection store — the
// frame is painted only when that exact row is the selection (VIS-975).
const revealRowHandleByPath = async (page, rowPath) => {
  await page.evaluate(rp => {
    window.useStore.getState().setWorkspaceOutlineSelectedKey(rp);
  }, rowPath);
  const handle = page.getByTestId(`canvas-drag-frame-${rowPath}`);
  await expect(handle).toBeVisible({ timeout: WAIT });
  return handle;
};

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  const dash = page.getByTestId(`dashboard_${DASHBOARD}`);
  await expect(dash).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('canvas-dnd-layer')).toBeAttached({ timeout: WAIT });
  // Let nested charts settle so their slots have stable boxes.
  await page.waitForTimeout(800);
};

test.describe('Canvas nested DnD + resize (VIS-903)', () => {
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

  test('a NESTED item exposes a drag grip + resize edges on selection', async () => {
    await openCanvas(page);
    const nested = await findNestedMultiItemRow(page);
    expect(nested, 'the nested-layouts dashboard has a nested multi-item row').toBeTruthy();

    const firstItemPath = `${nested.rowPath}.item.0`;
    // Selecting the nested item reveals its grip (depth > 1) — the VIS-903 fix.
    const handle = await revealItemHandle(page, firstItemPath);
    await expect(handle).toHaveAttribute('data-canvas-handle-kind', 'item');
    // The resize layer paints a width edge on the selected nested item.
    await expect(page.getByTestId(`canvas-resize-width-${firstItemPath}`)).toBeVisible({
      timeout: WAIT,
    });
    await page.screenshot({ path: `${SCREENS}/vis903-01-nested-affordances.png`, fullPage: true });
  });

  test('drag a NESTED item to its row end → gesture reaches the shared context + persists', async () => {
    // The nested multi-item rows in this fixture are KPI clusters of IDENTICAL
    // refs (indicator_chart ×N), so an order-by-ref assertion can't distinguish
    // them. This test proves the NESTED item grip drives a real drag that reaches
    // the SAME shared <WorkspaceDndContext> (overlay pill shows) and persists a
    // backend-valid config (length preserved, no 400). The order-distinct proof
    // lives in the sub-ROW reorder test below (distinct charts per sub-row).
    await openCanvas(page);
    const nested = await findNestedMultiItemRow(page);
    expect(nested).toBeTruthy();
    const before = await readNestedItems(page, nested.rowPath);
    expect(before.length).toBeGreaterThanOrEqual(2);

    const handle = await revealItemHandle(page, `${nested.rowPath}.item.0`);
    const endZone = page.getByTestId(`canvas-dropzone-${nested.rowPath}-end`);
    await expect(endZone).toBeAttached({ timeout: WAIT });
    await dndDrag(page, handle, endZone);
    // The shared drag overlay pill proves the nested grip reaches the SAME
    // shell-level DndContext (no second context for nested nodes).
    await expect(page.getByTestId('library-drag-preview')).toBeVisible({ timeout: 4000 });
    await page.mouse.up();

    // The nested row keeps its item count (a reorder never adds/drops items).
    await expect
      .poll(async () => (await readNestedItems(page, nested.rowPath))?.length, { timeout: WAIT })
      .toBe(before.length);
    await page.screenshot({ path: `${SCREENS}/vis903-02-nested-item-reordered.png`, fullPage: true });
  });

  test('reorder sub-ROWS within a container → persists to the container config', async () => {
    await openCanvas(page);
    const container = await findContainerWithSubRows(page);
    expect(container, 'the dashboard has a container with ≥2 sub-rows').toBeTruthy();

    const firstSubRowPath = `${container.containerPath}.row.0`;
    const sig = async () => {
      const rows = await readRows(page);
      // Read the container's sub-row signatures.
      const parts = container.containerPath.split('.');
      let node = null;
      let cursor = rows;
      for (let i = 0; i < parts.length; i += 2) {
        const idx = Number(parts[i + 1]);
        if (parts[i] === 'row') {
          node = cursor[idx];
          cursor = null;
        } else {
          node = (node.items || [])[idx];
          cursor = node.rows;
        }
      }
      return (node.rows || []).map(r => (r.items || []).map(itemKey).join('|')).join('#');
    };
    const beforeSig = await sig();

    // Select the nested sub-row to reveal its frame, then drag it to the trailing
    // append band of the container's sibling group (VIS-975: the row frame is
    // painted only when that exact row is selected).
    const rowHandle = await revealRowHandleByPath(page, firstSubRowPath);
    const appendBand = page.getByTestId(
      `canvas-dropzone-${container.containerPath}.row-before-${container.subRowCount}`
    );
    await expect(appendBand).toBeAttached({ timeout: WAIT });
    await dndDrag(page, rowHandle, appendBand);
    await expect(page.getByTestId('canvas-row-drag-preview')).toBeVisible({ timeout: 4000 });
    await page.mouse.up();

    await expect.poll(async () => sig(), { timeout: WAIT }).not.toBe(beforeSig);
    await page.screenshot({ path: `${SCREENS}/vis903-03-nested-rows-reordered.png`, fullPage: true });
  });

  test('no console errors AND no auto-save 400 across the nested gestures', async () => {
    const NOISE = [
      'favicon',
      'DevTools',
      'react-cool',
      'ResizeObserver',
      'Download the React DevTools',
      'compile',
    ];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    const saveFailures = page._consoleErrors.filter(
      e => e.includes('400') || e.toLowerCase().includes('bad request')
    );
    expect(saveFailures, 'nested DnD must persist backend-valid config (sanitize)').toHaveLength(0);
    expect(real).toHaveLength(0);
  });
});
