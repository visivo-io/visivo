/**
 * Story: Build-mode Save/Publish cluster (VIS-806 / Track H H-1).
 *
 * The Workspace TopBar mounts <CommitCluster> — the status pill + Discard +
 * Commit·N group. Every canvas action auto-saves to the backend draft cache;
 * the cluster's pending count updates live; Commit opens the confirm modal
 * and flushes the cache to YAML; Discard drops the cache and the canvas
 * reverts to last-committed state.
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
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

const PROJECT_YML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../test-projects/integration/project.visivo.yml'
);

test.use({ viewport: { width: 1600, height: 1400 } });

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
// action whose auto-save the cluster must surface.
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
// until it reports clean, then open a fresh canvas so the store re-hydrates
// from the clean state. Keeps every test independent of its predecessors.
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
  await expect(page.getByTestId('workspace-save-pill-clean')).toBeVisible({ timeout: WAIT });
};

test.describe('Build-mode Save/Publish cluster (VIS-806 / H-1)', () => {
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

  test('clean baseline: "Saved" pill, Publish disabled, no Discard', async ({ request }) => {
    await startClean(page, request);
    await expect(page.getByTestId('workspace-save-pill-clean')).toHaveText(/Saved/, {
      timeout: WAIT,
    });
    await expect(page.getByTestId('workspace-top-bar-commit')).toBeDisabled();
    await expect(page.getByTestId('workspace-top-bar-discard')).toHaveCount(0);

    // Regression guard: the Workspace overlay must stack ABOVE Home's fixed
    // TopNav (z-[60] > z-50). At the old z-40 the outer nav covered this bar,
    // making every cluster button visible-but-unclickable.
    const coveredByOuterNav = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="workspace-top-bar"]');
      const hit = document.elementFromPoint(Math.floor(window.innerWidth / 2), 24);
      return !(bar && hit && bar.contains(hit));
    });
    expect(coveredByOuterNav, 'workspace top bar is the interactive surface').toBe(false);

    // The bar's Deploy opens the real DeployModal (the outer nav's Deploy is
    // unreachable in Build mode now).
    await page.getByTestId('workspace-top-bar-deploy').hover();
    await page.getByTestId('workspace-top-bar-deploy').click();
    await expect(page.getByText('Project Deployment')).toBeVisible({ timeout: WAIT });
    await page.getByRole('button', { name: '×' }).click();
    await expect(page.getByText('Project Deployment')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/vis806-01-clean-cluster.png` });
  });

  test('a canvas action lights the cluster: live count + enabled Publish + Discard', async ({
    request,
  }) => {
    await startClean(page, request);
    await addRowViaCanvas(page);

    await expect(page.getByTestId('workspace-save-pill-dirty')).toHaveText(/1 change/, {
      timeout: WAIT,
    });
    const publish = page.getByTestId('workspace-top-bar-commit');
    await expect(publish).toBeEnabled();
    await expect(publish).toHaveText(/Commit/);
    await expect(publish).toHaveText(/1/);
    await expect(page.getByTestId('workspace-top-bar-discard')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/vis806-02-dirty-cluster.png` });
  });

  test('Discard: confirm dialog → draft cache dropped → canvas reverts', async ({ request }) => {
    await startClean(page, request);
    const baselineRows = (await readRows(page)).length;
    await addRowViaCanvas(page);
    expect((await readRows(page)).length).toBe(baselineRows + 1);
    await expect(page.getByTestId('workspace-save-pill-dirty')).toBeVisible({ timeout: WAIT });

    await page.getByTestId('workspace-top-bar-discard').hover();
    await page.getByTestId('workspace-top-bar-discard').click();
    await expect(page.getByTestId('workspace-discard-confirm')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('workspace-discard-confirm')).toHaveText(/Discard 1 change\?/);
    await page.screenshot({ path: `${SCREENS}/vis806-03-discard-confirm.png` });

    await page.getByTestId('workspace-discard-confirm-button').click();
    await expect(page.getByTestId('workspace-discard-confirm')).toHaveCount(0, {
      timeout: WAIT,
    });

    // Count returns to 0 and the canvas re-renders from last-published state.
    await expect(page.getByTestId('workspace-save-pill-clean')).toBeVisible({ timeout: WAIT });
    await expect
      .poll(async () => (await readRows(page)).length, { timeout: WAIT })
      .toBe(baselineRows); // reverted — the discarded row is gone
    await expect(page.getByTestId('workspace-top-bar-commit')).toBeDisabled();
    await page.screenshot({ path: `${SCREENS}/vis806-04-after-discard.png` });
  });

  test('Publish: modal lists the pending change → YAML written → "Published ✓" flash → clean', async ({
    request,
  }) => {
    await startClean(page, request);
    const yamlBefore = fs.readFileSync(PROJECT_YML, 'utf8');
    const rowsAfterAdd = (await addRowViaCanvas(page)) + 1;

    await expect(page.getByTestId('workspace-save-pill-dirty')).toBeVisible({ timeout: WAIT });
    await page.getByTestId('workspace-top-bar-commit').hover();
    await page.getByTestId('workspace-top-bar-commit').click();

    // The PublishModal confirm step lists the dashboard's pending change.
    const modalCommit = page.getByRole('button', { name: 'Commit Changes' });
    await expect(modalCommit).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('commit-modal-pending-list')).toContainText(DASHBOARD);
    await page.screenshot({ path: `${SCREENS}/vis806-05-publish-modal.png` });

    await modalCommit.click();

    // Transient success flash (≤2s) then the cluster settles clean.
    await expect(page.getByTestId('workspace-save-pill-committed')).toBeVisible({
      timeout: WAIT,
    });
    await page.screenshot({ path: `${SCREENS}/vis806-06-published-flash.png` });
    await expect(page.getByTestId('workspace-save-pill-clean')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('workspace-top-bar-commit')).toBeDisabled({ timeout: WAIT });

    // YAML round-trip: the file actually changed on disk and the backend
    // reports a clean draft cache.
    const yamlAfter = fs.readFileSync(PROJECT_YML, 'utf8');
    expect(yamlAfter).not.toBe(yamlBefore);
    const pending = await (await request.get(`${BASE}/api/commit/pending/`)).json();
    expect(pending.count).toBe(0);

    // The published row survives a re-fetch (it's in YAML now, not the cache).
    await expect
      .poll(async () => (await readRows(page)).length, { timeout: WAIT })
      .toBe(rowsAfterAdd);
  });

  test('cluster fits a 1280px top bar without pushing Deploy/utilities off-screen', async ({
    request,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await startClean(page, request);
    await addRowViaCanvas(page); // dirty state = widest cluster (pill+Discard+Publish·N)

    await expect(page.getByTestId('workspace-save-pill-dirty')).toBeVisible({ timeout: WAIT });
    for (const id of [
      'workspace-top-bar-commit',
      'workspace-top-bar-discard',
      'workspace-top-bar-deploy',
      'workspace-top-bar-slack',
      'workspace-top-bar-docs',
      'workspace-top-bar-account',
    ]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, `${id} is rendered`).toBeTruthy();
      expect(box.x + box.width, `${id} fits inside 1280px`).toBeLessThanOrEqual(1280);
    }
    await page.screenshot({ path: `${SCREENS}/vis806-07-1280-top-bar.png` });

    // Clean up the extra draft so afterAll's restore starts from a known state.
    await page.getByTestId('workspace-top-bar-discard').click();
    await expect(page.getByTestId('workspace-discard-confirm')).toBeVisible({ timeout: WAIT });
    await page.getByTestId('workspace-discard-confirm-button').click();
    await expect(page.getByTestId('workspace-save-pill-clean')).toBeVisible({ timeout: WAIT });
  });

  test('no console errors across the publish/discard gestures', async () => {
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
