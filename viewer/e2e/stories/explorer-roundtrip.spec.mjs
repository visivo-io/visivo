/**
 * Story: J-2 / VIS-778 — Explorer overlay round-trip from Build mode.
 *
 * From a scoped dashboard, Library "+ New Chart" opens Explorer as a modal
 * overlay over Build mode (route
 * /workspace/dashboard/<d>/explorer?return_to=workspace&slot=<s>). The overlay
 * is framed (border + shadow + dimmed backdrop + "Adding to dashboard … · slot
 * …" breadcrumb) and its Save button reads "Save and place in slot". Esc /
 * Cancel / backdrop close return to Build mode without placing.
 *
 * The actual save+place-into-the-originating-slot behaviour (and the slot index
 * it targets) is exhaustively covered at the unit level in
 * ExplorerOverlay.test.jsx; here we harden the framing, the breadcrumb content
 * across slot descriptors, and every close gesture.
 *
 * Precondition: sandbox (integration project).
 */

import { test, expect } from '@playwright/test';

const DASHBOARD = 'simple-dashboard';

async function openOverlay(page, slot = 'new') {
  await page.goto(
    `/workspace/dashboard/${DASHBOARD}/explorer?return_to=workspace&slot=${encodeURIComponent(slot)}`
  );
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-testid="explorer-overlay"]')).toBeVisible({ timeout: 20000 });
}

for (const viewport of [
  { name: 'desktop', width: 1600, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test.describe(`J-2 — Explorer overlay round-trip (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test.setTimeout(90000);

    test('renders the framed card, dimmed backdrop, and origin breadcrumb', async ({ page }) => {
      await openOverlay(page, 'new');
      await expect(page.locator('[data-testid="explorer-overlay-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="explorer-overlay-backdrop"]')).toBeVisible();
      await expect(page.locator('[data-testid="explorer-overlay-dashboard"]')).toContainText(
        DASHBOARD
      );
      await expect(page.locator('[data-testid="explorer-overlay-slot"]')).toContainText('new row');
    });

    test('breadcrumb slot label reflects an "end of row" descriptor', async ({ page }) => {
      await openOverlay(page, '1:end');
      // slot "1:end" → human label "end of row 2".
      await expect(page.locator('[data-testid="explorer-overlay-slot"]')).toContainText(
        'end of row 2'
      );
    });

    test('shows "Save and place in slot" instead of the standard Save', async ({ page }) => {
      await openOverlay(page);
      await expect(page.locator('[data-testid="explorer-save-and-place-button"]')).toBeVisible({
        timeout: 20000,
      });
      await expect(page.locator('[data-testid="explorer-save-button"]')).toHaveCount(0);
    });

    test('Esc returns to Build mode without placing', async ({ page }) => {
      await openOverlay(page);
      // Establish focus inside the overlay (a real user arrives via a click, so
      // the document already has focus) before pressing Esc, so the keydown
      // reaches the overlay's document-level handler.
      await page
        .locator('[data-testid="explorer-overlay-card"]')
        .click({ position: { x: 200, y: 10 } });
      await page.keyboard.press('Escape');
      await page.waitForURL(new RegExp(`/workspace/dashboard/${DASHBOARD}$`), { timeout: 15000 });
      await expect(page.locator('[data-testid="explorer-overlay"]')).toHaveCount(0);
    });

    test('the close (X) button returns to Build mode without placing', async ({ page }) => {
      await openOverlay(page);
      await page.locator('[data-testid="explorer-overlay-close"]').click();
      await page.waitForURL(new RegExp(`/workspace/dashboard/${DASHBOARD}$`), { timeout: 15000 });
      await expect(page.locator('[data-testid="explorer-overlay"]')).toHaveCount(0);
    });

    test('backdrop click returns to Build mode without placing', async ({ page }) => {
      await openOverlay(page);
      // Click the backdrop at a corner so it doesn't land on the card.
      await page.locator('[data-testid="explorer-overlay-backdrop"]').click({
        position: { x: 5, y: 5 },
      });
      await page.waitForURL(new RegExp(`/workspace/dashboard/${DASHBOARD}$`), { timeout: 15000 });
      await expect(page.locator('[data-testid="explorer-overlay"]')).toHaveCount(0);
    });
  });
}

// Desktop-only: the Library "+ New Chart" entry point is a left-rail affordance.
test.describe('J-2 — Library "+ New Chart" opens the overlay (desktop)', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });
  test.setTimeout(90000);

  test('"+ New Chart" inside a scoped dashboard opens the overlay route', async ({ page }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    const newChart = page.locator('[data-testid="library-subsection-chart-create"]');
    if (!(await newChart.isVisible().catch(() => false))) {
      const chartHeader = page.locator('[data-testid="library-subsection-chart-header"]');
      if (await chartHeader.count()) await chartHeader.click();
    }
    await expect(newChart).toBeVisible({ timeout: 10000 });
    await newChart.click();
    await page.waitForURL(/\/workspace\/dashboard\/.+\/explorer/, { timeout: 15000 });
    await expect(page.locator('[data-testid="explorer-overlay"]')).toBeVisible({ timeout: 20000 });
    // It carries the round-trip params so close returns to the origin dashboard.
    expect(page.url()).toContain('return_to=workspace');
  });
});
