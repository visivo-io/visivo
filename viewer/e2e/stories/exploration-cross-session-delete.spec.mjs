/**
 * Story: Cross-session delete → deleted-remotely recovery (VIS-1083,
 * e2e-gap-review.md finding #10 — MEDIUM). Deleting an exploration in one
 * browser session while it's actively being edited in another used to leave
 * the editing session permanently, silently stuck: `runSync`'s catch set a
 * generic `syncStatus: 'error'` with no distinction from a transient
 * failure, and `updateExplorationDraft` unconditionally re-armed the sync
 * loop on every keystroke regardless of status — a broken record kept
 * re-attempting and re-failing forever with nothing in the UI to explain
 * why or offer a way out.
 *
 * THE FIX (workspaceExplorationsStore.js):
 *   - `runSync`'s catch distinguishes a 404 (`error.status === 404` — the
 *     record is gone, `ExplorationRepository.update()` returns `None` for a
 *     vanished id, `exploration_views.py` turns that into a 404) and sets
 *     `syncStatus: 'deleted-remotely'` instead of the generic `'error'`.
 *   - `updateExplorationDraft` stops re-arming the sync loop once
 *     `syncStatus` is `'deleted-remotely'` — no more doomed retries.
 *   - `ExplorationPane` renders `ExplorationDeletedRemotelyBanner` whenever
 *     `syncStatus === 'deleted-remotely'`: a clear, non-silent state with
 *     two real recovery options — "Recreate as new exploration" (mints a
 *     fresh record from the local draft) and "Close tab" (nothing left to
 *     lose — the backend record is already gone).
 *
 * Two genuinely separate browser contexts (not two tabs in one context) so
 * each has its OWN in-memory Zustand store, matching the real "two browser
 * sessions" scenario the finding describes.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationCrossSessionDelete VISIVO_SANDBOX_BACKEND_PORT=8052 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3052 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3052 npx playwright test exploration-cross-session-delete
 *
 * Mutates shared file-backed state — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), never
 * `parallel`.
 */

import { test, expect } from '@playwright/test';
import { typeSql } from '../helpers/explorer.mjs';
import { BASE_URL, API } from '../helpers/sandbox.mjs';

/** Create a stable exploration via the API (so both sessions reference the
 * SAME id from the start) rather than minting it through either page's own
 * UI — neither session should "own" the create. */
async function createExplorationViaApi(page, name) {
  const res = await page.request.post(`${API}/api/explorations/`, { data: { name } });
  expect(res.ok()).toBe(true);
  return (await res.json()).id;
}

async function openExplorationTab(page, id) {
  await page.goto(`${BASE_URL}/workspace/exploration/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
}

async function deleteFromHome(page, id) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
  await page.getByTestId(`exploration-card-${id}-menu`).click();
  await page.getByTestId(`exploration-card-${id}-delete-action`).click();
  await page.getByTestId('exploration-delete-confirm-confirm').click();
}

async function waitForBackendDraftSql(page, id, expectedSql, timeout = 15000) {
  await expect(async () => {
    const res = await page.request.get(`${API}/api/explorations/${id}/`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data?.draft?.queries?.[0]?.sql).toBe(expectedSql);
  }).toPass({ timeout });
}

/**
 * Deletes `id` from `pageB` (a different session than the one editing it),
 * then forces `pageA`'s NEXT draft-sync attempt to actually fire against the
 * now-dead id — the banner (`runSync`'s 404 catch, workspaceExplorationsStore.js)
 * only ever appears once a REAL sync attempt 404s, and the FIRST edit's own
 * sync (armed the moment `pageA` started editing, ~1.6s debounce) is very
 * plausibly already settled successfully by the time `deleteFromHome`'s own
 * multi-step UI navigation completes on `pageB` — leaving no subsequent
 * failing attempt to trigger anything. Confirming the first edit's sync
 * genuinely landed BEFORE deleting, then typing a SECOND edit to arm a fresh
 * sync AFTER the delete is confirmed, removes that timing ambiguity: the
 * second sync is guaranteed to fire against an id that is already gone.
 */
async function deleteAndForceSubsequentSyncAttempt(pageA, pageB, id, firstSql, retrySql) {
  await waitForBackendDraftSql(pageA, id, firstSql);
  await deleteFromHome(pageB, id);
  await expect(async () => {
    const res = await pageB.request.get(`${API}/api/explorations/${id}/`);
    expect(res.status()).toBe(404);
  }).toPass({ timeout: 10000 });
  await typeSql(pageA, retrySql);
}

test.describe('Cross-session delete surfaces a deleted-remotely banner, never a silent forever-stuck sync (VIS-1083)', () => {
  test('actively-editing Tab A sees the deleted-remotely banner once Tab B deletes the same exploration, and the sync loop genuinely stops', async ({
    browser,
  }) => {
    const setupPage = await browser.newPage();
    const id = await createExplorationViaApi(setupPage, 'Cross-session test');
    await setupPage.close();

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Tab A: open the exploration and edit it — the first edit's own sync
      // must genuinely settle (proves the healthy baseline) BEFORE Tab B
      // deletes it; a second edit afterward is what actually races the dead
      // id (see deleteAndForceSubsequentSyncAttempt's docstring).
      await openExplorationTab(pageA, id);
      await typeSql(pageA, 'SELECT 1 AS marker');
      await deleteAndForceSubsequentSyncAttempt(
        pageA,
        pageB,
        id,
        'SELECT 1 AS marker',
        'SELECT 1 AS marker_v2'
      );

      // The second edit's debounced sync 404s — must surface a clear,
      // actionable state, never stay silent.
      await expect(pageA.getByTestId('exploration-deleted-remotely-banner')).toBeVisible({
        timeout: 10000,
      });
      await expect(pageA.getByTestId('exploration-deleted-remotely-recreate')).toBeVisible();
      await expect(pageA.getByTestId('exploration-deleted-remotely-close')).toBeVisible();
      // The workbench itself keeps rendering underneath — the local draft is
      // not lost, only unsaveable until the user acts on the banner.
      await expect(pageA.getByTestId('workspace-middle-exploration')).toBeVisible();

      // The sync loop is genuinely stopped: further typing must NOT re-arm
      // a doomed POST against the dead id.
      const postsToDeadId = [];
      pageA.on('request', req => {
        if (req.method() === 'POST' && req.url().includes(`/api/explorations/${id}/`)) {
          postsToDeadId.push(req.url());
        }
      });
      await typeSql(pageA, 'SELECT 2 AS marker_after_delete');
      await pageA.waitForTimeout(2500); // past the ~1.6s debounce window
      expect(postsToDeadId).toHaveLength(0);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('"Recreate as new exploration" mints a fresh backend record from the local draft and clears the banner', async ({
    browser,
  }) => {
    const setupPage = await browser.newPage();
    const id = await createExplorationViaApi(setupPage, 'Recreate test');
    await setupPage.close();

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    let newId;

    try {
      await openExplorationTab(pageA, id);
      await typeSql(pageA, 'SELECT 999 AS recovered_marker');
      await deleteAndForceSubsequentSyncAttempt(
        pageA,
        pageB,
        id,
        'SELECT 999 AS recovered_marker',
        'SELECT 999 AS recovered_marker_v2'
      );
      await expect(pageA.getByTestId('exploration-deleted-remotely-banner')).toBeVisible({
        timeout: 10000,
      });

      await pageA.getByTestId('exploration-deleted-remotely-recreate').click();

      // Lands on a brand NEW exploration tab — never the dead id. A bare
      // `/\/workspace\/exploration\/exp_/` predicate would match the CURRENT
      // (pre-click) URL too — it's already at `/workspace/exploration/${id}`
      // — so `waitForURL` could resolve immediately without any navigation
      // ever happening; require the pathname to actually differ from the
      // dead id's URL.
      await pageA.waitForURL(
        url => /\/workspace\/exploration\/exp_/.test(url.pathname) && url.pathname !== `/workspace/exploration/${id}`,
        { timeout: 10000 }
      );
      newId = new URL(pageA.url()).pathname.split('/').pop();
      expect(newId).not.toBe(id);
      await expect(pageA.getByTestId('exploration-deleted-remotely-banner')).not.toBeVisible();
      await expect(pageA.getByTestId(`workspace-tab-exploration:${id}`)).not.toBeVisible();

      // Backend-asserted: the new record actually persisted the recovered
      // draft (the SECOND edit — the one that armed the 404'd sync attempt,
      // i.e. the freshest local state) — not just an optimistic client-only
      // patch.
      await expect(async () => {
        const res = await pageA.request.get(`${API}/api/explorations/${newId}/`);
        expect(res.ok()).toBe(true);
        const data = await res.json();
        expect(data.draft?.queries?.[0]?.sql).toBe('SELECT 999 AS recovered_marker_v2');
      }).toPass({ timeout: 15000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
      if (newId) {
        const cleanup = await browser.newPage();
        await cleanup.request.delete(`${API}/api/explorations/${newId}/`).catch(() => {});
        await cleanup.close();
      }
    }
  });

  test('"Close tab" force-closes with no further network activity against the dead id', async ({
    browser,
  }) => {
    const setupPage = await browser.newPage();
    const id = await createExplorationViaApi(setupPage, 'Close test');
    await setupPage.close();

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      await openExplorationTab(pageA, id);
      await typeSql(pageA, 'SELECT 1 AS marker');
      await deleteAndForceSubsequentSyncAttempt(
        pageA,
        pageB,
        id,
        'SELECT 1 AS marker',
        'SELECT 1 AS marker_v2'
      );
      await expect(pageA.getByTestId('exploration-deleted-remotely-banner')).toBeVisible({
        timeout: 10000,
      });

      const postsToDeadId = [];
      pageA.on('request', req => {
        if (req.method() === 'POST' && req.url().includes(`/api/explorations/${id}/`)) {
          postsToDeadId.push(req.url());
        }
      });

      await pageA.getByTestId('exploration-deleted-remotely-close').click();

      await expect(pageA.getByTestId(`workspace-tab-exploration:${id}`)).not.toBeVisible();
      // Lands back on Explorer Home (the only open tab just closed), not a
      // crash or a stuck pane. `workspace-tab-strip` is persistent chrome
      // (always rendered regardless of tab count) so it isn't a meaningful
      // assertion here — `workspace-middle-explorer` is the real signal.
      await expect(pageA.getByTestId('workspace-middle-explorer')).toBeVisible();
      await pageA.waitForTimeout(1000);
      expect(postsToDeadId).toHaveLength(0);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
