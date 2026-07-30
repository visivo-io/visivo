/**
 * Story: Rename racing the debounced draft-sync (VIS-1085, e2e-gap-review.md
 * finding #7 — MEDIUM). A rename (immediate, non-debounced POST `{name}`)
 * firing in the same window as the draft-sync's own debounced POST `{draft}`
 * used to be able to silently clobber one of the two writes:
 * `ExplorationRepository.update()` (exploration_repository.py) is an
 * unlocked read-modify-write — full `_read()`, patch only the fields present
 * in the request, `_write()` the merged doc back, no lock, no version check
 * — and `hot_reload_server.py` runs Flask with `async_mode="threading"`, so
 * concurrent HTTP requests are genuinely concurrent OS threads. Whichever
 * request's `_read()` happened first but `_write()` landed LAST would win,
 * silently discarding the other's field.
 *
 * THE FIX (workspaceExplorationsStore.js): every write for a given
 * exploration id — the debounced draft sync, an immediate rename, a discard
 * revert, and a promotion record — is enqueued onto a per-id promise chain
 * (`_writeQueues`/`enqueueWrite`) so at most ONE `update()`-shaped request
 * for that id is ever in flight. This closes the race entirely on the
 * client, without needing any backend locking.
 *
 * Per the review's own recommended approach: rather than waiting out the
 * real ~1.6s of timers (flaky and slow, and not actually deterministic even
 * then), this story forces the race directly by invoking the underlying
 * store actions concurrently via `page.evaluate` + `Promise.all` — the exact
 * code paths a real ~1.6s-apart rename+draft-sync would hit, without the
 * wait. Verified through the BACKEND afterward: both the new name and the
 * synced draft must survive, never one clobbering the other.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationConcurrentRename VISIVO_SANDBOX_BACKEND_PORT=8054 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3054 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3054 npx playwright test exploration-concurrent-rename-and-draft-sync
 *
 * Mutates shared file-backed state — runs in the serial
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

test.describe('Rename racing the debounced draft-sync never clobbers either write (VIS-1085)', () => {
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

  test('a rename fired concurrently with a flushed draft-sync for the same id: BOTH the new name and the synced draft persist', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);

    // The edit that would normally arm ExplorationPane's 600ms live-sync
    // timer -> the store's own 1s scheduleSync debounce.
    await typeSql(page, 'SELECT 1 AS raced_sql');

    // Force the race deterministically: fire the rename and a flush of the
    // just-typed draft CONCURRENTLY via Promise.all, from inside the page —
    // the exact underlying store calls a real ~1.6s-apart rename+debounce
    // would make, without waiting out the real timers (flaky and slow).
    // Pre-fix, both hit ExplorationRepository.update()'s unlocked
    // read-modify-write as genuinely concurrent HTTP requests (Flask's
    // threading dev server); post-fix, `enqueueWrite` serializes them so
    // this is safe regardless of how close together they fire.
    await page.evaluate(async () => {
      const store = window.useStore.getState();
      const currentId = window.location.pathname.split('/').pop();
      await Promise.all([
        store.renameExploration(currentId, 'Raced Name'),
        store.flushExplorationSync(currentId),
      ]);
    });

    // Backend-asserted: NEITHER write was clobbered by the other.
    await expect(async () => {
      const res = await page.request.get(`${API}/api/explorations/${id}/`);
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data.name).toBe('Raced Name');
      expect(data.draft?.queries?.[0]?.sql).toBe('SELECT 1 AS raced_sql');
    }).toPass({ timeout: 15000 });

    // The UI reflects the same — no split-brain between client and server.
    await expect(page.locator('[role="tab"]', { hasText: 'Raced Name' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('the reverse race (draft-sync flushed just after a rename kicks off) is equally safe', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeSql(page, 'SELECT 2 AS reverse_raced_sql');

    await page.evaluate(async () => {
      const store = window.useStore.getState();
      const currentId = window.location.pathname.split('/').pop();
      const renamePromise = store.renameExploration(currentId, 'Reverse Raced Name');
      const flushPromise = store.flushExplorationSync(currentId);
      await Promise.all([flushPromise, renamePromise]);
    });

    await expect(async () => {
      const res = await page.request.get(`${API}/api/explorations/${id}/`);
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data.name).toBe('Reverse Raced Name');
      expect(data.draft?.queries?.[0]?.sql).toBe('SELECT 2 AS reverse_raced_sql');
    }).toPass({ timeout: 15000 });
  });
});
