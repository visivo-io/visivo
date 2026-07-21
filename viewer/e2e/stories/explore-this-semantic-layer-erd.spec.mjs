/**
 * Story: "Explore this" from the Semantic Layer ERD (Explore 2.0 Phase
 * 6c-T5 — ux-audit.md "No 'Explore this' entry point from Semantic Layer
 * ERD — nodes are completely inert", ⚠ conflicts-with-e2e).
 *
 * The audit's auditor tried both a right-click AND a left-click on a model
 * card in the Semantic Layer ERD and got nothing — no menu, no selection,
 * "the right rail still says 'Select an object from the Library or
 * Outline'". `semantic-layer-erd.spec.mjs` (the pre-existing suite) only
 * ever exercises relation nodes and layout/drag mechanics — it never drives
 * a MODEL card's own click/right-click, which is exactly the gap this audit
 * finding calls out. This story drives the fix the way a real user would:
 * navigate to the Semantic Layer, find a model card, and either right-click
 * it for "Explore this" or use the new always-visible header "Explore"
 * icon button — no testid shortcuts standing in for the gesture itself,
 * only for locating the real, on-screen affordances.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=exploreThisErd VISIVO_SANDBOX_BACKEND_PORT=8057 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3057 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3057 npx playwright test explore-this-semantic-layer-erd
 *
 * Mints real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), never
 * `parallel`. See the DOUBLE-REGISTRATION RULE note in
 * playwright.config.mjs: this filename must appear in BOTH
 * `exploration-mutations`'s `testMatch` and `parallel`'s `testIgnore`.
 */

import { test, expect } from '@playwright/test';
import { WAIT, openWorkspace } from '../helpers/workspace.mjs';

test.use({ viewport: { width: 1600, height: 1100 } });

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const apiBase = (() => {
  try {
    const u = new URL(BASE_URL);
    return `${u.protocol}//${u.hostname}:8001`;
  } catch {
    return 'http://localhost:8001';
  }
})();

// A real model in the integration test project (used elsewhere, e.g.
// relations-and-semantic.spec.mjs).
const MODEL = 'local_test_table';

async function openSemanticLayer(page) {
  await openWorkspace(page);
  await expect(page.getByTestId('project-semantic-layer-cta')).toBeVisible({ timeout: WAIT });
  await page.getByTestId('project-open-semantic-layer').click();
  await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible({ timeout: WAIT });
  const modelNode = page.getByTestId(`semantic-erd-model-node-${MODEL}`);
  await expect(modelNode).toBeVisible({ timeout: WAIT });
  return modelNode;
}

test.describe('"Explore this" from the Semantic Layer ERD (Phase 6c-T5)', () => {
  test.setTimeout(90000);

  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    idsBeforeTest = res && res.ok() ? (await res.json()).map(e => e.id) : [];
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    const idsAfter = res && res.ok() ? (await res.json()).map(e => e.id) : [];
    for (const id of idsAfter.filter(i => !idsBeforeTest.includes(i))) {
      await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('left-clicking a model card selects it (the right rail stops saying "Select an object...")', async ({
    page,
  }) => {
    const modelNode = await openSemanticLayer(page);
    // Before: nothing selected, the right rail's placeholder is showing.
    await modelNode.click();
    // The click routes through `setWorkspaceSelection` — verified via the
    // live store rather than the right rail's exact copy (owned by other
    // tracks), which is the actual bug this closes ("left-click doesn't
    // even select the object").
    await expect(async () => {
      const active = await page.evaluate(() => window.useStore.getState().workspaceActiveObject);
      expect(active).toEqual({ type: 'model', name: MODEL });
    }).toPass({ timeout: 5000 });
  });

  test('right-clicking a model card offers "Explore this", and using it mints a real, seeded exploration', async ({
    page,
  }) => {
    const modelNode = await openSemanticLayer(page);
    await modelNode.click({ button: 'right' });

    const ctxMenu = page.getByTestId('semantic-erd-node-ctx-menu');
    await expect(ctxMenu).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('semantic-erd-node-ctx-explore-this')).toBeVisible();

    await page.getByTestId('semantic-erd-node-ctx-explore-this').click();

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
    const explorationId = new URL(page.url()).pathname.split('/').pop();

    const exploration = await (
      await page.request.get(`${apiBase}/api/explorations/${explorationId}/`)
    ).json();
    expect(exploration.seeded_from).toMatchObject({ type: 'model', name: MODEL });
    // Phase 6c-T5 naming coherence: a deterministic, human-readable default
    // name derived from what was explored — never 'Scratch'/'Exploration N'.
    expect(exploration.name).toBe(`${MODEL} exploration`);
  });

  test('the always-visible header "Explore" button mints an exploration WITHOUT needing right-click at all', async ({
    page,
  }) => {
    await openSemanticLayer(page);
    // No hover, no right-click — the button is visible on the card by
    // default (ux-audit.md's "at least one visible, labeled path per
    // surface" direction).
    const exploreButton = page.getByTestId(`semantic-erd-model-explore-${MODEL}`);
    await expect(exploreButton).toBeVisible();
    await exploreButton.click();

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  });
});
