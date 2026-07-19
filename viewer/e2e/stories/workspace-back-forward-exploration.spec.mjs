/**
 * Story: Browser Back/Forward across destinations and exploration tabs
 * (e2e-gap-review.md finding #15).
 *
 * `Workspace.jsx`'s URL→store `useEffect` (keyed on `syncedTargetRef`) is
 * the ONLY code path that reacts to browser back/forward and deep links —
 * its own comment says so verbatim: "still needed for browser back/forward
 * and deep links, which never call [openWorkspaceTab/openWorkspaceView]".
 * Every INTERACTIVE transition (a click, a keyboard shortcut) double-writes
 * the store directly AND the URL synchronously (the VIS-1050 fix), so this
 * effect is normally just re-confirming state that's already correct. A
 * real `page.goBack()`/`page.goForward()` is the one gesture that has never
 * exercised this effect being the SOLE writer, end to end, against a real
 * sandbox — confirmed absent from the suite (grep for `goBack`/`goForward`
 * across every spec file returns nothing prior to this file).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=backForward VISIVO_SANDBOX_BACKEND_PORT=8048 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3048 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3048 npx playwright test workspace-back-forward-exploration
 *
 * Runs in playwright.config.mjs's `exploration-mutations` project (serial,
 * no retries) — mints real backend exploration records, same reasoning as
 * exploration-lifecycle.spec.mjs.
 */
import { test, expect } from '@playwright/test';
import { typeSql } from '../helpers/explorer.mjs';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const API = BASE_URL.replace(':3001', ':8001');

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

async function waitForBackendDraftSql(page, id, expectedSql, timeout = 30000) {
  await expect(async () => {
    const res = await page.request.get(`${API}/api/explorations/${id}/`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    const sql = data?.draft?.queries?.[0]?.sql;
    expect(sql).toBe(expectedSql);
  }).toPass({ timeout });
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

test.describe('Browser Back/Forward walks destinations + exploration tabs (Explore 2.0)', () => {
  // exploration-lifecycle.spec.mjs's own file header explains why: this
  // project runs concurrently with `parallel`'s many workers against the
  // same :8001 Flask dev server, so a slow debounced-sync round-trip under
  // combined load needs real headroom, not a tight guess — mirrors that
  // file's identical rationale for its own multi-step tests.
  test.describe.configure({ timeout: 90000 });

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

  test('Back/Forward walks Explorer Home -> exploration -> Project -> chart tab and never loses exploration state', async ({
    page,
  }) => {
    // History entry 0: Explorer Home (initial goto).
    await gotoExplorerHome(page);

    // History entry 1: a real exploration, with a distinctive persisted edit.
    const id = await newExploration(page);
    await typeSqlReliably(page, 'SELECT 111 AS back_forward_marker');
    await expect(page.getByTestId(`workspace-tab-dirty-exploration:${id}`)).not.toBeVisible({
      timeout: 10000,
    });
    await waitForBackendDraftSql(page, id, 'SELECT 111 AS back_forward_marker');

    // History entry 2: switch to Project (parks the exploration tab, open
    // but unfocused).
    await page.getByTestId('workspace-view-switcher-project').click();
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
    await page.waitForURL('**/workspace', { timeout: 10000 });
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toBeVisible();
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toHaveAttribute(
      'data-active',
      'false'
    );

    // History entry 3: open a Library chart tab.
    const chartHeader = page.getByTestId('library-subsection-chart-header');
    const chartRow = page.getByTestId('library-row-chart-simple-scatter-chart');
    if (!(await chartRow.isVisible().catch(() => false))) {
      await chartHeader.hover();
      await chartHeader.click();
    }
    await expect(chartRow).toBeVisible({ timeout: 10000 });
    await chartRow.click();
    await expect(page.getByTestId('workspace-tab-chart:simple-scatter-chart')).toHaveAttribute(
      'data-active',
      'true'
    );
    await page.waitForURL(/[?&]edit=chart%3Asimple-scatter-chart/, { timeout: 10000 });

    // --- Walk BACK through history: 3 -> 2 -> 1 -> 0 ---

    // Back to entry 2: Project, exploration still parked (open, unfocused).
    await page.goBack();
    await page.waitForURL('**/workspace', { timeout: 10000 });
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'true'
    );
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toBeVisible();

    // Back to entry 1: the exploration re-activates, SQL intact — the ONE
    // thing the URL→store effect (and nothing else) drives here.
    await page.goBack();
    await page.waitForURL(new RegExp(`/workspace/exploration/${id}$`), { timeout: 10000 });
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.view-lines').first()).toContainText('back_forward_marker', {
      timeout: 10000,
    });
    const activeViewAfterBack = await page.evaluate(
      () => window.useStore.getState().workspaceActiveView
    );
    expect(activeViewAfterBack).toBe('explorer');

    // Back to entry 0: bare Explorer Home gallery.
    await page.goBack();
    await page.waitForURL(/\/workspace\/exploration$/, { timeout: 10000 });
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 15000 });

    // --- Walk FORWARD back through history: 0 -> 1 -> 2 -> 3 ---

    await page.goForward();
    await page.waitForURL(new RegExp(`/workspace/exploration/${id}$`), { timeout: 10000 });
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.view-lines').first()).toContainText('back_forward_marker', {
      timeout: 10000,
    });

    await page.goForward();
    await page.waitForURL('**/workspace', { timeout: 10000 });
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();

    await page.goForward();
    await page.waitForURL(/[?&]edit=chart%3Asimple-scatter-chart/, { timeout: 10000 });
    await expect(page.getByTestId('workspace-tab-chart:simple-scatter-chart')).toHaveAttribute(
      'data-active',
      'true'
    );
    // The exploration tab is still there, just parked — round-tripping
    // through the whole history never dropped it from the strip.
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toBeVisible();
  });

  test('pressing browser Back while a dirty-close confirmation is pending dismisses it, not orphans it (combines with #5)', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeSql(page, 'SELECT 222 AS marker');
    await expect(page.getByTestId(`workspace-tab-dirty-exploration:${id}`)).toBeVisible({
      timeout: 3000,
    });

    const closeBtn = page.getByTestId(`workspace-tab-close-exploration:${id}`);
    await closeBtn.hover();
    await closeBtn.click();
    await expect(page.getByTestId('tab-close-confirm-dialog')).toBeVisible();

    // Browser Back — a control no keydown/click handler can intercept —
    // instead of clicking "Keep editing"/"Close without saving".
    await page.goBack();
    await page.waitForURL(/\/workspace\/exploration$/, { timeout: 10000 });
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId('tab-close-confirm-dialog')).not.toBeVisible();
    await expect(page.getByTestId('tab-close-confirm-backdrop')).not.toBeVisible();
    const pending = await page.evaluate(() => window.useStore.getState().workspacePendingCloseTabId);
    expect(pending).toBeNull();
  });
});
