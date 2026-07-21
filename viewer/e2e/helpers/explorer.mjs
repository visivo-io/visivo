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
 * Put the keyboard caret in the Monaco editor.
 *
 * Do NOT click `.view-lines`. Monaco stacks presentational overlays
 * (`.scroll-decoration`, the scrollable-element container) above the line
 * area, and which one sits under the cursor depends on the editor's scroll
 * state at that instant — so a click there is hit-test roulette. It usually
 * wins and occasionally spends its whole timeout losing:
 *
 *     locator.click: Timeout 10000ms exceeded.
 *       - <div class="scroll-decoration"> intercepts pointer events
 *
 * (Observed in a gate run on `exploration-cross-tab-concurrency`, where two
 * live contexts make the editor more likely to be mid-scroll-settle.)
 *
 * Monaco's real keyboard target is a dedicated hidden element. Focusing it
 * directly skips hit-testing altogether, so no overlay can intercept it. Every
 * caller here follows up with select-all + type, so the caret position a click
 * would have set is irrelevant.
 *
 * WHICH element that is depends on the Monaco build. The version bundled here
 * uses the EditContext API and focuses `div.native-edit-context` (tabIndex 0);
 * its only `<textarea>` is `.ime-text-area`, which is NOT the focus target —
 * targeting `textarea.inputarea` (the pre-EditContext name, and what most
 * Monaco-testing advice online still says) matches nothing at all here. Both
 * are listed so this keeps working across a Monaco upgrade in either
 * direction, and the assertion below fails loudly rather than silently typing
 * into the void if a future build renames them again.
 */
const MONACO_INPUT = '.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea';

export async function focusSqlEditor(page, { timeout = 10000 } = {}) {
  const input = page.locator(MONACO_INPUT).first();
  await input.waitFor({ state: 'attached', timeout });
  await input.focus();
  await page.waitForFunction(
    sel => !!document.activeElement && document.activeElement.matches(sel),
    MONACO_INPUT,
    { timeout: 5000 }
  );
}

/**
 * Type SQL into the Monaco editor, replacing whatever is there.
 *
 * Self-verifying: keystrokes only reach the document if the editor genuinely
 * holds focus, and `setActiveModelSql` no-ops when there is no active model
 * (explorerStore.js) — so a mistimed call USED TO TYPE INTO THE VOID and
 * return happily, surfacing much later as an empty `draft.queries[0].sql` in
 * whatever backend assertion came next. Several callers had grown their own
 * private "did it land? then type again" wrapper around this; that check
 * belongs here, once, where it can also fail loudly instead of leaving the
 * caller to discover the emptiness three steps downstream.
 */
export async function typeSql(page, sql) {
  const attempt = async () => {
    await focusSqlEditor(page);
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+a`);
    // Brief pause to let Monaco process the select-all before typing
    await page.waitForTimeout(100);
    await page.keyboard.type(sql, { delay: 5 });
    // Monaco's onChange → store write is not synchronous with the last
    // keystroke; poll rather than sample once.
    return page
      .waitForFunction(
        expected => {
          const s = window.useStore?.getState?.();
          const name = s?.explorerActiveModelName;
          return !!name && s.explorerModelStates?.[name]?.sql === expected;
        },
        sql,
        { timeout: 5000 }
      )
      .then(
        () => true,
        () => false
      );
  };

  if (await attempt()) return;
  if (await attempt()) return;
  throw new Error(
    `typeSql: the editor never took "${sql}" (two attempts). The active model's ` +
      `sql is still ${JSON.stringify(
        await page.evaluate(() => {
          const s = window.useStore?.getState?.();
          return s?.explorerModelStates?.[s?.explorerActiveModelName]?.sql ?? null;
        })
      )} — check that an active model exists before typing.`
  );
}

/**
 * Run the current SQL query via the Run button.
 *
 * Scoped to `[data-onb-target="sql-run-button"]` (SQLEditor.jsx's stable
 * anchor) rather than `getByRole('button', { name: 'Run' })` — the latter's
 * default substring+case-insensitive name match also resolves a not-yet-run
 * query chip whose accessible name is "Not yet run <query> Options for
 * <query>" (ExplorationQueryChips.jsx), which contains "run" too. Integration
 * gate regression (Explore 2.0 Phase 3b): fine for the old standalone
 * `/explorer` route (no chip row existed there), but a real ambiguity once a
 * fresh exploration's query chip is on the same page as the Run button.
 */
export async function runQuery(page) {
  const runButton = page.locator('[data-onb-target="sql-run-button"]');
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
