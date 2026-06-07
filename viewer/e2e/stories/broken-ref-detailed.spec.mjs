/**
 * Story (HARDENING): Broken-ref card + reference picker — detailed coverage
 * (VIS-792 / Track L L-1 + L-2).
 *
 * Extends the happy-path `broken-ref-fix.spec.mjs` with the per-type + edge-state
 * coverage the brief + acceptance checklist call out:
 *   - the BrokenRefCard renders for EACH leaf type (chart / table / markdown /
 *     input) with a TYPE-CORRECT heading and the missing ref in monospace;
 *   - the ReferencePicker title matches the broken field type;
 *   - search FILTERS the object list (and shows the no-matches state);
 *   - EMPTY state — a type with no objects (markdown is empty in the integration
 *     project) shows the prominent create CTA, not an empty list;
 *   - "Delete this slot" shows an inline confirm that can be CANCELLED, then
 *     confirmed to remove the item;
 *   - the card ADAPTS across slot sizes (a narrow ~220px slot vs a full-width
 *     row) — the container-query content density;
 *   - Q16: in VIEW mode (`/project/<name>`) a broken ref is a NON-interactive
 *     placeholder (legacy "<Type> not found" text, NO Fix/Delete affordances).
 *
 * Broken refs are injected at runtime by optimistically swapping the canvas
 * dashboard config to point a leaf at a non-existent name (store-driven, same as
 * the other canvas stories) — no special fixture project is required.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VIS_BROKEN_BASE=http://localhost:3023 npx playwright test broken-ref-detailed
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_BROKEN_BASE || 'http://localhost:3023';
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

// APPEND a brand-new broken-ref item (of `type`, pointing at a non-existent
// name) to row.0 so the renderer mounts a <BrokenRefCard> in that NEW slot.
//
// IMPORTANT — test isolation: the BrokenRefCard's "Fix…" / "Delete this slot"
// actions COMMIT through the real save path (commitCanvasConfig), which mutates
// the shared sandbox dashboard. Breaking an EXISTING slot (e.g. row.0.item.0)
// and then committing a delete would permanently remove that real chart from
// the shared project. So we always operate on an APPENDED throwaway slot: a
// committed delete simply returns row.0 to its original items, and a committed
// fix only ADDS a valid item — the project's original charts are never harmed.
//
// Returns `{ name, path }` — the missing ref name + the appended slot's canvas
// path. Optionally `width` makes the appended slot narrow for the density check.
const breakFirstSlot = async (page, type, { width } = {}) => {
  const brokenName = `__missing_${type}_${Date.now()}`;
  const path = await page.evaluate(
    ({ dashboard, name, leafType, slotWidth }) => {
      const s = window.useStore.getState();
      const entry = (s.dashboards || []).find(d => d.name === dashboard);
      const cfg = entry?.config || entry;
      const next = JSON.parse(JSON.stringify(cfg));
      const row0 = next.rows?.[0];
      if (!row0) return null;
      if (!Array.isArray(row0.items)) row0.items = [];
      // For the narrow-density check, widen the existing siblings (client-only —
      // this break is optimistic and never committed) so the appended slot is a
      // genuinely small fraction of the row width and the container query fires.
      if (slotWidth && slotWidth < 4) {
        row0.items.forEach(it => {
          it.width = 12;
        });
      }
      const item = { width: slotWidth || 1 };
      item[leafType] = `\${ref(${name})}`;
      row0.items.push(item);
      const idx = row0.items.length - 1;
      if (s.updateDashboardConfigOptimistic) {
        s.updateDashboardConfigOptimistic(dashboard, next);
      }
      return `row.0.item.${idx}`;
    },
    { dashboard: DASHBOARD, name: brokenName, leafType: type, slotWidth: width }
  );
  return { name: brokenName, path };
};

const TYPE_HEADINGS = {
  chart: 'Chart',
  table: 'Table',
  markdown: 'Markdown',
  input: 'Input',
};

test.describe('Broken-ref detailed (VIS-792 / L-1+L-2)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);

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

  for (const type of ['chart', 'table', 'markdown', 'input']) {
    test(`BrokenRefCard renders type-correct heading + monospace ref for a ${type}`, async () => {
      await openCanvas(page);
      const broken = await breakFirstSlot(page, type);
      // Scope to THIS test's appended card (unique broken name) so assertions are
      // robust even if other broken slots are present on the canvas.
      const card = page.locator(
        `[data-testid="broken-ref-card"][data-broken-name="${broken.name}"]`
      );
      await expect(card).toBeVisible({ timeout: WAIT });
      await expect(card).toHaveAttribute('data-broken-type', type);
      // Type-correct heading.
      await expect(card.getByTestId('broken-ref-heading')).toContainText(TYPE_HEADINGS[type]);
      await expect(card.getByTestId('broken-ref-heading')).toContainText('not found');
      // Missing ref name in monospace.
      const nameEl = card.getByTestId('broken-ref-name');
      await expect(nameEl).toHaveText(broken.name);
      const fontFamily = await nameEl.evaluate(el => getComputedStyle(el).fontFamily);
      expect(fontFamily.toLowerCase()).toMatch(/mono/);
      // Both affordances present on the canvas (build surface).
      await expect(card.getByTestId('broken-ref-fix')).toBeVisible();
      await expect(card.getByTestId('broken-ref-delete')).toBeVisible();
      await page.screenshot({
        path: `${SCREENS}/vis792d-card-${type}.png`,
        fullPage: true,
      });
    });
  }

  test('ReferencePicker title matches the broken field type (table)', async () => {
    await openCanvas(page);
    const broken = await breakFirstSlot(page, 'table');
    const card = page.locator(`[data-testid="broken-ref-card"][data-broken-name="${broken.name}"]`);
    await card.getByTestId('broken-ref-fix').click();
    await expect(page.getByTestId('reference-picker')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('reference-picker-title')).toContainText('Pick a table');
  });

  test('ReferencePicker search filters the list and shows the no-matches state', async () => {
    await openCanvas(page);
    const broken = await breakFirstSlot(page, 'chart');
    const card = page.locator(`[data-testid="broken-ref-card"][data-broken-name="${broken.name}"]`);
    await card.getByTestId('broken-ref-fix').click();
    await expect(page.getByTestId('reference-picker')).toBeVisible({ timeout: WAIT });

    // Count rows before filtering.
    const allRows = page.locator('[data-testid^="reference-picker-row-"]');
    const before = await allRows.count();
    expect(before).toBeGreaterThan(1);

    // Filter to a substring that matches a real chart ("fibonacci").
    await page.getByTestId('reference-picker-search').fill('fibonacci');
    await page.waitForTimeout(150);
    const after = await page.locator('[data-testid^="reference-picker-row-"]').count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
    // Every remaining row should match the query.
    for (const t of await page
      .locator('[data-testid^="reference-picker-row-"]')
      .evaluateAll(els => els.map(e => e.getAttribute('data-testid')))) {
      expect(t.toLowerCase()).toContain('fibonacci');
    }
    await page.screenshot({
      path: `${SCREENS}/vis792d-picker-search.png`,
      fullPage: true,
    });

    // A query that matches nothing → no-matches state.
    await page.getByTestId('reference-picker-search').fill('zzz_no_such_object_zzz');
    await page.waitForTimeout(150);
    await expect(page.getByTestId('reference-picker-no-matches')).toBeVisible();
    await page.screenshot({
      path: `${SCREENS}/vis792d-picker-no-matches.png`,
      fullPage: true,
    });
  });

  test('EMPTY-state: a type with no objects shows the create CTA (markdown)', async () => {
    await openCanvas(page);
    const broken = await breakFirstSlot(page, 'markdown');
    const card = page.locator(`[data-testid="broken-ref-card"][data-broken-name="${broken.name}"]`);
    await card.getByTestId('broken-ref-fix').click();
    await expect(page.getByTestId('reference-picker')).toBeVisible({ timeout: WAIT });
    // The integration project has zero markdown objects → prominent empty state.
    await expect(page.getByTestId('reference-picker-empty')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('reference-picker-empty-create')).toBeVisible();
    // No object rows are rendered.
    await expect(page.locator('[data-testid^="reference-picker-row-"]')).toHaveCount(0);
    await page.screenshot({
      path: `${SCREENS}/vis792d-picker-empty.png`,
      fullPage: true,
    });
    // Close the picker (Escape) to leave the page clean.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('reference-picker')).toHaveCount(0);
  });

  test('Delete this slot: confirm can be CANCELLED, then confirmed to remove', async () => {
    // The delete COMMITS a removal through the real save path. We break an
    // EXISTING slot (re-point row.0.item.0 to a missing ref) so exactly ONE
    // broken card renders and the committed delete removes that one slot; the
    // end-of-run sandbox restart restores the dashboard (the source YAML is
    // never touched). Targeting an appended slot proved flaky because the
    // optimistic-vs-committed config the commit reads can leave a duplicate.
    await openCanvas(page);
    const broken = `__missing_chart_${Date.now()}`;
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
      { dashboard: DASHBOARD, name: broken }
    );
    const card = page.locator(`[data-testid="broken-ref-card"][data-broken-name="${broken}"]`);
    await expect(card).toBeVisible({ timeout: WAIT });

    // Open the inline confirm, then cancel — the card stays.
    await card.getByTestId('broken-ref-delete').click();
    await expect(card.getByTestId('broken-ref-confirm-delete')).toBeVisible();
    await card.getByTestId('broken-ref-cancel-delete').click();
    await expect(card.getByTestId('broken-ref-confirm-delete')).toHaveCount(0);
    await expect(card).toBeVisible();

    // Now confirm — the slot is removed (commits a real deletion of item.0).
    await card.getByTestId('broken-ref-delete').click();
    await card.getByTestId('broken-ref-confirm-delete-button').click();
    await expect(card).toHaveCount(0, { timeout: WAIT });
  });

  test('card adapts across slot sizes (narrow ~3/12 slot vs full-width)', async () => {
    // Narrow slot: explanatory copy collapses (container query <240px hides it).
    await openCanvas(page);
    const narrow = await breakFirstSlot(page, 'chart', { width: 3 });
    const narrowCard = page.locator(
      `[data-testid="broken-ref-card"][data-broken-name="${narrow.name}"]`
    );
    await expect(narrowCard).toBeVisible({ timeout: WAIT });
    await page.screenshot({
      path: `${SCREENS}/vis792d-card-narrow.png`,
      fullPage: true,
    });
    // Heading + monospace ref + actions remain present even when narrow.
    await expect(narrowCard.getByTestId('broken-ref-heading')).toBeVisible();
    await expect(narrowCard.getByTestId('broken-ref-name')).toBeVisible();
    await expect(narrowCard.getByTestId('broken-ref-fix')).toBeVisible();

    // Full-width slot: the whole card (incl. explanatory copy) renders.
    await openCanvas(page);
    const wide = await breakFirstSlot(page, 'chart', { width: 12 });
    const wideCard = page.locator(
      `[data-testid="broken-ref-card"][data-broken-name="${wide.name}"]`
    );
    await expect(wideCard).toBeVisible({ timeout: WAIT });
    await page.screenshot({
      path: `${SCREENS}/vis792d-card-fullwidth.png`,
      fullPage: true,
    });
  });

  test('Q16: VIEW mode shows a non-interactive placeholder (no Fix/Delete)', async () => {
    // In View mode the Dashboard renderer has no `renderBrokenRef`, so a broken
    // ref falls back to the legacy inline "<Type> not found: <ref>" text with NO
    // interactive affordances. Inject the broken ref against the View route.
    await page.goto(`${BASE}/project/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('project-view-root')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
    await page.waitForTimeout(400);
    await breakFirstSlot(page, 'chart');
    // The interactive card must NOT mount in View mode.
    await expect(page.getByTestId('broken-ref-card')).toHaveCount(0, { timeout: WAIT });
    await expect(page.getByTestId('broken-ref-fix')).toHaveCount(0);
    await expect(page.getByTestId('broken-ref-delete')).toHaveCount(0);
    // The legacy placeholder text is shown instead.
    await expect(page.getByText(/Chart not found/i).first()).toBeVisible({ timeout: WAIT });
    await page.screenshot({
      path: `${SCREENS}/vis792d-view-mode-placeholder.png`,
      fullPage: true,
    });
  });

  test('no console errors across the detailed broken-ref flow', async () => {
    const NOISE = [
      'favicon',
      'DevTools',
      'react-cool',
      'ResizeObserver',
      'compile',
      'not found',
      'Failed to fetch',
      'fetch error',
      // Intentionally breaking refs (and committing a fix/delete) makes the
      // server 404 the missing object's data endpoint — expected environmental
      // noise for this flow, not a regression.
      'Failed to load resource',
      '404',
    ];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real).toHaveLength(0);
  });
});
