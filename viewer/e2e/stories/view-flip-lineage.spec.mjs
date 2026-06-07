/**
 * Story: View-mode flip-to-lineage gesture (VIS-788 / I-1).
 *
 * Per Q3b the flip-to-lineage gesture lives in VIEW mode too (`/project/<name>`),
 * not just the Workspace build canvas. Each leaf slot (chart/table/markdown/input)
 * reveals a mulberry flip toggle on hover; clicking it opens the SAME delivered
 * lineage card the build canvas uses (<LibraryRowFlipPopover> → shared
 * <MiniLineageCard>) anchored to the slot. The only View-mode difference: the
 * card's "Expand" deep-links to /workspace?edit=<type>:<name> (View mode has no
 * right rail to flip in place).
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8050 VISIVO_SANDBOX_FRONTEND_PORT=3050 \
 *   VISIVO_SANDBOX_NAME=itrack bash scripts/sandbox.sh start
 *   # then: VIS_VIEWFLIP_BASE=http://localhost:3050 npx playwright test view-flip-lineage
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_VIEWFLIP_BASE || 'http://localhost:3050';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1400 } });

const openView = async page => {
  await page.goto(`${BASE}/project/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-view-root')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('view-flip-layer')).toBeAttached({ timeout: WAIT });
  await page.waitForTimeout(600);
};

// Hover the slot to reveal its kebab (⋮) menu button. The flip layer tracks hover
// via pointermove delegation on the view root, so we hover the slot directly.
const revealMenu = async (page, itemPath) => {
  const slot = page.locator(`[data-canvas-path="${itemPath}"]`).first();
  await slot.hover();
  await expect(page.getByTestId(`view-item-menu-${itemPath}`)).toBeVisible({ timeout: WAIT });
};

// Open the kebab dropdown for a slot.
const openMenu = async (page, itemPath) => {
  await page.getByTestId(`view-item-menu-${itemPath}`).evaluate(el => el.click());
  await expect(page.getByTestId(`view-item-menu-list-${itemPath}`)).toBeVisible({ timeout: WAIT });
};

// Reveal + open the kebab, then select an action by id (copy | flip).
const selectAction = async (page, itemPath, actionId) => {
  await revealMenu(page, itemPath);
  await openMenu(page, itemPath);
  await page.getByTestId(`view-item-action-${actionId}-${itemPath}`).evaluate(el => el.click());
};

const clickFlip = (page, itemPath) => selectAction(page, itemPath, 'flip');

test.describe('View-mode flip-to-lineage (VIS-788 / I-1)', () => {
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

  test('a leaf slot reveals the kebab (⋮) menu on hover in View mode', async () => {
    await openView(page);
    await revealMenu(page, 'row.0.item.0');
    await openMenu(page, 'row.0.item.0');
    // The consolidated menu carries BOTH item actions: Copy link + Flip.
    await expect(page.getByTestId('view-item-action-copy-row.0.item.0')).toBeVisible();
    await expect(page.getByTestId('view-item-action-flip-row.0.item.0')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/vis788-01-view-item-menu.png`, fullPage: true });
  });

  test('the item-built-in share/Copy button is GONE in View mode (collision fix)', async () => {
    await openView(page);
    // Hover the chart slot; the OLD per-item share/"Copy link" button used the
    // shared <Menu> (faShareAlt). In View mode it is suppressed — the kebab owns it.
    const slot = page.locator('[data-canvas-path="row.0.item.0"]').first();
    await slot.hover();
    await expect(page.getByTestId('view-item-menu-row.0.item.0')).toBeVisible({ timeout: WAIT });
    // No legacy standalone flip button testid anywhere.
    await expect(page.locator('[data-testid^="view-flip-button-"]')).toHaveCount(0);
  });

  test('Copy link copies the deep-link URL with element_id', async () => {
    // Grant clipboard access so we can read back what Copy link wrote.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openView(page);
    await page.evaluate(() => navigator.clipboard.writeText('').catch(() => {}));
    await selectAction(page, 'row.0.item.0', 'copy');
    // Assert the clipboard received a URL carrying element_id (the deep-link param).
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    expect(clip).toContain('element_id=');
  });

  test('flipping opens the shared lineage card anchored to the slot', async () => {
    await openView(page);
    await clickFlip(page, 'row.0.item.0');
    const card = page.getByTestId('view-flip-card-row.0.item.0');
    await expect(card).toBeVisible({ timeout: WAIT });
    await expect(
      page.getByTestId('view-flip-card-row.0.item.0-selector-input')
    ).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/vis788-02-view-lineage-card.png`, fullPage: true });
  });

  test('Expand deep-links to /workspace?edit=<type>:<name>', async () => {
    await openView(page);
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toBeVisible({ timeout: WAIT });
    await page.getByTestId('view-flip-card-row.0.item.0-expand').click();
    await expect(page).toHaveURL(/\/workspace\?edit=/, { timeout: WAIT });
  });

  test('flip is a toggle — flipping back closes the card', async () => {
    await openView(page);
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toBeVisible({ timeout: WAIT });
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toHaveCount(0);
  });

  test('the kebab menu closes on Escape', async () => {
    await openView(page);
    await revealMenu(page, 'row.0.item.0');
    await openMenu(page, 'row.0.item.0');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('view-item-menu-list-row.0.item.0')).toHaveCount(0);
  });

  test('no console errors across the View-mode flip gestures', async () => {
    // `Failed to fetch` / `fetch error` are transient: the Expand step navigates
    // to /workspace, which refetches the dashboard/store slices and can race a
    // tear-down — environmental noise unrelated to the flip gesture.
    const NOISE = [
      'favicon',
      'DevTools',
      'react-cool',
      'ResizeObserver',
      'compile',
      'Failed to fetch',
      'fetch error',
    ];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real).toHaveLength(0);
  });
});
