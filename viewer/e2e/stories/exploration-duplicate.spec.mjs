/**
 * Story: Exploration Duplicate — happy path + reload-race (e2e-gap-review.md
 * #18 [MEDIUM·PARTIAL]).
 *
 * Distinct from `exploration-duplicate-race.spec.mjs`, which only covers
 * RAPID-DOUBLE-CLICK races on the Duplicate button (VIS-1086's in-flight
 * guard) — this file covers content-fidelity (does the duplicate actually
 * carry the source's LATEST edit, byte for byte, not a stale pre-debounce
 * draft?) and the RELOAD-TIMING race `handleDuplicate`'s own two-step
 * sequence sits on:
 *
 *   `ExplorationPane.jsx`'s `handleDuplicate` is `await flushExplorationSync(id)`
 *   THEN `await duplicateExploration(id)` THEN `openWorkspaceTab(...)`. Every
 *   write goes through a plain `fetch()` (`viewer/src/api/utils.js`) with no
 *   `keepalive: true` and no `beforeunload` guard anywhere in `viewer/src/` —
 *   a hard reload in the narrow window between either leg's request being
 *   SENT and its response LANDING can abort that specific request before it
 *   completes.
 *
 * Two reload-race variants below drive both halves of that window
 * deterministically via `page.route()` (which pauses a request BEFORE it is
 * ever dispatched to the real network/server — releasing the gate is what
 * lets it actually go out): reload while LEG 1 (the pre-duplicate flush) is
 * held, and reload while LEG 2 (the duplicate's own create) is held. Both
 * document CURRENT behavior (regression-armor, not a bug fix — see the
 * conversation's task list, which scopes #18 to coverage only): a request
 * held by `page.route()` and then torn down by a reload never reaches the
 * real backend, so neither variant can ever mint an orphaned duplicate —
 * the only question each answers is "what happens to the exploration that
 * was already open."
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationDuplicate VISIVO_SANDBOX_BACKEND_PORT=8056 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3056 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3056 npx playwright test exploration-duplicate
 *
 * Mints real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), never
 * `parallel`.
 */

import { test, expect } from '@playwright/test';
import { typeSql } from '../helpers/explorer.mjs';
import { BASE_URL, API } from '../helpers/sandbox.mjs';

async function listExplorationIds(page) {
  const res = await page.request.get(`${API}/api/explorations/`).catch(() => null);
  if (!res || !res.ok()) return [];
  return ((await res.json().catch(() => [])) || []).map(e => e.id);
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

/** `typeSql` + a verify-and-retry guard (mirrors exploration-lifecycle.spec.mjs's
 * `typeSqlReliably` verbatim — same cold-load "auto-create model tab" race). */
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

/** Poll the BACKEND record until its persisted draft's first query's `sql`
 * matches (mirrors exploration-lifecycle.spec.mjs's `waitForBackendDraftSql`). */
async function waitForBackendDraftSql(page, id, expectedSql, timeout = 15000) {
  await expect(async () => {
    const res = await page.request.get(`${API}/api/explorations/${id}/`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data?.draft?.queries?.[0]?.sql).toBe(expectedSql);
  }).toPass({ timeout });
}

/**
 * Wait for this exploration's SLICE-LEVEL `draft` (workspaceExplorationsStore.js,
 * NOT the legacy explorerStore.js working copy) to actually contain
 * `expectedSql`. This is NOT a cosmetic wait: `ExplorationPane`'s own 600ms
 * "live sync" effect is what calls `updateExplorationDraft` — the thing that
 * both updates this exploration's SLICE-level `draft` and arms the ~1s
 * backend-POST debounce `flushExplorationSync` flushes. Clicking Duplicate
 * with truly ZERO delay after typing races AHEAD of that first 600ms stage:
 * `duplicateExploration` would then read a STALE slice-level draft (the
 * edit never reached the slice at all yet) and `flushExplorationSync` would
 * be a pure no-op (no timer armed to flush).
 *
 * Deliberately polls the DRAFT CONTENT itself, not `syncStatus === 'saving'`
 * — `syncStatus` flips to 'saving' on EVERY live-sync tick, including an
 * earlier, unrelated one from the exploration's own cold-start auto-create
 * (empty SQL) that can still be settling when this test's typing lands;
 * waiting on the status string alone can catch that earlier cycle instead of
 * the one this edit actually armed. The draft's own content is the precise,
 * unambiguous signal that THIS edit has reached the slice.
 */
async function waitForSliceDraftSql(page, id, expectedSql, timeout = 10000) {
  await page.waitForFunction(
    ({ id, expectedSql }) =>
      window.useStore.getState().workspaceExplorations.byId[id]?.draft?.queries?.[0]?.sql ===
      expectedSql,
    { id, expectedSql },
    { timeout }
  );
}

test.describe('Exploration Duplicate — happy path + reload race (e2e-gap-review.md #18)', () => {
  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/api/explorations/').catch(() => {});
    await page.unroute('**/api/explorations/**').catch(() => {});
    const idsAfterTest = await listExplorationIds(page);
    const createdIds = idsAfterTest.filter(id => !idsBeforeTest.includes(id));
    for (const id of createdIds) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test("duplicate flushes the latest edit and opens the new exploration's tab, with byte-identical content (zero-timing-tricks happy path)", async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const idA = await newExploration(page);

    // Type, then click Duplicate as soon as the edit has genuinely reached
    // the slice — NOT a flat wait for the backend POST to settle (that's
    // what `handleDuplicate`'s own flush exists to short-circuit). See
    // `waitForSliceDraftSql`'s docstring for why zero delay would race ahead
    // of the mechanism this test is actually about.
    await typeSqlReliably(page, 'SELECT 999 AS pane_dup_marker');
    await waitForSliceDraftSql(page, idA, 'SELECT 999 AS pane_dup_marker');
    await expect(page.getByTestId('exploration-duplicate-button')).toBeEnabled();
    await page.getByTestId('exploration-duplicate-button').click();

    // A new tab opens for a DIFFERENT exploration id.
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15000 })
      .not.toBe(`/workspace/exploration/${idA}`);
    const idB = new URL(page.url()).pathname.split('/').pop();
    expect(idB).not.toBe(idA);
    expect(idB).toMatch(/^exp_/);

    // The pre-duplicate flush landed — the SOURCE reflects the latest edit.
    await waitForBackendDraftSql(page, idA, 'SELECT 999 AS pane_dup_marker');
    // The duplicate seeded from that same up-to-date draft, not a stale
    // pre-debounce one — byte-identical content.
    await waitForBackendDraftSql(page, idB, 'SELECT 999 AS pane_dup_marker');
  });

  test('reloading right as the pre-duplicate flush is sent (before its response lands) never orphans a duplicate', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeSqlReliably(page, 'SELECT 1 AS reload_leg1_marker');
    await waitForSliceDraftSql(page, id, 'SELECT 1 AS reload_leg1_marker');

    let notifyIntercepted;
    const intercepted = new Promise(resolve => {
      notifyIntercepted = resolve;
    });
    // Hold LEG 1 (the pre-duplicate flush, POST /api/explorations/<id>/)
    // before it ever reaches the real network — never call route.continue(),
    // so this specific write can never land server-side.
    await page.route(`**/api/explorations/${id}/`, async route => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      notifyIntercepted();
      // Deliberately never continue — the impending reload tears this down.
    });

    const before = await listExplorationIds(page);
    await page.getByTestId('exploration-duplicate-button').click();
    await intercepted;
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.unroute(`**/api/explorations/${id}/`).catch(() => {});

    // The held flush request never reached the real backend, so this
    // specific edit is lost — the CURRENT, documented behavior (this test is
    // coverage/regression-armor, not a fix; see the file docstring). Nothing
    // is corrupted: the app reloads cleanly onto the source exploration with
    // its last successfully-flushed content, never a crash or a stuck state.
    // Polled (not a one-shot check) — settling right after a hard reload can
    // take a beat under load, same reasoning as `waitForBackendDraftSql`.
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await expect(async () => {
      const res = await page.request.get(`${API}/api/explorations/${id}/`);
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data?.draft?.queries?.[0]?.sql || '').not.toContain('reload_leg1_marker');
    }).toPass({ timeout: 10000 });

    // `duplicateExploration` is never reached (the chain never got past its
    // first await) — no orphaned duplicate record exists.
    const after = await listExplorationIds(page);
    expect(after.filter(x => !before.includes(x))).toHaveLength(0);
  });

  test('reloading right as the duplicate create request is sent (after the flush already landed) leaves the source flushed and never orphans a duplicate', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeSqlReliably(page, 'SELECT 1 AS reload_leg2_marker');
    await waitForSliceDraftSql(page, id, 'SELECT 1 AS reload_leg2_marker');

    let notifyIntercepted;
    const intercepted = new Promise(resolve => {
      notifyIntercepted = resolve;
    });
    // Hold LEG 2 (the duplicate's own create, POST /api/explorations/) —
    // LEG 1's own update endpoint (/api/explorations/<id>/) is a DIFFERENT
    // URL and is left completely unintercepted, so it completes normally
    // before this route ever fires.
    await page.route('**/api/explorations/', async route => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      notifyIntercepted();
      // Deliberately never continue.
    });

    const before = await listExplorationIds(page);
    await page.getByTestId('exploration-duplicate-button').click();
    await intercepted;
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.unroute('**/api/explorations/').catch(() => {});

    // LEG 1 (the flush) was never intercepted, so it already completed by
    // the time LEG 2's create request was even issued — the source's edit
    // landed regardless of the reload.
    await waitForBackendDraftSql(page, id, 'SELECT 1 AS reload_leg2_marker');

    // The duplicate's create request never reached the real backend (held,
    // then torn down by the reload) — no orphan record was minted.
    const after = await listExplorationIds(page);
    expect(after.filter(x => !before.includes(x))).toHaveLength(0);
  });
});
