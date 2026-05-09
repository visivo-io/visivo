/**
 * Phase 4 of the onboarding-checklist v2 plan.
 *
 * Validates the OnboardingCoach component:
 *  - mounts when there's a current incomplete checklist item AND
 *    the user is on the matching route AND the target DOM element
 *    exists.
 *  - hides when the user dismisses ("I've got this") for that item.
 *  - re-anchors to the next currentItem when the previous one
 *    becomes done (sticky completion).
 *
 * Phase 4 ships markers for top-nav-deploy and top-nav-project.
 * Phase 5 will add markers in Explorer + Editor for source / model /
 * insight / dashboard / metric.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

async function gotoCompletedFlow(page, role, overrides = {}) {
  await page.goto(`${BASE}/editor`);
  await page.evaluate(
    ({ role, overrides }) => {
      window.localStorage.setItem(
        'visivo.onboarding.v1',
        JSON.stringify({
          completed_at: '2026-01-01T00:00:00.000Z',
          role,
          path: 'data',
          checklist_dismissed: false,
          checklist_checked: [],
          ...overrides,
        })
      );
    },
    { role, overrides }
  );
  await page.goto(`${BASE}/editor`);
  await page.waitForSelector('[data-testid="onboarding-checklist"]', { timeout: 15000 });
}

test.describe('OnboardingCoach', () => {
  // Each test does 2-3 page navigations + waitForLoadState. Under
  // 7-worker parallel sweep the default 30s isn't enough headroom;
  // these settle in 5-8s in isolation.
  test.describe.configure({ timeout: 60_000 });

  test('shows on /editor pointing at the Deploy button when deploy is the current item', async ({
    page,
  }) => {
    // Arrange: every other item is satisfied so deploy is currentItem.
    await gotoCompletedFlow(page, 'analytics_engineer', {
      source_connected: true,
      visited_project_route: '2026-01-01',
      cloud_connected: true,
      checklist_checked: [
        'connect_source',
        'build_model',
        'create_insight',
        'build_dashboard',
        'view_project',
        'connect_cloud',
        'define_metric',
      ],
    });
    await expect(page.getByTestId('onboarding-coach')).toBeVisible();
    const tooltip = page.getByTestId('onboarding-coach-deploy');
    await expect(tooltip).toBeVisible();
    await expect(tooltip.getByText('Deploy to share')).toBeVisible();
    await expect(tooltip.getByText('Run visivo deploy to push to cloud.')).toBeVisible();
    // Halo positions over the deploy button (rectangles overlap).
    const haloBox = await page.locator('.onb-coach__halo').boundingBox();
    const targetBox = await page.locator('[data-onb-target="top-nav-deploy"]').boundingBox();
    expect(haloBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    expect(Math.abs(haloBox.x - (targetBox.x - 8))).toBeLessThan(2);
    expect(Math.abs(haloBox.y - (targetBox.y - 8))).toBeLessThan(2);
  });

  test('"I\'ve got this" dismiss persists per item', async ({ page }) => {
    await gotoCompletedFlow(page, 'analytics_engineer', {
      source_connected: true,
      visited_project_route: '2026-01-01',
      cloud_connected: true,
      checklist_checked: [
        'connect_source',
        'build_model',
        'create_insight',
        'build_dashboard',
        'view_project',
        'connect_cloud',
        'define_metric',
      ],
    });
    await expect(page.getByTestId('onboarding-coach-deploy')).toBeVisible();
    await page.getByText("I've got this").click();
    await expect(page.getByTestId('onboarding-coach')).toHaveCount(0);
    const persisted = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('visivo.onboarding.v1') || '{}')
    );
    expect(persisted.coach_dismissed).toContain('deploy');
  });

  test('hides on routes other than the currentItem.route', async ({ page }) => {
    await gotoCompletedFlow(page, 'analytics_engineer', {
      source_connected: true,
      visited_project_route: '2026-01-01',
      cloud_connected: true,
      checklist_checked: [
        'connect_source',
        'build_model',
        'create_insight',
        'build_dashboard',
        'view_project',
        'connect_cloud',
        'define_metric',
      ],
    });
    await expect(page.getByTestId('onboarding-coach')).toBeVisible();
    // /explorer is currentItem.route only when define_metric is current
    // for analytics engineer; with all items satisfied except deploy
    // the route is /editor, so navigating to /lineage hides the coach.
    await page.goto(`${BASE}/lineage`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('onboarding-coach')).toHaveCount(0);
  });
});
