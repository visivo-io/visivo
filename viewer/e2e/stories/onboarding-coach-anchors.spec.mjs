/**
 * Phase 5 of the onboarding-checklist v2 plan.
 *
 * Verifies every anchor target id named in the manifest resolves to a
 * real DOM element in the live app, and that the OnboardingCoach
 * positions its halo over that element on the matching route.
 *
 * Stops the Coach from going stale silently: if a host component is
 * renamed or the marker is removed, this test fails before users hit
 * a no-op coach.
 *
 * Explore 2.0 Phase 3b cutover (B14 part 2): the exploration-workbench
 * anchors (`sql-editor`/`query-chip-add`/`sql-run-button`/
 * `chart-crud-section`/`right-panel-add-insight`/`explorer-save-button`)
 * only render inside an OPEN exploration tab, not on the bare Explorer
 * Home route (`/workspace/exploration`) the old `/explorer` standalone
 * route's "always in a workbench" model let this file assume — a real
 * exploration is minted + opened first. `model-tab-bar` (the retired
 * ModelTabBar's "+") is replaced by `query-chip-add`
 * (ExplorationQueryChips' "+").
 */
import { test, expect } from '@playwright/test';
import { apiBase } from '../helpers/sandbox.mjs';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

// Anchors that mount eagerly when the user lands on the route. The Coach
// guarantees a graceful no-op when a target isn't on the page yet, so
// markers like metric-add-button (which lives inside DataSectionToolbar
// and only renders after the user has run a query) are intentionally
// excluded from this eager-existence sweep — they're verified as part
// of phase 5 when DataSectionToolbar mounts in user-flow e2e specs.
const ROUTE_ANCHORS = [
  { id: 'top-nav-deploy', route: '/editor' },
  { id: 'top-nav-project', route: '/editor' },
  { id: 'source-create-button', route: '/editor' },
];

// Anchors that only exist inside an OPEN exploration tab (see file header).
const EXPLORATION_ANCHORS = [
  'sql-editor',
  'query-chip-add',
  'sql-run-button',
  'chart-crud-section',
  'right-panel-add-insight',
  'explorer-save-button',
];

async function setupOnboarded(page, role = 'analytics_engineer') {
  await page.goto(`${BASE}/editor`);
  await page.evaluate(role => {
    window.localStorage.setItem(
      'visivo.onboarding.v1',
      JSON.stringify({
        completed_at: '2026-01-01T00:00:00.000Z',
        role,
        path: 'data',
        checklist_dismissed: false,
        checklist_checked: [],
        coach_dismissed: [],
      })
    );
  }, role);
}

test.describe('OnboardingCoach — anchor markers exist on every advertised route', () => {
  for (const anchor of ROUTE_ANCHORS) {
    test(`[data-onb-target="${anchor.id}"] is rendered on ${anchor.route}`, async ({ page }) => {
      await setupOnboarded(page);
      await page.goto(`${BASE}${anchor.route}`);
      await page.waitForLoadState('networkidle');
      const el = page.locator(`[data-onb-target="${anchor.id}"]`).first();
      await expect(el).toBeAttached();
    });
  }

  test('exploration-workbench anchors are rendered inside an OPEN exploration tab', async ({
    page,
  }) => {
    let idsBeforeTest = [];
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    idsBeforeTest = res && res.ok() ? (await res.json()).map(e => e.id) : [];

    await setupOnboarded(page);
    await page.goto(`${BASE}/workspace/exploration`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });

    await page.getByTestId('explorer-home-new-exploration').click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
      timeout: 10000,
    });

    for (const id of EXPLORATION_ANCHORS) {
      await expect(
        page.locator(`[data-onb-target="${id}"]`).first(),
        `[data-onb-target="${id}"] should be attached inside an open exploration`
      ).toBeAttached({ timeout: 10000 });
    }

    const idsAfter = await page.request
      .get(`${apiBase}/api/explorations/`)
      .then(r => r.json())
      .then(list => list.map(e => e.id))
      .catch(() => []);
    for (const id of idsAfter.filter(i => !idsBeforeTest.includes(i))) {
      await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
    }
  });
});
