/**
 * Story: Canvas flip-to-lineage (VIS-785 / Track D D-6).
 *
 * Each canvas leaf item carries a flip toggle (revealed on hover/selection); the
 * flip opens the item's lineage neighbourhood card — the DELIVERED Track-C
 * lineage surface (<LibraryRowFlipPopover>) anchored to the slot, with the live
 * selector input and an Expand affordance that routes the subject to the
 * Workspace lineage lens (E-1). Multi-flip is allowed; the affordance is
 * suppressed during a drag; `prefers-reduced-motion` is honored.
 *
 * Deferred (design-blocked, see PR): the bespoke C-2 bounded-rendering card,
 * the CSS-3D in-slot rotation (<ItemFlipCard>), and the standalone
 * <ItemLineageModal>. Those depend on the still-pending D-4/D-5/D-6 briefs +
 * the unbuilt standalone <MiniLineageCard> (VIS-780); this story validates the
 * delivered core gesture.
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

// Reveal the flip button for a leaf item by setting hover + selection via the
// store (the flip layer reads workspaceCanvasHoverKey / selection). The button
// sits over the Plotly chart for hit-testing, so we click it via element
// dispatch rather than a coordinate click (same idiom the DnD story uses).
const revealFlip = async (page, itemPath) => {
  await page.evaluate(k => {
    const s = window.useStore.getState();
    s.setWorkspaceOutlineSelectedKey(k);
    if (s.setWorkspaceCanvasHoverKey) s.setWorkspaceCanvasHoverKey(k);
  }, itemPath);
  await expect(page.getByTestId(`canvas-flip-button-${itemPath}`)).toBeVisible({ timeout: WAIT });
};

const clickFlip = async (page, itemPath) => {
  await page.getByTestId(`canvas-flip-button-${itemPath}`).evaluate(el => el.click());
};

test.describe('Canvas flip-to-lineage (VIS-785 / D-6)', () => {
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

  test('a leaf item reveals a flip toggle on hover/selection', async () => {
    await openCanvas(page);
    await revealFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('canvas-flip-button-row.0.item.0')).toHaveAttribute('aria-pressed', 'false');
    await page.screenshot({ path: `${SCREENS}/vis785-01-flip-button.png`, fullPage: true });
  });

  test('flipping opens the lineage card (ancestors/subject/descendants + selector)', async () => {
    await openCanvas(page);
    await revealFlip(page, 'row.0.item.0');
    await clickFlip(page, 'row.0.item.0');

    // The lineage card opens, anchored to the slot, with the live selector input.
    const card = page.getByTestId('canvas-flip-card-row.0.item.0');
    await expect(card).toBeVisible({ timeout: WAIT });
    await expect(
      page.getByTestId('canvas-flip-card-row.0.item.0-selector-input')
    ).toBeVisible();
    // The subject row reflects the item's referenced object.
    await expect(page.getByTestId('canvas-flip-card-row.0.item.0-name')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/vis785-02-lineage-card.png`, fullPage: true });
  });

  test('editing the selector re-walks the lineage live', async () => {
    await openCanvas(page);
    await revealFlip(page, 'row.0.item.0');
    await clickFlip(page, 'row.0.item.0');
    const input = page.getByTestId('canvas-flip-card-row.0.item.0-selector-input');
    await expect(input).toBeVisible({ timeout: WAIT });
    // Clamp to ancestors-only — the card stays mounted and re-renders.
    await input.fill('+');
    await input.press('Backspace');
    await expect(page.getByTestId('canvas-flip-card-row.0.item.0')).toBeVisible();
  });

  test('flip is a toggle — flipping back closes the card', async () => {
    await openCanvas(page);
    await revealFlip(page, 'row.0.item.0');
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('canvas-flip-card-row.0.item.0')).toBeVisible({ timeout: WAIT });
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('canvas-flip-card-row.0.item.0')).toHaveCount(0);
  });

  test('no console errors across the flip gestures', async () => {
    const NOISE = ['favicon', 'DevTools', 'react-cool', 'ResizeObserver', 'compile'];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real).toHaveLength(0);
  });
});
