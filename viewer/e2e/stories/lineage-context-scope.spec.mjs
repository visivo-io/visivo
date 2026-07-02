/**
 * Story: Lineage Context Scope (VIS-E1 / VIS-779)
 *
 * End-to-end validation of LineageCanvas + the universal lineage lens.
 * Exercises EVERY acceptance criterion as an explicit, screenshotted step:
 *
 *   1. <LineageCanvas> mounts in the middle pane lineage lens (no "coming
 *      soon" placeholder).
 *   2. Selector is `*` unscoped, `+<dashboard>` for a dashboard scope, and
 *      `+<item>` for an item scope.
 *   3. "Show full project" widens the scope back to `*` WITHOUT changing the
 *      route, and the selector input clears.
 *   4. Selection sync round-trips: clicking a node in the DAG updates the
 *      workspace selection (the clicked object becomes the scoped subject).
 *   5. The manual selector input still works as an override.
 *   6. (this spec) — the whole flow runs green with no console errors.
 *   7. `middle_pane_toggled` telemetry fires on lineage entry (observed via
 *      the `visivo:workspace-telemetry` CustomEvent the app dispatches).
 *   8. Universal lineage: selecting ANY object type defaults to its own DAG
 *      in the Lineage lens, and the Library flip-popover "Expand" opens the
 *      object in the lineage lens (scoped to ITS DAG, not the dashboard's).
 *
 * Precondition: the vis779 sandbox is running on :3002/:8002 (NEVER :3000/
 * :3001). The playwright config's default baseURL is :3001 (the shared
 * `parallel`/`state-mutating` sandbox), so this spec is self-contained on
 * :3002 via the BASE constant + absolute navigations. Run with:
 *   cd viewer && npx playwright test e2e/stories/lineage-context-scope.spec.mjs --reporter=list
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS779_BASE || 'http://localhost:3002';
const WAIT_FOR_PAGE = 20000;
const SHOTS = 'e2e/stories/__screens__';

// A chart that exists in the integration project and has a non-trivial DAG.
const SUBJECT_CHART = 'fibonacci';

const screenshot = (page, name) =>
  page.screenshot({ path: `${SHOTS}/vis779-${name}.png` });

// Install a window-level telemetry capture BEFORE any app code runs on the
// page, so we never miss the `middle_pane_toggled` emission that fires the
// moment the lineage lens mounts.
const installTelemetryCapture = page =>
  page.addInitScript(() => {
    window.__vis_tel = [];
    window.addEventListener('visivo:workspace-telemetry', e => {
      window.__vis_tel.push(e.detail);
    });
  });

const telemetryEvents = page => page.evaluate(() => window.__vis_tel || []);

test.describe('Lineage Context Scope (VIS-779)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  /** @type {import('@playwright/test').Page} */
  let page;
  let dashboardName;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });

    await installTelemetryCapture(page);

    // Discover a dashboard name from the project so the story is data-driven.
    await page.goto(`${BASE}/api/project/`);
    const projectText = await page.locator('body').innerText();
    let project;
    try {
      project = JSON.parse(projectText);
    } catch {
      project = null;
    }
    const dashboards =
      project?.project_json?.dashboards || project?.dashboards || [];
    dashboardName = dashboards[0]?.name;

    test.skip(!dashboardName, 'No dashboards in the sandbox project');

    await page.goto(`${BASE}/workspace/dashboard/${encodeURIComponent(dashboardName)}`);
    await page.waitForLoadState('networkidle');
    await page
      .getByTestId('workspace-subbar-dashboard')
      .waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: switching the lens to Lineage mounts LineageCanvas (no placeholder)', async () => {
    // The sub-bar PreviewLensPicker exposes a Lineage tab in a Segmented control.
    await page.getByRole('tab', { name: /lineage/i }).first().click();
    await expect(page.getByTestId('workspace-middle-dashboard-lineage')).toBeVisible({
      timeout: WAIT_FOR_PAGE,
    });
    await expect(page.getByTestId('lineage-canvas')).toBeVisible();
    await expect(page.getByText(/Lineage view coming soon/i)).toHaveCount(0);
    // The DAG actually renders nodes.
    await page.locator('.react-flow__node').first().waitFor({ timeout: WAIT_FOR_PAGE });
    await screenshot(page, '01-lineage-lens-mounted');
  });

  test('Step 2: scope is `+<dashboard>` for the dashboard scope', async () => {
    await expect(page.getByTestId('lineage-canvas-scope-bar')).toBeVisible();
    await expect(page.getByTestId('lineage-canvas-scope-pill')).toContainText(
      dashboardName
    );
    await expect(page.getByTestId('lineage-canvas-reset-scope')).toBeVisible();
    const selectorInput = page.locator('input[placeholder*="source_name"]');
    await expect(selectorInput).toHaveValue(`+${dashboardName}`);
    await screenshot(page, '02-dashboard-scope');
  });

  test('Step 7: middle_pane_toggled telemetry fired on lineage entry', async () => {
    const events = await telemetryEvents(page);
    const toggled = events.filter(e => e.eventName === 'middle_pane_toggled');
    expect(toggled.length).toBeGreaterThan(0);
    const entry = toggled.find(e => e.payload && e.payload.pane === 'lineage');
    expect(entry).toBeTruthy();
    expect(entry.payload).toMatchObject({
      pane: 'lineage',
      scope: 'dashboard',
      dashboardName,
      selector: `+${dashboardName}`,
    });
  });

  test('Step 3: "Show full project" widens scope to `*` without changing route', async () => {
    await page.getByTestId('lineage-canvas-reset-scope').click();

    // The reset affordance vanishes (we are now at the full-project scope)…
    await expect(page.getByTestId('lineage-canvas-reset-scope')).toHaveCount(0);
    await expect(page.getByTestId('lineage-canvas-scope-pill')).toContainText(
      /full project/i
    );
    // …the selector input clears (`*` normalises to the empty "show all" state)…
    const selectorInput = page.locator('input[placeholder*="source_name"]');
    await expect(selectorInput).toHaveValue('');
    // …and the route is unchanged.
    await expect(page).toHaveURL(
      new RegExp(`/workspace/dashboard/${dashboardName}`)
    );
    await screenshot(page, '03-show-full-project');
  });

  test('Step 5: the manual selector input works as an override', async () => {
    const selectorInput = page.locator('input[placeholder*="source_name"]');
    await selectorInput.fill(`+${SUBJECT_CHART}+`);
    await expect(selectorInput).toHaveValue(`+${SUBJECT_CHART}+`);
    // The DAG re-filters to the manually-typed selection; assert the override
    // stuck and the DAG still renders nodes.
    await page.locator('.react-flow__node').first().waitFor({ timeout: WAIT_FOR_PAGE });
    await screenshot(page, '05-manual-selector-override');
    // Clear so it doesn't pollute the next step.
    const clearBtn = page.getByRole('button', { name: /^clear$/i }).first();
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
    } else {
      await selectorInput.fill('');
    }
  });

  test('Step 4: clicking a node round-trips selection into the workspace', async () => {
    // Re-enter the dashboard lineage lens cleanly, then narrow the DAG to the
    // chart's own neighbourhood via the manual selector. This makes the chart
    // node the centred subject (large, deterministic hit target) regardless of
    // the headless viewport's fitView zoom on the broad dashboard graph.
    await page.goto(`${BASE}/workspace/dashboard/${encodeURIComponent(dashboardName)}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /lineage/i }).first().click();
    await expect(page.getByTestId('lineage-canvas')).toBeVisible({ timeout: WAIT_FOR_PAGE });
    await page.locator('input[placeholder*="source_name"]').fill(`+${SUBJECT_CHART}+`);

    const node = page.locator(`.react-flow__node[data-id="chart-${SUBJECT_CHART}"]`);
    await node.waitFor({ state: 'visible', timeout: WAIT_FOR_PAGE });
    await node.scrollIntoViewIfNeeded();
    await node.click();

    // The clicked chart becomes the active (non-dashboard) workspace object,
    // so MiddlePane re-renders PerObjectPane and the scope re-derives to the
    // chart's own DAG — without the user touching the lens picker.
    await expect(page.getByTestId('workspace-subbar-chart')).toBeVisible({
      timeout: WAIT_FOR_PAGE,
    });
    await expect(page.getByTestId('lineage-canvas')).toBeVisible();
    await expect(page.getByTestId('lineage-canvas-scope-pill')).toContainText(
      SUBJECT_CHART
    );
    await expect(page.locator('input[placeholder*="source_name"]')).toHaveValue(
      `+${SUBJECT_CHART}`
    );
    await expect(
      page.getByText(/Per-object preview coming soon \(Track N\)/i)
    ).toHaveCount(0);
    await screenshot(page, '04-node-click-roundtrip');
  });

  test('Step 8: flip-popover "Expand" opens the object in the universal Lineage lens', async () => {
    // Start from a clean dashboard route so the Library is visible and the
    // dashboard URL param is still present (the route must NOT change when
    // Expand re-scopes to the object).
    await page.goto(`${BASE}/workspace/dashboard/${encodeURIComponent(dashboardName)}`);
    await page.waitForLoadState('networkidle');

    // Library per-type subsections are collapsed by default (VIS-828); the chart
    // rows aren't rendered until the Charts subsection is expanded.
    await page.getByTestId('library-subsection-chart-header').click();

    const row = page.getByTestId(`library-row-chart-${SUBJECT_CHART}`);
    await row.waitFor({ timeout: WAIT_FOR_PAGE });
    // Center the row in the viewport BEFORE opening the flip-popover. The popover
    // renders in a floating portal anchored below the row; if the row sits near
    // the bottom of the Library scroll area the portal (and its Expand button)
    // open off-screen, so the Expand click would land outside the viewport.
    await row.scrollIntoViewIfNeeded();
    await row.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await row.hover();
    await page.getByTestId(`library-row-chart-${SUBJECT_CHART}-flip`).click();

    const popover = page.getByTestId(`library-row-chart-${SUBJECT_CHART}-popover`);
    await expect(popover).toBeVisible({ timeout: WAIT_FOR_PAGE });
    await screenshot(page, '08a-flip-popover');

    const expandBtn = page.getByTestId(`library-row-chart-${SUBJECT_CHART}-popover-expand`);
    await expect(expandBtn).toBeVisible({ timeout: WAIT_FOR_PAGE });
    await expandBtn.click();

    // The chart opens in the universal Lineage lens, scoped to ITS OWN DAG —
    // not the dashboard's — and the route is unchanged (E-1 requires it).
    await expect(page.getByTestId('workspace-middle-chart-lineage')).toBeVisible({
      timeout: WAIT_FOR_PAGE,
    });
    await expect(page.getByTestId('lineage-canvas')).toBeVisible();
    await expect(page.getByTestId('lineage-canvas-scope-pill')).toContainText(
      SUBJECT_CHART
    );
    await expect(page.locator('input[placeholder*="source_name"]')).toHaveValue(
      `+${SUBJECT_CHART}`
    );
    await expect(
      page.getByText(/Per-object preview coming soon \(Track N\)/i)
    ).toHaveCount(0);
    await expect(page).toHaveURL(
      new RegExp(`/workspace/dashboard/${dashboardName}`)
    );
    await screenshot(page, '08b-universal-lineage-expanded');
  });

  test('Step 6: no console errors during the whole flow', async () => {
    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('Download the React DevTools')
    );
    expect(realErrors).toHaveLength(0);
  });
});
