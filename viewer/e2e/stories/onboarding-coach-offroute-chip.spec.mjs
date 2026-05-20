/**
 * Phase 5 polish: off-route chip.
 *
 * When a user has work left but they're on a different page from where
 * that work lives, the OnboardingCoach renders a small floating chip
 * pointing them at the right route. Phase 4's Coach silently hid in
 * that case; this gives users a one-click way back into the flow.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

async function gotoCoachOnDeployFromOffRoute(page) {
  // Pre-set state so deploy is the only incomplete row, then land on
  // a route (Lineage) that's not /editor — the chip should appear.
  await page.goto(`${BASE}/lineage`);
  await page.evaluate(() => {
    window.localStorage.setItem(
      'visivo.onboarding.v1',
      JSON.stringify({
        completed_at: '2026-01-01T00:00:00.000Z',
        role: 'analytics_engineer',
        path: 'data',
        source_connected: true,
        visited_project_route: '2026-01-01',
        cloud_connected: true,
        checklist_dismissed: false,
        checklist_checked: [
          'connect_source',
          'build_model',
          'create_insight',
          'build_dashboard',
          'view_project',
          'connect_cloud',
          'define_metric',
        ],
        coach_dismissed: [],
      })
    );
  });
  await page.goto(`${BASE}/lineage`);
  await page.waitForSelector('[data-testid="onboarding-coach-chip"]', { timeout: 10000 });
}

test.describe('OnboardingCoach — off-route chip', () => {
  test.describe.configure({ timeout: 60_000 });

  test('chip appears on a different route + click takes user to currentItem.route', async ({
    page,
  }) => {
    await gotoCoachOnDeployFromOffRoute(page);
    const chip = page.getByTestId('onboarding-coach-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-onb-chip-item', 'deploy');
    await expect(chip).toContainText('Next: Deploy to share');
    await chip.click();
    await page.waitForURL(/\/editor$/, { timeout: 10000 });
  });

  test('chip is hidden once the user dismisses the item', async ({ page }) => {
    await gotoCoachOnDeployFromOffRoute(page);
    await page.evaluate(() => {
      const ps = JSON.parse(window.localStorage.getItem('visivo.onboarding.v1') || '{}');
      ps.coach_dismissed = ['deploy'];
      window.localStorage.setItem('visivo.onboarding.v1', JSON.stringify(ps));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('onboarding-coach-chip')).toHaveCount(0);
  });
});
