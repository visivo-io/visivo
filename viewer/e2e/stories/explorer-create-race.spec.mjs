/**
 * Story: Stale create-completion navigation (VIS-1084, e2e-gap-review.md
 * finding #11 — MEDIUM). Switching destinations while a "New exploration" /
 * "Start from a source" create is still in flight used to let the stale
 * completion forcibly yank the user back to Explorer once it resolved:
 * `ExplorerHomePane.jsx`'s `handleNew`/`handleSourceTile` are `async`, await
 * a real network round-trip (`createExploration()`), then unconditionally
 * call `openExploration(result.id)` -> `openWorkspaceTab(...)`, which
 * activates the new exploration tab and forces `workspaceActiveView` back to
 * 'explorer' as a side effect — with zero check for "is the user even still
 * on this screen."
 *
 * THE FIX (ExplorerHomePane.jsx): a `mountedRef` (same pattern as
 * `useRecordSave.js`/`useDebouncedSave.js`) makes the post-await navigate
 * conditional on this component instance still being mounted. Switching
 * destinations (a ViewSwitcher row, Cmd+2/3) unmounts `ExplorerHomePane` —
 * `MiddlePane.jsx` renders a DIFFERENT destination's Home in its place — so
 * `mountedRef.current` is reliably `false` by the time a still-in-flight
 * create resolves. The exploration is still created and persisted either
 * way; it's just never force-opened into a screen the user already left.
 *
 * This story forces the race deterministically via `page.route()` (gating
 * the create POST) rather than hoping for a real network race to land
 * inside the assertion window.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorerCreateRace VISIVO_SANDBOX_BACKEND_PORT=8053 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3053 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3053 npx playwright test explorer-create-race
 *
 * Mints real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), never
 * `parallel`.
 */

import { test, expect } from '@playwright/test';
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

/** Gate the exploration-create POST so it resolves only once `release()` is
 * called — a deterministic stand-in for "the network round-trip is still in
 * flight when the user navigates away." */
async function gateCreatePost(page) {
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
  return release;
}

test.describe('Explorer Home: switching destinations mid-create never yanks navigation back (VIS-1084)', () => {
  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/api/explorations/').catch(() => {});
    const idsAfterTest = await listExplorationIds(page);
    const createdIds = idsAfterTest.filter(id => !idsBeforeTest.includes(id));
    for (const id of createdIds) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('"+ New exploration": switching to Semantic Layer before the create resolves stays on Semantic Layer — the exploration is still created, just not force-opened', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const release = await gateCreatePost(page);

    await page.getByTestId('explorer-home-new-exploration').click();
    // The create POST is now held open — the user (a real click, not a
    // keyboard shortcut, to keep this story orthogonal to the P4-D1
    // keyboard-suppression fix) switches to a different destination while
    // it's still in flight.
    await page.getByTestId('workspace-view-switcher-semantic-layer').click();
    await expect(page.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true'
    );

    // Release the gate — the create resolves NOW, after the user has
    // already navigated away. Wait for the actual HTTP response (not a
    // blind timeout) before unrouting — `release()` only resolves the gate
    // promise, it doesn't wait for the still-suspended route handler's own
    // `await route.continue()` to actually run; unrouting while that
    // handler is mid-resolution races Playwright's own unroute cleanup
    // against it ("Route is already handled").
    const responsePromise = page.waitForResponse(
      res => res.url().endsWith('/api/explorations/') && res.request().method() === 'POST'
    );
    release();
    await responsePromise;
    await page.unroute('**/api/explorations/');

    // The stale completion must NOT force-navigate back to the new
    // exploration tab — Semantic Layer stays active, no exploration tab
    // opens/activates.
    await page.waitForTimeout(500);
    await expect(page.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(new URL(page.url()).pathname).not.toMatch(/\/workspace\/exploration\/exp_/);

    // The exploration itself was still genuinely created and persisted —
    // navigating to Explorer Home afterward finds it in the gallery, ready
    // to open deliberately.
    await expect(async () => {
      const idsNow = await listExplorationIds(page);
      expect(idsNow.length).toBeGreaterThan(idsBeforeTest.length);
    }).toPass({ timeout: 10000 });
  });

  test('a source tile: switching destinations before the create resolves does not force-open the seeded exploration either', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await expect(page.getByTestId('explorer-home-source-tile-local-sqlite')).toBeVisible({
      timeout: 15000,
    });
    const release = await gateCreatePost(page);

    await page.getByTestId('explorer-home-source-tile-local-sqlite').click();
    await page.getByTestId('workspace-view-switcher-project').click();
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'true'
    );

    const responsePromise = page.waitForResponse(
      res => res.url().endsWith('/api/explorations/') && res.request().method() === 'POST'
    );
    release();
    await responsePromise;
    await page.unroute('**/api/explorations/');

    await page.waitForTimeout(500);
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(new URL(page.url()).pathname).not.toMatch(/\/workspace\/exploration\/exp_/);
  });

  test('baseline (unchanged): staying on Explorer Home through the create still opens the new tab normally', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await page.getByTestId('explorer-home-new-exploration').click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  });
});
