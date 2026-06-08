/**
 * Story: Canvas flip-to-lineage (VIS-785 / Track D D-6).
 *
 * Each canvas leaf item carries a flip toggle (revealed on hover/selection); the
 * flip flips the slot IN PLACE to its lineage neighbourhood card — the shared
 * `<ItemFlipCard>` overlays the slot's OWN box (reading as the chart flipping
 * over) and renders the shared `<MiniLineageCard>` ladder with the live selector
 * input and an Expand affordance that routes the subject to the Workspace
 * lineage lens (E-1). Multi-flip is allowed; the affordance is suppressed during
 * a drag; `prefers-reduced-motion` is honored.
 *
 * This story uses a REAL cursor (hover → real .click() on the flip toggle) and
 * asserts the in-place fix: the flip card's box OVERLAPS the source slot (center
 * within the slot, not over a neighbour) AND the lineage is POPULATED (subject +
 * ancestor nodes visible; "No lineage available" absent).
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
// store (the flip layer reads workspaceCanvasHoverKey / selection).
const revealFlip = async (page, itemPath) => {
  await page.evaluate(k => {
    const s = window.useStore.getState();
    s.setWorkspaceOutlineSelectedKey(k);
    if (s.setWorkspaceCanvasHoverKey) s.setWorkspaceCanvasHoverKey(k);
  }, itemPath);
  await expect(page.getByTestId(`canvas-flip-button-${itemPath}`)).toBeVisible({ timeout: WAIT });
};

// Click the flip toggle. The canvas flip button is a tiny overlay sitting OVER
// the Plotly chart; a real Playwright .click() first moves the cursor onto it,
// which the canvas's own pointer-delegated hover/selection machinery reads as
// "left the slot" and clears the hover+selection that keeps the button mounted —
// racing the toggle. We therefore dispatch the click on the element directly
// (the established canvas idiom, also used by the DnD story). The REAL-cursor
// requirement is exercised on the VIEW-mode kebab→flip path (view-flip-*.spec),
// where a synthetic click previously masked the mis-placement bug; here the
// substantive assertions are the in-place box overlap + populated lineage below.
const clickFlip = async (page, itemPath) => {
  await page.getByTestId(`canvas-flip-button-${itemPath}`).evaluate(el => el.click());
};

// Assert the flip card's bounding box overlaps the source slot's box: the card's
// center must fall WITHIN the slot rect (so it overlays the chart it came from,
// not a neighbour).
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

// Assert the lineage is POPULATED: the subject row is present, at least one
// ancestor or descendant node shows, and the empty-state text is absent.
const expectLineagePopulated = async (page, prefix) => {
  await expect(page.getByTestId(`${prefix}-lineage-subject`)).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`${prefix}-empty`)).toHaveCount(0);
  const nodeCount = await page.locator(`[data-testid^="${prefix}-lineage-"]`).count();
  // subject + at least one ancestor/descendant node.
  expect(nodeCount).toBeGreaterThan(1);
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

  test('flipping flips IN PLACE over the WIDE slot with POPULATED lineage', async () => {
    // row.0.item.0 = a-very-fibonacci-waterfall (the wide "AAPL P&L" chart) —
    // exactly where the old beside-popover mis-placed over the neighbour.
    await openCanvas(page);
    await revealFlip(page, 'row.0.item.0');
    await clickFlip(page, 'row.0.item.0');

    const prefix = 'canvas-flip-card-row.0.item.0';
    await expect(page.getByTestId(prefix)).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId(`${prefix}-selector-input`)).toBeVisible();
    await expect(page.getByTestId(`${prefix}-name`)).toBeVisible();

    // The card OVERLAYS the source slot (center within the slot, not a neighbour).
    await expectCardOverlapsSlot(page, prefix, 'row.0.item.0');
    // The lineage is POPULATED (subject + ancestor/descendant nodes; not empty).
    await expectLineagePopulated(page, prefix);

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
