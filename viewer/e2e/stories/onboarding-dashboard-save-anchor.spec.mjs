/**
 * Phase 5 follow-up: verify the lazy `dashboard-save` anchor.
 *
 * The Coach's `dashboard-save` target is on the Save button inside
 * DashboardEditForm, which only mounts after a user opens (or creates)
 * a Dashboard via the Editor's FAB. We can't include this in the eager
 * onboarding-coach-anchors sweep — this test drives the FAB → Dashboard
 * flow then confirms the marker is present.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

async function gotoCompletedAsRole(page, role = 'analytics_engineer') {
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
  await page.goto(`${BASE}/editor`);
  await page.waitForSelector('[data-testid="onboarding-checklist"]', { timeout: 15000 });
}

test.describe('Onboarding — dashboard-save lazy anchor', () => {
  test.setTimeout(45_000);

  test('marker mounts when a Dashboard is opened via the Editor FAB', async ({ page }) => {
    await gotoCompletedAsRole(page);

    // Open the FAB menu and pick "Dashboard". This routes through
    // CreateButton → EditPanel → DashboardEditForm. The integration
    // project ships several dashboards whose names contain
    // "dashboard", so we use exact match to disambiguate the FAB
    // menu entry from the left-rail object list.
    await page.locator('[data-onb-target="source-create-button"]').click();
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();

    // DashboardEditForm renders inside the right-side EditPanel.
    // The Save button carries data-onb-target="dashboard-save".
    const save = page.locator('[data-onb-target="dashboard-save"]');
    await expect(save).toBeAttached({ timeout: 10000 });
    await expect(save).toBeVisible();
  });
});
