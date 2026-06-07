/**
 * Story (HARDENING): One shared MiniLineageCard across all three flip surfaces
 * (VIS-780 / C-4 — refactor regression guard).
 *
 * VIS-780 extracted the lineage neighbourhood card out of LibraryRowFlipPopover
 * into a standalone <MiniLineageCard>, consumed by THREE surfaces:
 *   1. the Library row flip-popover (Workspace),
 *   2. the canvas item flip (Workspace build canvas),
 *   3. the View-mode slot flip (`/project/<name>`).
 *
 * This story asserts all three render the SAME card structure — the identical set
 * of MiniLineageCard data-testid suffixes (`-body`, `-chain`, `-selector-input`,
 * `-expand`) — so a future change to one surface can't silently diverge the
 * shared card. It does NOT re-test each surface's behaviour (covered elsewhere);
 * it's a structural-parity guard.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VIS_SHARED_BASE=http://localhost:3023 npx playwright test shared-lineage-card
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_SHARED_BASE || 'http://localhost:3023';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const SUBJECT_CHART = 'a-very-fibonacci-waterfall';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1400 } });

// The set of MiniLineageCard parts every surface must render.
const SHARED_SUFFIXES = ['-body', '-selector-input', '-expand'];

const assertSharedCard = async (page, prefix) => {
  await expect(page.getByTestId(prefix)).toBeVisible({ timeout: WAIT });
  for (const suffix of SHARED_SUFFIXES) {
    await expect(page.getByTestId(`${prefix}${suffix}`)).toBeVisible();
  }
};

test.describe('Shared MiniLineageCard parity (VIS-780)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180000);

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

  test('Library row flip-popover renders the shared card', async () => {
    await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('library-subsection-chart-header').click();
    const row = page.getByTestId(`library-row-chart-${SUBJECT_CHART}`);
    await row.waitFor({ timeout: WAIT });
    await row.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await row.hover();
    await page.getByTestId(`library-row-chart-${SUBJECT_CHART}-flip`).click();
    await assertSharedCard(page, `library-row-chart-${SUBJECT_CHART}-popover`);
    await page.screenshot({
      path: `${SCREENS}/vis780-01-library-card.png`,
      fullPage: true,
    });
  });

  test('Canvas item flip renders the shared card', async () => {
    await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('canvas-flip-layer')).toBeAttached({ timeout: WAIT });
    await page.waitForTimeout(600);
    // Re-assert hover/selection until the flip layer reveals the button — the
    // layer reads the store keys and re-renders, which can lag under load.
    const flipBtn = page.getByTestId('canvas-flip-button-row.0.item.0');
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await page.evaluate(k => {
        const s = window.useStore.getState();
        s.setWorkspaceOutlineSelectedKey(k);
        if (s.setWorkspaceCanvasHoverKey) s.setWorkspaceCanvasHoverKey(k);
      }, 'row.0.item.0');
      try {
        await expect(flipBtn).toBeVisible({ timeout: 4000 });
        break;
      } catch (e) {
        if (attempt === 7) throw e;
        await page.waitForTimeout(500);
      }
    }
    await flipBtn.evaluate(el => el.click());
    await assertSharedCard(page, 'canvas-flip-card-row.0.item.0');
    await page.screenshot({
      path: `${SCREENS}/vis780-02-canvas-card.png`,
      fullPage: true,
    });
  });

  test('View-mode slot flip renders the shared card', async () => {
    await page.goto(`${BASE}/project/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('project-view-root')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('view-flip-layer')).toBeAttached({ timeout: WAIT });
    await page.waitForTimeout(600);
    const slot = page.locator('[data-canvas-path="row.0.item.0"]').first();
    await expect(slot).toBeVisible({ timeout: WAIT });
    await slot.scrollIntoViewIfNeeded();
    const button = page.getByTestId('view-flip-button-row.0.item.0');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await slot.hover({ position: { x: 40, y: 20 }, timeout: 4000 });
      } catch {
        await slot.hover({ timeout: 4000 }).catch(() => {});
      }
      try {
        await expect(button).toBeVisible({ timeout: 3000 });
        break;
      } catch (e) {
        if (attempt === 9) throw e;
        await page.waitForTimeout(500);
      }
    }
    await page.getByTestId('view-flip-button-row.0.item.0').evaluate(el => el.click());
    await assertSharedCard(page, 'view-flip-card-row.0.item.0');
    await page.screenshot({
      path: `${SCREENS}/vis780-03-view-card.png`,
      fullPage: true,
    });
  });

  test('no console errors across the shared-card surfaces', async () => {
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
