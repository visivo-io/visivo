/**
 * Story: Empty-state CTAs
 *
 * Validates that the empty-state messages on Explorer, Lineage, Editor, and
 * Project routes have actionable CTAs that open the source-creation modal
 * when the project has no objects.
 *
 * Precondition: An empty-project sandbox must be running on the port
 * configured below. Default is :3013 (frontend) / :8013 (backend) pointed
 * at viewer/e2e/fixtures/empty-project. Start it with:
 *
 *   VISIVO_SANDBOX_NAME=empty \
 *   VISIVO_SANDBOX_BACKEND_PORT=8013 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3013 \
 *   VISIVO_SANDBOX_PROJECT_DIR="$PWD/viewer/e2e/fixtures/empty-project" \
 *   bash scripts/sandbox.sh start
 *
 * Then run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3013 \
 *     npx playwright test e2e/stories/empty-state-cta.spec.mjs --reporter=list
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3013';
const ROUTE_TIMEOUT = 15000;

test.describe('Empty-state CTAs', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);
  test.use({ baseURL: BASE_URL });

  test('Explorer surfaces Add Source CTA when project is empty', async ({ page }) => {
    await page.goto('/explorer');
    await page.waitForLoadState('networkidle');

    // The empty-state CTA renders inside the left panel object list.
    const cta = page.getByTestId('empty-state-cta').first();
    await expect(cta).toBeVisible({ timeout: ROUTE_TIMEOUT });
    await expect(cta).toContainText('No data sources yet');
    await expect(page.getByTestId('empty-state-primary').first()).toHaveText('Add Source');
  });

  test('Lineage surfaces Add Source CTA when project is empty', async ({ page }) => {
    await page.goto('/lineage');
    await page.waitForLoadState('networkidle');

    const cta = page.getByTestId('empty-state-cta').first();
    await expect(cta).toBeVisible({ timeout: ROUTE_TIMEOUT });
    await expect(cta).toContainText('No sources or models yet');
    await expect(page.getByTestId('empty-state-primary').first()).toHaveText('Add Source');
  });

  test('Editor surfaces Add Source + Show me the FAB CTAs when project is empty', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    const cta = page.getByTestId('empty-state-cta').first();
    await expect(cta).toBeVisible({ timeout: ROUTE_TIMEOUT });
    await expect(cta).toContainText('Your project is empty');
    await expect(page.getByTestId('empty-state-primary').first()).toHaveText('Add Source');
    await expect(page.getByTestId('empty-state-secondary').first()).toHaveText('Show me the FAB');
  });

  test('Project surfaces Add Source CTA when no dashboards exist', async ({ page }) => {
    await page.goto('/project-new');
    await page.waitForLoadState('networkidle');

    const cta = page.getByTestId('empty-state-cta').first();
    await expect(cta).toBeVisible({ timeout: ROUTE_TIMEOUT });
    await expect(cta).toContainText('No dashboards yet');
    await expect(page.getByTestId('empty-state-primary').first()).toHaveText('Add Source');
  });

  test('Clicking Add Source opens the source-creation modal', async ({ page }) => {
    await page.goto('/explorer');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('empty-state-primary').first().click();

    const modal = page.getByTestId('source-creation-modal');
    await expect(modal).toBeVisible({ timeout: ROUTE_TIMEOUT });

    // Close it again so subsequent tests start fresh.
    await page.getByTestId('source-creation-modal-close').click();
    await expect(modal).not.toBeVisible({ timeout: ROUTE_TIMEOUT });
  });
});
