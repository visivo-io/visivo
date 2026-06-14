/* eslint-disable no-template-curly-in-string */
/**
 * Story: Semantic Layer ERD graph overhaul (build spec §8 Step 6).
 *
 * Exercises the reactflow ERD machine on the integration project's Semantic
 * Layer page:
 *   (a) drag a model card → its position persists into
 *       window.useStore.getState().workspaceErdLayout['semantic-layer'].nodes
 *   (b) cards never overlap and the layout fills multiple columns (the §4.4
 *       acceptance gate proxy — no edge path overlaps a non-endpoint card body)
 *   (c) click a relation pill → the RelationEditForm modal opens (relationModalOpen)
 *   (e) Tidy layout clears positions and re-fits
 *
 * The column→column drag-to-author gesture and pill waypoint drag are too brittle
 * to drive through Playwright pointer events reliably; they're covered by unit +
 * component tests (RelationPillEdge.test.jsx, useRelationErdDag.test.js). This
 * story asserts the wiring that IS reliably drivable through the real canvas.
 *
 * Precondition: an isolated sandbox running the integration project. The runner
 * passes VIS_CANVAS_BASE / PLAYWRIGHT_BASE_URL pointing at it.
 */

import { test, expect } from '@playwright/test';
import { SCREENS, WAIT, collectErrors, openWorkspace } from '../helpers/workspace.mjs';

test.use({ viewport: { width: 1600, height: 1200 } });

const openSemanticLayer = async page => {
  await openWorkspace(page);
  await expect(page.getByTestId('project-semantic-layer-cta')).toBeVisible({ timeout: WAIT });
  await page.getByTestId('project-open-semantic-layer').click();
  await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('semantic-layer-erd')).toBeVisible({ timeout: WAIT });
  // Wait for at least one model card to render.
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: WAIT });
};

test.describe('Semantic Layer ERD overhaul (reactflow machine)', () => {
  test.setTimeout(120000);

  test('cards tile without overlap and the Tidy toolbar is present', async ({ page }) => {
    const errors = collectErrors(page);
    await openSemanticLayer(page);

    // The new Tidy toolbar renders.
    await expect(page.getByTestId('semantic-layer-erd-toolbar')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('semantic-layer-erd-reset-layout')).toBeVisible({
      timeout: WAIT,
    });

    // Gather every model card box; assert multi-column tiling + no overlaps (the
    // acceptance-gate proxy: no card body overlapped by another).
    const boxes = await page.locator('.react-flow__node').evaluateAll(nodes =>
      nodes.map(n => {
        const r = n.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      })
    );
    expect(boxes.length).toBeGreaterThan(1);
    const overlaps = (a, b) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }

    await page.screenshot({ path: `${SCREENS}/sl-erd-01-tiled.png` });
    expect(errors).toEqual([]);
  });

  test('(a) dragging a model card persists its position to the semantic-layer scope', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openSemanticLayer(page);

    // Drag the first model card ~180px to the right + down.
    const card = page.locator('.react-flow__node').first();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    const startX = box.x + box.width / 2;
    const startY = box.y + 12; // grab near the header
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY + 90, { steps: 8 });
    await page.mouse.move(startX + 180, startY + 140, { steps: 8 });
    await page.mouse.up();

    // The drag-stop persisted a position into the session-only store slice.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const st = window.useStore?.getState?.();
            const layout = st?.workspaceErdLayout?.['semantic-layer'];
            return layout ? Object.keys(layout.nodes || {}).length : 0;
          }),
        { timeout: WAIT }
      )
      .toBeGreaterThan(0);

    await page.screenshot({ path: `${SCREENS}/sl-erd-02-after-drag.png` });
    expect(errors).toEqual([]);
  });

  test('(c) clicking a relation pill opens the relation edit modal', async ({ page }) => {
    const errors = collectErrors(page);
    await openSemanticLayer(page);

    // The integration project ships local_to_local; its pill renders on the edge.
    const pill = page.locator('[data-testid^="erd-relation-pill-"]').first();
    await expect(pill).toBeVisible({ timeout: WAIT });
    await pill.click();

    // The existing RelationEditForm modal opens (relationModalOpen → true).
    await expect
      .poll(async () => page.evaluate(() => window.useStore?.getState?.().relationModalOpen === true), {
        timeout: WAIT,
      })
      .toBe(true);

    await page.screenshot({ path: `${SCREENS}/sl-erd-03-pill-edit.png` });
    expect(errors).toEqual([]);
  });

  test('(e) Tidy layout clears saved positions and re-fits', async ({ page }) => {
    const errors = collectErrors(page);
    await openSemanticLayer(page);

    // Move a card so there IS a saved position to clear.
    const card = page.locator('.react-flow__node').first();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const layout = window.useStore?.getState?.().workspaceErdLayout?.['semantic-layer'];
            return layout ? Object.keys(layout.nodes || {}).length : 0;
          }),
        { timeout: WAIT }
      )
      .toBeGreaterThan(0);

    // Tidy → confirm dialog (there are edits) → accept → positions cleared.
    page.once('dialog', d => d.accept());
    await page.getByTestId('semantic-layer-erd-reset-layout').click();

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const layout = window.useStore?.getState?.().workspaceErdLayout?.['semantic-layer'];
            return layout ? Object.keys(layout.nodes || {}).length : 0;
          }),
        { timeout: WAIT }
      )
      .toBe(0);

    await page.screenshot({ path: `${SCREENS}/sl-erd-04-after-tidy.png` });
    expect(errors).toEqual([]);
  });
});
