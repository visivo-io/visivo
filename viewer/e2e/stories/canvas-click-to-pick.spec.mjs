/**
 * Story: clicking an empty canvas slot (or the right rail's "Choose…") opens the
 * ReferencePicker; a chart pick fills the slot, an insight pick is wrapped in a
 * minted `<insight>-chart`. The layout is never saved, but each insight pick
 * leaves a draft wrapper chart behind, so assertions name the exact chart.
 *
 * Runs against its own sandbox (not the shared :3001 one):
 *   VISIVO_SANDBOX_BACKEND_PORT=8050 VISIVO_SANDBOX_FRONTEND_PORT=3050 \
 *   VISIVO_SANDBOX_NAME=pick bash scripts/sandbox.sh start
 *   VIS_PICK_BASE=http://localhost:3050 npx playwright test canvas-click-to-pick
 */

import { test, expect } from '@playwright/test';

const BASE =
  process.env.VIS_PICK_BASE || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3050';
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

// Appends an unsaved row with one empty slot (the last one on the canvas) and
// returns its canvas path.
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
      return `row.${next.rows.length - 1}.item.0`;
    },
    { dashboard: DASHBOARD }
  );

// `${ref(name)}` / `ref(name)` → `name`.
const parseRefName = value => {
  const match = String(value || '').match(/^\$?\{?\s*ref\(\s*([^)]+?)\s*\)\s*\}?$/);
  return match ? match[1] : String(value || '');
};

const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    expect(await slot.evaluate(el => el.tagName)).toBe('BUTTON');

    await slot.click();
    const picker = page.getByTestId('reference-picker');
    await expect(picker).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('reference-picker-title')).toHaveText('Pick a chart or insight');

    await expect(page.getByTestId('reference-picker-section-chart')).toBeVisible();
    await expect(page.getByTestId('reference-picker-section-insight')).toBeVisible();
    expect(
      await picker.locator('[data-picker-type="chart"]').count()
    ).toBeGreaterThan(0);
    expect(
      await picker.locator('[data-picker-type="insight"]').count()
    ).toBeGreaterThan(0);

    await page.screenshot({ path: `${SCREENS}/pick-01-picker-open.png`, fullPage: true });

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

    await expect(picker).not.toBeVisible();
    await expect
      .poll(async () => {
        const item = await readItemAtPath(page, itemPath);
        return item?.chart || null;
      }, { timeout: WAIT })
      .toContain(chartName);

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

    await expect
      .poll(async () => {
        const item = await readItemAtPath(page, itemPath);
        return item?.chart || null;
      }, { timeout: WAIT })
      .toContain(`${insightName}-chart`);
    const item = await readItemAtPath(page, itemPath);
    expect(item.insight).toBeUndefined();

    // Drafts from earlier runs/retries survive, so check the exact placed name.
    const placedName = parseRefName(item.chart);
    expect(placedName).toMatch(new RegExp(`^${escapeRe(insightName)}-chart(-\\d+)?$`));

    // The saved chart comes back in the `${ref(...)}` form, so compare names.
    await expect
      .poll(
        async () => {
          const wrapper = await page.evaluate(name => {
            const matches = (window.useStore.getState().charts || []).filter(
              c => c.name === name
            );
            if (matches.length !== 1) return { count: matches.length };
            const cfg = matches[0].config || matches[0];
            return { count: 1, insights: cfg.insights || [] };
          }, placedName);
          return { ...wrapper, insights: (wrapper.insights || []).map(parseRefName) };
        },
        { timeout: WAIT }
      )
      .toEqual({ count: 1, insights: [insightName] });

    await page.screenshot({ path: `${SCREENS}/pick-03-insight-wrapped.png`, fullPage: true });
  });

  test('the right rail "Choose…" on an empty item opens the same picker', async () => {
    await openCanvas(page);
    const itemPath = await appendEmptySlotRow(page);

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

    const slot = page.getByTestId('canvas-empty-slot').last();
    await slot.focus();
    await page.keyboard.press('Enter');
    const picker = page.getByTestId('reference-picker');
    await expect(picker).toBeVisible({ timeout: WAIT });

    await page.keyboard.press('Escape');
    await expect(picker).not.toBeVisible();
    await expect(slot).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(picker).toBeVisible({ timeout: WAIT });

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
