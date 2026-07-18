/**
 * Shared helpers for Explorer/exploration E2E tests.
 *
 * Explore 2.0 Phase 3b cutover (05-e2e-ledger.md's Helpers table): the
 * standalone `/explorer` route and its `ExplorerLeftPanel`/`ModelTabBar`-
 * driven navigation (`loadExplorer`/`loadExplorerWithModel`/
 * `loadExplorerWithChart`/`createModelWithSource`) are retired along with
 * the components they drove — `/explorer` is now a permanent redirect and
 * every DOM target those helpers clicked no longer exists. Callers that
 * need to open the exploration surface build their own small
 * `gotoExplorerHome`/`newExploration` pair against the new mount (see
 * `exploration-lifecycle.spec.mjs`, `exploration-dnd-pull-in.spec.mjs`,
 * `exploration-build-rail.spec.mjs`, `pill-aggregation.spec.mjs` — all
 * near-identical, kept local rather than factored here since each file
 * already needed its own backend-polling/cleanup helpers too).
 *
 * What survives here is genuinely mount-agnostic: constants, Monaco SQL
 * typing (the editor widget itself is carried forward unchanged), the Run
 * button flow, and the console-error filter.
 */

export const WAIT_FOR_PAGE = 15000;
export const DEFAULT_TIMEOUT = 60000;

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
