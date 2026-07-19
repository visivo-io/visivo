/**
 * Story: Tab-strip position shortcuts (Cmd+4-9) and drag-reorder against a
 * "phantom" exploration tab — one whose backend record was deleted OUT OF
 * BAND (e2e-gap-review.md finding #25).
 *
 * `restoreWorkspaceTabs` (workspaceStore.js) only sanitizes SHAPE (drops
 * nulls, dedupes by id, scrubs workspace-view chrome types) — it performs
 * ZERO cross-check against `workspaceExplorations.byId` or a fetched list.
 * A tab set restored from a prior session's localStorage snapshot can
 * therefore contain an `exploration` tab whose backend record is gone
 * (deleted from a different session, or a session killed before its own
 * `deleteExploration`'s force-close/toast round-trip completed). This story
 * simulates exactly that: seed `visivo.workspace.tabs.<project>` with a real
 * (still-live) exploration AND a fabricated phantom exploration id that was
 * never created, then verify the tab strip's power features (position
 * shortcuts, drag-reorder, label fallback, landing on the phantom tab)
 * degrade gracefully — never a crash.
 *
 * Deliberately a NEW dedicated file rather than extending
 * `workspace-tabs-shortcuts.spec.mjs`: that file's existing tests are all
 * registered in the PARALLEL Playwright project (no backend exploration
 * mutations); mixing a real exploration-delete in would force the WHOLE
 * file to move to the serial `exploration-mutations` project, a bigger
 * blast radius than this small dedicated file.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=phantomTab VISIVO_SANDBOX_BACKEND_PORT=8050 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3050 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3050 npx playwright test workspace-tab-phantom-exploration
 *
 * Runs in playwright.config.mjs's `exploration-mutations` project (serial,
 * no retries) — mints/deletes a real backend exploration record, same
 * reasoning as exploration-lifecycle.spec.mjs.
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

/** Seed the persisted tab-set localStorage key exactly as
 * `Workspace.jsx`'s restore effect reads it (`{ tabs, activeView }`),
 * mirroring a prior session's snapshot that includes a tab whose backend
 * record has since vanished. `projectName` matches the integration
 * project's real name so the storage key lines up with what the app itself
 * would compute.
 *
 * Uses `page.addInitScript` (runs before ANY page script on the next
 * navigation) rather than a live `page.evaluate` write — the latter races
 * `Workspace.jsx`'s own "persist the tab set on every change" effect, which
 * can re-fire (e.g. on an unrelated background poll/re-render) and clobber
 * a live write with the CURRENTLY-mounted app's own (still just
 * `[realTab]`) state before the reload actually happens. An init script
 * applies strictly before the reloaded document's own JS boots, so there's
 * no live app instance left to race. */
async function seedTabSet(page, projectName, tabs, activeView = 'explorer') {
  await page.addInitScript(
    ({ key, tabs, activeView }) => {
      window.localStorage.setItem(key, JSON.stringify({ tabs, activeView }));
    },
    { key: `visivo.workspace.tabs.${projectName}`, tabs, activeView }
  );
}

async function getProjectName(page) {
  return page.evaluate(() => {
    const p = window.useStore.getState().project;
    return p?.project_json?.name || p?.name || 'project';
  });
}

test.describe('Tab-strip power features against a phantom exploration tab (#25)', () => {
  // Headroom for combined-load contention against the shared sandbox
  // (mirrors exploration-lifecycle.spec.mjs's own rationale) — each test
  // reloads the page at least once.
  test.describe.configure({ timeout: 60000 });

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

  test('a phantom exploration tab restored from localStorage: label falls back to the raw id, and landing on it (click) reaches a clean not-found state', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const realId = await newExploration(page);
    const projectName = await getProjectName(page);

    // Delete the real exploration's backend record directly (out-of-band —
    // never routed through THIS session's own `deleteExploration`, which is
    // the only path that force-closes + toasts). The tab stays in the
    // client's in-memory strip until a reload re-reads the persisted set.
    const phantomId = 'exp_phantom_never_created_0001';
    await page.request.delete(`${API}/api/explorations/${realId}/`);

    // Seed the persisted tab-set as if a PRIOR session had this exploration
    // (now deleted) open, plus the never-created phantom id — simulating
    // restoreWorkspaceTabs blindly restoring a stale snapshot with zero
    // cross-check against the fetched workspaceExplorations list.
    await seedTabSet(page, projectName, [
      { id: `exploration:${realId}`, type: 'exploration', name: realId },
      { id: `exploration:${phantomId}`, type: 'exploration', name: phantomId },
    ]);

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Both tabs restored into the strip — restoreWorkspaceTabs sanitizes
    // shape only, no existence cross-check.
    const realTab = page.getByTestId(`workspace-tab-exploration:${realId}`);
    const phantomTab = page.getByTestId(`workspace-tab-exploration:${phantomId}`);
    await expect(realTab).toBeVisible({ timeout: 15000 });
    await expect(phantomTab).toBeVisible();

    // Label fallback (TabStrip.jsx's explorationDisplayName): neither
    // record resolves via workspaceExplorations.byId (both are gone/never
    // existed), so the tab falls back to displaying the raw backend id.
    await expect(phantomTab).toContainText(phantomId);
    await expect(realTab).toContainText(realId);

    // Landing on the phantom tab via a click reaches a clean not-found
    // state — never a crash.
    await page.getByTestId(`workspace-tab-select-exploration:${phantomId}`).click();
    await expect(page.getByTestId('workspace-middle-exploration-not-found')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/doesn't exist/i)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/workspace/exploration/${phantomId}`);

    // The tab strip itself is still fully functional — the real (now also
    // deleted) tab is still selectable without crashing the app either.
    await page.getByTestId(`workspace-tab-select-exploration:${realId}`).click();
    await expect(page.getByTestId('workspace-middle-exploration-not-found')).toBeVisible({
      timeout: 15000,
    });
  });

  test('Cmd/Ctrl+4-9 position shortcuts and drag-reorder are type/record-agnostic — landing on a phantom tab by POSITION reaches the same clean not-found state', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const realId = await newExploration(page);
    const projectName = await getProjectName(page);

    const phantomId = 'exp_phantom_position_0002';
    await seedTabSet(page, projectName, [
      { id: `exploration:${realId}`, type: 'exploration', name: realId },
      { id: `exploration:${phantomId}`, type: 'exploration', name: phantomId },
    ]);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(`workspace-tab-exploration:${realId}`)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId(`workspace-tab-exploration:${phantomId}`)).toBeVisible();

    // Cmd/Ctrl+4 -> first tab position (real), Cmd/Ctrl+5 -> second tab
    // position (phantom) — useWorkspaceTabShortcuts.js's `switchWorkspaceTab`
    // is a plain array-index lookup, agnostic to whether the tab's backend
    // record actually exists.
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+5' : 'Control+5');

    // Poll the STORE (not an immediate `page.url()` read, which can catch
    // the URL mid-navigation) for the expected active tab, then confirm the
    // URL followed suit.
    await page.waitForFunction(
      expectedId => window.useStore.getState().workspaceActiveTabId === expectedId,
      `exploration:${phantomId}`,
      { timeout: 10000 }
    );
    await page.waitForURL(new RegExp(`/workspace/exploration/${phantomId}$`), { timeout: 10000 });
    await expect(page.getByTestId('workspace-middle-exploration-not-found')).toBeVisible({
      timeout: 15000,
    });
    expect(new URL(page.url()).pathname).toBe(`/workspace/exploration/${phantomId}`);

    // Cmd/Ctrl+4 switches back to the real (first-position) tab without
    // incident — the shortcut layer never distinguishes phantom from real.
    await page.keyboard.press(isMac ? 'Meta+4' : 'Control+4');
    await expect(page.getByTestId(`workspace-tab-exploration:${realId}`)).toHaveAttribute(
      'data-active',
      'true'
    );

    // Drag-reorder the phantom tab ahead of the real one — reorderWorkspaceTabs
    // is a plain id/array-index operation with no type/record awareness, so
    // this must succeed exactly like reordering any other pair of tabs
    // (workspace-tabs-shortcuts.spec.mjs's own "drag-to-reorder tabs with a
    // real cursor" is the reference gesture this mirrors).
    // Real pointer drag, mirroring workspace-tabs-shortcuts.spec.mjs's own
    // "drag-to-reorder tabs with a real cursor" reference geometry: glide
    // onto the target's LEFT THIRD so closestCenter resolves to it.
    const phantomWrapper = page.getByTestId(`workspace-tab-wrapper-exploration:${phantomId}`);
    const realWrapper = page.getByTestId(`workspace-tab-wrapper-exploration:${realId}`);
    const phantomBox = await phantomWrapper.boundingBox();
    const realBox = await realWrapper.boundingBox();

    await page.mouse.move(phantomBox.x + phantomBox.width / 2, phantomBox.y + phantomBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(realBox.x + realBox.width / 3, realBox.y + realBox.height / 2, {
      steps: 12,
    });
    await page.mouse.move(realBox.x + realBox.width / 3, realBox.y + realBox.height / 2, {
      steps: 4,
    });
    await page.mouse.up();

    // Reorder succeeded (no crash) — the phantom tab is now in the FIRST
    // position, confirmed by Cmd/Ctrl+4 now landing on IT instead of the
    // real tab.
    await page.keyboard.press(isMac ? 'Meta+4' : 'Control+4');
    const activeTabId = await page.evaluate(() => window.useStore.getState().workspaceActiveTabId);
    expect(activeTabId).toBe(`exploration:${phantomId}`);
  });
});
