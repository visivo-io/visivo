/**
 * Story: Flip → "Expand / Open full lineage" opens a Workspace TAB + lineage lens.
 *
 * The flip card's Expand footer used to deep-link to /workspace?edit=<type>:<name>
 * but the Workspace never opened a tab for it — it landed on the unscoped Project
 * Editor (only the "project" tab in the strip). The fix: Expand routes to
 * /workspace?edit=<type>:<name>&lens=lineage, and Workspace hydrates a REAL tab
 * for the subject (so the tab strip gains it + it becomes active) and shows the
 * full lineage in the middle pane — NOT Project Settings.
 *
 * This story drives the REAL cursor on the build canvas: hover the slot → click
 * the ⋮ kebab → click Flip → click Expand, then asserts the opened Workspace tab
 * + lineage lens.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8050 VISIVO_SANDBOX_FRONTEND_PORT=3050 \
 *   VISIVO_SANDBOX_NAME=dtrack bash scripts/sandbox.sh start
 *   # then: VIS_FLIP_BASE=http://localhost:3050 npx playwright test flip-expand-workspace-tab
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_FLIP_BASE || 'http://localhost:3050';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
// row.0.item.0 of simple-dashboard is the chart `a-very-fibonacci-waterfall`.
const SUBJECT = 'chart:a-very-fibonacci-waterfall';
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

// REAL cursor: drive the physical mouse (coordinate move → down/up) slot → ⋮
// kebab → Flip. The kebab is a z-50 overlay over a live Plotly chart whose
// svg-container Playwright's actionability check flags as "intercepting pointer
// events", aborting a Locator.click() even though the kebab paints on top.
// Coordinate-driven mouse events are a genuine cursor that physically traverses
// to the kebab and clicks, bypassing that false-positive. Moving onto the kebab
// fires its onPointerEnter → menuHoverKey, pinning it mounted (independent of the
// transient canvas hover) before the click lands.
const clickAt = async (page, locator) => {
  await expect(locator).toBeVisible({ timeout: WAIT });
  // Hover first (fires onPointerEnter → menuHoverKey, pinning the kebab mounted),
  // then force-click. `force` bypasses Playwright's actionability check, which
  // false-positives on the live Plotly svg-container "intercepting pointer events"
  // even though the kebab/card overlay paints on top (z-50). Still a real cursor —
  // the pointer traverses to the element; force only skips the bogus guard.
  await locator.hover({ force: true });
  await locator.click({ force: true });
};

const flipViaKebab = async (page, itemPath) => {
  // Real cursor: move onto the slot and click to SELECT it — selection
  // (workspaceOutlineSelectedKey) pins the kebab mounted while the cursor travels
  // up to it (the hover-only key clears as the cursor leaves the chart body).
  const slot = await page.locator(`[data-canvas-path="${itemPath}"]`).first().boundingBox();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + 24);
  await page.mouse.down();
  await page.mouse.up();
  const kebab = page.getByTestId(`view-item-menu-${itemPath}`);
  await expect(kebab).toBeVisible({ timeout: WAIT });
  await clickAt(page, kebab); // real traverse + click on the ⋮
  await expect(page.getByTestId(`view-item-menu-list-${itemPath}`)).toBeVisible({ timeout: WAIT });
  await clickAt(page, page.getByTestId(`view-item-action-flip-${itemPath}`));
  await expect(page.getByTestId(`canvas-flip-card-${itemPath}`)).toBeVisible({ timeout: WAIT });
};

test.describe('Flip → Expand opens a Workspace tab + lineage lens', () => {
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

  test('Expand opens a NEW workspace tab for the subject + renders the lineage lens', async () => {
    await openCanvas(page);
    await flipViaKebab(page, 'row.0.item.0');

    // Expand from the flip card (coordinate-driven — the card overlays the chart).
    await clickAt(page, page.getByTestId('canvas-flip-card-row.0.item.0-expand'));

    // The URL carries the lineage deep-link.
    await expect(page).toHaveURL(/\/workspace\?edit=chart:a-very-fibonacci-waterfall&lens=lineage/, {
      timeout: WAIT,
    });

    // The tab strip GAINS the subject's tab and it is active (not just "project").
    const subjectTab = page.getByTestId(`workspace-tab-${SUBJECT}`);
    await expect(subjectTab).toBeVisible({ timeout: WAIT });
    await expect(subjectTab).toHaveAttribute('data-active', 'true');

    // The middle pane shows the chart's lineage lens — NOT the Project Editor /
    // Project Settings surface.
    await expect(page.getByTestId('workspace-middle-chart')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('workspace-middle-chart-lineage')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('workspace-middle-project')).toHaveCount(0);

    await page.screenshot({
      path: `${SCREENS}/flip-expand-01-workspace-tab-lineage.png`,
      fullPage: true,
    });
  });

  test('no console errors across the Expand → tab gesture', async () => {
    // Navigating to /workspace refetches store slices and can race a tear-down —
    // transient fetch noise is environmental, not the gesture.
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
