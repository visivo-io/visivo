/**
 * Story: Same exploration open in two independent browser contexts —
 * documented last-write-wins is never actually tested end-to-end
 * (e2e-gap-review.md #19 [MEDIUM · PARTIAL]).
 *
 * `ExplorationRepository.update()` (visivo/server/repositories/
 * exploration_repository.py) is a bare read-mutate-write with no version
 * check — `07-exploration-api-contract.md` documents this as intentional
 * last-write-wins ("409 reserved for future optimistic concurrency (not in
 * v1)"). `exploration-lifecycle.spec.mjs`'s two-tab isolation test only ever
 * switches between two DIFFERENT exploration ids in ONE browser
 * context/Zustand singleton — it never opens the SAME exploration id in two
 * genuinely independent browser contexts (two separate Zustand stores, each
 * with its own restore + debounce cycle). This story drives that exact
 * scenario end to end and asserts:
 *   1. Both contexts independently restore the same base draft.
 *   2. The later writer's edit wins server-side (last-write-wins, as
 *      documented).
 *   3. Neither context's syncStatus ever surfaces as 'error' from this.
 *   4. The LOSING context isn't left stuck — a reload cleanly picks up the
 *      winner's SQL, and a further edit from the (reloaded) loser persists
 *      normally afterward.
 *
 * Uses TWO independent `browser.newContext()`s (genuinely separate Zustand
 * stores, unlike two tabs in one context) per the finding's own
 * recommendation.
 */

import { test, expect } from '@playwright/test';
import { typeSql } from '../helpers/explorer.mjs';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const API = BASE_URL.replace(':3001', ':8001');

/** `typeSql` + a verify-and-retry guard (mirrors exploration-lifecycle.spec.mjs's
 * identical helper) — under concurrent-load contention, typing before the
 * active model is genuinely bound can silently vanish. */
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

// 30s (not a flat 15s) mirrors exploration-lifecycle.spec.mjs's own
// documented reasoning: this file runs concurrently with `parallel`'s many
// workers against the same :8001 Flask dev server, and this specific story
// opens TWO independent browser contexts at once — real combined-load
// contention, not just a correctness dependency.
async function waitForBackendDraftSql(page, id, expectedSql, timeout = 30000) {
  await expect(async () => {
    const res = await page.request.get(`${API}/api/explorations/${id}/`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    const sql = data?.draft?.queries?.[0]?.sql;
    expect(sql).toBe(expectedSql);
  }).toPass({ timeout });
}

async function openExploration(page, id) {
  await page.goto(`${BASE_URL}/workspace/exploration/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  // Mirrors exploration-lifecycle.spec.mjs's `newExploration()` guard: typing
  // before the legacy explorerStore singleton's restore effect has actually
  // bound an active model silently no-ops (`setActiveModelSql` no-ops with no
  // active model) — wait for a real active model first, both on first open
  // AND after a reload.
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 15000,
  });
}

const syncStatus = (page, id) =>
  page.evaluate(eid => window.useStore.getState().workspaceExplorations?.byId?.[eid]?.syncStatus, id);

// This story drives two manually-created `browser.newContext()`s (genuinely
// independent Zustand stores — the whole point of the test) rather than the
// fixture-managed default `page`/`context`. Tracing those ad-hoc contexts
// alongside the unused default one intermittently hits a Playwright
// trace-artifact housekeeping error (ENOENT on an internal recording file)
// in this environment, unrelated to this story's own assertions — same as
// cross-tab-soft-reload-project-runs.spec.mjs / workspace-cross-tab-tabset.spec.mjs.
test.use({ trace: 'off', screenshot: 'off' });

test.describe('Same exploration open in two independent browser contexts (#19)', () => {
  test.setTimeout(90000);

  let explorationId;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/explorations/`, {
      data: {
        name: 'Cross-tab concurrency test',
        draft: { queries: [{ name: 'query_1', sql: 'SELECT 0 AS base_marker' }] },
      },
    });
    expect(res.ok(), 'exploration create must succeed before the test body runs').toBe(true);
    const created = await res.json();
    explorationId = created.id;
  });

  test.afterEach(async ({ request }) => {
    if (explorationId) {
      await request.delete(`${API}/api/explorations/${explorationId}/`).catch(() => {});
    }
  });

  test('last write wins server-side; neither context errors; the losing context recovers cleanly on reload', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await openExploration(pageA, explorationId);
    await openExploration(pageB, explorationId);

    // Both contexts independently restored the SAME base draft.
    await expect(pageA.locator('.view-lines').first()).toContainText('SELECT 0 AS base_marker', {
      timeout: 10000,
    });
    await expect(pageB.locator('.view-lines').first()).toContainText('SELECT 0 AS base_marker', {
      timeout: 10000,
    });

    // Context A edits first...
    await typeSqlReliably(pageA, 'SELECT 1 AS marker_a');
    // ...Context B edits shortly after (B is the deterministic last writer —
    // enough of a gap that A's debounce chain has almost certainly already
    // fired at least once by the time B's own settles).
    await pageA.waitForTimeout(400);
    await typeSqlReliably(pageB, 'SELECT 2 AS marker_b');

    // The backend settles on B's edit — last-write-wins, as documented.
    await waitForBackendDraftSql(pageB, explorationId, 'SELECT 2 AS marker_b');

    // Give A's own (now-losing) debounced write every chance to also land
    // before asserting the FINAL state — the backend must still show B's
    // SQL afterward, not flip back to A's.
    await pageA.waitForTimeout(2000);
    await waitForBackendDraftSql(pageA, explorationId, 'SELECT 2 AS marker_b');

    // Neither context's local syncStatus ever surfaced as an outright error
    // from this race — last-write-wins is a silent overwrite, not a failure.
    expect(await syncStatus(pageA, explorationId)).not.toBe('error');
    expect(await syncStatus(pageB, explorationId)).not.toBe('error');

    // The LOSING context (A) isn't left stuck: reloading it cleanly picks up
    // the winner's SQL — not stale, not crashed, not a not-found state.
    await pageA.reload();
    await pageA.waitForLoadState('networkidle');
    await expect(pageA.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await expect(pageA.getByTestId('workspace-middle-exploration-not-found')).not.toBeVisible();
    await expect(pageA.locator('.view-lines').first()).toContainText('SELECT 2 AS marker_b', {
      timeout: 10000,
    });
    await pageA.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
      timeout: 10000,
    });

    // And a further edit from the reloaded loser persists normally
    // afterward — proving it's genuinely recovered, not permanently wedged.
    await typeSqlReliably(pageA, 'SELECT 3 AS marker_recovered');
    await waitForBackendDraftSql(pageA, explorationId, 'SELECT 3 AS marker_recovered');
    expect(await syncStatus(pageA, explorationId)).not.toBe('error');

    await contextA.close();
    await contextB.close();
  });
});
