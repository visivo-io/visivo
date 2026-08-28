/**
 * Story: Click-to-pick — empty slots stop being drag-only (W5 / Track L, B2).
 *
 * Every empty canvas slot is clickable: clicking opens the <ReferencePicker>
 * scoped to CHARTS and INSIGHTS (typed sections, objectTypeConfigs palette).
 * Picking a chart places `chart: ref(name)` into that slot's working copy
 * (#617 explicit save — nothing persists until the dashboard Save). Picking an
 * INSIGHT auto-wraps it (#637): a unique `<insight>-chart` wrapper chart is
 * minted through the same saveChart path Library "Wrap in Chart…" (#632) uses,
 * and the slot points at the wrapper. The same picker opens from the right
 * rail's "Choose…" on an empty item's edit panel. Zero drags anywhere in this
 * story, and both paths are keyboard-completable (the slot is a real button,
 * the picker rows are buttons).
 *
 * NOTE: an insight pick saves a DRAFT wrapper chart immediately (the placement
 * itself stays in the un-saved working copy — same semantics as the #637 drop
 * path). The story never presses the dashboard Save, so the layout is not
 * persisted; the draft wrapper chart is uniquely named per run.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8050 VISIVO_SANDBOX_FRONTEND_PORT=3050 \
 *   VISIVO_SANDBOX_NAME=pick bash scripts/sandbox.sh start
 *   # then: VIS_PICK_BASE=http://localhost:3050 npx playwright test canvas-click-to-pick
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_PICK_BASE || 'http://localhost:3050';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1400 } });

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
  await page.waitForTimeout(600);
};

// APPEND a fresh row holding ONE empty slot, so the story always knows which
// empty slot it is exercising (the LAST canvas-empty-slot on the canvas) and
// never mutates the fixture's real items. The write is optimistic-only (#617
// working copy) — the story never presses Save, so nothing persists.
const appendEmptySlotRow = async page =>
  page.evaluate(
    ({ dashboard }) => {
      const s = window.useStore.getState();
      const entry = (s.dashboards || []).find(d => d.name === dashboard);
      const cfg = entry?.config || entry;
      const next = JSON.parse(JSON.stringify(cfg));
      next.rows = Array.isArray(next.rows) ? next.rows : [];
      next.rows.push({ height: 'small', items: [{ width: 1 }] });
      if (s.updateDashboardConfigOptimistic) {
        s.updateDashboardConfigOptimistic(dashboard, next);
      }
      // The new slot's canvas path: last row, first item.
      return `row.${next.rows.length - 1}.item.0`;
    },
    { dashboard: DASHBOARD }
  );

// Read the item config at a composite canvas path from the live working copy.
const readItemAtPath = async (page, itemPath) =>
  page.evaluate(
    ({ dashboard, path }) => {
      const s = window.useStore.getState();
      const entry = (s.dashboards || []).find(d => d.name === dashboard);
      const cfg = entry?.config || entry;
      const tokens = path.split('.');
      let node = cfg;
      for (let i = 0; i < tokens.length; i += 2) {
        const axis = tokens[i];
        const index = Number(tokens[i + 1]);
        node = axis === 'row' ? node.rows?.[index] : node.items?.[index];
        if (!node) return null;
      }
      return node;
    },
    { dashboard: DASHBOARD, path: itemPath }
  );

test.describe('Canvas click-to-pick (W5 / Track L)', () => {
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

  test('an empty slot is a clickable button that opens the ReferencePicker', async () => {
    await openCanvas(page);
    await appendEmptySlotRow(page);

    const slot = page.getByTestId('canvas-empty-slot').last();
    await expect(slot).toBeVisible({ timeout: WAIT });
    // A real <button> — focusable, so the path is keyboard-completable.
    expect(await slot.evaluate(el => el.tagName)).toBe('BUTTON');

    await slot.click();
    const picker = page.getByTestId('reference-picker');
    await expect(picker).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('reference-picker-title')).toHaveText('Pick a chart or insight');

    // Typed sections — charts AND insights, objectTypeConfigs headers.
    await expect(page.getByTestId('reference-picker-section-chart')).toBeVisible();
    await expect(page.getByTestId('reference-picker-section-insight')).toBeVisible();
    expect(
      await picker.locator('[data-picker-type="chart"]').count()
    ).toBeGreaterThan(0);
    expect(
      await picker.locator('[data-picker-type="insight"]').count()
    ).toBeGreaterThan(0);

    await page.screenshot({ path: `${SCREENS}/pick-01-picker-open.png`, fullPage: true });

    // Escape closes without touching the slot.
    await page.keyboard.press('Escape');
    await expect(picker).not.toBeVisible();
  });

  test('picking a CHART fills the slot with chart: ref(name) in the working copy', async () => {
    await openCanvas(page);
    const itemPath = await appendEmptySlotRow(page);

    await page.getByTestId('canvas-empty-slot').last().click();
    const picker = page.getByTestId('reference-picker');
    await expect(picker).toBeVisible({ timeout: WAIT });

    const chartRow = picker.locator('[data-picker-type="chart"]').first();
    const chartName = (
      await chartRow.locator('.text-sm').first().textContent()
    ).trim();
    await chartRow.click();

    // Picker closed, placement landed in the #617 working copy.
    await expect(picker).not.toBeVisible();
    await expect
      .poll(async () => {
        const item = await readItemAtPath(page, itemPath);
        return item?.chart || null;
      }, { timeout: WAIT })
      .toContain(chartName);

    // The slot now renders content (the empty placeholder is gone from that row).
    await page.screenshot({ path: `${SCREENS}/pick-02-chart-placed.png`, fullPage: true });
  });

  test('picking an INSIGHT auto-wraps: mints <insight>-chart and places the wrapper (#637)', async () => {
    await openCanvas(page);
    const itemPath = await appendEmptySlotRow(page);

    await page.getByTestId('canvas-empty-slot').last().click();
    const picker = page.getByTestId('reference-picker');
    await expect(picker).toBeVisible({ timeout: WAIT });

    const insightRow = picker.locator('[data-picker-type="insight"]').first();
    const insightName = (
      await insightRow.locator('.text-sm').first().textContent()
    ).trim();
    await insightRow.click();
    await expect(picker).not.toBeVisible();

    // The slot points at the minted wrapper chart — never a bare insight.
    await expect
      .poll(async () => {
        const item = await readItemAtPath(page, itemPath);
        return item?.chart || null;
      }, { timeout: WAIT })
      .toContain(`${insightName}-chart`);
    const item = await readItemAtPath(page, itemPath);
    expect(item.insight).toBeUndefined();

    // The wrapper chart exists as a draft in the chart store, holding exactly
    // the wrapped insight (same shape as Library "Wrap in Chart…", #632).
    await expect
      .poll(
        async () =>
          page.evaluate(
            name =>
              (window.useStore.getState().charts || []).some(c =>
                c.name.startsWith(`${name}-chart`)
              ),
            insightName
          ),
        { timeout: WAIT }
      )
      .toBe(true);

    await page.screenshot({ path: `${SCREENS}/pick-03-insight-wrapped.png`, fullPage: true });
  });

  test('the right rail "Choose…" on an empty item opens the same picker', async () => {
    await openCanvas(page);
    const itemPath = await appendEmptySlotRow(page);

    // Select the empty item so the right rail routes to its ItemEditForm.
    await page.evaluate(path => {
      const s = window.useStore.getState();
      if (s.setWorkspaceSelection) s.setWorkspaceSelection(undefined, path);
    }, itemPath);

    const chooseButton = page.getByTestId(/^item-.*-choose$/);
    await expect(chooseButton).toBeVisible({ timeout: WAIT });
    await page.screenshot({ path: `${SCREENS}/pick-04-rail-choose.png`, fullPage: true });

    await chooseButton.click();
    const picker = page.getByTestId('reference-picker');
    await expect(picker).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('reference-picker-title')).toHaveText('Pick a chart or insight');

    // Pick a chart from the rail path too — the item leaf fills the same way.
    const chartRow = picker.locator('[data-picker-type="chart"]').first();
    const chartName = (
      await chartRow.locator('.text-sm').first().textContent()
    ).trim();
    await chartRow.click();
    await expect(picker).not.toBeVisible();

    await expect
      .poll(async () => {
        const item = await readItemAtPath(page, itemPath);
        return item?.chart || null;
      }, { timeout: WAIT })
      .toContain(chartName);

    await page.screenshot({ path: `${SCREENS}/pick-05-rail-placed.png`, fullPage: true });
  });

  test('keyboard: Tab reaches the picker rows and Enter picks (no pointer)', async () => {
    await openCanvas(page);
    const itemPath = await appendEmptySlotRow(page);

    // Focus the slot button directly (it is in the tab order) and open with Enter.
    await page.getByTestId('canvas-empty-slot').last().focus();
    await page.keyboard.press('Enter');
    const picker = page.getByTestId('reference-picker');
    await expect(picker).toBeVisible({ timeout: WAIT });

    // Search auto-focuses; Tab moves into the list; Enter picks the row.
    await expect(page.getByTestId('reference-picker-search')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(picker).not.toBeVisible();
    await expect
      .poll(async () => {
        const item = await readItemAtPath(page, itemPath);
        return item ? Object.keys(item).some(k => k === 'chart') : false;
      }, { timeout: WAIT })
      .toBe(true);
  });

  test('no console errors across the click-to-pick flows', async () => {
    const real = page._consoleErrors.filter(
      e => !e.includes('favicon') && !e.includes('ResizeObserver')
    );
    expect(real).toEqual([]);
  });
});
