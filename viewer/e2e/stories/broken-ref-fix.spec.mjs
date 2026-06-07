/**
 * Story: Broken-ref placeholder card + reference picker (VIS-792 / Track L L-1+L-2).
 *
 * When a canvas item references a chart/table/markdown/input that no longer
 * resolves (deleted or renamed), the canvas paints a <BrokenRefCard> filling the
 * slot — a MUTED warning surface (highlight family, not danger) with the missing
 * ref name in monospace, a primary "Fix…" action, and a destructive
 * "Delete this slot" escape. "Fix…" opens the <ReferencePicker> modal; picking a
 * valid object re-points the leaf and the slot re-renders. "Delete this slot"
 * confirms then removes the item.
 *
 * The broken reference is injected at runtime by optimistically swapping the
 * canvas dashboard config to point a leaf at a non-existent chart name — the same
 * store-driven setup the other canvas stories use — so this story needs no
 * special fixture project.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8050 VISIVO_SANDBOX_FRONTEND_PORT=3050 \
 *   VISIVO_SANDBOX_NAME=ltrack bash scripts/sandbox.sh start
 *   # then: VIS_BROKEN_BASE=http://localhost:3050 npx playwright test broken-ref-fix
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_BROKEN_BASE || 'http://localhost:3050';
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

// Optimistically re-point the first leaf item at a non-existent chart so the
// renderer mounts a <BrokenRefCard> in that slot. Returns the broken name.
const breakFirstSlot = async page => {
  const brokenName = `__missing_chart_${Date.now()}`;
  await page.evaluate(
    ({ dashboard, name }) => {
      const s = window.useStore.getState();
      const entry = (s.dashboards || []).find(d => d.name === dashboard);
      const cfg = entry?.config || entry;
      const next = JSON.parse(JSON.stringify(cfg));
      const item = next.rows?.[0]?.items?.[0];
      if (item) {
        delete item.chart;
        delete item.table;
        delete item.markdown;
        delete item.input;
        item.chart = `\${ref(${name})}`;
      }
      if (s.updateDashboardConfigOptimistic) {
        s.updateDashboardConfigOptimistic(dashboard, next);
      }
    },
    { dashboard: DASHBOARD, name: brokenName }
  );
  return brokenName;
};

test.describe('Broken-ref card + reference picker (VIS-792 / L-1+L-2)', () => {
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

  test('a broken reference renders the BrokenRefCard placeholder filling the slot', async () => {
    await openCanvas(page);
    const broken = await breakFirstSlot(page);
    const card = page.getByTestId('broken-ref-card');
    await expect(card).toBeVisible({ timeout: WAIT });
    // Type-aware heading + missing ref name in monospace.
    await expect(page.getByTestId('broken-ref-heading')).toContainText('not found');
    await expect(page.getByTestId('broken-ref-name')).toHaveText(broken);
    // Both affordances present.
    await expect(page.getByTestId('broken-ref-fix')).toBeVisible();
    await expect(page.getByTestId('broken-ref-delete')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/vis792-01-broken-card.png`, fullPage: true });
  });

  test('Fix… opens the ReferencePicker modal with a searchable object list', async () => {
    await openCanvas(page);
    await breakFirstSlot(page);
    await page.getByTestId('broken-ref-fix').click();
    await expect(page.getByTestId('reference-picker')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('reference-picker-title')).toContainText('Pick a chart');
    await expect(page.getByTestId('reference-picker-search')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/vis792-02-reference-picker.png`, fullPage: true });
  });

  test('picking a valid chart re-points the slot and clears the broken card', async () => {
    await openCanvas(page);
    await breakFirstSlot(page);
    await page.getByTestId('broken-ref-fix').click();
    await expect(page.getByTestId('reference-picker')).toBeVisible({ timeout: WAIT });
    // Pick the first available row in the list.
    const firstRow = page.locator('[data-testid^="reference-picker-row-"]').first();
    await expect(firstRow).toBeVisible({ timeout: WAIT });
    await firstRow.click();
    // Picker closes and the broken card is gone (slot now resolves).
    await expect(page.getByTestId('reference-picker')).toHaveCount(0);
    await expect(page.getByTestId('broken-ref-card')).toHaveCount(0, { timeout: WAIT });
  });

  test('Delete this slot confirms then removes the broken item', async () => {
    await openCanvas(page);
    await breakFirstSlot(page);
    await expect(page.getByTestId('broken-ref-card')).toBeVisible({ timeout: WAIT });
    await page.getByTestId('broken-ref-delete').click();
    await expect(page.getByTestId('broken-ref-confirm-delete')).toBeVisible();
    await page.getByTestId('broken-ref-confirm-delete-button').click();
    await expect(page.getByTestId('broken-ref-card')).toHaveCount(0, { timeout: WAIT });
  });

  test('no console errors across the broken-ref flow', async () => {
    const NOISE = [
      'favicon',
      'DevTools',
      'react-cool',
      'ResizeObserver',
      'compile',
      'not found',
      'Failed to fetch',
      'fetch error',
    ];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real).toHaveLength(0);
  });
});
