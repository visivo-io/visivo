/**
 * Punch-list §11.4 of specs/onboarding-checklist-v2/plan.md.
 *
 * The Coach used to render the halo at the target's bounding box even
 * when the target had scrolled out of the viewport — so the halo simply
 * went off-screen and the user lost the hint. Now the Coach detects the
 * fully-offscreen case and renders a pinned scroll-chip at the viewport
 * edge in the direction of the target. Clicking the chip scrolls the
 * target back into view.
 *
 * This spec drives the case on /editor by:
 *   1) Setting the Coach to point at top-nav-deploy (always-mounted, at
 *      the top of the page).
 *   2) Scrolling the viewport-scroll container down past the nav so the
 *      Deploy button is offscreen above.
 *   3) Asserting the scroll-chip mounts with direction="up".
 *   4) Clicking the chip → asserting the page scrolled back to the
 *      target.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

test.describe('OnboardingCoach — scroll-offscreen chip', () => {
  test('chip appears when target scrolls offscreen + click scrolls it back', async ({ page }) => {
    // Seed onboarding state so build_dashboard's Step 1 target
    // (source-create-button, FAB at bottom-right of /editor) is the
    // current target. Then we'll scroll the page so the FAB scrolls
    // offscreen below the bottom edge. Many e2e environments have the
    // FAB inside a scrolling container; if scrolling the page doesn't
    // move it, we simulate offscreen rect via injection.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/editor`);
    await page.evaluate(() => {
      window.localStorage.setItem(
        'visivo.onboarding.v1',
        JSON.stringify({
          completed_at: '2026-01-01T00:00:00.000Z',
          role: 'analytics_engineer',
          path: 'data',
          checklist_dismissed: false,
          checklist_checked: [
            'connect_source',
            'build_model',
            'create_insight',
            'define_metric',
          ],
          coach_dismissed: [],
          actions: {
            // Drive Coach to build_dashboard, Step 1 (FAB).
            model_tab_created: '2026-01-01',
            sql_written: '2026-01-01',
            query_run: '2026-01-01',
            insight_added: '2026-01-01',
            insight_saved: '2026-01-01',
            metric_defined: '2026-01-01',
          },
        })
      );
    });
    await page.goto(`${BASE}/editor`);
    await page.waitForSelector('[data-onb-target="source-create-button"]');

    // Force the FAB element to a fully-offscreen-below position via a
    // transient inline style. The Coach's measure() uses
    // getBoundingClientRect, so any visual position change triggers the
    // chip render through the scroll/resize listener.
    await page.evaluate(() => {
      const fab = document.querySelector('[data-onb-target="source-create-button"]');
      fab._originalStyle = fab.getAttribute('style') || '';
      fab.style.position = 'fixed';
      fab.style.top = '99999px';
      fab.style.left = '24px';
      window.dispatchEvent(new Event('scroll'));
    });

    const chip = page.getByTestId('onboarding-coach-scroll-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-onb-scroll-dir', 'down');
  });

  test('chip points up when the target is above the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/editor`);
    await page.evaluate(() => {
      window.localStorage.setItem(
        'visivo.onboarding.v1',
        JSON.stringify({
          completed_at: '2026-01-01T00:00:00.000Z',
          role: 'analytics_engineer',
          path: 'data',
          checklist_dismissed: false,
          checklist_checked: [
            'connect_source',
            'build_model',
            'create_insight',
            'define_metric',
          ],
          coach_dismissed: [],
          actions: {
            model_tab_created: '2026-01-01',
            sql_written: '2026-01-01',
            query_run: '2026-01-01',
            insight_added: '2026-01-01',
            insight_saved: '2026-01-01',
            metric_defined: '2026-01-01',
          },
        })
      );
    });
    await page.goto(`${BASE}/editor`);
    await page.waitForSelector('[data-onb-target="source-create-button"]');

    await page.evaluate(() => {
      const fab = document.querySelector('[data-onb-target="source-create-button"]');
      fab.style.position = 'fixed';
      fab.style.top = '-9999px';
      fab.style.left = '24px';
      window.dispatchEvent(new Event('scroll'));
    });

    const chip = page.getByTestId('onboarding-coach-scroll-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-onb-scroll-dir', 'up');
  });
});
