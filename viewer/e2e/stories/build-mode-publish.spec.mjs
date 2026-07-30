/**
 * Story: Build-mode commit + discard via the shared TopNav (VIS-806 / Track H H-1).
 *
 * The Workspace now renders UNDER Home's shared <TopNav>; commit / deploy live
 * in that nav — mutually exclusive by dirty state (main's merged
 * Commit-XOR-Deploy TopNav): a Commit button surfaces when there are
 * uncommitted draft changes, and a Deploy button surfaces when the project is
 * clean. The commit-confirm + Discard flow is the layout-level
 * <CommitModal>. Every canvas action auto-saves to the backend draft cache,
 * which flips the nav into the dirty state; Commit flushes the cache to YAML;
 * Discard (in the modal) drops the cache and the canvas reverts.
 *
 * The commit step REALLY writes test-projects/integration/project.visivo.yml.
 * The suite snapshots the file in beforeAll and restores it byte-for-byte in
 * afterAll (which also re-triggers the watcher so the sandbox recompiles back
 * to baseline), plus discards any leftover drafts on both ends.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8051 VISIVO_SANDBOX_FRONTEND_PORT=3051 \
 *   VISIVO_SANDBOX_NAME=vis806 bash scripts/sandbox.sh start
 *   # then: VIS_PUBLISH_BASE=http://localhost:3051 npx playwright test build-mode-publish
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.VIS_PUBLISH_BASE || 'http://localhost:3051';

// Requires the DEDICATED isolated sandbox documented above (:8051/:3051).
// Without VIS_PUBLISH_BASE explicitly set, the target does not exist in the
// standard :8001/:3001 topology and every test here would fail on
// ERR_CONNECTION_REFUSED — skip loudly instead so shared-sandbox
// invocations (e.g. `--project=workspace-publish` in the canonical gate's
// stage B) report an honest 'infrastructure not provisioned' skip, never a
// vacuous red. This is an env-var opt-in gate, not a result-dependent skip.
test.skip(
  !process.env.VIS_PUBLISH_BASE,
  'requires the isolated VIS_PUBLISH_BASE sandbox (see header) — not the shared :3001 sandbox'
);
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

const PROJECT_YML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../test-projects/integration/project.visivo.yml'
);

test.use({ viewport: { width: 1600, height: 1400 } });

// Commit and Deploy are the shared TopNav's mutually-exclusive action button
// (main's merged Commit-XOR-Deploy-by-dirty-state contract): the Commit button
// (title "Commit changes") renders ONLY when the project is dirty, and the
// Deploy button (title "Deploy") renders ONLY when the project is clean.
const navCommit = page => page.getByTitle('Commit changes');
const navDeploy = page => page.getByTitle('Deploy');

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
  const dash = page.getByTestId(`dashboard_${DASHBOARD}`);
  await expect(dash).toBeVisible({ timeout: WAIT });
  await expect(dash.locator('[data-row-index]').first()).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('canvas-add-row')).toBeAttached({ timeout: WAIT });
};

// Append a 3-up row through the real "+ Add row" affordance — the canvas
// action whose auto-save flips the nav into the dirty (committable) state.
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

const discardViaApi = async request => {
  await request.post(`${BASE}/api/commit/discard/`).catch(() => {});
};

// Self-contained test setup: drop any leftover drafts on the backend, wait
// until it reports clean, then open a fresh canvas. Clean ⇒ the shared nav
// shows no Commit button. Keeps every test independent of its predecessors.
const startClean = async (page, request) => {
  await discardViaApi(request);
  await expect
    .poll(
      async () => {
        const res = await request.get(`${BASE}/api/commit/pending/`);
        return (await res.json()).count;
      },
      { timeout: WAIT }
    )
    .toBe(0);
  await openCanvas(page);
  await expect(navCommit(page)).toHaveCount(0, { timeout: WAIT });
};

test.describe('Build-mode commit + discard via shared TopNav (VIS-806 / H-1)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180000);

  /** @type {import('@playwright/test').Page} */
  let page;
  let originalYaml;

  test.beforeAll(async ({ browser, request }) => {
    originalYaml = fs.readFileSync(PROJECT_YML, 'utf8');
    await discardViaApi(request);
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
  });

  test.afterAll(async ({ request }) => {
    // Byte-for-byte YAML restore + draft drop, then give the watcher a beat
    // to recompile back to baseline so the next suite sees a clean sandbox.
    await discardViaApi(request);
    if (originalYaml !== undefined && fs.readFileSync(PROJECT_YML, 'utf8') !== originalYaml) {
      fs.writeFileSync(PROJECT_YML, originalYaml);
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    await page.close();
  });

  test('clean baseline: Deploy visible (not Commit) in the nav, and the nav is the interactive top surface', async ({
    request,
  }) => {
    await startClean(page, request);
    // Clean ⇒ Deploy is the visible action and Commit is absent (main's merged
    // Commit-XOR-Deploy-by-dirty-state TopNav; the old feature-branch nav showed
    // NEITHER button when clean).
    await expect(navDeploy(page)).toBeVisible();
    await expect(navCommit(page)).toHaveCount(0);

    // Regression guard for the un-overlay: the workspace must sit UNDER the
    // shared sticky TopNav now — the element at the very top is the <nav>,
    // not the workspace root (the old z-[60] overlay covered the nav).
    const topIsNav = await page.evaluate(() => {
      const hit = document.elementFromPoint(Math.floor(window.innerWidth / 2), 12);
      return Boolean(hit && hit.closest('nav'));
    });
    expect(topIsNav, 'the shared TopNav is the top interactive surface').toBe(true);
    await page.screenshot({ path: `${SCREENS}/vis806-01-clean-nav.png` });
  });

  test('a canvas action surfaces Commit and hides Deploy; Deploy (clean state) opens the deploy modal', async ({
    request,
  }) => {
    await startClean(page, request);

    // Clean ⇒ Deploy is the visible action (main's merged Commit-XOR-Deploy-by-
    // dirty-state TopNav), so the deploy modal is exercised from the clean state.
    // The nav Deploy opens Home's deploy modal.
    await expect(navDeploy(page)).toBeVisible({ timeout: WAIT });
    await navDeploy(page).click();
    await expect(page.getByText('Project Deployment')).toBeVisible({ timeout: WAIT });
    await page.getByRole('button', { name: '×' }).click();
    await expect(page.getByText('Project Deployment')).toHaveCount(0);

    // A canvas action auto-saves → the project goes dirty → the nav swaps Deploy
    // out for Commit (Commit-XOR-Deploy: dirty shows Commit, Deploy is absent).
    await addRowViaCanvas(page);
    await expect(navCommit(page)).toBeVisible({ timeout: WAIT });
    // The Commit button badges the live pending-change count.
    await expect(navCommit(page)).toContainText('1');
    await expect(navDeploy(page)).toHaveCount(0);
    await page.screenshot({ path: `${SCREENS}/vis806-02-dirty-nav.png` });
  });

  test('Discard (in the commit modal) drops the draft cache → canvas reverts', async ({
    request,
  }) => {
    await startClean(page, request);
    const baselineRows = (await readRows(page)).length;
    await addRowViaCanvas(page);
    expect((await readRows(page)).length).toBe(baselineRows + 1);
    await expect(navCommit(page)).toBeVisible({ timeout: WAIT });

    // Commit button opens the modal; the modal hosts Discard.
    await navCommit(page).click();
    await expect(page.getByTestId('commit-modal-pending-list')).toBeVisible({ timeout: WAIT });
    await page.getByTestId('commit-modal-discard').click();
    await expect(page.getByTestId('commit-modal-discard-confirm')).toHaveText(
      /Discard all 1 change\?/
    );
    await page.screenshot({ path: `${SCREENS}/vis806-03-discard-confirm.png` });
    await page.getByTestId('commit-modal-discard-confirm-button').click();

    // Modal closes, the nav swaps Commit back out for Deploy (main's merged
    // Commit-XOR-Deploy-by-dirty-state TopNav: discard returns to clean), and
    // the canvas re-renders from last-committed state (the added row is dropped).
    await expect(page.getByTestId('commit-modal-pending-list')).toHaveCount(0, { timeout: WAIT });
    await expect(navCommit(page)).toHaveCount(0, { timeout: WAIT });
    await expect(navDeploy(page)).toBeVisible({ timeout: WAIT });
    await expect
      .poll(async () => (await readRows(page)).length, { timeout: WAIT })
      .toBe(baselineRows);
    await page.screenshot({ path: `${SCREENS}/vis806-04-after-discard.png` });
  });

  test('Commit: modal lists the pending change → YAML written → nav returns clean', async ({
    request,
  }) => {
    await startClean(page, request);
    const yamlBefore = fs.readFileSync(PROJECT_YML, 'utf8');
    const rowsAfterAdd = (await addRowViaCanvas(page)) + 1;

    await expect(navCommit(page)).toBeVisible({ timeout: WAIT });
    await navCommit(page).click();

    // The modal confirm step lists the dashboard's pending change.
    const modalCommit = page.getByRole('button', { name: 'Commit Changes' });
    await expect(modalCommit).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('commit-modal-pending-list')).toContainText(DASHBOARD);
    await page.screenshot({ path: `${SCREENS}/vis806-05-commit-modal.png` });

    await modalCommit.click();

    // The modal closes and the nav returns clean: Commit is gone and Deploy is
    // back (main's merged Commit-XOR-Deploy-by-dirty-state TopNav).
    await expect(page.getByTestId('commit-modal-pending-list')).toHaveCount(0, { timeout: WAIT });
    await expect(navCommit(page)).toHaveCount(0, { timeout: WAIT });
    await expect(navDeploy(page)).toBeVisible({ timeout: WAIT });

    // YAML round-trip: the file actually changed on disk and the backend
    // reports a clean draft cache.
    const yamlAfter = fs.readFileSync(PROJECT_YML, 'utf8');
    expect(yamlAfter).not.toBe(yamlBefore);
    const pending = await (await request.get(`${BASE}/api/commit/pending/`)).json();
    expect(pending.count).toBe(0);

    // The committed row survives a re-fetch (it's in YAML now, not the cache).
    await expect
      .poll(async () => (await readRows(page)).length, { timeout: WAIT })
      .toBe(rowsAfterAdd);
  });

  test('the nav commit/deploy actions stay on-screen at 1280px', async ({ request }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await startClean(page, request);

    // Commit and Deploy are mutually exclusive by dirty state (main's merged
    // Commit-XOR-Deploy TopNav), so only one action ever renders — assert each
    // fits inside 1280px in the state that shows it, not both at once.
    // Clean ⇒ Deploy is the on-screen action.
    await expect(navDeploy(page)).toBeVisible({ timeout: WAIT });
    let box = await navDeploy(page).boundingBox();
    expect(box, 'Deploy button is rendered').toBeTruthy();
    expect(box.x + box.width, 'Deploy fits inside 1280px').toBeLessThanOrEqual(1280);

    // Dirty ⇒ Deploy is swapped out for the Commit button.
    await addRowViaCanvas(page);
    await expect(navCommit(page)).toBeVisible({ timeout: WAIT });
    box = await navCommit(page).boundingBox();
    expect(box, 'Commit button is rendered').toBeTruthy();
    expect(box.x + box.width, 'Commit fits inside 1280px').toBeLessThanOrEqual(1280);

    await page.screenshot({ path: `${SCREENS}/vis806-06-1280-nav.png` });

    // Clean up the extra draft so afterAll's restore starts from a known state.
    await navCommit(page).click();
    await page.getByTestId('commit-modal-discard').click();
    await page.getByTestId('commit-modal-discard-confirm-button').click();
    await expect(navCommit(page)).toHaveCount(0, { timeout: WAIT });
  });

  test('no console errors across the commit/discard gestures', async () => {
    const NOISE = [
      'favicon',
      'DevTools',
      'react-cool',
      'ResizeObserver',
      'Download the React DevTools',
    ];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real, `console errors:\n${real.join('\n')}`).toHaveLength(0);
  });
});
