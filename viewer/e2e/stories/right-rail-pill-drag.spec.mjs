/**
 * Story: Right-rail pill-and-drag (VIS-802 / Track G G-1).
 *
 * Validates the critical cross-rail drag enabled by the shell-level shared
 * <DndContext>: a Library row (LEFT rail) dragged onto a RefDropZone in a
 * right-rail Edit form writes the ref, which then renders as an <EmbeddedPill>.
 *
 *   1.  Build an empty item slot (add a row → add an item) so a RefDropZone is
 *       visible in the right-rail Edit form.
 *   2.  Drag a Library chart row onto that RefDropZone.
 *   3.  The dropped ref lands: the zone flips to filled + shows an EmbeddedPill
 *       carrying the chart name.
 *
 * This also implicitly proves the shell DndContext spans the left rail (drag
 * source) AND the right rail (drop target) — they could never communicate if
 * each owned its own context.
 *
 * Port: this worktree's sandbox runs on :3013 (backend :8013).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.RIGHT_RAIL_BASE_URL || 'http://localhost:3013';
const WORKSPACE_URL = `${BASE_URL}/workspace`;
const WAIT_FOR_PAGE = 20000;
const SCREENS = 'e2e/stories/__screens__';
const CHART_NAME = 'simple-scatter-chart';

const setRightTab = (page, tab) =>
  page.evaluate(t => window.useStore.getState().setWorkspaceRightTab(t), tab);
const setOutlineKey = (page, key) =>
  page.evaluate(k => window.useStore.getState().setWorkspaceOutlineSelectedKey(k), key);
const selectDashboard = (page, name) =>
  page.evaluate(
    n => window.useStore.getState().openWorkspaceTab({ id: `dashboard:${n}`, type: 'dashboard', name: n }),
    name
  );

// dnd-kit PointerSensor needs down → nudge (clears the 5px activation distance)
// → move(s) → settle → up. We scroll both endpoints into view first so their
// boxes are real, and end with a couple of settling moves on the target so
// dnd-kit registers the `over` before the drop.
const dndDrag = async (page, source, target) => {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sb = await source.boundingBox();
  const tb = await target.boundingBox();
  expect(sb && tb, 'both drag endpoints have a box').toBeTruthy();
  const tx = tb.x + tb.width / 2;
  const ty = tb.y + tb.height / 2;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  // Clear the 5px activation distance.
  await page.mouse.move(sb.x + sb.width / 2 + 10, sb.y + sb.height / 2 + 10, { steps: 6 });
  // Travel to the target, then settle on it so the collision detector fires.
  await page.mouse.move(tx, ty, { steps: 20 });
  await page.mouse.move(tx + 1, ty + 1, { steps: 3 });
  await page.mouse.move(tx, ty, { steps: 3 });
  return { tb };
};

test.describe('Right-rail pill-and-drag (G-1)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
    await page.goto(`${WORKSPACE_URL}/dashboard/insights-dashboard`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail').waitFor({ timeout: WAIT_FOR_PAGE });
    // Library subsections default to COLLAPSED (VIS-828), so the chart rows
    // aren't rendered until the Charts subsection is expanded.
    const chartHeader = page.getByTestId('library-subsection-chart-header');
    await chartHeader.waitFor({ timeout: WAIT_FOR_PAGE });
    if (!(await page.getByTestId(`library-row-chart-${CHART_NAME}`).count())) {
      await chartHeader.click();
    }
    await page.getByTestId(`library-row-chart-${CHART_NAME}`).waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('drag a Library chart row onto an empty RefDropZone → ref lands as a pill', async () => {
    await setRightTab(page, 'edit');
    await selectDashboard(page, 'insights-dashboard');

    // Build a known-empty item slot: add a fresh row, select it, add an item.
    // The new row appends to the end; capture its index from the store.
    await setOutlineKey(page, 'dashboard');
    await page.getByTestId('right-rail-edit-dashboard').waitFor({ timeout: 10000 });
    await page.getByTestId('right-rail-edit-add-row').click();

    const newRowIndex = await page.evaluate(() => {
      const s = window.useStore.getState();
      const d = (s.dashboards || []).find(x => x.name === 'insights-dashboard');
      const rows = (d.config || d).rows || [];
      return rows.length - 1;
    });

    // Select the new (empty) row and add an item to expose a RefDropZone.
    await setOutlineKey(page, `row.${newRowIndex}`);
    await page.getByTestId('right-rail-edit-row').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /add item/i }).click();

    const dropZone = page
      .locator(`[data-testid^="ref-dropzone-row-${newRowIndex}-item-"]`)
      .first();
    await dropZone.waitFor({ timeout: 10000 });
    await expect(dropZone).toHaveAttribute('data-filled', 'false');
    await page.getByTestId('workspace-right-rail').screenshot({
      path: `${SCREENS}/vis802-06-empty-dropzone.png`,
    });

    // Drag the Library chart row onto the empty dropzone.
    const libRow = page.getByTestId(`library-row-chart-${CHART_NAME}`);
    const { tb } = await dndDrag(page, libRow, dropZone);
    // Mid-flight: the shared shell DndContext is tracking the cross-rail drag,
    // so the right-rail dropzone shows the valid-drag (mulberry) ring + the
    // shared drag overlay pill is visible. Proves the contexts didn't fragment.
    await expect(dropZone).toHaveAttribute('data-valid-drag', 'true', { timeout: 4000 });
    await page.screenshot({ path: `${SCREENS}/vis802-07-drag-overlay.png`, fullPage: true });
    await page.mouse.up();

    // The ref lands: the zone flips to filled + an EmbeddedPill shows the name.
    await expect
      .poll(
        async () =>
          page.evaluate(rowIndex => {
            const s = window.useStore.getState();
            const d = (s.dashboards || []).find(x => x.name === 'insights-dashboard');
            const rows = (d.config || d).rows || [];
            const items = rows[rowIndex]?.items || [];
            return items.some(it => typeof it.chart === 'string' && it.chart.includes('simple-scatter-chart'));
          }, newRowIndex),
        { timeout: 10000 }
      )
      .toBe(true);

    // The slot now renders a filled pill carrying the chart name.
    const filled = page.locator('[data-testid^="ref-dropzone-row-"][data-filled="true"]');
    await expect(filled.first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('workspace-right-rail')).toContainText(CHART_NAME);
    await page.getByTestId('workspace-right-rail').screenshot({
      path: `${SCREENS}/vis802-08-ref-landed-pill.png`,
    });
    // (drop coordinate referenced so lint doesn't flag the unused var)
    expect(tb).toBeTruthy();
  });

  test('GAP-3: no console errors AND no auto-save 400 during the empty-scaffold drop', async () => {
    // The test scaffolds an EMPTY row + EMPTY item before the drop. Pre-fix the
    // debounced auto-save POSTed that invalid intermediate (empty-string leaf
    // fields) and the backend rejected it with a 400. GAP-3 sanitizes the
    // payload so the empty slot persists as a valid empty item — so we now GATE
    // the bug: there must be NO 400 / "bad request" at all.
    const NOISE = ['favicon', 'DevTools', 'react-cool', 'ResizeObserver', 'Download the React DevTools'];
    const realErrors = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    const saveFailures = page._consoleErrors.filter(
      e => e.includes('400') || e.toLowerCase().includes('bad request')
    );
    expect(saveFailures, 'auto-save must not POST invalid scaffold state (GAP-3)').toHaveLength(0);
    expect(realErrors).toHaveLength(0);
  });
});
