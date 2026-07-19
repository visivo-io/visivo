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

// Playwright runs on the same host as the browser, so process.platform picks
// the right modifier for the page's navigator-based detection (mirrors
// workspace-tabs-shortcuts.spec.mjs's own MOD constant).
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

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

  // e2e-gap-review.md #3 [HIGH·PARTIAL]: the existing lossless-park test above
  // deliberately waits for the dirty dot to CLEAR before closing (its own
  // comment: "the contract is only that sync has SETTLED before we close") —
  // it never drives a close while the REAL syncStatus pipeline (not a
  // manually-flipped flag) is genuinely mid-debounce. `requestCloseWorkspaceTab`
  // (workspaceStore.js) has exactly one behavior for a dirty tab: it ALWAYS
  // raises TabCloseConfirmDialog — there is no "close directly while dirty"
  // door in the UI, so driving a real close through this exact interruption
  // means going through "Close without saving", which (VIS-1081,
  // `discardExploration`) deliberately reverts to the pre-session snapshot
  // BEFORE `ExplorationPane`'s own unmount-cleanup flush re-persists whatever
  // the (now-reverted) legacy store holds. This test proves that interaction
  // is safe even when the debounce is a REAL, in-flight one (not a
  // synthetic/settled one): the discard-revert wins cleanly, the in-flight
  // autosave never races back in to resurrect the discarded edit, and the tab
  // reactivates cleanly afterward with no stuck 'saving'/'error' state.
  test('closing a tab mid-debounce (real syncStatus, via the confirm dialog\'s "Close without saving") reverts cleanly and never resurrects the discarded edit', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);

    await typeSqlReliably(page, 'SELECT 1 AS marker_v1');
    // Poll the REAL store (not a manual flag) until the debounce has
    // genuinely armed — `syncStatus` only flips to 'saving' once
    // ExplorationPane's 600ms live-sync timer has ALREADY fired and called
    // `updateExplorationDraft`, so catching it here guarantees a real
    // backend POST is either in flight or about to be scheduled.
    await page.waitForFunction(
      id => window.useStore.getState().workspaceExplorations.byId[id]?.syncStatus === 'saving',
      id,
      { timeout: 5000 }
    );

    const closeBtn = page.getByTestId(`workspace-tab-close-exploration:${id}`);
    await closeBtn.hover();
    await closeBtn.click();

    // Genuinely dirty at click time -> the confirm dialog, not a direct close.
    const dialog = page.getByTestId('tab-close-confirm-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.getByTestId('tab-close-confirm-close').click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).not.toBeVisible();
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible();

    // The discard reverted to the pre-session (empty SQL) snapshot — the
    // in-flight autosave's own stale write must never race back in and
    // resurrect 'marker_v1' server-side.
    await expect(async () => {
      const res = await page.request.get(`${API}/api/explorations/${id}/`);
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data?.draft?.queries?.[0]?.sql || '').not.toContain('marker_v1');
    }).toPass({ timeout: 10000 });

    // Reopening reactivates cleanly — no stuck syncStatus, no crash, no
    // duplicate tab.
    await expect(async () => {
      const card = page.getByTestId(`exploration-card-${id}-open`);
      if (await card.isVisible()) await card.click();
      await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 30000 });
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toHaveCount(1);
    const syncStatus = await page.evaluate(
      id => window.useStore.getState().workspaceExplorations.byId[id]?.syncStatus,
      id
    );
    expect(syncStatus).not.toBe('error');
  });

  // e2e-gap-review.md #17 [MEDIUM·PARTIAL]: `activateWorkspaceView`
  // (workspaceStore.js) unconditionally nulls `workspaceActiveTabId` on every
  // view click — including re-clicking a document tab's OWN destination —
  // parking it (still open, just unfocused) rather than closing it. Clicking
  // back into Explorer's OWN view lands on ExplorerHomePane's gallery, never
  // back on the parked tab directly; the only way back to the tab itself is
  // its own Home card's "Open" action. This exercises exactly that path,
  // deliberately WITHOUT waiting for the dirty dot to clear first (the gap
  // the other two lifecycle tests in this file don't hit) — a real edit is
  // still plausibly in flight when the reopen happens.
  test("park via view-switch (not close), then reopen from Home's own card — reactivates the SAME tab, no duplicate, edit survives", async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeSqlReliably(page, 'SELECT 999 AS reopen_marker');

    // Park via a VIEW SWITCH, not a close — no dirty-confirm dialog gates
    // this path at all (activateWorkspaceView doesn't check `dirty`).
    await page.getByTestId('workspace-view-switcher-project').click();
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible({ timeout: 15000 });
    // Still open, just unfocused.
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toBeVisible();

    // Re-clicking Explorer's OWN view lands on the gallery, not the tab.
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible({ timeout: 15000 });

    // Reopen from the exploration's OWN Home card while it's still parked
    // (and plausibly still mid-debounce) elsewhere in the strip.
    await expect(async () => {
      const card = page.getByTestId(`exploration-card-${id}-open`);
      if (await card.isVisible()) await card.click();
      await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 30000 });

    // The SAME tab reactivated — no duplicate tab was minted for it.
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toHaveCount(1);
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toHaveAttribute(
      'data-active',
      'true'
    );
    // The restore-on-activate effect never clobbered the in-flight edit.
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 999 AS reopen_marker', {
      timeout: 10000,
    });
    await waitForBackendDraftSql(page, id, 'SELECT 999 AS reopen_marker');
  });

  // e2e-gap-review.md #21 [MEDIUM·PARTIAL]: reloading at a BARE view URL
  // (e.g. /workspace/semantic-layer) while a document tab sits parked behind
  // it in restored localStorage is never exercised — view-switcher.spec.mjs's
  // own bare-URL-reload test opens zero tabs first, and this file's other
  // reload test always reloads with the exploration tab itself ACTIVE. This
  // drives the three-way race directly: the parked view must render from the
  // URL (not resurrect onto the parked tab), and the parked tab must survive
  // the reload with its content intact.
  test('reload at a bare view URL restores that view (not the parked tab), and the parked exploration tab survives with its content intact', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeSqlReliably(page, 'SELECT 99 AS parked_marker');
    const dirtyDot = page.getByTestId(`workspace-tab-dirty-exploration:${id}`);
    await expect(dirtyDot).not.toBeVisible({ timeout: 10000 });
    await waitForBackendDraftSql(page, id, 'SELECT 99 AS parked_marker');

    // Park behind Semantic Layer (not Project — the reviewer's own example).
    await page.getByTestId('workspace-view-switcher-semantic-layer').click();
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible({
      timeout: 15000,
    });
    expect(new URL(page.url()).pathname).toBe('/workspace/semantic-layer');
    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).toBeVisible();

    // Hard-reload AT this exact bare view URL.
    await page.reload();
    await page.waitForLoadState('networkidle');

    // The correct view renders straight from the URL — never resurrected
    // onto the parked document tab.
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible({
      timeout: 30000,
    });
    expect(new URL(page.url()).pathname).toBe('/workspace/semantic-layer');
    await expect(page.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true'
    );

    // The parked tab survived the reload (restored from localStorage) with
    // its persisted content intact.
    const parkedTab = page.getByTestId(`workspace-tab-exploration:${id}`);
    await expect(parkedTab).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`workspace-tab-select-exploration:${id}`).click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 99 AS parked_marker', {
      timeout: 10000,
    });
  });

  // e2e-gap-review.md #29 [LOW·PARTIAL]: only the mouse-× path has ever been
  // proven safe for a real exploration tab's lossless park/reopen guarantee —
  // Cmd/Ctrl+W (`useWorkspaceTabShortcuts.js`) routes through the exact same
  // `requestCloseWorkspaceTab` primitive, but no test ever drives the
  // keyboard shortcut against a real, backend-synced exploration.
  test(`${MOD}+W closes an exploration tab and reopening it is lossless, same as the mouse ×`, async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeSqlReliably(page, 'SELECT 999 AS kbd_marker');

    const dirtyDot = page.getByTestId(`workspace-tab-dirty-exploration:${id}`);
    await expect(dirtyDot).not.toBeVisible({ timeout: 10000 });
    await waitForBackendDraftSql(page, id, 'SELECT 999 AS kbd_marker');

    // Move focus OFF the Monaco editor first — `handleTabShortcut` suppresses
    // every shortcut while an editable target has focus.
    await page.getByTestId('workspace-tab-strip').click();
    await page.keyboard.press(`${MOD}+w`);

    await expect(page.getByTestId(`workspace-tab-exploration:${id}`)).not.toBeVisible();
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible();

    await expect(async () => {
      const card = page.getByTestId(`exploration-card-${id}-open`);
      if (await card.isVisible()) await card.click();
      await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 30000 });
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 999 AS kbd_marker', {
      timeout: 10000,
    });
  });
});
