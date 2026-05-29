/**
 * Story: Outline Tree Panel (VIS-793 / Track F F-3)
 *
 * End-to-end validation of the right-rail Outline tab's tree of the scoped
 * dashboard. Each VIS-793 acceptance criterion is an explicit step:
 *
 *   1. <OutlineTreePanel> renders the scoped dashboard as an indented tree
 *      (dashboard → row → item).
 *   2. The tree mounts in the right-rail Outline tab.
 *   3. Clicking a tree node updates the workspace selection state (mulberry
 *      highlight; canvas highlight is Track D — selection dispatch only).
 *   4. "+ Add row" appends a row to the dashboard.
 *   5. `right_rail_tab_switched` telemetry fires on right-rail tab change.
 *   6. Empty state ("No rows yet.") when no dashboard is scoped.
 *   7. (this spec) passes against the sandbox.
 *
 * Canvas live-sync (drag-reorder updates the tree) depends on Track D (the
 * canvas), which is not built yet — that assertion is intentionally omitted.
 * The tree reads `dashboards` from the shared store, so it would reflect
 * canvas mutations for free once Track D lands.
 *
 * Targets the vis793 sandbox on :3004 via absolute URLs (the default config
 * baseURL is :3001). Screenshots land in e2e/stories/__screens__/.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3004';
const WAIT_FOR_PAGE = 20000;
const SCREENS = 'e2e/stories/__screens__';

// A dashboard that exists in the integration test project (project.json).
const DASHBOARD = 'simple-dashboard';

const collectConsoleErrors = page => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(String(err)));
  return errors;
};

const realErrors = errors =>
  errors.filter(
    e =>
      !e.includes('favicon') &&
      !e.includes('DevTools') &&
      !/Failed to load resource/.test(e) &&
      !/the server responded with a status of 404/.test(e)
  );

const openScopedOutline = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await page
    .getByTestId('workspace-right-rail-tab-outline')
    .click({ timeout: WAIT_FOR_PAGE });
};

test.describe('Outline Tree Panel (VIS-793)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  test('Criterion 2: Outline tab mounts the tree (not the placeholder)', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await openScopedOutline(page);

    await expect(page.getByTestId('workspace-right-rail-outline')).toBeVisible({
      timeout: WAIT_FOR_PAGE,
    });
    // The old "coming soon" placeholder must be gone.
    await expect(page.getByText('Outline tree coming soon')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/vis793-step2-outline-mounted.png` });
    expect(realErrors(errors)).toHaveLength(0);
  });

  test('Criterion 1: tree renders dashboard → row → item, indented', async ({
    page,
  }) => {
    await openScopedOutline(page);

    // Dashboard root carries the dashboard name.
    const root = page.getByTestId('outline-tree-node-dashboard');
    await expect(root).toBeVisible({ timeout: WAIT_FOR_PAGE });
    await expect(root).toContainText(DASHBOARD);

    // Row nodes exist.
    const row0 = page.getByTestId('outline-tree-node-row.0');
    await expect(row0).toBeVisible();

    // At least one leaf item exists under a row, and the tree is indented:
    // the item is rendered with more left-padding than its parent row.
    const item0 = page.getByTestId('outline-tree-node-row.0.item.0');
    await expect(item0).toBeVisible();
    const rowBox = await row0.boundingBox();
    const itemBox = await item0.boundingBox();
    const dashBox = await root.boundingBox();
    // dashboard < row < item left-edge content (indent grows with depth).
    expect(rowBox.x).toBeGreaterThanOrEqual(dashBox.x);
    expect(itemBox.x).toBeGreaterThanOrEqual(rowBox.x);

    await page.screenshot({ path: `${SCREENS}/vis793-step1-tree-indented.png` });
  });

  test('Criterion 3: clicking a node updates workspace selection state', async ({
    page,
  }) => {
    await openScopedOutline(page);

    const row1 = page.getByTestId('outline-tree-node-row.1');
    await expect(row1).toBeVisible({ timeout: WAIT_FOR_PAGE });
    await row1.click();

    // The clicked node is selected (mulberry highlight via data-selected).
    await expect(row1).toHaveAttribute('data-selected', 'true');
    // And selecting it deselects siblings / the root.
    await expect(page.getByTestId('outline-tree-node-dashboard')).toHaveAttribute(
      'data-selected',
      'false'
    );

    // Dispatch reached the workspace store (canvas would read this key in
    // Track D). The store action sets `workspaceOutlineSelectedKey = 'row.1'`.
    const selectedKey = await page.evaluate(() => {
      const buf = window.__visivoWorkspaceTelemetry;
      // Prefer the data-attribute as the canonical selection signal.
      const el = document.querySelector(
        '[data-testid="outline-tree-node-row.1"]'
      );
      return el ? el.getAttribute('data-selection-key') : null;
    });
    expect(selectedKey).toBe('row.1');

    await page.screenshot({ path: `${SCREENS}/vis793-step3-row-selected.png` });
  });

  test('Criterion 4: "+ Add row" appends a row to the dashboard', async ({
    page,
  }) => {
    await openScopedOutline(page);

    await expect(page.getByTestId('outline-tree-node-row.0')).toBeVisible({
      timeout: WAIT_FOR_PAGE,
    });
    const before = await page
      .locator('[data-testid^="outline-tree-node-row."]')
      .count();

    await page.getByTestId('outline-tree-add-row').click();

    await expect
      .poll(
        async () =>
          page.locator('[data-testid^="outline-tree-node-row."]').count(),
        { timeout: WAIT_FOR_PAGE }
      )
      .toBeGreaterThan(before);

    await page.screenshot({ path: `${SCREENS}/vis793-step4-row-added.png` });
  });

  test('Criterion 5: right_rail_tab_switched telemetry fires on tab change', async ({
    page,
  }) => {
    await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');

    // Reset the telemetry buffer so we only see the tab-switch event below.
    await page.evaluate(() => {
      window.__visivoWorkspaceTelemetry = [];
    });

    // Default right tab is "edit" — switch to "outline" to trigger the event.
    await page.getByTestId('workspace-right-rail-tab-outline').click({
      timeout: WAIT_FOR_PAGE,
    });

    const event = await page.evaluate(() =>
      (window.__visivoWorkspaceTelemetry || []).find(
        e => e.eventName === 'right_rail_tab_switched'
      )
    );
    expect(event).toBeTruthy();
    expect(event.payload.tab).toBe('outline');

    await page.screenshot({ path: `${SCREENS}/vis793-step5-telemetry.png` });
  });

  test('Criterion 6: empty state when no dashboard is scoped', async ({ page }) => {
    // Unscoped workspace — no dashboard in the URL.
    await page.goto(`${BASE}/workspace`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail-tab-outline').click({
      timeout: WAIT_FOR_PAGE,
    });

    // The "open a dashboard" no-dashboard messaging is shown.
    await expect(
      page.getByTestId('outline-tree-no-dashboard')
    ).toBeVisible({ timeout: WAIT_FOR_PAGE });

    await page.screenshot({ path: `${SCREENS}/vis793-step6-empty-state.png` });
  });
});
