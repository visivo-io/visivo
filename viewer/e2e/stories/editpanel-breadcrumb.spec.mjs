/**
 * Story: EditPanel structural breadcrumb + keyboard nav (VIS-804 / Track G G-2)
 *
 * The right-rail Edit tab now carries a slim STRUCTURAL BREADCRUMB band between
 * the tab header and the form body. It reflects the current
 * `workspaceOutlineSelectedKey` ancestry (`dashboard ▸ row 2 ▸ item 1`):
 *
 *   - Each segment is a button that SELECTS that ancestor (writes the parent
 *     key via `setWorkspaceOutlineSelectedKey`) — the same selection source the
 *     Outline tree + canvas read.
 *   - Keyboard nav on the band: ↑/↓ step siblings, ←/→ step the hierarchy,
 *     ⌘↑/↓ reorder, Enter focuses the form, Esc deselects.
 *
 * Driven against the deeply-nested `nested-layouts-dashboard` so the breadcrumb
 * renders a multi-segment chain (dashboard ▸ row ▸ container ▸ row ▸ item).
 *
 * Precondition: an isolated sandbox running the integration project. BASE
 * defaults to :3045 but is env-overridable:
 *   VISIVO_SANDBOX_BACKEND_PORT=8045 VISIVO_SANDBOX_FRONTEND_PORT=3045 \
 *   VISIVO_SANDBOX_NAME=vis804 bash scripts/sandbox.sh start
 *   # then: VIS_EDITPANEL_BREADCRUMB_BASE=http://localhost:3045 \
 *   #         npx playwright test editpanel-breadcrumb
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_EDITPANEL_BREADCRUMB_BASE || 'http://localhost:3045';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'nested-layouts-dashboard';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1200 } });

const setKey = (page, key) =>
  page.evaluate(k => window.useStore.getState().setWorkspaceOutlineSelectedKey(k), key);

const readKey = page =>
  page.evaluate(() => window.useStore.getState().workspaceOutlineSelectedKey);

const openEditRail = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  // Ensure the Edit tab is active (it is the default, but click to be explicit).
  const editTab = page.getByTestId('workspace-right-rail-tab-edit');
  await expect(editTab).toBeVisible({ timeout: WAIT });
  await editTab.click();
  await expect(page.getByTestId('workspace-right-rail-edit')).toBeVisible({ timeout: WAIT });
};

test.describe('EditPanel breadcrumb + keyboard nav (VIS-804)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  test('breadcrumb renders the selection ancestry and segments are clickable', async ({
    page,
  }) => {
    await openEditRail(page);

    // Dashboard selection → a single root segment.
    await setKey(page, 'dashboard');
    const band = page.getByTestId('edit-breadcrumb');
    await expect(band).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('edit-breadcrumb-segment-dashboard')).toHaveText(/.+/);

    // Row selection → dashboard ▸ row.
    await setKey(page, 'row.0');
    await expect(page.getByTestId('edit-breadcrumb-segment-dashboard')).toBeVisible();
    await expect(page.getByTestId('edit-breadcrumb-segment-row.0')).toContainText('Row 1');

    // Item selection → dashboard ▸ row ▸ item (3 segments).
    await setKey(page, 'row.0.item.0');
    await expect(page.getByTestId('edit-breadcrumb-segment-row.0.item.0')).toBeVisible({
      timeout: WAIT,
    });
    const segs = page.locator('[data-testid^="edit-breadcrumb-segment-"]');
    expect(await segs.count()).toBe(3);

    // Click the row ancestor → selection jumps to that ancestor.
    await page.getByTestId('edit-breadcrumb-segment-row.0').click();
    expect(await readKey(page)).toBe('row.0');

    await page.screenshot({ path: `${SCREENS}/editpanel-breadcrumb-item.png`, fullPage: false });
  });

  test('keyboard nav moves the selection along the outline', async ({ page }) => {
    await openEditRail(page);

    // Start at the first top-level row, focus the band.
    await setKey(page, 'row.0');
    const band = page.getByTestId('edit-breadcrumb');
    await band.focus();

    // → descends into the first child item.
    await band.press('ArrowRight');
    await expect.poll(() => readKey(page)).toBe('row.0.item.0');

    // ← steps back up to the row.
    await band.press('ArrowLeft');
    await expect.poll(() => readKey(page)).toBe('row.0');

    // ↓ steps to the next sibling row (the dashboard has multiple top rows).
    await band.press('ArrowDown');
    await expect.poll(() => readKey(page)).not.toBe('row.0');

    // Esc deselects back to the dashboard root.
    await band.press('Escape');
    await expect.poll(() => readKey(page)).toBe('dashboard');

    await page.screenshot({
      path: `${SCREENS}/editpanel-breadcrumb-keyboard.png`,
      fullPage: false,
    });
  });
});
