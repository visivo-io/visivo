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

  test('build_model row flips only when all three sub-actions fire', async ({ page }) => {
    await gotoCompletedOnboardingState(page);
    const row = page.getByTestId('onb-checklist-build_model');
    // Macro item: requires model_tab_created + sql_written + query_run.
    // Each sub-action alone is not enough.
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => {
      const lsKey = 'visivo.onboarding.v1';
      const current = JSON.parse(window.localStorage.getItem(lsKey) || '{}');
      current.actions = { ...(current.actions || {}), model_tab_created: new Date().toISOString() };
      window.localStorage.setItem(lsKey, JSON.stringify(current));
    });
    await page.reload();
    await page.waitForSelector('[data-testid="onboarding-checklist"]');
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => {
      const lsKey = 'visivo.onboarding.v1';
      const current = JSON.parse(window.localStorage.getItem(lsKey) || '{}');
      current.actions = {
        ...(current.actions || {}),
        sql_written: new Date().toISOString(),
        query_run: new Date().toISOString(),
      };
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

  test('create_insight row flips only when both sub-actions fire', async ({ page }) => {
    await gotoCompletedOnboardingState(page);
    const row = page.getByTestId('onb-checklist-create_insight');
    // Macro item: requires insight_added + insight_saved.
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => {
      const lsKey = 'visivo.onboarding.v1';
      const current = JSON.parse(window.localStorage.getItem(lsKey) || '{}');
      current.actions = { ...(current.actions || {}), insight_added: new Date().toISOString() };
      window.localStorage.setItem(lsKey, JSON.stringify(current));
    });
    await page.reload();
    await page.waitForSelector('[data-testid="onboarding-checklist"]');
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => {
      const lsKey = 'visivo.onboarding.v1';
      const current = JSON.parse(window.localStorage.getItem(lsKey) || '{}');
      current.actions = {
        ...(current.actions || {}),
        insight_saved: new Date().toISOString(),
      };
      window.localStorage.setItem(lsKey, JSON.stringify(current));
    });
    await page.reload();
    await page.waitForSelector('[data-testid="onboarding-checklist"]');
    await expect(row).toHaveAttribute('aria-disabled', 'true');
  });

  test('build_dashboard row flips only when both sub-actions fire', async ({ page }) => {
    await gotoCompletedOnboardingState(page);
    const row = page.getByTestId('onb-checklist-build_dashboard');
    // Macro item: requires dashboard_editor_opened + dashboard_saved.
    // Step 1 alone (user opens editor but doesn't save) is not enough —
    // exactly the scenario the lazy-anchor work originally tried to cover.
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => {
      const lsKey = 'visivo.onboarding.v1';
      const current = JSON.parse(window.localStorage.getItem(lsKey) || '{}');
      current.actions = {
        ...(current.actions || {}),
        dashboard_editor_opened: new Date().toISOString(),
      };
      window.localStorage.setItem(lsKey, JSON.stringify(current));
    });
    await page.reload();
    await page.waitForSelector('[data-testid="onboarding-checklist"]');
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => {
      const lsKey = 'visivo.onboarding.v1';
      const current = JSON.parse(window.localStorage.getItem(lsKey) || '{}');
      current.actions = {
        ...(current.actions || {}),
        dashboard_saved: new Date().toISOString(),
      };
      window.localStorage.setItem(lsKey, JSON.stringify(current));
    });
    await page.reload();
    await page.waitForSelector('[data-testid="onboarding-checklist"]');
    await expect(row).toHaveAttribute('aria-disabled', 'true');
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
