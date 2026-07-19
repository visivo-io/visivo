/**
 * Story: Cross-tab workspace tab-set clobbering (e2e-gap-review.md #13
 * [MEDIUM · CONFIRMED_GAP]).
 *
 * Workspace.jsx persists the OPEN-TAB SET (+ active view) to ONE shared
 * per-project localStorage key (`visivo.workspace.tabs.<project>`) — not
 * per-browser-tab. Each real browser tab's `Workspace` instance:
 *   1. Restores from that key EXACTLY ONCE, at its own mount (a
 *      component-local `tabsRestored` ref — scoped to THIS JS runtime, with
 *      no awareness of any other tab).
 *   2. Re-serializes the FULL `{tabs, activeView}` blob back to the SAME key
 *      on every subsequent change to its own `workspaceTabs`/
 *      `workspaceActiveView`.
 *
 * There is no `window.addEventListener('storage', ...)` anywhere — so if Tab
 * B mounted BEFORE Tab A opened an exploration, Tab B's own restored
 * snapshot never learned about it, and the very next time Tab B's persist
 * effect fires (any unrelated change, e.g. switching destinations), it
 * clobbers the shared key with a tab-set that never included Tab A's
 * exploration. Reloading Tab A afterward silently loses that tab from the
 * restored strip — the exploration record itself stays safe on the backend
 * (this bug is purely about the localStorage-persisted UI tab-set), but the
 * user has to rediscover it via Explorer Home.
 *
 * Uses a SINGLE `browser.newContext()` (shared localStorage, exactly like
 * two real OS-level browser tabs in one profile) with TWO independent
 * `page`s from it — per the finding's own note, this is the one config no
 * other spec in this suite uses.
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const API = BASE_URL.replace(':3001', ':8001');

async function listExplorationIds(page) {
  const res = await page.request.get(`${API}/api/explorations/`).catch(() => null);
  if (!res || !res.ok()) return [];
  const data = await res.json().catch(() => []);
  return (data || []).map(e => e.id);
}

/** Every `visivo.workspace.tabs.<project>` key currently in localStorage —
 * there's exactly one live project in the sandbox, but reading by prefix
 * avoids hardcoding the project's display name (Workspace.jsx derives it
 * from `project.project_json?.name || project.name || 'project'`). */
const tabsStorageEntries = page =>
  page.evaluate(() => {
    const out = {};
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('visivo.workspace.tabs.')) {
        try {
          out[key] = JSON.parse(localStorage.getItem(key));
        } catch {
          out[key] = null;
        }
      }
    }
    return out;
  });

const clearTabsStorage = page =>
  page.evaluate(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('visivo.workspace.tabs.'))
      .forEach(k => localStorage.removeItem(k));
  });

const anyEntryHasTabId = (entries, tabId) =>
  Object.values(entries).some(v => (v?.tabs || []).some(t => t.id === tabId));

// This story drives its own manually-created `browser.newContext()` (two
// real tabs sharing one profile — the whole point of the test) rather than
// the fixture-managed default `page`/`context`. Tracing that ad-hoc context
// alongside the unused default one hits a Playwright trace-artifact
// housekeeping error (ENOENT on an internal recording file) in this
// environment unrelated to this story's own assertions — see the identical
// note in cross-tab-soft-reload-project-runs.spec.mjs.
test.use({ trace: 'off', screenshot: 'off' });

test.describe('Cross-tab workspace tab-set clobbering (#13)', () => {
  test.setTimeout(60000);

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

  test("a stale second browser tab clobbers the first tab's exploration entry in the shared workspace tab-set key (no cross-tab storage sync)", async ({
    browser,
  }) => {
    const context = await browser.newContext();

    // Start from a known-empty shared tab-set key (a fresh profile) so this
    // test's assertions aren't polluted by whatever a prior run/session left
    // behind.
    const bootstrap = await context.newPage();
    await bootstrap.goto(`${BASE_URL}/workspace`);
    await bootstrap.waitForLoadState('networkidle');
    await clearTabsStorage(bootstrap);
    await bootstrap.close();

    // Tab B mounts FIRST, on the bare /workspace root — its own one-time
    // localStorage restore (Workspace.jsx's `tabsRestored` effect) captures
    // the shared key as genuinely EMPTY. Nothing about the exploration Tab A
    // is about to create exists yet.
    const pageB = await context.newPage();
    await pageB.goto(`${BASE_URL}/workspace`);
    await pageB.waitForLoadState('networkidle');
    await expect(pageB.getByTestId('workspace-view-switcher')).toBeVisible({ timeout: 15000 });

    // Tab A opens SECOND (same shared context/localStorage) and creates a
    // real exploration — its persist effect writes the shared key with this
    // exploration's tab entry.
    const pageA = await context.newPage();
    await pageA.goto(`${BASE_URL}/workspace/exploration`);
    await pageA.waitForLoadState('networkidle');
    await expect(pageA.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 15000 });
    await pageA.getByTestId('explorer-home-new-exploration').click();
    await expect(pageA.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await pageA.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
    const explorationId = new URL(pageA.url()).pathname.split('/').pop();
    const tabId = `exploration:${explorationId}`;

    // Confirm Tab A's write really landed in the SHARED key (read via pageB
    // — same context, same storage) before Tab B does anything.
    await expect
      .poll(async () => anyEntryHasTabId(await tabsStorageEntries(pageB), tabId), { timeout: 10000 })
      .toBe(true);

    // Tab A parks its own exploration (switches to the Project destination,
    // matching explorer-home.spec.mjs's own "park via view-switch" pattern)
    // — the tab stays in ITS OWN strip, just unfocused. This ALSO re-fires
    // Tab A's OWN persist effect (workspaceActiveView changed), which still
    // correctly includes the exploration tab (Tab A's own in-memory state
    // was never touched by anything Tab B does) — a realistic "keep
    // working, switch destinations" step before Tab B's stale write lands.
    await pageA.getByTestId('workspace-view-switcher-project').click();
    await expect(pageA.getByTestId(`workspace-tab-exploration:${explorationId}`)).toHaveAttribute(
      'data-active',
      'false'
    );
    // Under heavy concurrent load, `openWorkspaceView`'s `history.pushState`
    // navigation can lag behind the store update above — wait for the URL
    // itself to have genuinely left the exploration's own deep-link before
    // the later reload, so that reload can't race a still-in-flight
    // navigation and land back on the exploration's own self-healing URL
    // (which would reintroduce the tab via `activateWorkspaceTab`,
    // independent of anything localStorage says — see the reload comment
    // below for why that specific URL is deliberately avoided).
    await pageA.waitForFunction(
      () => !window.location.pathname.includes('/workspace/exploration/'),
      { timeout: 10000 }
    );
    await expect
      .poll(async () => anyEntryHasTabId(await tabsStorageEntries(pageA), tabId), { timeout: 10000 })
      .toBe(true);

    // Tab B does something totally unrelated to Tab A's exploration — switch
    // destinations. This is enough to fire Workspace.jsx's persist effect
    // (keyed on `[workspaceTabs, workspaceActiveView, tabsStorageKey]`) using
    // Tab B's OWN in-memory state, which never learned about Tab A's tab.
    await pageB.getByTestId('workspace-view-switcher-semantic-layer').click();
    await expect(pageB.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true'
    );

    // The shared key is now clobbered: Tab A's exploration tab is gone from
    // EVERY entry (there is exactly one project's worth of entries in this
    // sandbox) — Tab B's write overwrote it with a tab-set that never
    // included it.
    await expect
      .poll(async () => anyEntryHasTabId(await tabsStorageEntries(pageB), tabId), { timeout: 10000 })
      .toBe(false);

    // Reload Tab A at its CURRENT (Project / bare workspace-root) URL — NOT
    // the exploration's own deep-link URL. Reloading AT the exploration's
    // own `/workspace/exploration/:id` URL would self-heal the tab back in
    // via the URL->store sync effect's `activateWorkspaceTab` regardless of
    // what localStorage says (that's exactly why
    // exploration-lifecycle.spec.mjs's "reload while the exploration tab is
    // ACTIVE" test passes even with this bug present). This test targets the
    // DIFFERENT, genuinely-broken case #13 describes: a PARKED tab, reloaded
    // from a non-tab (view) URL — nothing reintroduces it once the shared
    // localStorage key no longer carries it.
    await pageA.reload();
    await pageA.waitForLoadState('networkidle');
    await expect(pageA.getByTestId('workspace-route-root')).toBeVisible({ timeout: 15000 });
    await expect(pageA.getByTestId(`workspace-tab-exploration:${explorationId}`)).not.toBeVisible({
      timeout: 5000,
    });

    // The exploration RECORD itself is untouched on the backend — only its
    // open/parked UI tab-strip state was lost. Reopening it via Explorer
    // Home still works.
    const backendCheck = await pageA.request.get(`${API}/api/explorations/${explorationId}/`);
    expect(backendCheck.ok()).toBe(true);

    await context.close();
  });
});
