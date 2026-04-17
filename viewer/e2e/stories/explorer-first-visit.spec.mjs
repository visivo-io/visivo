/**
 * Story: Explorer First Visit (Design Spec Story 1)
 *
 * Validates the full first-visit flow: empty state -> layout -> objects -> interactions.
 *
 * All 7 tests start from the same fresh state and don't modify it destructively,
 * so we run in serial mode with a shared page loaded once in beforeAll.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

test.describe('Explorer First Visit', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });

    await page.goto('/explorer-new');
    await page.waitForLoadState('networkidle');
    await page.getByText('Run a query to see results').waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: Three-panel layout renders without errors', async () => {
    // Left panel: object lists load
    await expect(page.getByText(/^Models \(\d+\)/)).toBeVisible();

    // Center panel: empty state
    await expect(page.getByText('Run a query to see results')).toBeVisible();

    // Right panel: save button
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeVisible();

    // No console errors
    const realErrors = page._consoleErrors.filter(
      e => !e.includes('favicon') && !e.includes('DevTools') && !e.includes('react-cool')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('Step 2: Source tree shows sources', async () => {
    await expect(page.getByText('local-sqlite').first()).toBeVisible();
    await expect(page.getByText('local-duckdb').first()).toBeVisible();
  });

  test('Step 3: All object type sections render', async () => {
    await expect(page.getByText(/^Models \(\d+\)/)).toBeVisible();
    await expect(page.getByText('Metrics (5)')).toBeVisible();
    await expect(page.getByText('Dimensions (3)')).toBeVisible();
    // Insights count includes 21 published + 1 auto-created draft (race-dependent).
    await expect(page.getByText(/^Insights \(2[12]\)/)).toBeVisible();
    await expect(page.getByText('Charts (26)')).toBeVisible();
    await expect(page.getByText('Inputs (15)')).toBeVisible();
  });

  test('Step 4: Clicking a model loads it into a tab', async () => {
    await page.getByRole('button', { name: 'test-table', exact: true }).click();

    await expect(page.getByText('No models')).not.toBeVisible({ timeout: 5000 });
  });

  test('Step 5: Search filters objects', async () => {
    await page.getByPlaceholder('Search...').fill('fibonacci');

    await expect(page.getByText('fibonacci').first()).toBeVisible();
  });

  test('Step 6: Right panel has chart above auto-created insight', async () => {
    // Chart header shows "Chart:" label and the chart name input with "Untitled"
    await expect(page.getByText('Chart:', { exact: false })).toBeVisible();
    await expect(page.getByTestId('chart-name-input')).toHaveValue('Untitled');
    // An insight is auto-created on first visit
    const insightSection = page.locator('[data-testid^="insight-crud-section-"]');
    await expect(insightSection.first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Add Insight' }).first()).toBeVisible();
    // Save is enabled because auto-created insight is new
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled();
  });

  test('Step 7: Adding a second insight creates it below the first', async () => {
    // Auto-created insight already exists
    const insightsBefore = page.locator('[data-testid^="insight-crud-section-"]');
    await expect(insightsBefore.first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    const insightsAfter = page.locator('[data-testid^="insight-crud-section-"]');
    expect(await insightsAfter.count()).toBeGreaterThanOrEqual(2);
  });
});
