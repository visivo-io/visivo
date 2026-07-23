/**
 * Story: Commit-broadcast reload symmetry across /workspace, /project, and
 * /runs (Explore 2.0 e2e-gap-review.md D7 — "VIS-1087's remaining half").
 *
 * `commit_views.py`'s `commit_changes()` calls
 * `hot_reload_server.socketio.emit('reload')` — an UNSCOPED broadcast to
 * every connected socket (unchanged by this fix; see hot_reload_server.py).
 * The injected `/hot-reload.js` (baked into every served index.html) only
 * skips the hard `window.location.reload()` when
 * `window.__VISIVO_SOFT_RELOAD__` is true, and that flag is set by
 * `useProjectChangeListener()` (viewer/src/components/views/workspace/
 * useProjectChangeListener.js). Before this fix, ONLY `Workspace.jsx` ever
 * called that hook — so `/project` (Project.jsx) and `/runs` (RunsView.jsx),
 * which mount OUTSIDE the Workspace shell (LocalRouter.jsx), hard-reloaded on
 * every commit fired from any `/workspace/...` tab. The fix mounts the SAME
 * hook in `Project.jsx`/`RunsView.jsx` too — mechanical, behavior-preserving,
 * does not retire or fold `/project` into the Workspace (03-delivery-plan.md's
 * "Resolved questions" §1 keeps it the separate "consumer surface").
 *
 * This story proves the asymmetry is GONE: all three routes set the
 * soft-reload flag, and a real commit fired from `/workspace` never hard-
 * reloads a `/project` or `/runs` tab (asserted via a `window`-scoped marker
 * that only a hard `window.location.reload()` would wipe).
 *
 * Mutates test-projects/integration/project.visivo.yml via a REAL commit —
 * snapshots + byte-restores it, same pattern as build-mode-publish.spec.mjs /
 * external-edit-banner.spec.mjs. Runs in the isolated 'workspace-publish'
 * playwright project (serial, no retries) since it fires a real
 * `POST /api/commit/` against shared sandbox state.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8051 VISIVO_SANDBOX_FRONTEND_PORT=3051 \
 *   VISIVO_SANDBOX_NAME=vis806 bash scripts/sandbox.sh start
 *   # then: VIS_PUBLISH_BASE=http://localhost:3051 npx playwright test cross-tab-soft-reload
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { io as ioClient } from 'socket.io-client';
import { apiBase } from '../helpers/sandbox.mjs';

const BASE =
  process.env.VIS_PUBLISH_BASE || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';
// P6-D14 (e2e-gap-review.md "Phase 6 delta pass") — derive the backend port
// from BASE's OWN frontend port, never hardcode :8001. Every sandbox
// invocation in this suite (including this spec's own header:
// VISIVO_SANDBOX_BACKEND_PORT=8051 paired with FRONTEND_PORT=3051) pairs a
// frontend port "3xxx" with a backend port "8xxx" sharing the same trailing
// digits (:3001<->:8001, :3044<->:8044, :3047<->:8047, :3051<->:8051).
// Hardcoding 8001 meant that under the documented isolated-sandbox
// invocation (BASE=:3051), the dirty-model POST and the real commit this
// test fires hit the SHARED :8001 backend instead of the isolated :8051 one
// — committing a junk model into the shared sandbox's
// project.visivo.yml and firing an unscoped reload broadcast at every
// :8001-connected page, while this test's own marker-survival assertions
// went vacuous for the (never-received) commit-broadcast path.
const WAIT = 20000;
// The commit broadcast is near-instant (a bare socket.io emit); this just
// gives every page's socket + hot-reload.js handler time to run before we
// poll for the marker's survival.
const SETTLE_WAIT = 8000;

const PROJECT_YML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../test-projects/integration/project.visivo.yml'
);

const MODEL_NAME = `e2e_d7_model_${Date.now()}`;

/** Mark the page's CURRENT JS context. A hard `window.location.reload()`
 * creates a brand-new JS context (this marker is gone); a soft refresh
 * (refetch + re-render in place) never touches an unrelated `window`
 * property, so the marker survives untouched either way. */
const markAlive = page =>
  page.evaluate(() => {
    window.__E2E_D7_ALIVE_MARKER__ = 'still-alive';
  });

const isStillAlive = page =>
  page.evaluate(() => window.__E2E_D7_ALIVE_MARKER__ === 'still-alive').catch(() => false);

const softReloadFlagIsSet = page =>
  page.evaluate(() => window.__VISIVO_SOFT_RELOAD__ === true).catch(() => false);

// This test drives its own manually-created `browser.newContext()` (three
// real tabs sharing one profile) rather than the fixture-managed default
// `page`/`context` — tracing that ad-hoc context alongside the unused
// default one hit a Playwright trace-artifact housekeeping error (ENOENT on
// an internal recording file) in this environment that has nothing to do
// with this story's own assertions (which all pass before the error surfaces
// at context teardown). Trace/screenshot aren't needed here — every
// assertion is a plain boolean read off `window`, not a visual one.
test.use({ trace: 'off', screenshot: 'off' });

test.describe('Commit-broadcast reload symmetry across /workspace, /project, /runs (D7)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  let originalYaml;

  test.beforeAll(async ({ request }) => {
    originalYaml = fs.readFileSync(PROJECT_YML, 'utf8');
    await request.post(`${BASE}/api/commit/discard/`).catch(() => {});
  });

  test.afterAll(async ({ request }) => {
    await request.post(`${BASE}/api/commit/discard/`).catch(() => {});
    if (originalYaml !== undefined && fs.readFileSync(PROJECT_YML, 'utf8') !== originalYaml) {
      fs.writeFileSync(PROJECT_YML, originalYaml);
      // Let the file watcher's recompile settle before the next test file
      // touches the sandbox (mirrors build-mode-publish.spec.mjs /
      // external-edit-banner.spec.mjs's identical restore wait).
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
  });

  test('all three routes set the soft-reload flag, and a commit from /workspace never hard-reloads /project or /runs', async ({
    browser,
  }) => {
    // A single shared context (three real OS-level browser tabs in one
    // profile), not three independent `browser.newPage()` contexts — matches
    // #13's own note on the closest-analogous multi-page pattern in this
    // suite, and avoids a Playwright trace-recording collision observed
    // across three simultaneously-traced AD-HOC contexts in this project's
    // global `trace: 'retain-on-failure'` config.
    const context = await browser.newContext();
    const pageWorkspace = await context.newPage();
    const pageProject = await context.newPage();
    const pageRuns = await context.newPage();

    // P6-D7 (e2e-gap-review.md "Phase 6 delta pass") — the marker-survival
    // assertions below are a NEGATIVE control only: with the soft-reload
    // flag set, a delivered 'reload' event and a completely DEAD broadcast
    // (socketio.emit removed, socket never connects, hot-reload.js's handler
    // deleted) produce identical page state — the marker "survives" either
    // way. The POSITIVE control needs proof the 'reload' broadcast was
    // actually emitted and delivered.
    //
    // NOT via a browser-side console.log assertion on hot_reload_server.py's
    // injected "Soft reload handled by app…" line: that script is injected
    // into the HTML Flask serves directly (see hot_reload_server.py's
    // `/hot-reload.js` route docstring), which never happens against this
    // suite's actual sandbox topology — `sandbox.sh`'s frontend
    // (`yarn start:local` / plain `vite`) serves the viewer's OWN
    // `index.html` (no hot-reload.js reference at all) and only proxies
    // `/api`/`/socket.io` to Flask (vite.config.mjs); confirmed by direct
    // reproduction (the console never contains that line under this
    // topology, run in isolation, independent of anything this pass
    // touches). `useProjectChangeListener.js` (the React-mounted hook that
    // sets the flag this test already checks) also does NOT itself
    // subscribe to 'reload' — only sets the flag `/hot-reload.js` reads.
    //
    // Instead: connect directly to the backend's own Socket.IO server from
    // this test's Node context (independent of whatever the browser happens
    // to be running) and assert the 'reload' event is genuinely broadcast —
    // this is exactly the "socket-received counter" alternative
    // e2e-gap-review.md's finding names, and it would fail if
    // `commit_views.py`'s `socketio.emit("reload")` were ever deleted, where
    // the marker-survival checks alone would not.
    const reloadEventTimestamps = [];
    const probeSocket = ioClient(apiBase, { transports: ['websocket', 'polling'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('probe socket connect timeout')), WAIT);
      probeSocket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      probeSocket.once('connect_error', err => {
        clearTimeout(timer);
        reject(err);
      });
    });
    probeSocket.on('reload', () => reloadEventTimestamps.push(Date.now()));

    await pageWorkspace.goto(`${BASE}/workspace`);
    await pageWorkspace.waitForLoadState('networkidle');
    await expect(pageWorkspace.getByTestId('workspace-route-root')).toBeVisible({ timeout: WAIT });

    await pageProject.goto(`${BASE}/project`);
    await pageProject.waitForLoadState('networkidle');

    await pageRuns.goto(`${BASE}/runs`);
    await pageRuns.waitForLoadState('networkidle');

    // Precondition (the fix itself): before D7, only /workspace ever set
    // this flag — /project and /runs never did.
    await expect.poll(() => softReloadFlagIsSet(pageWorkspace), { timeout: WAIT }).toBe(true);
    await expect.poll(() => softReloadFlagIsSet(pageProject), { timeout: WAIT }).toBe(true);
    await expect.poll(() => softReloadFlagIsSet(pageRuns), { timeout: WAIT }).toBe(true);

    await markAlive(pageWorkspace);
    await markAlive(pageProject);
    await markAlive(pageRuns);

    // A real dirty change + a real commit, fired from the /workspace tab —
    // exactly the scenario D7 describes (User A commits from /workspace;
    // User B, or the same user's second tab, sits on /project or /runs).
    const dirtyRes = await pageWorkspace.request.post(`${apiBase}/api/models/${MODEL_NAME}/`, {
      data: { sql: 'select 1' },
    });
    expect(dirtyRes.ok()).toBe(true);
    const commitRes = await pageWorkspace.request.post(`${apiBase}/api/commit/`);
    expect(commitRes.ok()).toBe(true);

    await pageProject.waitForTimeout(SETTLE_WAIT);

    // The marker survives on ALL THREE pages — none of them hard-reloaded.
    // Before the D7 fix, /project and /runs would have hard-navigated here
    // (window.location.reload()), wiping this marker.
    expect(await isStillAlive(pageWorkspace)).toBe(true);
    expect(await isStillAlive(pageProject)).toBe(true);
    expect(await isStillAlive(pageRuns)).toBe(true);

    // P6-D7 — the POSITIVE control: the probe socket genuinely received the
    // 'reload' broadcast, proving `commit_changes()` actually emitted it
    // (not just that the three pages' markers happened to survive for some
    // unrelated reason).
    expect(reloadEventTimestamps.length).toBeGreaterThan(0);

    probeSocket.close();
    await context.close();
  });
});
