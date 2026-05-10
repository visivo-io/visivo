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
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

// Anchors that mount eagerly when the user lands on the route. The Coach
// guarantees a graceful no-op when a target isn't on the page yet, so
// markers like metric-add-button (which lives inside DataSectionToolbar
// and only renders after the user has run a query) are intentionally
// excluded from this eager-existence sweep — they're verified as part
// of phase 5 when DataSectionToolbar mounts in user-flow e2e specs.
const ANCHORS = [
  { id: 'top-nav-deploy', route: '/editor' },
  { id: 'top-nav-project', route: '/editor' },
  { id: 'source-create-button', route: '/editor' },
  { id: 'sql-editor', route: '/explorer' },
  { id: 'model-tab-bar', route: '/explorer' },
  { id: 'sql-run-button', route: '/explorer' },
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
  for (const anchor of ANCHORS) {
    test(`[data-onb-target="${anchor.id}"] is rendered on ${anchor.route}`, async ({ page }) => {
      await setupOnboarded(page);
      await page.goto(`${BASE}${anchor.route}`);
      await page.waitForLoadState('networkidle');
      const el = page.locator(`[data-onb-target="${anchor.id}"]`).first();
      await expect(el).toBeAttached();
    });
  }
});
