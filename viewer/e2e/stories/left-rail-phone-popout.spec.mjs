/**
 * Story: opening the Library on a phone-sized viewport (user-reported).
 *
 * `WorkspaceShell` auto-collapses the left rail once the canvas would drop
 * below `CENTER_MIN_WIDTH` (480px). At phone widths it is collapsed the whole
 * time — and clicking anything in the 48px strip appeared to do nothing.
 *
 * Nothing was wrong with the click. Expanding set `workspaceLeftCollapsed =
 * false`; the shell's width effect lists that flag in its deps, so it re-ran,
 * measured that the rail still doesn't fit, and collapsed it again before
 * paint. The strip's buttons render hover and title states that promise
 * interactivity, so they read as broken rather than as refused.
 *
 * The rail now opens as a POPOUT drawn over the content when it cannot be
 * seated in flow. That costs no layout width, so the measurement that used to
 * undo it has nothing to undo.
 *
 * Covers:
 *   1. At 390px (iPhone-ish) the rail starts collapsed and a type button opens
 *      the popout — the case that read as dead.
 *   2. The popout actually covers the content (it is not squeezed into the
 *      48px strip's own box), which is the half unit tests cannot see.
 *   3. Tapping the content beside it, and Escape, dismiss it.
 *   4. Opening an object dismisses it — otherwise it sits on top of the thing
 *      it just opened.
 *   5. At a desktop width the same button expands in flow, with no popout.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=leftRailPhone VISIVO_SANDBOX_BACKEND_PORT=8046 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3046 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3046 npx playwright test left-rail-phone-popout
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1600, height: 1000 };

async function gotoWorkspace(page) {
  await page.goto(`${BASE_URL}/workspace`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: 30000 });
}

test.describe('Left rail on a phone-sized viewport', () => {
  test('a collapsed type button opens the Library instead of doing nothing', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoWorkspace(page);

    // Collapsed by the shell, not by the user.
    await expect(page.getByTestId('workspace-left-rail')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
    await expect(page.getByTestId('workspace-left-rail-overlay')).toHaveCount(0);

    await page.getByTestId('workspace-left-rail-collapsed-model').click();

    await expect(page.getByTestId('workspace-left-rail-overlay')).toBeVisible();
    // ...and it landed on the section the button names.
    await expect(page.getByTestId('library-subsection-model')).toHaveAttribute(
      'data-collapsed',
      'false'
    );
  });

  test('the popout covers the content rather than being squeezed into the strip', async ({
    page,
  }) => {
    // The half the unit tests cannot check: it is positioned against the shell
    // row, not its own 48px container, so it has room to be a drawer.
    await page.setViewportSize(PHONE);
    await gotoWorkspace(page);
    await page.getByTestId('workspace-left-rail-expand').click();

    const panel = page.getByTestId('workspace-left-rail-overlay');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box.width).toBeGreaterThan(200);
    // Starts after the 48px strip, so the icons stay reachable underneath it.
    expect(box.x).toBeGreaterThanOrEqual(40);
  });

  test('tapping beside it, or pressing Escape, dismisses it', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoWorkspace(page);

    await page.getByTestId('workspace-left-rail-expand').click();
    await expect(page.getByTestId('workspace-left-rail-overlay')).toBeVisible();
    await page.getByTestId('workspace-left-rail-overlay-backdrop').click();
    await expect(page.getByTestId('workspace-left-rail-overlay')).toHaveCount(0);

    await page.getByTestId('workspace-left-rail-expand').click();
    await expect(page.getByTestId('workspace-left-rail-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('workspace-left-rail-overlay')).toHaveCount(0);
  });

  test('opening an object dismisses it, so it does not cover what it just opened', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await gotoWorkspace(page);
    await page.getByTestId('workspace-left-rail-collapsed-model').click();

    const overlay = page.getByTestId('workspace-left-rail-overlay');
    await expect(overlay).toBeVisible();

    // Any model row will do — this story is about the panel, not the object.
    await overlay.locator('[data-testid^="library-row-model-"]').first().click();

    await expect(overlay).toHaveCount(0);
  });

  test('at a desktop width the same button expands in flow, with no popout', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoWorkspace(page);

    // Wide enough that the rail is already expanded; collapse it first so the
    // strip is what we click.
    const rail = page.getByTestId('workspace-left-rail');
    if ((await rail.getAttribute('data-collapsed')) !== 'true') {
      await page.getByTestId('workspace-left-rail-collapse').click();
    }
    await page.getByTestId('workspace-left-rail-collapsed-model').click();

    await expect(page.getByTestId('workspace-left-rail-overlay')).toHaveCount(0);
    await expect(page.getByTestId('library-subsection-model')).toBeVisible();
  });
});
