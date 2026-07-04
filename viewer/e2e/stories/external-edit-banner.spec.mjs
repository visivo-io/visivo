/**
 * Story: External-edit banner during a dirty Build session (VIS-808 / Track H H-2).
 *
 * With unsaved drafts in the Build session, an external edit to the project
 * YAML triggers the hot-reload pipeline: the backend drops the drafts
 * (Q15 last-write-wins), emits `project_changed {drafts_dropped: true}`,
 * and the Workspace soft-refreshes — canvas re-renders from the file's
 * state, the cluster returns to "Saved", and the warning banner appears at
 * the top of the canvas area (dismissible, non-blocking).
 *
 * Mutates test-projects/integration/project.visivo.yml from the OUTSIDE
 * (fs append of a comment — parse-identical, but a real watcher event), so
 * it runs in the isolated 'workspace-publish' playwright project (serial,
 * no retries). The suite snapshots and byte-restores the YAML.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8051 VISIVO_SANDBOX_FRONTEND_PORT=3051 \
 *   VISIVO_SANDBOX_NAME=vis806 bash scripts/sandbox.sh start
 *   # then: VIS_PUBLISH_BASE=http://localhost:3051 npx playwright test external-edit-banner
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.VIS_PUBLISH_BASE || 'http://localhost:3051';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;
// The watcher debounces 500ms, then recompiles + reruns — give the banner
// the full pipeline's worth of time.
const RELOAD_WAIT = 45000;

const PROJECT_YML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../test-projects/integration/project.visivo.yml'
);

test.use({ viewport: { width: 1600, height: 1200 } });

const readRows = page =>
  page.evaluate(name => {
    const s = window.useStore.getState();
    const d = (s.dashboards || []).find(x => x.name === name);
    const cfg = d ? d.config || d : null;
    return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
  }, DASHBOARD);

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('canvas-add-row')).toBeAttached({ timeout: WAIT });
};

const addRowViaCanvas = async page => {
  const before = (await readRows(page)).length;
  await page.getByTestId('canvas-add-row-end-button').click();
  await expect(page.getByTestId('row-template-menu')).toBeVisible({ timeout: WAIT });
  await page.getByTestId('row-template-3up').click();
  await expect
    .poll(async () => (await readRows(page)).length, { timeout: WAIT })
    .toBe(before + 1);
  return before;
};

test.describe('External-edit banner (VIS-808 / H-2)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180000);

  /** @type {import('@playwright/test').Page} */
  let page;
  let originalYaml;

  test.beforeAll(async ({ browser, request }) => {
    originalYaml = fs.readFileSync(PROJECT_YML, 'utf8');
    await request.post(`${BASE}/api/commit/discard/`).catch(() => {});
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
  });

  test.afterAll(async ({ request }) => {
    await request.post(`${BASE}/api/commit/discard/`).catch(() => {});
    if (originalYaml !== undefined && fs.readFileSync(PROJECT_YML, 'utf8') !== originalYaml) {
      fs.writeFileSync(PROJECT_YML, originalYaml);
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    await page.close();
  });

  test('an external YAML edit during a dirty session drops drafts and shows the banner', async () => {
    await openCanvas(page);
    // Clean ⇒ the shared nav shows no Commit button.
    await expect(page.getByTitle('Commit changes')).toHaveCount(0, { timeout: WAIT });
    const baselineRows = (await readRows(page)).length;

    // Dirty the session through a real canvas action → the nav surfaces Commit.
    await addRowViaCanvas(page);
    await expect(page.getByTitle('Commit changes')).toBeVisible({ timeout: WAIT });
    expect((await readRows(page)).length).toBe(baselineRows + 1);

    // External edit: touch the YAML outside Visivo (comment append — a real
    // file change for the watcher, parse-identical for the compiler).
    fs.writeFileSync(PROJECT_YML, `${originalYaml}\n# external edit ${process.pid}\n`);

    // The banner appears once the hot-reload pipeline lands...
    await expect(page.getByTestId('external-edit-banner')).toBeVisible({
      timeout: RELOAD_WAIT,
    });
    await expect(page.getByTestId('external-edit-banner')).toHaveText(
      /File changed externally/
    );
    await page.screenshot({ path: `${SCREENS}/vis808-01-banner.png` });

    // ...the draft row is gone (canvas re-rendered from the file's state,
    // Q15 last-write-wins) and the nav returns clean (no Commit button).
    await expect
      .poll(async () => (await readRows(page)).length, { timeout: WAIT })
      .toBe(baselineRows);
    await expect(page.getByTitle('Commit changes')).toHaveCount(0, { timeout: WAIT });
  });

  test('the banner does not block canvas interaction and dismisses on X', async () => {
    // Still visible from the previous test (30s auto-dismiss window).
    await expect(page.getByTestId('external-edit-banner')).toBeVisible({ timeout: WAIT });

    // Canvas stays interactive underneath: the add-row affordance still works.
    await page.getByTestId('canvas-add-row-end-button').click();
    await expect(page.getByTestId('row-template-menu')).toBeVisible({ timeout: WAIT });
    await page.keyboard.press('Escape');

    await page.getByTestId('external-edit-banner-dismiss').hover();
    await page.getByTestId('external-edit-banner-dismiss').click();
    await expect(page.getByTestId('external-edit-banner')).toHaveCount(0);
    await page.screenshot({ path: `${SCREENS}/vis808-02-dismissed.png` });
  });

  test('no console errors across the external-edit flow', async () => {
    const NOISE = [
      'favicon',
      'DevTools',
      'react-cool',
      'ResizeObserver',
      'Download the React DevTools',
      // socket.io reconnect chatter during the sandbox's recompile window
      'WebSocket',
      'websocket error',
      'xhr poll error',
    ];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real, `console errors:\n${real.join('\n')}`).toHaveLength(0);
  });
});
