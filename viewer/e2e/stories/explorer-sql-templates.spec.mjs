/**
 * Story: Explorer SQL Templates
 *
 * Validates the empty-editor experience: when a source is selected but the
 * editor is empty, an actionable card with starter SQL templates is shown.
 * Also validates that picking a template populates the editor.
 *
 * Precondition: Sandbox running on the configured frontend port.
 */

import { test, expect } from '@playwright/test';

// Allow overriding the frontend port via env var so this spec can target an
// isolated sandbox (e.g. :3016) without colliding with the default :3001
// sandbox used by the rest of the suite.
const FRONTEND_PORT = process.env.VISIVO_SANDBOX_FRONTEND_PORT || '3001';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${FRONTEND_PORT}`;
test.use({ baseURL: BASE_URL });

const WAIT_FOR_PAGE = 15000;

async function loadExplorer(page) {
  await page.goto('/explorer');
  await page.waitForLoadState('networkidle');
  // Either the empty-editor overlay or the regular empty results message can
  // appear depending on whether there's an auto-loaded model with SQL.
  await Promise.race([
    page.locator('[data-testid="empty-editor-overlay"]').first().waitFor({ timeout: WAIT_FOR_PAGE }),
    page.getByText('Run a query to see results').waitFor({ timeout: WAIT_FOR_PAGE }),
  ]);
}

async function openFreshModelTab(page) {
  // Add a new model tab — it auto-selects the project default source
  // and starts with an empty editor, so the overlay should be visible.
  await page.getByRole('button', { name: 'Add model' }).click();
  // Wait for editor to render
  await page.locator('.view-lines').first().waitFor({ timeout: 10000 });
}

test.describe('Explorer SQL Templates', () => {
  test.setTimeout(60000);

  test('Step 1: empty-editor overlay shows on a fresh model tab', async ({ page }) => {
    await loadExplorer(page);
    await openFreshModelTab(page);

    // The empty-editor card should be visible because the editor is empty
    // and a default source is auto-selected.
    await expect(page.locator('[data-testid="empty-editor-overlay"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText('Start a query to see results')).toBeVisible();
    await expect(page.getByTestId('sql-template-menu-trigger')).toBeVisible();
  });

  test('Step 2: clicking the template menu opens it with all six templates', async ({
    page,
  }) => {
    await loadExplorer(page);
    await openFreshModelTab(page);

    await page.getByTestId('sql-template-menu-trigger').click();

    await expect(page.getByTestId('sql-template-menu-list')).toBeVisible();
    await expect(page.getByTestId('sql-template-select-all')).toBeVisible();
    await expect(page.getByTestId('sql-template-count-by-category')).toBeVisible();
    await expect(page.getByTestId('sql-template-sum-by-month')).toBeVisible();
    await expect(page.getByTestId('sql-template-top-n')).toBeVisible();
    await expect(page.getByTestId('sql-template-join-two')).toBeVisible();
    await expect(page.getByTestId('sql-template-distinct-values')).toBeVisible();
  });

  test('Step 3: picking the "Show all rows" template populates the editor', async ({
    page,
  }) => {
    await loadExplorer(page);
    await openFreshModelTab(page);

    // Open menu and pick the SELECT * starter
    await page.getByTestId('sql-template-menu-trigger').click();
    await page.getByTestId('sql-template-select-all').click();

    // Editor should now contain the template's SELECT * pattern. The editor
    // is Monaco — its content renders within `.view-lines`.
    const editorContent = page.locator('.view-lines').first();
    await expect(editorContent).toContainText('SELECT *', { timeout: 5000 });
    await expect(editorContent).toContainText('LIMIT 100');

    // Take a screenshot for visual verification
    await page.screenshot({
      path: 'e2e/.artifacts/explorer-sql-templates-after-pick.png',
      fullPage: true,
    });
  });

  test('Step 4: empty-editor card is hidden once SQL is present', async ({ page }) => {
    await loadExplorer(page);
    await openFreshModelTab(page);

    // Start in the empty state
    await expect(page.locator('[data-testid="empty-editor-overlay"]')).toBeVisible({
      timeout: 5000,
    });

    // Pick a template — that populates the editor
    await page.getByTestId('sql-template-menu-trigger').click();
    await page.getByTestId('sql-template-select-all').click();

    // The empty-editor overlay should disappear; the regular "Run a query" hint
    // takes over (since we have SQL but no result yet).
    await expect(page.locator('[data-testid="empty-editor-overlay"]')).not.toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('empty-results')).toBeVisible({ timeout: 5000 });
  });
});
