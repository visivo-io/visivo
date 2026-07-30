/**
 * Story: Tab power features — shortcuts, drag-reorder, overflow, dirty-close
 * (VIS-812 / Track O O-3; keyboard scheme reconciled in Explore 2.0 Phase 0
 * against the new view-switcher shortcuts, 01-ux-spec.md §6).
 *
 *   1. Cmd/Ctrl+T activates the Project destination ("new tab" affordance).
 *   2. Cmd/Ctrl+1/2/3 switch to the three workspace VIEWS (Project / Semantic
 *      Layer / Explorer) — reassigned from tab-position switching, which
 *      shifts down to Cmd/Ctrl+4..9.
 *   3. Cmd/Ctrl+W closes the active (clean) tab.
 *   4. Shortcuts are suppressed while typing in an input.
 *   5. Drag-to-reorder with a REAL cursor (pointer-driven dnd-kit).
 *   6. >8 tabs → the strip overflows and scrolls horizontally.
 *   7. Closing a dirty tab raises the confirmation dialog (Keep editing /
 *      Close without saving).
 *
 * IMPORTANT (01-ux-spec.md §6): Cmd+1/2/3 were validated to be unclaimed by
 * any OS-level chord (OS screenshot chords are Cmd+SHIFT+3/4/5) — this real
 * Playwright keyboard press exercises the actual browser/OS interception,
 * which a synthetic dispatch would not.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=trackO VISIVO_SANDBOX_BACKEND_PORT=8041 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3041 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3041 npx playwright test workspace-tabs-shortcuts
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
// Playwright runs on the same host as the browser, so process.platform picks
// the right modifier for the page's navigator-based detection.
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function gotoWorkspace(page) {
  await page.goto(`${BASE_URL}/workspace`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-tab-strip')).toBeVisible({ timeout: 15000 });
}

async function openLibraryObject(page, type, name) {
  const header = page.getByTestId(`library-subsection-${type}-header`);
  const row = page.getByTestId(`library-row-${type}-${name}`);
  if (!(await row.isVisible().catch(() => false))) {
    await header.hover();
    await header.click();
  }
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.hover();
  await row.click();
}

test.describe('Tab shortcuts + reorder + overflow + dirty-close (VIS-812)', () => {
  test('Cmd+1/2/3 switch views; Cmd+4/5 switch tab position; Cmd+T re-activates Project; Cmd+W closes', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    await openLibraryObject(page, 'table', 'new_table');
    // Strip: [chart, table] — table is active (no project tab; views left the
    // tab model, Phase 0).

    const chartTab = page.getByTestId('workspace-tab-chart:simple-scatter-chart');
    const tableTab = page.getByTestId('workspace-tab-table:new_table');
    await expect(tableTab).toHaveAttribute('data-active', 'true');

    // Cmd+4 → tab position 1 (the chart).
    await page.keyboard.press(`${MOD}+4`);
    await expect(chartTab).toHaveAttribute('data-active', 'true');

    // Cmd+5 → tab position 2 (the table).
    await page.keyboard.press(`${MOD}+5`);
    await expect(tableTab).toHaveAttribute('data-active', 'true');

    // Cmd+1 → the Project view — parks the table tab (stays open, unfocused).
    await page.keyboard.press(`${MOD}+1`);
    await expect(tableTab).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'true'
    );

    // Cmd+2 → the Semantic Layer view.
    await page.keyboard.press(`${MOD}+2`);
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible();
    await expect(page.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true'
    );

    // Cmd+3 → the Explorer view.
    await page.keyboard.press(`${MOD}+3`);
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible();
    await expect(page.getByTestId('workspace-view-switcher-explorer')).toHaveAttribute(
      'data-active',
      'true'
    );

    // Cmd+5 refocuses the table tab (still open, per the park semantics).
    await page.keyboard.press(`${MOD}+5`);
    await expect(tableTab).toHaveAttribute('data-active', 'true');

    // Cmd+W closes the active clean tab; focus falls back to the chart.
    await page.keyboard.press(`${MOD}+w`);
    await expect(page.getByTestId('workspace-tab-table:new_table')).toHaveCount(0);
    await expect(chartTab).toHaveAttribute('data-active', 'true');

    // Cmd+T activates the Project destination ("new tab" affordance) — the
    // chart tab parks, Project's Home takes the center.
    await page.keyboard.press(`${MOD}+t`);
    await expect(chartTab).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
  });

  test('shortcuts are suppressed while typing in an input', async ({ page }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    const chartTab = page.getByTestId('workspace-tab-chart:simple-scatter-chart');
    await expect(chartTab).toHaveAttribute('data-active', 'true');

    // Focus the Library search input and fire the chord — nothing must change.
    const search = page.locator('input').first();
    await search.hover();
    await search.click();
    await page.keyboard.press(`${MOD}+1`);
    await expect(chartTab).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('workspace-tab-chart:simple-scatter-chart')).toHaveCount(1);
    // The view switcher didn't move either — the chord never reached it.
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  test('drag-to-reorder tabs with a real cursor', async ({ page }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    await openLibraryObject(page, 'table', 'new_table');
    // Strip order: [chart, table] (no project tab — it left the tab model, Phase 0).

    const source = page.getByTestId('workspace-tab-wrapper-table:new_table');
    const target = page.locator('[data-testid^="workspace-tab-wrapper-chart:"]');
    const src = await source.boundingBox();
    const tgt = await target.boundingBox();
    expect(src && tgt).toBeTruthy();

    // Real pointer drag: down on the table tab, glide onto the chart tab
    // (left edge so closest-center resolves to it), release.
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(tgt.x + tgt.width / 3, tgt.y + tgt.height / 2, { steps: 12 });
    await page.mouse.move(tgt.x + tgt.width / 3, tgt.y + tgt.height / 2, { steps: 4 });
    await page.mouse.up();

    // The table tab now occupies the first slot.
    const ids = await page
      .getByTestId('workspace-tab-strip')
      .locator('[role="tab"]')
      .evaluateAll(els => els.map(el => el.getAttribute('data-testid')));
    expect(ids[0]).toBe('workspace-tab-table:new_table');
  });

  test('the strip scrolls horizontally when more than 8 tabs are open', async ({ page }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    // Bulk state setup (NOT the behaviour under test): background-open enough
    // tabs to overflow the strip — the scroll behaviour is what we assert.
    await page.evaluate(() => {
      const open = window.useStore.getState().openWorkspaceTabBackground;
      for (let i = 1; i <= 9; i += 1) {
        open({ type: 'model', name: `overflow-model-${i}` });
      }
    });
    const strip = page.getByTestId('workspace-tab-strip');
    // 1 chart + 9 overflow models (no project tab — it left the tab model, Phase 0).
    await expect(strip.locator('[role="tab"]')).toHaveCount(10, { timeout: 10000 });

    const scroller = strip.locator('> div').first();
    const overflows = await scroller.evaluate(el => el.scrollWidth > el.clientWidth);
    expect(overflows).toBe(true);

    // Switching to the LAST tab keeps it in view (scrollIntoView on activate).
    const lastSelect = page.getByTestId('workspace-tab-select-model:overflow-model-9');
    await page.evaluate(() =>
      window.useStore.getState().switchWorkspaceTab('model:overflow-model-9')
    );
    await expect(page.getByTestId('workspace-tab-model:overflow-model-9')).toBeVisible();
    const inView = await lastSelect.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.right <= window.innerWidth && r.left >= 0;
    });
    expect(inView).toBe(true);
  });

  test('closing a dirty tab raises the confirmation dialog', async ({ page }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    const tabId = 'chart:simple-scatter-chart';
    // Wait for the tab to actually land in the store before flipping its dirty
    // flag — `openLibraryObject`'s click routes through the URL round-trip
    // (`openWorkspaceTab` -> navigate -> `Workspace`'s URL-sync effect ->
    // `activateWorkspaceTab`), so evaluating immediately after the click can
    // race the store write and silently no-op (VIS-812 flake).
    await expect(page.getByTestId(`workspace-tab-${tabId}`)).toBeVisible();
    // Dirty wiring belongs to Track H (auto-save) — flip the flag as setup.
    await page.evaluate(id => {
      window.useStore.getState().setWorkspaceTabDirty(id, true);
    }, tabId);
    await expect(page.getByTestId(`workspace-tab-dirty-${tabId}`)).toBeVisible();

    // Real-cursor close → the dialog appears instead of closing.
    const closeBtn = page.getByTestId(`workspace-tab-close-${tabId}`);
    await closeBtn.hover();
    await closeBtn.click();
    const dialog = page.getByTestId('tab-close-confirm-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('simple-scatter-chart');

    // "Keep editing" → tab survives, still dirty.
    const cancel = page.getByTestId('tab-close-confirm-cancel');
    await cancel.hover();
    await cancel.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByTestId(`workspace-tab-${tabId}`)).toBeVisible();
    await expect(page.getByTestId(`workspace-tab-dirty-${tabId}`)).toBeVisible();

    // Close again via Cmd+W (the tab is active) → confirm the discard.
    await page.keyboard.press(`${MOD}+w`);
    await expect(dialog).toBeVisible();
    const confirm = page.getByTestId('tab-close-confirm-close');
    await confirm.hover();
    await confirm.click();
    await expect(page.getByTestId(`workspace-tab-${tabId}`)).toHaveCount(0);
  });
});
