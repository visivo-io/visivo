/**
 * Story (HARDENING): VIS-788 / VIS-792 on a MOBILE viewport (390×844).
 *
 * Scope reality (a real finding from this pass): the Workspace BUILD canvas
 * (`/workspace/dashboard/<name>`) is a desktop tool. The phone-facing ILC
 * surface is VIEW mode (`/project/<name>`): the flip-to-lineage gesture and
 * the (non-interactive, Q16) broken-ref placeholder.
 *
 * 6c-T2 update: the build-canvas-isn't-mobile mechanism changed. Before,
 * the left Library rail was FIXED-width and `project-canvas` had no floor
 * (`min-w-0`), so at 390px the canvas was squeezed to near-zero width. Now
 * `WorkspaceShell` auto-collapses both rails at a narrow viewport (the
 * BLOCKER-at-1100px fix, shell-ia #10/cold-start #2) AND the canvas holds a
 * real min-width (480px, `CENTER_MIN_WIDTH`) — so at 390px the canvas
 * renders at its full 480px floor instead of collapsing, but the SHELL
 * itself has no horizontal scroll (`overflow-hidden`), so most of that
 * 480px is laid out past the 390px viewport edge and is genuinely
 * inaccessible — still not a usable phone surface, just via overflow
 * instead of collapse. (A visible side effect: what IS on-screen — the
 * chart's left portion, both rails as thin icon strips — is considerably
 * more legible than the old near-zero sliver, though still not "mobile
 * ready.") The assertion below checks for that overflow instead of a
 * near-zero width.
 *
 * This story therefore validates, at 390×844:
 *   - the View-mode flip card opens + renders the shared MiniLineageCard chain;
 *   - the View-mode broken-ref placeholder stays legible on a phone (Q16);
 *   - and documents that the build canvas is intentionally not a mobile surface.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VIS_MOBILE_BASE=http://localhost:3023 npx playwright test ilc-mobile
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_MOBILE_BASE || 'http://localhost:3023';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

test.use({ viewport: { width: 390, height: 844 } });

// Append a broken-ref leaf to row.0 (optimistic, client-only — no commit) so the
// View-mode renderer paints the legacy "<Type> not found" placeholder.
const breakInView = async (page, type) => {
  const brokenName = `__missing_${type}_${Date.now()}`;
  await page.evaluate(
    ({ dashboard, name, leafType }) => {
      const s = window.useStore.getState();
      const entry = (s.dashboards || []).find(d => d.name === dashboard);
      const cfg = entry?.config || entry;
      const next = JSON.parse(JSON.stringify(cfg));
      const row0 = next.rows?.[0];
      if (!row0) return;
      if (!Array.isArray(row0.items)) row0.items = [];
      row0.items.push({ width: 1, [leafType]: `\${ref(${name})}` });
      if (s.updateDashboardConfigOptimistic) {
        s.updateDashboardConfigOptimistic(dashboard, next);
      }
    },
    { dashboard: DASHBOARD, name: brokenName, leafType: type }
  );
  return brokenName;
};

test.describe('ILC on mobile (VIS-788 / VIS-792)', () => {
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

  test('the Workspace build canvas is NOT a phone surface (canvas overflows, unreachable past the fold)', async () => {
    // Documented finding, mechanism updated at 6c-T2 (see file header): the
    // canvas now holds its real min-width (480px) instead of collapsing to
    // zero, but the shell has no horizontal scroll, so most of it is laid
    // out past the 390px viewport edge — still not a reachable phone
    // surface, the canvas-only broken-ref repair is still desktop-only by
    // design (mobile users edit on desktop; they VIEW on mobile).
    await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const canvas = page.getByTestId('project-canvas');
    await expect(canvas).toBeAttached({ timeout: WAIT });
    const box = await canvas.boundingBox();
    // The canvas is present and now holds a real min-width — but the shell
    // gives it no horizontal scroll, so it extends well past the phone
    // viewport's right edge and most of it is unreachable.
    expect(box).not.toBeNull();
    expect(box.width, 'canvas holds its real min-width, not a squeeze').toBeGreaterThanOrEqual(400);
    expect(
      box.x + box.width,
      'canvas extends past the 390px viewport — unreachable without scroll the shell does not offer'
    ).toBeGreaterThan(390);
    await page.screenshot({ path: `${SCREENS}/mobile-01-canvas-not-mobile.png`, fullPage: true });
  });

  test('View mode renders the dashboard in a single-column stack on mobile', async () => {
    await page.goto(`${BASE}/project/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('project-view-root')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SCREENS}/mobile-02-view-stack.png`, fullPage: true });
  });

  test('View-mode flip card opens + renders the shared card on mobile', async () => {
    await page.goto(`${BASE}/project/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('project-view-root')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('view-flip-layer')).toBeAttached({ timeout: WAIT });
    await page.waitForTimeout(600);
    const slot = page.locator('[data-canvas-path="row.0.item.0"]').first();
    await expect(slot).toBeVisible({ timeout: WAIT });
    await slot.scrollIntoViewIfNeeded();
    // Flip via the consolidated kebab (the standalone flip button was removed
    // when item actions consolidated into ItemActionMenu). Select-then-click
    // with real cursor coordinates; force-clicks bypass the false-positive
    // "intercepted by Plotly svg-container" actionability check.
    const itemPath = 'row.0.item.0';
    const kebab = page.getByTestId(`view-item-menu-${itemPath}`);
    if (!(await kebab.isVisible().catch(() => false))) {
      const box = await slot.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 24);
      await page.mouse.down();
      await page.mouse.up();
      await expect(kebab).toBeVisible({ timeout: WAIT });
    }
    await kebab.hover({ force: true });
    await kebab.click({ force: true });
    await expect(page.getByTestId(`view-item-menu-list-${itemPath}`)).toBeVisible({
      timeout: WAIT,
    });
    const flipRow = page.getByTestId(`view-item-action-flip-${itemPath}`);
    await expect(flipRow).toBeVisible({ timeout: WAIT });
    await flipRow.hover({ force: true });
    await flipRow.click({ force: true });
    const prefix = 'view-flip-card-row.0.item.0';
    await expect(page.getByTestId(prefix)).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId(`${prefix}-body`)).toBeVisible();
    await expect(page.getByTestId(`${prefix}-expand`)).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/mobile-03-view-flip.png`, fullPage: true });
  });

  test('View-mode broken-ref placeholder stays legible on mobile (Q16)', async () => {
    await page.goto(`${BASE}/project/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('project-view-root')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
    await page.waitForTimeout(400);
    await breakInView(page, 'chart');
    // View mode never mounts the interactive card — only the legacy placeholder.
    await expect(page.getByTestId('broken-ref-card')).toHaveCount(0, { timeout: WAIT });
    await expect(page.getByText(/Chart not found/i).first()).toBeVisible({ timeout: WAIT });
    await page.screenshot({ path: `${SCREENS}/mobile-04-view-broken-placeholder.png`, fullPage: true });
  });

  test('no console errors across the mobile flow', async () => {
    const NOISE = [
      'favicon',
      'DevTools',
      'react-cool',
      'ResizeObserver',
      'compile',
      'not found',
      'Failed to fetch',
      'fetch error',
      'Failed to load resource',
      '404',
    ];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real).toHaveLength(0);
  });
});
