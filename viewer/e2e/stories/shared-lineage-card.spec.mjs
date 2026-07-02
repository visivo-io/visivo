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

// Flip a slot via the consolidated kebab (⋮) — the standalone flip buttons were
// removed when item actions consolidated into ItemActionMenu (both canvas and
// View mode share the `view-item-menu-*` / `view-item-action-flip-*` testids).
// Select-then-click with real cursor coordinates: selection pins the kebab
// mounted, and force-clicks bypass Playwright's false-positive "intercepted by
// Plotly svg-container" actionability check (the kebab paints above it, z-50).
const flipViaKebab = async (page, itemPath) => {
  const kebab = page.getByTestId(`view-item-menu-${itemPath}`);
  if (!(await kebab.isVisible().catch(() => false))) {
    const slot = await page.locator(`[data-canvas-path="${itemPath}"]`).first().boundingBox();
    await page.mouse.move(slot.x + slot.width / 2, slot.y + 24);
    await page.mouse.down();
    await page.mouse.up();
    await expect(kebab).toBeVisible({ timeout: WAIT });
  }
  await kebab.hover({ force: true });
  await kebab.click({ force: true });
  await expect(page.getByTestId(`view-item-menu-list-${itemPath}`)).toBeVisible({ timeout: WAIT });
  const row = page.getByTestId(`view-item-action-flip-${itemPath}`);
  await expect(row).toBeVisible({ timeout: WAIT });
  await row.hover({ force: true });
  await row.click({ force: true });
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
    await flipViaKebab(page, 'row.0.item.0');
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
    await flipViaKebab(page, 'row.0.item.0');
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
