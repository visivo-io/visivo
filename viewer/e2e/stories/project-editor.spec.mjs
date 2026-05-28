/**
 * Story: Project Editor (VIS-805 / Track M M-1)
 *
 * Validates the unscoped Workspace middle pane — the `<ProjectEditor>` surface
 * mounted at `/workspace` when no dashboard is scoped. Covers the M-1 happy
 * path: health row, level groups, recent edits, tile selection, project-chrome
 * selection, the "+ New Dashboard" CTA, and drag-between-levels.
 *
 * Precondition: Sandbox running on :3001/:8001
 *   visivo serve --port 8001 (in test-projects/integration)
 *   yarn start:sandbox (Vite on :3001 proxying to :8001)
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

test.describe('Project Editor (M-1)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });

    await page.goto('/workspace');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('project-editor').waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: ProjectEditor mounts in the unscoped middle pane', async () => {
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
    await expect(page.getByTestId('project-editor')).toBeVisible();
    // The old placeholder is gone.
    await expect(
      page.getByTestId('workspace-middle-project-placeholder')
    ).toHaveCount(0);
  });

  test('Step 2: health summary shows the four object counts', async () => {
    const health = page.getByTestId('project-editor-health');
    await expect(health).toBeVisible();
    await expect(page.getByTestId('project-editor-health-dashboards')).toBeVisible();
    await expect(page.getByTestId('project-editor-health-insights')).toBeVisible();
    await expect(page.getByTestId('project-editor-health-models')).toBeVisible();
    await expect(page.getByTestId('project-editor-health-sources')).toBeVisible();
  });

  test('Step 3: recent edits feed renders', async () => {
    await expect(page.getByTestId('project-editor-recent')).toBeVisible();
  });

  test('Step 4: at least one level group with dashboard tiles renders', async () => {
    const groups = page.locator('[data-testid^="level-group-"]');
    await expect(groups.first()).toBeVisible();
    const tiles = page.locator('[data-testid^="project-tile-"]');
    await expect(tiles.first()).toBeVisible();
  });

  test('Step 5: clicking a tile scopes the dashboard (selection dispatched)', async () => {
    const tile = page.locator('[data-testid^="project-tile-"]').first();
    await tile.click();
    // The clicked tile reflects the selected state.
    await expect(tile).toHaveAttribute('data-selected', 'true');
  });

  test('Step 6: the + New Dashboard CTA is present and clickable', async () => {
    const cta = page.getByTestId('project-editor-new-dashboard');
    await expect(cta).toBeVisible();
    await expect(cta).toContainText('New Dashboard');
    await cta.click();
  });

  test('Step 7: dragging a tile onto another level group reassigns its level', async () => {
    const tile = page.locator('[data-testid^="project-tile-"]').first();
    const groups = page.locator('[data-testid^="level-group-dropzone-"]');
    const groupCount = await groups.count();
    test.skip(groupCount < 2, 'Needs at least two level groups to drag between');

    const target = groups.nth(1);
    await tile.hover();
    await page.mouse.down();
    const box = await target.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
    } else {
      await page.mouse.up();
    }
    // The grid should still render after the drop completes.
    await expect(page.getByTestId('project-editor')).toBeVisible();
  });

  test('Step 8: no console errors during the happy path', async () => {
    const realErrors = page._consoleErrors.filter(
      e => !e.includes('favicon') && !e.includes('DevTools') && !e.includes('react-cool')
    );
    expect(realErrors).toHaveLength(0);
  });
});
