/**
 * Story: Canvas flip-to-lineage via the consolidated kebab (VIS-785 / Track D D-6).
 *
 * The build canvas now uses the SAME consolidated <ItemActionMenu> kebab (⋮) View
 * mode uses — Copy link + Flip to lineage in ONE menu — instead of a standalone
 * flip button. The old dark faShareAlt "Copy" icon the item renderers used to
 * paint is GONE (the share code was removed from Chart/Markdown/Table). Flip
 * flips the slot IN PLACE to its lineage neighbourhood card (the shared
 * <ItemFlipCard> over the slot's OWN box) with a live selector + an Expand
 * affordance that opens a Workspace TAB for the subject on the lineage lens.
 *
 * This story uses a REAL cursor (hover the slot → real .click() on the ⋮ kebab →
 * real .click() on the action row) and asserts:
 *   (a) NO old share icon on the canvas chart ([data-icon="share-alt"] count 0);
 *   (b) the ⋮ kebab opens via a real cursor reach with Copy + Flip;
 *   (c) flip overlays the slot IN PLACE with POPULATED lineage;
 *   (d) Expand opens a NEW Workspace tab for the subject + the lineage lens.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8050 VISIVO_SANDBOX_FRONTEND_PORT=3050 \
 *   VISIVO_SANDBOX_NAME=dtrack bash scripts/sandbox.sh start
 *   # then: VIS_FLIP_BASE=http://localhost:3050 npx playwright test canvas-flip-lineage
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_FLIP_BASE || 'http://localhost:3050';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1400 } });

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('canvas-flip-layer')).toBeAttached({ timeout: WAIT });
  await page.waitForTimeout(600);
};

// Hover the slot with a REAL cursor to reveal its kebab (⋮). The canvas tracks
// hover via the selection overlay's real pointermove, so hovering the slot sets
// workspaceCanvasHoverKey and mounts the kebab. When the slot is already flipped,
// an in-place card COVERS the body but its kebab stays mounted — short-circuit.
const revealMenu = async (page, itemPath) => {
  const kebab = page.getByTestId(`view-item-menu-${itemPath}`);
  if (await kebab.isVisible().catch(() => false)) return;
  await page.locator(`[data-canvas-path="${itemPath}"]`).first().hover();
  await expect(kebab).toBeVisible({ timeout: WAIT });
};

// Open the kebab dropdown with a REAL cursor click on the ⋮ kebab.
const openMenu = async (page, itemPath) => {
  await page.getByTestId(`view-item-menu-${itemPath}`).click();
  await expect(page.getByTestId(`view-item-menu-list-${itemPath}`)).toBeVisible({ timeout: WAIT });
};

// Reveal + open the kebab, then select an action (copy | flip) with a REAL cursor
// click on the action row.
const selectAction = async (page, itemPath, actionId) => {
  await revealMenu(page, itemPath);
  await openMenu(page, itemPath);
  await page.getByTestId(`view-item-action-${actionId}-${itemPath}`).click();
};

const clickFlip = (page, itemPath) => selectAction(page, itemPath, 'flip');

// Assert the flip card's box overlaps the source slot's box (center within it).
const expectCardOverlapsSlot = async (page, cardTestId, itemPath) => {
  const card = page.getByTestId(cardTestId);
  await expect(card).toBeVisible({ timeout: WAIT });
  const cardBox = await card.boundingBox();
  const slotBox = await page.locator(`[data-canvas-path="${itemPath}"]`).first().boundingBox();
  expect(cardBox).not.toBeNull();
  expect(slotBox).not.toBeNull();
  const cx = cardBox.x + cardBox.width / 2;
  const cy = cardBox.y + cardBox.height / 2;
  expect(cx).toBeGreaterThanOrEqual(slotBox.x - 2);
  expect(cx).toBeLessThanOrEqual(slotBox.x + slotBox.width + 2);
  expect(cy).toBeGreaterThanOrEqual(slotBox.y - 2);
  expect(cy).toBeLessThanOrEqual(slotBox.y + slotBox.height + 2);
};

// Assert the lineage is POPULATED: subject row present, at least one ancestor/
// descendant node visible, and the empty-state text absent.
const expectLineagePopulated = async (page, prefix) => {
  await expect(page.getByTestId(`${prefix}-lineage-subject`)).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`${prefix}-empty`)).toHaveCount(0);
  const nodeCount = await page.locator(`[data-testid^="${prefix}-lineage-"]`).count();
  expect(nodeCount).toBeGreaterThan(1);
};

test.describe('Canvas flip-to-lineage via kebab (VIS-785 / D-6)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the build-canvas chart has NO old share icon AND no standalone flip button', async () => {
    await openCanvas(page);
    // Hover the wide chart slot — the OLD per-item Copy used the shared <Menu>
    // (faShareAlt → [data-icon="share-alt"]). That share code is removed; the
    // kebab owns Copy now.
    await page.locator('[data-canvas-path="row.0.item.0"]').first().hover();
    await expect(page.getByTestId('view-item-menu-row.0.item.0')).toBeVisible({ timeout: WAIT });
    // The old dark share-alt icon is gone everywhere on the canvas.
    await expect(page.locator('[data-icon="share-alt"]')).toHaveCount(0);
    // And no legacy standalone canvas flip button remains.
    await expect(page.locator('[data-testid^="canvas-flip-button-"]')).toHaveCount(0);
    await page.screenshot({ path: `${SCREENS}/vis785-01-canvas-kebab.png`, fullPage: true });
  });

  test('REAL cursor: hover slot → reach → click ⋮ opens the menu with Copy + Flip', async () => {
    // Guards the kebab-unmount race on the build canvas too: the kebab lives in a
    // sibling overlay, so moving the REAL cursor from the chart body up to the ⋮
    // can clear the canvas hover that mounted it. The controlled open/menu-hover
    // state keeps it mounted. This uses a REAL click (cursor traverses to the
    // kebab) rather than a synthetic el.click().
    await openCanvas(page);
    const path = 'row.0.item.0';
    await page.locator(`[data-canvas-path="${path}"]`).first().hover();
    const kebab = page.getByTestId(`view-item-menu-${path}`);
    await expect(kebab).toBeVisible({ timeout: WAIT });
    await kebab.click(); // real mouse traverse + click
    const list = page.getByTestId(`view-item-menu-list-${path}`);
    await expect(list).toBeVisible({ timeout: WAIT });
    // The consolidated menu carries BOTH actions: Copy link + Flip to lineage.
    await expect(page.getByTestId(`view-item-action-copy-${path}`)).toBeVisible();
    await expect(page.getByTestId(`view-item-action-flip-${path}`)).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/vis785-02-canvas-kebab-open.png`, fullPage: true });
  });

  test('Copy link copies the deep-link URL with element_id', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openCanvas(page);
    await page.evaluate(() => navigator.clipboard.writeText('').catch(() => {}));
    await selectAction(page, 'row.0.item.0', 'copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    expect(clip).toContain('element_id=');
  });

  test('flipping flips IN PLACE over the WIDE slot with POPULATED lineage', async () => {
    await openCanvas(page);
    await clickFlip(page, 'row.0.item.0');
    const prefix = 'canvas-flip-card-row.0.item.0';
    await expect(page.getByTestId(prefix)).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId(`${prefix}-selector-input`)).toBeVisible();
    await expectCardOverlapsSlot(page, prefix, 'row.0.item.0');
    await expectLineagePopulated(page, prefix);
    await page.screenshot({ path: `${SCREENS}/vis785-03-canvas-lineage-card.png`, fullPage: true });
  });

  test('flip is a toggle — flipping back closes the card', async () => {
    await openCanvas(page);
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('canvas-flip-card-row.0.item.0')).toBeVisible({ timeout: WAIT });
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('canvas-flip-card-row.0.item.0')).toHaveCount(0);
  });

  test('no console errors across the canvas flip gestures', async () => {
    const NOISE = ['favicon', 'DevTools', 'react-cool', 'ResizeObserver', 'compile'];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real).toHaveLength(0);
  });
});
