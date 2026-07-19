/**
 * Story: Double-click create doors mint duplicates (VIS-1086,
 * e2e-gap-review.md findings #8 and #9 — MEDIUM). Every create door in the
 * Explorer surface used to have no in-flight guard at all:
 *
 *   - #9: ExplorationPane's "Duplicate" button — `handleDuplicate` had no
 *     `disabled`/in-flight ref; two rapid clicks fired two independent
 *     `duplicateExploration` calls, minting two duplicate records and
 *     opening two tabs the user only meant to create once.
 *   - #8: ExplorerHomePane's "+ New exploration" / a "Start from a source"
 *     tile — `handleNew`/`handleSourceTile` only guarded against the
 *     FIRST-VISIT seed racing a manual create (`seedPromiseRef`), never
 *     against two manual clicks of the same button. Both POSTs land at
 *     `ExplorationRepository.create()`, each independently computing
 *     `_default_name()` from a directory listing taken BEFORE either
 *     request's `_write()` has landed — no lock — so two rapid clicks could
 *     mint the SAME default name (a name collision, not just a duplicate
 *     record).
 *
 * THE FIX:
 *   - Frontend: every create door (`ExplorationPane`'s Duplicate button,
 *     `ExplorerHomePane`'s "+ New exploration" and every source tile) is now
 *     guarded by a synchronous in-flight ref CHECKED INSIDE THE HANDLER
 *     (not just a `disabled` HTML attribute, which only takes effect after
 *     a React re-render — a real double-click can dispatch both click
 *     events before that render lands) plus a `disabled` state for the
 *     visible affordance.
 *   - Backend (`exploration_repository.py`): `create()`'s whole "resolve id
 *     + name, then write" sequence is now serialized per-process
 *     (`_create_lock`, a `threading.Lock` — Flask runs with
 *     `async_mode="threading"`, so concurrent requests are real concurrent
 *     OS threads) AND `_default_name()` collision-checks its candidate
 *     against the CURRENT set of existing names, incrementing until free —
 *     defense in depth for any request that reaches the backend
 *     concurrently despite the frontend guard (e.g. two separate browser
 *     windows, which the frontend's per-component ref can't coordinate
 *     across).
 *
 * This story exercises the FRONTEND guard specifically (the backend
 * concurrency fix has its own dedicated real-thread test,
 * `tests/server/repositories/test_exploration_repository.py::TestConcurrentCreate`)
 * — two click events are dispatched via `page.evaluate` (bypassing
 * Playwright's own actionability/disabled-wait) so BOTH land before React
 * has a chance to re-render the button disabled, matching a genuine
 * faster-than-a-render double-click rather than relying on the `disabled`
 * attribute alone.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationDuplicateRace VISIVO_SANDBOX_BACKEND_PORT=8055 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3055 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3055 npx playwright test exploration-duplicate-race
 *
 * Mints real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), never
 * `parallel`.
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const API = BASE_URL.replace(':3001', ':8001');

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

/** Dispatch two click events on the SAME testid synchronously in one task —
 * bypasses Playwright's own actionability wait (which would otherwise honor
 * a `disabled` attribute and refuse the second click) so both land before
 * React has a chance to re-render the button disabled, the genuine "double-
 * click faster than a render" race these fixes defend against. */
async function doubleClickFast(page, testId) {
  await page.evaluate(id => {
    const els = document.querySelectorAll(`[data-testid="${id}"]`);
    const btn = els[els.length - 1];
    btn.click();
    btn.click();
  }, testId);
}

test.describe('Double-click create doors mint exactly one record (VIS-1086)', () => {
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

  test('double-clicking the exploration Duplicate button mints exactly ONE duplicate, opens exactly ONE new tab', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const before = await listExplorationIds(page);

    const tabStripTabs = page.getByTestId('workspace-tab-strip').locator('[role="tab"]');
    const initialTabCount = await tabStripTabs.count();

    await expect(page.getByTestId('exploration-duplicate-button')).toBeEnabled();
    await doubleClickFast(page, 'exploration-duplicate-button');

    // Exactly one new tab opens (a second, silently-swallowed duplicate
    // click would otherwise open two).
    await expect(tabStripTabs).toHaveCount(initialTabCount + 1, { timeout: 15000 });
    // Give any (incorrectly) second in-flight request a moment to land
    // before asserting the backend count — a false negative here (asserting
    // too early) would be worse than a slightly slower test.
    await page.waitForTimeout(1500);

    const after = await listExplorationIds(page);
    const createdCount = after.filter(id => !before.includes(id)).length;
    expect(createdCount).toBe(1);
  });

  test('double-clicking "+ New exploration" mints exactly ONE record with a unique name', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const before = await listExplorationIds(page);

    await expect(page.getByTestId('explorer-home-new-exploration')).toBeEnabled();
    await doubleClickFast(page, 'explorer-home-new-exploration');

    // Exactly one navigation lands on a real exploration tab.
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1500);

    const after = await listExplorationIds(page);
    const createdIds = after.filter(id => !before.includes(id));
    expect(createdIds).toHaveLength(1);
  });

  test('double-clicking a "Start from a source" tile mints exactly ONE record', async ({ page }) => {
    await gotoExplorerHome(page);
    await expect(page.getByTestId('explorer-home-source-tile-local-sqlite')).toBeVisible({
      timeout: 15000,
    });
    const before = await listExplorationIds(page);

    await doubleClickFast(page, 'explorer-home-source-tile-local-sqlite');

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1500);

    const after = await listExplorationIds(page);
    const createdIds = after.filter(id => !before.includes(id));
    expect(createdIds).toHaveLength(1);
  });

  test('the Duplicate button visibly disables itself while the request is in flight', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    // Delay the duplicate's create POST so the disabled window is
    // observable rather than racing a real (usually sub-100ms) round trip.
    let release = () => {};
    const gate = new Promise(resolve => {
      release = resolve;
    });
    await page.route('**/api/explorations/', async route => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await gate;
      await route.continue();
    });

    await page.getByTestId('exploration-duplicate-button').click();
    await expect(page.getByTestId('exploration-duplicate-button')).toBeDisabled({ timeout: 3000 });

    release();
    await page.unroute('**/api/explorations/');
    await expect(page.getByTestId('exploration-duplicate-button')).toBeEnabled({ timeout: 10000 });
  });
});
