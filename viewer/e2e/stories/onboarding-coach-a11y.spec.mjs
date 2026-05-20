/**
 * Phase 6 of the onboarding-checklist v2 plan.
 *
 * Coach a11y + telemetry contract:
 *   - tooltip has role="status" aria-live="polite" so screen readers
 *     announce the next-step hint without trapping focus.
 *   - Esc dismisses the current hint (keyboard parity with the
 *     "I've got this" link).
 *   - Clicking the highlighted target fires
 *     onboarding_coach_target_clicked once.
 *   - Reduced-motion preference removes the pulse animation.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

async function gotoCoachOnDeploy(page) {
  await page.goto(`${BASE}/editor`);
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
  await page.goto(`${BASE}/editor`);
  await page.waitForSelector('[data-testid="onboarding-coach"]', { timeout: 10000 });
}

test.describe('OnboardingCoach — a11y + telemetry', () => {
  test('tooltip has role="status" + aria-live="polite"', async ({ page }) => {
    await gotoCoachOnDeploy(page);
    const tooltip = page.getByTestId('onboarding-coach-deploy');
    await expect(tooltip).toHaveAttribute('role', 'status');
    await expect(tooltip).toHaveAttribute('aria-live', 'polite');
  });

  test('Esc dismisses the hint and persists per item', async ({ page }) => {
    await gotoCoachOnDeploy(page);
    await expect(page.getByTestId('onboarding-coach')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('onboarding-coach')).toHaveCount(0);
    const persisted = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('visivo.onboarding.v1') || '{}')
    );
    expect(persisted.coach_dismissed).toContain('deploy');
  });

  test('clicking the highlighted target emits onboarding_coach_target_clicked', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__onbEvents = [];
    });
    await gotoCoachOnDeploy(page);
    // The Deploy button opens a modal; we just need the click to register.
    const deploy = page.locator('[data-onb-target="top-nav-deploy"]');
    await deploy.click();
    const events = await page.evaluate(() => window.__onbEvents || []);
    const names = events.map(e => e.event);
    expect(names).toContain('onboarding_coach_target_clicked');
  });

  test('reduced-motion removes the halo pulse animation', async ({ page, browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const reducedPage = await ctx.newPage();
    await reducedPage.goto(`${BASE}/editor`);
    await reducedPage.evaluate(() => {
      window.localStorage.setItem(
        'visivo.onboarding.v1',
        JSON.stringify({
          completed_at: '2026-01-01T00:00:00.000Z',
          role: 'analytics_engineer',
          source_connected: true,
          visited_project_route: '2026-01-01',
          cloud_connected: true,
          path: 'data',
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
    await reducedPage.goto(`${BASE}/editor`);
    await reducedPage.waitForSelector('[data-testid="onboarding-coach"]');
    const animationName = await reducedPage
      .locator('.onb-coach__halo')
      .evaluate(el => getComputedStyle(el).animationName);
    expect(animationName).toBe('none');
    await ctx.close();
  });
});
