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

// Hover the slot to reveal its flip toggle. The flip layer tracks hover via
// pointermove delegation on the view root, so we hover the slot element directly.
const revealFlip = async (page, itemPath) => {
  const slot = page.locator(`[data-canvas-path="${itemPath}"]`).first();
  await slot.hover();
  await expect(page.getByTestId(`view-flip-button-${itemPath}`)).toBeVisible({ timeout: WAIT });
};

const clickFlip = async (page, itemPath) => {
  await page.getByTestId(`view-flip-button-${itemPath}`).evaluate(el => el.click());
};

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

  test('a leaf slot reveals a flip toggle on hover in View mode', async () => {
    await openView(page);
    await revealFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-button-row.0.item.0')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await page.screenshot({ path: `${SCREENS}/vis788-01-view-flip-button.png`, fullPage: true });
  });

  test('flipping opens the shared lineage card anchored to the slot', async () => {
    await openView(page);
    await revealFlip(page, 'row.0.item.0');
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
    await revealFlip(page, 'row.0.item.0');
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toBeVisible({ timeout: WAIT });
    await page.getByTestId('view-flip-card-row.0.item.0-expand').click();
    await expect(page).toHaveURL(/\/workspace\?edit=/, { timeout: WAIT });
  });

  test('flip is a toggle — flipping back closes the card', async () => {
    await openView(page);
    await revealFlip(page, 'row.0.item.0');
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toBeVisible({ timeout: WAIT });
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toHaveCount(0);
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
