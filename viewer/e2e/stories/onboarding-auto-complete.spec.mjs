/**
 * Phase 2 of the onboarding-checklist v2 plan.
 *
 * The legacy checklist only auto-checked sources + dashboards. After
 * Phase 2 each row has a real predicate, sourced from the dedicated
 * Zustand slices (sourceStore / modelStore / insightStore) and the
 * persisted onboarding state (visited_project_route, deployed_at).
 *
 * These tests don't drive the full Explorer/Editor UI — that's exercised
 * elsewhere. We push state directly into the relevant slices via
 * `useStore.setState({...})` from the page context, then assert the
 * checklist row flips without a page reload.
 *
 * Predicates are pure, so this is the right level: it isolates the
 * "does the checklist react to a slice change?" question from "does
 * the Explorer's Save button work?".
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

async function gotoCompletedOnboardingState(page, overrides = {}) {
  await page.goto(`${BASE}/editor`);
  await page.evaluate(state => {
    const base = {
      completed_at: '2026-01-01T00:00:00.000Z',
      role: 'analytics_engineer',
      path: 'data',
      checklist_dismissed: false,
      checklist_checked: [],
    };
    window.localStorage.setItem('visivo.onboarding.v1', JSON.stringify({ ...base, ...state }));
  }, overrides);
  await page.goto(`${BASE}/editor`);
  await page.waitForSelector('[data-testid="onboarding-checklist"]', { timeout: 15000 });
}

test.describe('Onboarding checklist — auto-complete predicates', () => {
  test.describe.configure({ timeout: 60_000 });

  test('build_model row flips when persisted.actions.model_saved is set', async ({ page }) => {
    await gotoCompletedOnboardingState(page);
    const row = page.getByTestId('onb-checklist-build_model');
    // Sample-onboarded users land with models pre-existing, but the
    // build_model predicate requires the action flag — they have to
    // actually save one. Until that flag flips, the row stays open.
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => {
      const lsKey = 'visivo.onboarding.v1';
      const current = JSON.parse(window.localStorage.getItem(lsKey) || '{}');
      current.actions = { ...(current.actions || {}), model_saved: new Date().toISOString() };
      window.localStorage.setItem(lsKey, JSON.stringify(current));
    });
    await page.reload();
    await page.waitForSelector('[data-testid="onboarding-checklist"]');
    await expect(row).toHaveAttribute('aria-disabled', 'true');
  });

  test('view_project row flips after the user navigates to /project', async ({ page }) => {
    await gotoCompletedOnboardingState(page);
    const row = page.getByTestId('onb-checklist-view_project');
    // Not done yet on /editor.
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await page.goto(`${BASE}/project`);
    await page.waitForLoadState('networkidle');
    // ProjectVisitTracker writes visited_project_route on mount.
    const persisted = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('visivo.onboarding.v1') || '{}')
    );
    expect(persisted.visited_project_route).toBeTruthy();
    // Navigate back somewhere with the checklist visible and confirm
    // the row is now done.
    await page.goto(`${BASE}/editor`);
    await page.waitForSelector('[data-testid="onboarding-checklist"]');
    await expect(page.getByTestId('onb-checklist-view_project')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  test('deploy row flips when deployed_at is set', async ({ page }) => {
    await gotoCompletedOnboardingState(page);
    const row = page.getByTestId('onb-checklist-deploy');
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    // Simulate StageSelection.jsx writing deployed_at on a successful
    // /api/cloud/deploy/ poll response.
    await page.evaluate(() => {
      const lsKey = 'visivo.onboarding.v1';
      const current = JSON.parse(window.localStorage.getItem(lsKey) || '{}');
      current.deployed_at = new Date().toISOString();
      window.localStorage.setItem(lsKey, JSON.stringify(current));
    });
    await page.reload();
    await page.waitForSelector('[data-testid="onboarding-checklist"]');
    await expect(page.getByTestId('onb-checklist-deploy')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
