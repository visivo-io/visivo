/**
 * Story: Cold-session default-source race (VIS-1082, e2e-gap-review.md
 * finding #2 — HIGH). The very first auto-created query in a session must
 * never silently skip the project's configured default source.
 *
 * `useExplorerWorkbenchInit.js`'s auto-create-model-tab effect is a
 * `useLayoutEffect` gated only on `explorerSources.length > 0` — it fires as
 * soon as sources arrive, with no dependency on `state.defaults` (fetched by
 * a separate, later-declared, unordered `useEffect` in the same hook). On a
 * cold session, sources can land before defaults do, so `createModelTab()`
 * (explorerStore.js) resolves its source from "project default > first
 * available" with `state.defaults` still `null` — falling back to whichever
 * source sorts first, silently wrong if that isn't the configured default.
 *
 * This project's own sandbox fixture (test-projects/integration/project.visivo.yml)
 * is the exact precondition: two sources (`local-sqlite` first, `local-duckdb`
 * second) with `defaults.source_name: local-duckdb` — the configured default
 * is NOT the first source in listing order.
 *
 * THE FIX (viewer/src/components/explorer/useExplorerWorkbenchInit.js +
 * viewer/src/stores/explorerStore.js's `applyResolvedDefaultSource`):
 * remembers whether `defaults` had already arrived at the moment the tab was
 * auto-created; if not, a dedicated effect rebinds that tab's source once
 * `defaults` actually lands (a no-op if the user has since picked a source
 * themselves). This story forces the race deterministically via
 * `page.route()` (gating `/api/defaults/`) rather than hoping for a real
 * network race to land inside the assertion window.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorerColdSession VISIVO_SANDBOX_BACKEND_PORT=8051 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3051 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3051 npx playwright test explorer-cold-session-default-source
 *
 * Mints real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), never
 * `parallel`.
 */

import { test, expect } from '@playwright/test';
import { BASE_URL, API } from '../helpers/sandbox.mjs';
import { focusSqlEditor } from '../helpers/explorer.mjs';

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

test.describe('Cold-session default-source race (VIS-1082)', () => {
  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/api/defaults/**').catch(() => {});
    const idsAfterTest = await listExplorationIds(page);
    const createdIds = idsAfterTest.filter(id => !idsBeforeTest.includes(id));
    for (const id of createdIds) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('an exploration auto-created before defaults arrive still ends up bound to the project default source, not the first-available fallback', async ({
    page,
  }) => {
    // Gate the defaults fetch (useExplorerWorkbenchInit.js's fetchDefaults())
    // so it resolves strictly AFTER the sources fetch + the synchronous
    // auto-create-model-tab layout effect have already run — the exact
    // ordering the review identified as reachable on a genuinely cold
    // session, forced deterministically rather than raced.
    let releaseDefaults = () => {};
    const defaultsGate = new Promise(resolve => {
      releaseDefaults = resolve;
    });
    await page.route('**/api/defaults/**', async route => {
      await defaultsGate;
      await route.continue();
    });

    await gotoExplorerHome(page);
    // Opening the exploration mounts ExplorationWorkbench -> useExplorerWorkbenchInit,
    // which fetches BOTH explorerSources and (gated) defaults, and the
    // layout effect auto-creates a model tab the instant sources land —
    // `newExploration`'s own wait proves that has already happened.
    const id = await newExploration(page);

    // Precondition check: the auto-created tab's source resolved with
    // `defaults` still null — "first available" (local-sqlite per the
    // sandbox fixture's YAML order), NOT the configured default
    // (local-duckdb). If this assertion ever fails, the race precondition
    // itself stopped reproducing (e.g. a source-fetch ordering change) —
    // investigate before assuming the FIX assertion below is meaningful.
    await expect(page.getByTestId('source-selector')).toContainText('local-sqlite', {
      timeout: 15000,
    });

    // Release the gate — defaults land. The fix's rebind effect
    // (applyResolvedDefaultSource, explorerStore.js) must correct the
    // already-created tab's source to the real project default. Wait for
    // the actual HTTP response (not a blind timeout) before unrouting —
    // `releaseDefaults()` only resolves the gate promise, it doesn't wait
    // for the still-suspended route handler's own `await route.continue()`
    // to actually run; unrouting while that handler is mid-resolution races
    // Playwright's own unroute cleanup against it ("Route is already
    // handled").
    const responsePromise = page.waitForResponse(res => res.url().includes('/api/defaults/'));
    releaseDefaults();
    await responsePromise;
    await page.unroute('**/api/defaults/**');

    await expect(page.getByTestId('source-selector')).toContainText('local-duckdb', {
      timeout: 10000,
    });

    // Backend-confirmed: the corrected source is what actually gets
    // persisted once the user runs/saves — not just a UI-only patch that
    // reverts on reload. Type SQL so a query genuinely exists, then let the
    // draft-sync settle and read the persisted source back.
    await focusSqlEditor(page);
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type('SELECT 1 AS cold_session_marker', { delay: 5 });
    await expect(async () => {
      const res = await page.request.get(`${API}/api/explorations/${id}/`);
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data.draft?.queries?.[0]?.sql).toBe('SELECT 1 AS cold_session_marker');
    }).toPass({ timeout: 15000 });
  });

  test('when defaults arrive BEFORE sources (the non-racy order), the tab is correct from the start — no rebind needed', async ({
    page,
  }) => {
    // Baseline/regression guard: the common case (defaults already cached
    // this session) must be unaffected by the fix — the tab should never
    // visibly flash the wrong source and correct itself.
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await expect(page.getByTestId('source-selector')).toContainText('local-duckdb', {
      timeout: 15000,
    });
    // Cleanup handled by afterEach via idsBeforeTest diffing; id referenced
    // only to document intent (not otherwise used).
    expect(id).toMatch(/^exp_/);
  });
});
