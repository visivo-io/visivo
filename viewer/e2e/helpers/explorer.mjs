/**
 * Shared helpers for Explorer E2E tests.
 *
 * All explorer tests run against sandbox at :3001/:8001.
 * Integration project has: 8 models, 5 metrics, 3 dimensions, 20 insights, 26 charts, 15 inputs.
 * Sources: local-sqlite (2 tables), local-duckdb (3 tables), and others.
 */

export const WAIT_FOR_PAGE = 15000;
export const DEFAULT_TIMEOUT = 60000;

/**
 * Navigate to explorer and wait for full render.
 * Waits until the "Run a query to see results" empty state text is visible,
 * which means all panels have rendered and data has loaded.
 */
export async function loadExplorer(page) {
  await page.goto('/explorer-new');
  await page.waitForLoadState('networkidle');
  await page.getByText('Run a query to see results').waitFor({ timeout: WAIT_FOR_PAGE });
}

/**
 * Load explorer and click a model from the left panel to create a tab.
 */
export async function loadExplorerWithModel(page, modelName) {
  await loadExplorer(page);
  await page.getByRole('button', { name: modelName, exact: true }).click();
  // Wait for the model tab to actually load (editor area becomes available)
  await page.locator('.view-lines').first().waitFor({ timeout: 10000 });
}

/**
 * Load explorer and click a chart from the left panel.
 */
export async function loadExplorerWithChart(page, chartName) {
  await loadExplorer(page);
  await page.getByRole('button', { name: chartName, exact: true }).click();
  // Wait for the chart to load (chart name input becomes visible in right panel)
  await page.locator('[data-testid="chart-name-input"]').waitFor({ timeout: 10000 });
}

/**
 * Create a new empty model tab and ensure a source is selected.
 * New tabs now auto-select the project default source (or first available).
 * This helper optionally overrides to a specific source if needed.
 */
export async function createModelWithSource(page, sourceName = null) {
  await page.getByRole('button', { name: 'Add model' }).click();

  // Wait for the new model tab to appear (editor area becomes available)
  await page.locator('.view-lines').first().waitFor({ timeout: 10000 });

  // Override source if a specific one was requested
  if (sourceName) {
    const sourceSelect = page.locator('select').first();
    if (await sourceSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sourceSelect.selectOption(sourceName);
    }
  }
}

/**
 * Type SQL into the Monaco editor.
 * Monaco renders with a scrollable overlay that intercepts pointer events.
 * We click the visible line area, select all, then type to replace.
 */
export async function typeSql(page, sql) {
  // Click the Monaco editor's visible line area
  const editorArea = page.locator('.view-lines');
  await editorArea.first().click({ timeout: 10000 });

  // Select all existing content and replace
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+a`);
  // Brief pause to let Monaco process the select-all before typing
  await page.waitForTimeout(100);
  await page.keyboard.type(sql, { delay: 5 });
}

/**
 * Run the current SQL query via the Run button.
 */
export async function runQuery(page) {
  const runButton = page.getByRole('button', { name: 'Run' });
  await runButton.click();
  // Wait for either query results (row count) or error state
  await Promise.race([
    page.locator('text=/\\d+ rows?/').first().waitFor({ timeout: 15000 }),
    page.locator('text=/error/i').first().waitFor({ timeout: 15000 }),
  ]);
}

/**
 * Filter console errors, ignoring known non-issues.
 */
export function filterRealErrors(errors) {
  return errors.filter(
    e =>
      !e.includes('favicon') &&
      !e.includes('DevTools') &&
      !e.includes('react-cool') &&
      !e.includes('Download the React DevTools')
  );
}
