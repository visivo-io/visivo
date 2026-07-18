/**
 * Story: Exploration lifecycle — create → edit → park → resume → reload
 * (Explore 2.0 Phase 2).
 *
 * Successor to `explorer-chart-loading-deep.spec.mjs` / `explorer-load-
 * chart.spec.mjs`'s resume/reload assertions (ledger: 05-e2e-ledger.md).
 * Covers `specs/plan/explorer-workspace-unification/01-ux-spec.md` §4 and
 * `02-architecture.md` §1/§8's state-bridge guarantees end to end:
 *
 *   1. Create → edit SQL → park (close the tab) → resume (Home → Open) →
 *      the SQL survives — park is LOSSLESS.
 *   2. Reload while the exploration tab is active restores it from the URL
 *      AND the draft (backend-persisted, not localStorage).
 *   3. Two explorations open in two (sequential) tabs never bleed state into
 *      each other — editing one, switching to the other, and back shows each
 *      exploration's OWN SQL, not the other's.
 *   4. Deep-linking `/workspace/exploration/:id` directly sets
 *      `workspaceActiveView` to 'explorer' (01-ux-spec.md §1's deep-link
 *      rule); closing that freshly-deep-linked tab lands on Explorer Home,
 *      not Project.
 *   5. An unknown id renders a clean not-found state (never a crash) —
 *      explorations mount outside ObjectCanvasFrame (D5).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationLifecycle VISIVO_SANDBOX_BACKEND_PORT=8044 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3044 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3044 npx playwright test exploration-lifecycle
 *
 * Runs in playwright.config.mjs's `exploration-mutations` project (serial,
 * no retries) CONCURRENTLY with `parallel`'s many workers against the same
 * :8001 Flask dev server — the `workspace-middle-exploration`/
 * `workspace-middle-explorer` visibility waits use a 30s (not 15s) timeout
 * to absorb that combined-load contention (CPU + network, since re-opening
 * an ALREADY-fetched exploration needs no new request but still got slow
 * under 5 concurrent Chromium instances) — it's a real latency margin, not
 * a correctness dependency; `test.describe.configure({ timeout: 60000 })`
 * below gives the surrounding multi-step test enough room to match.
 */

import { test, expect } from '@playwright/test';
import { typeSql } from '../helpers/explorer.mjs';

/**
 * `typeSql` + a verify-and-retry guard. Under heavy concurrent-load
 * contention (this project — playwright.config.mjs's `exploration-mutations`
 * — runs alongside `parallel`'s many workers against the same :8001 Flask
 * dev server), a slow `explorerSources` fetch widens the window between
 * `useExplorerWorkbenchInit`'s "auto-create a model tab" effect
 * (viewer/src/components/explorer/useExplorerWorkbenchInit.js) actually
 * landing and the SQL editor being genuinely bound to a model; typing that
 * lands in that window silently vanishes (`setActiveModelSql` no-ops with
 * no active model, explorerStore.js). `newExploration()`'s
 * `explorerActiveModelName` wait closes this for the common case, but
 * couldn't fully guarantee it under observed contention. Verify the store
 * actually captured what was typed and retype once if a stray race ate it,
 * rather than asserting a false negative on infrastructure noise.
 */
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

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
// Explorations are S3'd to a single file-backed repository shared by every
// test in this suite (`.visivo/explorations/` — see ExplorationRepository).
// Runs serially (playwright.config.mjs's `exploration-mutations` project)
// so tests never race each other, but each test still mints real backend
// records; belt-and-suspenders cleanup keeps the directory from growing
// across repeated runs — diff the id list before/after and delete whatever
// a test created.
const API = BASE_URL.replace(':3001', ':8001');

async function listExplorationIds(page) {
  const res = await page.request.get(`${API}/api/explorations/`).catch(() => null);
  if (!res || !res.ok()) return [];
  const data = await res.json().catch(() => []);
  return (data || []).map(e => e.id);
}

/**
 * Poll the BACKEND record (not a client-side proxy signal like the dirty
 * dot) until its persisted draft actually contains `expectedSql` for the
 * exploration's first model query. A hard reload re-fetches from the
 * backend and wipes all in-memory state, so this is the only check that
 * actually guarantees a reload will see the edit — under the combined-load
 * contention this project runs under (file header), the dirty dot clearing
 * (an optimistic client-side `syncStatus` flip) was observed to occasionally
 * land ahead of the real backend write finishing.
 */
async function waitForBackendDraftSql(page, id, expectedSql, timeout = 15000) {
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
  // `useExplorerWorkbenchInit`'s "auto-create a model tab when empty" effect
  // (viewer/src/components/explorer/useExplorerWorkbenchInit.js) still lands
  // asynchronously the very first time a project's sources haven't been
  // fetched yet (a `useLayoutEffect` closes the race once they're cached,
  // but can't outrun the network on a cold load). Typing before it lands
  // would silently vanish — `setActiveModelSql` no-ops with no active model
  // (explorerStore.js) — so wait for a real active model first, the same
  // guard `loadExplorerWithModel` uses for the standalone /explorer page
  // (e2e/helpers/explorer.mjs's `.view-lines`/"Run a query" waits).
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
  // `openWorkspaceTab` (workspaceStore.js) activates the store AND navigates
  // the URL — activation causes this pane's own immediate re-render, but the
  // URL (`history.pushState`, routed through the data router's own
  // navigation pipeline) can lag behind under real load (concurrent
  // Chromium instances). Wait for the URL itself before reading an id out
  // of it.
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  const id = new URL(page.url()).pathname.split('/').pop();
  return id;
}

test.describe('Exploration lifecycle (Explore 2.0 Phase 2)', () => {
  // The global 30s default (playwright.config.mjs) is tight for these
  // multi-step flows (create → type → debounced sync → close/reload →
  // reopen) once combined-load contention (this project runs concurrently
  // with `parallel`'s many workers, see the file-header note) stretches out
  // every round-trip.
  test.describe.configure({ timeout: 60000 });

  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    const idsAfterTest = await listExplorationIds(page);
    const createdIds = idsAfterTest.filter(id => !idsBeforeTest.includes(id));
    for (const id of createdIds) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('create → edit SQL → park (close) → resume from Home → SQL survives (lossless park)', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);

    await typeSqlReliably(page, 'SELECT 1 AS one');
    // Give the debounced draft-sync (workspaceExplorationsStore.js: 600ms
    // live-sync compute + 1000ms backend POST = ~1.6s, not a flat 1200ms
    // guess) a chance to actually clear the dirty flag before we close — a
    // still-dirty tab's × routes through the confirm-dialog guard
    // (`requestCloseWorkspaceTab`), not a direct close.
    // Do NOT assert the dirty dot ever APPEARS — a fast sync can complete
    // before the assertion attaches (observed flake class at the Phase 2
    // gate). The contract is only that sync has SETTLED before we close.
    const dirtyDot = page.getByTestId(`workspace-tab-dirty-exploration:${id}`);
    await expect(dirtyDot).not.toBeVisible({ timeout: 10000 });

    const tabTestId = `workspace-tab-exploration:${id}`;
    const closeBtn = page.getByTestId(`workspace-tab-close-exploration:${id}`);
    await closeBtn.hover();
    await closeBtn.click();
    await expect(page.getByTestId(tabTestId)).not.toBeVisible();
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible();

    // Resume from Home. ROOT CAUSE fixed at the source (workspaceStore.js's
    // `openWorkspaceTab`/`openWorkspaceView`, Workspace.jsx's URL-sync
    // effect): closing a tab then reopening the SAME document navigates the
    // URL to the same string it had before (ids are stable) — under real
    // scheduling this could leave `location.pathname` looking net-unchanged
    // across the whole transition to the URL→store sync `useEffect`, so it
    // never got a dedicated run and the tab silently never reopened.
    // `openWorkspaceTab`/`openWorkspaceView` now activate the store
    // synchronously instead of depending entirely on that deferred effect
    // (VIS-1050 gate). The retry block stays as belt-and-suspenders against
    // an unrelated, garden-variety flake class (a click landing on a
    // detached node mid-re-render) — a user would just click again.
    await expect(async () => {
      // Click only while the card is still visible — if a prior iteration's
      // click already opened the pane (just slower than the inner timeout),
      // the card is gone and re-clicking would deadlock the retry loop.
      const card = page.getByTestId(`exploration-card-${id}-open`);
      if (await card.isVisible()) await card.click();
      await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 30000 });
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 1 AS one', {
      timeout: 10000,
    });
  });

  test('reload while the exploration tab is active restores it from the URL + backend draft', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeSqlReliably(page, 'SELECT 2 AS two');
    // Unlike park/close (which flushes synchronously on unmount, so the
    // optimistic LOCAL store update is enough), a hard reload wipes all
    // in-memory state and re-fetches from the backend — this assertion is
    // only meaningful once the draft has genuinely round-tripped through
    // BOTH debounces (workspaceExplorationsStore.js: 600ms live-sync compute
    // + 1000ms backend POST = ~1.6s, not a flat guess). The tab's dirty dot
    // mirrors `syncStatus` ('saving' -> 'synced'), but that's an optimistic
    // CLIENT-side flip; poll the BACKEND record directly (the actual thing a
    // reload depends on) rather than trust the client's word for it.
    const dirtyDot = page.getByTestId(`workspace-tab-dirty-exploration:${id}`);
    await expect(dirtyDot).not.toBeVisible({ timeout: 10000 });
    await waitForBackendDraftSql(page, id, 'SELECT 2 AS two');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    expect(new URL(page.url()).pathname).toBe(`/workspace/exploration/${id}`);
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 2 AS two', {
      timeout: 10000,
    });
  });

  test('two explorations opened in two tabs never bleed state into each other', async ({ page }) => {
    await gotoExplorerHome(page);
    const idA = await newExploration(page);
    await typeSqlReliably(page, 'SELECT 111 AS a_marker');
    await page.waitForTimeout(1200);

    // Open a SECOND exploration (park A, activate B).
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible();
    const idB = await newExploration(page);
    await typeSqlReliably(page, 'SELECT 222 AS b_marker');
    await page.waitForTimeout(1200);
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 222 AS b_marker');
    await expect(page.locator('.view-lines').first()).not.toContainText('a_marker');

    // Switch back to A via its tab — B's edit must not have leaked into A.
    await page.getByTestId(`workspace-tab-select-exploration:${idA}`).click();
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 111 AS a_marker', {
      timeout: 10000,
    });
    await expect(page.locator('.view-lines').first()).not.toContainText('b_marker');

    // And B again, from A — same isolation guarantee both directions.
    await page.getByTestId(`workspace-tab-select-exploration:${idB}`).click();
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 222 AS b_marker', {
      timeout: 10000,
    });
  });

  test('deep-linking /workspace/exploration/:id sets the active destination to Explorer; closing lands on Explorer Home', async ({
    page,
  }) => {
    // First mint one via Home so we have a real, addressable id.
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await page.getByTestId(`workspace-tab-close-exploration:${id}`).click();

    // Deep-link directly, cold — never having visited Explorer Home first
    // in THIS navigation.
    await page.goto(`${BASE_URL}/workspace/exploration/${id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });

    const activeView = await page.evaluate(() => window.useStore.getState().workspaceActiveView);
    expect(activeView).toBe('explorer');

    const closeBtn = page.getByTestId(`workspace-tab-close-exploration:${id}`);
    await closeBtn.hover();
    await closeBtn.click();
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible();
    await expect(page.getByTestId('workspace-view-switcher-explorer')).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  test('an unknown exploration id renders a clean not-found state, never a crash', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace/exploration/exp_doesnotexist`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration-not-found')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/doesn't exist/i)).toBeVisible();
  });
});
