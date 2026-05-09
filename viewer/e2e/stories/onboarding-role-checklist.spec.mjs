/**
 * Phase 3 of the onboarding-checklist v2 plan.
 *
 * Each role defined in concepts.js can shape the checklist via the
 * ROLE_OVERRIDES map in onboardingManifest.js. These tests walk three
 * representative roles and assert the rendered list matches the role's
 * configured shape:
 *
 *   - analytics_engineer adds `define_metric` and relabels two rows.
 *   - software_engineer keeps the default count but relabels two rows.
 *   - executive drops the build steps and lands on a four-item set.
 *
 * Visual screenshots are captured per role for cross-check.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

async function gotoCompletedAsRole(page, role) {
  await page.goto(`${BASE}/editor`);
  await page.evaluate(
    ({ role }) => {
      window.localStorage.setItem(
        'visivo.onboarding.v1',
        JSON.stringify({
          completed_at: '2026-01-01T00:00:00.000Z',
          role,
          path: 'data',
          checklist_dismissed: false,
          checklist_checked: [],
        })
      );
    },
    { role }
  );
  await page.goto(`${BASE}/editor`);
  await page.waitForSelector('[data-testid="onboarding-checklist"]', { timeout: 15000 });
}

async function rowIds(page) {
  return page.$$eval('[data-testid^="onb-checklist-"]', els =>
    els.map(el => el.dataset.testid.replace('onb-checklist-', ''))
  );
}

test.describe('Onboarding checklist — role-aware manifest', () => {
  test('analytics_engineer sees define_metric + relabeled connect_source / build_model', async ({
    page,
  }) => {
    await gotoCompletedAsRole(page, 'analytics_engineer');
    const ids = await rowIds(page);
    expect(ids).toEqual([
      'connect_source',
      'build_model',
      'define_metric',
      'create_insight',
      'build_dashboard',
      'view_project',
      'connect_cloud',
      'deploy',
    ]);
    await expect(
      page.getByTestId('onb-checklist-connect_source').getByText('Connect your warehouse')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('onb-checklist-build_model')
        .getByText('Re-use a dbt model or save a SQL file')
    ).toBeVisible();
    await expect(
      page.getByTestId('onb-checklist-define_metric').getByText('Define a Metric on a Model')
    ).toBeVisible();
    await page.screenshot({
      path: '../../analytics-engineer-checklist.png',
      clip: { x: 1080, y: 60, width: 360, height: 600 },
    });
  });

  test('software_engineer sees the default 7 rows with two relabels', async ({ page }) => {
    await gotoCompletedAsRole(page, 'software_engineer');
    const ids = await rowIds(page);
    expect(ids).toEqual([
      'connect_source',
      'build_model',
      'create_insight',
      'build_dashboard',
      'view_project',
      'connect_cloud',
      'deploy',
    ]);
    await expect(
      page.getByTestId('onb-checklist-connect_source').getByText('Connect a database (Postgres / DuckDB)')
    ).toBeVisible();
    await expect(
      page.getByTestId('onb-checklist-build_model').getByText('Save a `.sql` file as a Model')
    ).toBeVisible();
    await page.screenshot({
      path: '../../software-engineer-checklist.png',
      clip: { x: 1080, y: 60, width: 360, height: 600 },
    });
  });

  test('executive drops build_model / create_insight / deploy', async ({ page }) => {
    await gotoCompletedAsRole(page, 'executive');
    const ids = await rowIds(page);
    expect(ids).toEqual([
      'connect_source',
      'build_dashboard',
      'view_project',
      'connect_cloud',
    ]);
    expect(ids).not.toContain('build_model');
    expect(ids).not.toContain('create_insight');
    expect(ids).not.toContain('deploy');
    await expect(
      page.getByTestId('onb-checklist-connect_source').getByText('Pick a sample to explore')
    ).toBeVisible();
    await expect(
      page.getByTestId('onb-checklist-build_dashboard').getByText('Open your dashboard')
    ).toBeVisible();
    await page.screenshot({
      path: '../../executive-checklist.png',
      clip: { x: 1080, y: 60, width: 360, height: 600 },
    });
  });

  test('founder relabels deploy to the cloud-first framing', async ({ page }) => {
    await gotoCompletedAsRole(page, 'founder');
    await expect(
      page
        .getByTestId('onb-checklist-deploy')
        .getByText('Connect Visivo Cloud + share with your team')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('onb-checklist-connect_source')
        .getByText('Connect Stripe, Postgres, or upload a CSV')
    ).toBeVisible();
  });

  test('other (just exploring) lands on the lowest-friction set', async ({ page }) => {
    await gotoCompletedAsRole(page, 'other');
    const ids = await rowIds(page);
    expect(ids).toEqual([
      'connect_source',
      'build_dashboard',
      'view_project',
      'connect_cloud',
    ]);
  });
});
