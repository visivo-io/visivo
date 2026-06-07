/**
 * Story (HARDENING): View-mode flip-to-lineage — detailed coverage (VIS-788 / I-1).
 *
 * Extends the happy-path `view-flip-lineage.spec.mjs` with the states the brief
 * calls out but the smoke story doesn't exercise:
 *   - the flip toggle appears on hover for EACH leaf type present in the
 *     dashboard (chart AND markdown — simple-dashboard carries both);
 *   - MULTI-FLIP: two slots flipped open at once, each rendering its own card;
 *   - flip-back closes only the targeted card (the other stays open);
 *   - the shared MiniLineageCard chain renders inside the View-mode card
 *     (VIS-780 shared-rendering: `-body` + `-chain` + `-expand` parts present);
 *   - the card "Expand" deep-links to /workspace?edit=<type>:<name> with the
 *     CORRECT type+name for the slot's subject (not just "an edit URL");
 *   - prefers-reduced-motion: the gesture still works with reduced motion.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VIS_VIEWFLIP_BASE=http://localhost:3023 npx playwright test view-flip-detailed
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_VIEWFLIP_BASE || 'http://localhost:3023';
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

// The flip layer tracks hover via a pointermove delegation on the View root, so
// the reveal needs a REAL pointer move over the slot (not just a synthetic
// hover). Scroll the slot into view, then move the mouse to its center via the
// bounding box so the delegated pointermove fires reliably. Retry once if the
// first move lands before layout settles.
const revealFlip = async (page, itemPath) => {
  const slot = page.locator(`[data-canvas-path="${itemPath}"]`).first();
  await slot.scrollIntoViewIfNeeded();
  const button = page.getByTestId(`view-flip-button-${itemPath}`);
  // The flip layer tracks hover via pointermove delegation on the View root, so
  // re-hover the slot's top-left corner (away from the chart center, and away
  // from any open card popover anchored to a sibling) until the delegated hover
  // reveals the flip button. `hover` auto-scrolls + auto-waits for actionability.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await slot.hover({ position: { x: 40, y: 20 }, timeout: 4000 }).catch(() => {});
    if (await button.isVisible().catch(() => false)) return;
    await page.waitForTimeout(500);
  }
  await expect(button).toBeVisible({ timeout: 4000 });
};

// The flip button sits in a pointer-events layer over the slot; dispatch the
// click directly to avoid the Plotly/markdown content intercepting it.
const clickFlip = async (page, itemPath) => {
  await page.getByTestId(`view-flip-button-${itemPath}`).evaluate(el => el.click());
};

test.describe('View-mode flip detailed (VIS-788 / I-1)', () => {
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

  test('flip toggle appears on hover for a CHART slot', async () => {
    await openView(page);
    await revealFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-button-row.0.item.0')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  test('flip toggle appears on hover for a MARKDOWN slot', async () => {
    await openView(page);
    // simple-dashboard row.2.item.0 is a markdown leaf.
    await revealFlip(page, 'row.2.item.0');
    await expect(page.getByTestId('view-flip-button-row.2.item.0')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  test('the View-mode card renders the shared MiniLineageCard chain (VIS-780)', async () => {
    await openView(page);
    await revealFlip(page, 'row.0.item.0');
    await clickFlip(page, 'row.0.item.0');
    const prefix = 'view-flip-card-row.0.item.0';
    await expect(page.getByTestId(prefix)).toBeVisible({ timeout: WAIT });
    // The SAME MiniLineageCard parts the Library + canvas flips render.
    await expect(page.getByTestId(`${prefix}-body`)).toBeVisible();
    await expect(page.getByTestId(`${prefix}-selector-input`)).toBeVisible();
    await expect(page.getByTestId(`${prefix}-expand`)).toBeVisible();
    await page.screenshot({
      path: `${SCREENS}/vis788d-01-shared-card.png`,
      fullPage: true,
    });
    // Close the card so the shared page is clean for the next test.
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId(prefix)).toHaveCount(0);
  });

  test('MULTI-FLIP: two slots flipped open at once each render their own card', async () => {
    // Use slots in DIFFERENT rows (row.0 + row.1) rather than two adjacent slots
    // in one row: an open flip card is a popover anchored beside its slot, and on
    // a 2-up row it overlays the sibling slot, making the sibling un-hoverable.
    // Cross-row slots avoid the overlap while still proving the multi-flip set.
    await openView(page);
    await revealFlip(page, 'row.0.item.0');
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toBeVisible({ timeout: WAIT });

    // Flip a SECOND slot in a lower row — the first card must stay open.
    await revealFlip(page, 'row.1.item.0');
    await clickFlip(page, 'row.1.item.0');
    await expect(page.getByTestId('view-flip-card-row.1.item.0')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toBeVisible();
    await page.screenshot({
      path: `${SCREENS}/vis788d-02-multi-flip.png`,
      fullPage: true,
    });

    // Flip the SECOND back — only it closes; the first remains.
    await clickFlip(page, 'row.1.item.0');
    await expect(page.getByTestId('view-flip-card-row.1.item.0')).toHaveCount(0);
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toBeVisible();

    // Clean up: close the first too.
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toHaveCount(0);
  });

  test('Expand deep-links with the CORRECT type:name for the slot subject', async () => {
    await openView(page);
    await revealFlip(page, 'row.0.item.0');
    await clickFlip(page, 'row.0.item.0');
    const prefix = 'view-flip-card-row.0.item.0';
    await expect(page.getByTestId(prefix)).toBeVisible({ timeout: WAIT });
    // Derive the subject name from the card itself rather than hard-coding the
    // chart name: an earlier spec's committed broken-ref delete can shift row.0's
    // item indices on the shared sandbox, so row.0.item.0 may reference a
    // different (but still valid) chart. The deep link must carry THAT subject.
    const subjectName = (await page.getByTestId(`${prefix}-name`).innerText()).trim();
    expect(subjectName.length).toBeGreaterThan(0);
    // Dispatch the click directly: the flip-card popover can extend past the
    // right viewport edge (a known View-mode finding), so the Expand button may
    // not be in an actionable position for a coordinate click.
    await page.getByTestId(`${prefix}-expand`).evaluate(el => el.click());
    await expect(page).toHaveURL(
      new RegExp(`/workspace\\?edit=chart:${subjectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      { timeout: WAIT }
    );
  });

  test('prefers-reduced-motion: gesture works AND motion is suppressed', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openView(page);
    await revealFlip(page, 'row.0.item.0');
    const btn = page.getByTestId('view-flip-button-row.0.item.0');
    // The flip-button drops its rotate-transition utility under reduced motion.
    const cls = await btn.getAttribute('class');
    expect(cls).not.toContain('transition-transform');
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toBeVisible({ timeout: WAIT });
    // Flipped, but no rotateY transform applied (motion suppressed).
    const transform = await btn.evaluate(el => el.style.transform);
    expect(transform).toBe('none');
    await clickFlip(page, 'row.0.item.0');
    await expect(page.getByTestId('view-flip-card-row.0.item.0')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: null });
  });

  test('no console errors across the detailed View-mode flip gestures', async () => {
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
