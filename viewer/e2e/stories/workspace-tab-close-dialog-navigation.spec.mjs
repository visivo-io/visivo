/**
 * Story: Tab-close confirmation survives navigation away (cross-PR #518 x
 * #519, e2e-gap-review.md finding #5).
 *
 * `requestCloseWorkspaceTab` parks a dirty tab's id in
 * `workspacePendingCloseTabId` so `TabCloseConfirmDialog` (mounted at the
 * shell level, inside `TabStrip.jsx` — never swapped by `MiddlePane`) can
 * ask "Keep editing / Close without saving" first. Before the fix landed
 * alongside this story, ONLY `confirmCloseWorkspaceTab`/
 * `cancelCloseWorkspaceTab`/`closeWorkspaceTab`'s own id-match guard ever
 * cleared that pending id — `activateWorkspaceTab`/`activateWorkspaceView`
 * (the write path behind every OTHER navigation: a ViewSwitcher click, a
 * Library row open, a tab click, Cmd+1/2/3) never touched it. Navigating
 * away while the dialog was pending left it floating over whatever new
 * destination/tab the user landed on next.
 *
 * TWO corrections to the finding's literal scenario, made after checking
 * the CURRENT source/DOM (not just the doc, whose reviewer traced an
 * earlier commit):
 *
 *   1. Cmd/Ctrl+1/2/3 while the dialog is open is suppressed ENTIRELY
 *      today by `useWorkspaceTabShortcuts.js`'s `hasBlockingModal()` guard
 *      (added for the unrelated P4-D1 gate — it checks for ANY
 *      `[aria-modal="true"]` element, which `TabCloseConfirmDialog` is).
 *      So Cmd+2 is a documented no-op, not a live reproduction — see the
 *      third test below, which locks in that (separate, already-correct)
 *      behavior instead of asserting a false reproduction.
 *
 *   2. A literal mouse `.click()` on a Library row or ViewSwitcher row
 *      ALSO cannot reach it: `TabCloseConfirmDialog`'s backdrop is
 *      `fixed inset-0 z-[90]` (a real full-viewport overlay, portaled onto
 *      `document.body`, with no z-index anywhere in the shell above it) —
 *      Playwright (and a real mouse) hit-tests the backdrop first, which
 *      calls `cancelClose()` on its own `onPointerDown`. That's a
 *      reasonable incidental mitigation for pointer users, but the dialog
 *      has NO FOCUS TRAP (no keydown/Tab interception at all), so a
 *      keyboard-focused control BEHIND the backdrop still fires its own
 *      click/keydown handler directly — no coordinate hit-test involved.
 *      That's the genuinely still-live reproduction this file drives:
 *      `.focus()` (however focus got there — Tab navigation, assistive
 *      tech, a remembered focus target) + Enter/Space activates the
 *      control underneath, exactly as the finding describes the RESULT
 *      (`activateWorkspaceTab`/`activateWorkspaceView` firing while the
 *      dialog is still parked) even though the literal INPUT differs from
 *      "click a Library row". Browser Back/Forward — genuinely unblocked
 *      by both the backdrop and the keyboard-shortcut guard — is covered
 *      separately in `workspace-back-forward-exploration.spec.mjs`.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=tabCloseDialogNav VISIVO_SANDBOX_BACKEND_PORT=8047 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3047 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3047 npx playwright test workspace-tab-close-dialog-navigation
 *
 * Runs in playwright.config.mjs's `exploration-mutations` project (serial,
 * no retries) — mints a real backend exploration record, same reasoning as
 * exploration-lifecycle.spec.mjs.
 */
import { test, expect } from '@playwright/test';
import { typeSql } from '../helpers/explorer.mjs';
import { BASE_URL, API } from '../helpers/sandbox.mjs';

async function typeSqlReliably(page, sql) {
  await typeSql(page, sql);
  const landed = await page.evaluate(expected => {
    const s = window.useStore.getState();
    const name = s.explorerActiveModelName;
    return !!name && s.explorerModelStates[name]?.sql === expected;
  }, sql);
  if (!landed) {
    await typeSql(page, sql);
  }
}

async function listExplorationIds(page) {
  const res = await page.request.get(`${API}/api/explorations/`).catch(() => null);
  if (!res || !res.ok()) return [];
  const data = await res.json().catch(() => []);
  return (data || []).map(e => e.id);
}

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
}

async function newExploration(page) {
  await page.getByTestId('explorer-home-new-exploration').click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  return new URL(page.url()).pathname.split('/').pop();
}

/** Arm a REAL dirty-close confirmation on exploration `id`: type SQL, wait
 * for the store's real syncStatus to flip dirty, then trigger the × so
 * `requestCloseWorkspaceTab` parks the dialog (never a manually-flipped
 * flag — mirrors the recommended story's own emphasis on a genuine
 * mid-debounce dirty tab). */
async function armDirtyCloseDialog(page, id, sql) {
  // Hold this exploration's draft-sync POST in-flight for as long as the
  // dialog stays armed. The dirty dot mirrors `syncStatus === 'saving'`
  // (ExplorationPane.jsx), so without the hold the debounced write can
  // settle inside the hover→click gap below and the × then closes a CLEAN
  // tab with no dialog at all (observed as a 1-in-N flake under gate load).
  // The REAL pipeline stays live — the write is genuinely in flight, never
  // a manually-flipped flag — and it also makes the callers' later
  // "still dirty" assertions deterministic instead of debounce-window-
  // dependent. Returns an async release(): lets the POST through and
  // removes the route. Callers must await it before any step that needs
  // the write to land, and by test end at the latest.
  let releaseHold = () => {};
  const held = new Promise(resolve => {
    releaseHold = resolve;
  });
  const routePattern = `**/api/explorations/${id}/`;
  await page.route(routePattern, async route => {
    if (route.request().method() === 'POST') await held;
    await route.fallback();
  });

  await typeSqlReliably(page, sql);
  await expect(page.getByTestId(`workspace-tab-dirty-exploration:${id}`)).toBeVisible({
    timeout: 3000,
  });
  const closeBtn = page.getByTestId(`workspace-tab-close-exploration:${id}`);
  await closeBtn.hover();
  await closeBtn.click();
  await expect(page.getByTestId('tab-close-confirm-dialog')).toBeVisible();

  return async () => {
    releaseHold();
    await page.unroute(routePattern);
  };
}

/** Activate a control BEHIND the dialog's full-viewport backdrop via
 * keyboard focus + Enter — see the file header's correction #2. A plain
 * `.click()` here hits the backdrop instead (no focus trap needed to
 * explain that: it's pure pointer-event hit-testing), so this is the
 * actual reachable path today, not a testing artifice. */
async function focusAndActivate(locator) {
  await locator.focus();
  await locator.press('Enter');
}

test.describe('Tab-close confirmation survives navigation away (cross-PR #518 x #519)', () => {
  // Headroom for combined-load contention against the shared sandbox
  // (mirrors exploration-lifecycle.spec.mjs's own rationale) — each test
  // mints/arms 2-3 explorations in sequence.
  test.describe.configure({ timeout: 60000 });

  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    const idsAfter = await listExplorationIds(page);
    for (const id of idsAfter.filter(i => !idsBeforeTest.includes(i))) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('activating the ViewSwitcher (destination switch) behind the open dialog dismisses it, not orphans it', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const releaseArm = await armDirtyCloseDialog(page, id, 'SELECT 1 AS one');

    const semanticRow = page.getByTestId('workspace-view-switcher-semantic-layer');
    await focusAndActivate(semanticRow);

    // The new destination is showing...
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible();
    // ...and the dialog must NOT be floating over it.
    await expect(page.getByTestId('tab-close-confirm-dialog')).not.toBeVisible();
    await expect(page.getByTestId('tab-close-confirm-backdrop')).not.toBeVisible();

    // The store's pending-close id is genuinely cleared, not just visually
    // hidden behind something else.
    const pending = await page.evaluate(() => window.useStore.getState().workspacePendingCloseTabId);
    expect(pending).toBeNull();

    // The tab itself is untouched — still open, still dirty (the dialog
    // was dismissed by navigation, not by "Close without saving").
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toBeVisible();
    await expect(page.getByTestId(`workspace-tab-dirty-exploration:${id}`)).toBeVisible();

    await releaseArm();
  });

  test('activating a Library row (opening a different tab) behind the open dialog dismisses it, not orphans it', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const releaseArm1 = await armDirtyCloseDialog(page, id, 'SELECT 2 AS two');

    // Navigate to Project first (behind the dialog) so the Library's chart
    // rows are on-screen underneath it.
    await focusAndActivate(page.getByTestId('workspace-view-switcher-project'));
    await expect(page.getByTestId('tab-close-confirm-dialog')).not.toBeVisible();
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();

    // Re-arm the dialog on a fresh dirty exploration tab, then activate a
    // Library chart row — the actual "click a Library row to open a
    // different tab" scenario from the finding, reached via keyboard focus
    // (see file header for why a literal click can't reach it).
    await focusAndActivate(page.getByTestId('workspace-view-switcher-explorer'));
    const id2 = await newExploration(page);
    const releaseArm2 = await armDirtyCloseDialog(page, id2, 'SELECT 3 AS three');

    await focusAndActivate(page.getByTestId('workspace-view-switcher-project'));
    await expect(page.getByTestId('tab-close-confirm-dialog')).not.toBeVisible();

    const header = page.getByTestId('library-subsection-chart-header');
    const row = page.getByTestId('library-row-chart-simple-scatter-chart');
    if (!(await row.isVisible().catch(() => false))) {
      await header.hover();
      await header.click();
    }
    await expect(row).toBeVisible({ timeout: 10000 });

    // Re-arm the dialog one more time so THIS activation is the one under
    // test, then activate the chart row via focus + Enter (the row's own
    // onKeyDown handles Enter/Space directly, per LibraryRow.jsx).
    await focusAndActivate(page.getByTestId('workspace-view-switcher-explorer'));
    const id3 = await newExploration(page);
    const releaseArm3 = await armDirtyCloseDialog(page, id3, 'SELECT 4 AS four');
    await focusAndActivate(row);

    await expect(page.getByTestId('workspace-tab-chart:simple-scatter-chart')).toHaveAttribute(
      'data-active',
      'true'
    );
    await expect(page.getByTestId('tab-close-confirm-dialog')).not.toBeVisible();
    await expect(page.getByTestId('tab-close-confirm-backdrop')).not.toBeVisible();
    const pending = await page.evaluate(() => window.useStore.getState().workspacePendingCloseTabId);
    expect(pending).toBeNull();

    await releaseArm1();
    await releaseArm2();
    await releaseArm3();
  });

  test('Cmd+2 while the dialog is open is suppressed entirely (hasBlockingModal) — documents the current, already-correct guard', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const releaseArm = await armDirtyCloseDialog(page, id, 'SELECT 5 AS five');

    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+2' : 'Control+2');

    // Nothing changed — the shortcut was swallowed by hasBlockingModal, so
    // the dialog is still up over the SAME exploration tab (no destination
    // switch actually happened).
    await expect(page.getByTestId('tab-close-confirm-dialog')).toBeVisible();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible();

    // Clean up via the dialog's own safe action so the test leaves no
    // pending-close state behind.
    await page.getByTestId('tab-close-confirm-cancel').click();
    await expect(page.getByTestId('tab-close-confirm-dialog')).not.toBeVisible();

    await releaseArm();
  });
});
