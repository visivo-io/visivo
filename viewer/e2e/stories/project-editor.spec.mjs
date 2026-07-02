/**
 * Story: Project Editor (VIS-805 / Track M M-1)
 *
 * Validates the unscoped Workspace middle pane — the `<ProjectEditor>` surface
 * mounted at `/workspace` when no dashboard is scoped. Each Linear acceptance
 * criterion is an explicit step with a screenshot at the meaningful state.
 *
 * Criteria covered (VIS-M1 / VIS-805):
 *   1.  <ProjectEditor> mounts in the unscoped middle pane.
 *   2.  Health summary renders the four object counts.
 *   3.  Recent edits feed renders.
 *   4.  Grouped tile grid by level (defaults.levels order; Unassigned last).
 *   5/6. dnd-kit drag source per tile + drop target per group → level updates
 *        in the draft cache (asserted via the zustand store + DOM regrouping).
 *   7.  Click a tile → `dashboard` selection dispatched to the workspace store.
 *   8.  Click whitespace → `project` (chrome) selection dispatched.
 *   9.  Search field appears when the project has >5 dashboards.
 *   10. "+ New Dashboard" CTA present/prominent.
 *   12. `project_editor_action` telemetry fires with the three kinds.
 *
 * Port: the sandbox for this worktree runs on :3003 (backend :8003). The shared
 * playwright.config baseURL is :3001, so this spec navigates with an absolute
 * URL (overridable via PROJECT_EDITOR_BASE_URL) to stay on its assigned port.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PROJECT_EDITOR_BASE_URL || 'http://localhost:3003';
const WORKSPACE_URL = `${BASE_URL}/workspace`;
const WAIT_FOR_PAGE = 20000;

// Workspace telemetry is observed via the canonical `visivo:workspace-telemetry`
// CustomEvent. The collector is installed as an init script so it survives the
// in-test navigations (`page.goto`) and captures every emission into `window.__evts`.
const installEventCollector = page =>
  page.addInitScript(() => {
    window.__evts = [];
    window.addEventListener('visivo:workspace-telemetry', e => window.__evts.push(e.detail));
  });
const readEvents = page => page.evaluate(() => window.__evts || []);
const clearEvents = page =>
  page.evaluate(() => {
    window.__evts = [];
  });
// Read the live workspace-store selection through the zustand store exposed on
// window by the viewer (`window.useStore`); fall back to the DOM if absent.
const readActiveObject = page =>
  page.evaluate(() => {
    const s = window.useStore && window.useStore.getState && window.useStore.getState();
    return s ? s.workspaceActiveObject : undefined;
  });

test.describe('Project Editor (M-1)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });

    // Install the telemetry CustomEvent collector before any navigation so it
    // is re-applied on every page load (including the in-test `page.goto`s).
    await installEventCollector(page);

    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('project-editor').waitFor({ timeout: WAIT_FOR_PAGE });
    // Let the workspace-route collection fetches (dashboards/insights/models/
    // sources) resolve so the health counts and tiles are present.
    await page.locator('[data-testid^="project-tile-"]').first().waitFor({ timeout: WAIT_FOR_PAGE });
    await clearEvents(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Criterion 1: ProjectEditor mounts in the unscoped middle pane', async () => {
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
    await expect(page.getByTestId('project-editor')).toBeVisible();
    await expect(page.getByTestId('workspace-middle-project-placeholder')).toHaveCount(0);
    await page.screenshot({ path: 'e2e/stories/__screens__/vis805-01-mount.png', fullPage: true });
  });

  test('Criterion 2: health summary shows the four object counts', async () => {
    await expect(page.getByTestId('project-editor-health')).toBeVisible();
    for (const key of ['dashboards', 'insights', 'models', 'sources']) {
      const cell = page.getByTestId(`project-editor-health-${key}`);
      await expect(cell).toBeVisible();
      // The integration project has non-zero counts for every category.
      await expect(cell).toContainText(/\d+/);
    }
    await page
      .getByTestId('project-editor-health')
      .screenshot({ path: 'e2e/stories/__screens__/vis805-02-health.png' });
  });

  test('Criterion 3: recent edits feed renders with entries', async () => {
    const recent = page.getByTestId('project-editor-recent');
    await expect(recent).toBeVisible();
    await expect(recent).toContainText(/Recent edits/i);
    // At least one recent-edit entry (≤5) for a project with dashboards.
    const entries = page.locator('[data-testid^="project-editor-recent-"]');
    expect(await entries.count()).toBeGreaterThan(0);
    expect(await entries.count()).toBeLessThanOrEqual(5);
    await recent.screenshot({ path: 'e2e/stories/__screens__/vis805-03-recent.png' });
  });

  test('Criterion 4: grouped tile grid renders dashboards by level', async () => {
    const groups = page.locator('[data-testid^="level-group-level:"]');
    // defaults.levels is empty in the integration project, so levels resolve by
    // index against the defaultLevels fallback → at least two populated groups
    // (level 0 "Organization", level 1 "Department").
    const groupCount = await groups.count();
    expect(groupCount).toBeGreaterThanOrEqual(2);
    await expect(groups.first()).toBeVisible();
    const tiles = page.locator('[data-testid^="project-tile-"]');
    expect(await tiles.count()).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: 'e2e/stories/__screens__/vis805-04-groups.png', fullPage: true });
  });

  test('Criterion 9: search field appears when the project has >5 dashboards', async () => {
    // Integration project has 6 dashboards (> the 5 threshold).
    await expect(page.getByTestId('project-editor-search')).toBeVisible();
  });

  test('Criterion 10: the + New Dashboard CTA is present and prominent', async () => {
    const cta = page.getByTestId('project-editor-new-dashboard');
    await expect(cta).toBeVisible();
    await expect(cta).toContainText('New Dashboard');
  });

  test('Criterion 7+12: clicking a tile dispatches a dashboard selection', async () => {
    await clearEvents(page);
    const tile = page.locator('[data-testid^="project-tile-"]').first();
    const tileTestId = await tile.getAttribute('data-testid');
    const tileName = tileTestId.replace('project-tile-', '');
    await tile.click();

    // Selection reaches the workspace store.
    const active = await readActiveObject(page);
    expect(active).toBeTruthy();
    expect(active.type).toBe('dashboard');
    expect(active.name).toBe(tileName);

    // Telemetry: select_tile.
    const events = await readEvents(page);
    const selectTile = events.find(
      e => e.eventName === 'project_editor_action' && e.payload?.kind === 'select_tile'
    );
    expect(selectTile, 'select_tile telemetry fired').toBeTruthy();
    expect(selectTile.payload.name).toBe(tileName);

    // Scoping to a dashboard switches the middle pane away from the project pane.
    await expect(page.getByTestId('workspace-middle-dashboard')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/stories/__screens__/vis805-07-tile-selected.png', fullPage: true });

    // Return to the unscoped project pane for the remaining steps.
    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('project-editor').waitFor({ timeout: WAIT_FOR_PAGE });
    await page.locator('[data-testid^="project-tile-"]').first().waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test('Criterion 8+12: clicking whitespace dispatches a project (chrome) selection', async () => {
    await clearEvents(page);
    // Click the editor whitespace (the header area below the title row),
    // avoiding tiles / interactive controls.
    await page.getByTestId('project-editor').click({ position: { x: 5, y: 5 } });
    const events = await readEvents(page);
    const selectChrome = events.find(
      e => e.eventName === 'project_editor_action' && e.payload?.kind === 'select_chrome'
    );
    expect(selectChrome, 'select_chrome telemetry fired').toBeTruthy();
    const active = await readActiveObject(page);
    expect(active?.type).toBe('project');
    await page.screenshot({ path: 'e2e/stories/__screens__/vis805-08-chrome.png', fullPage: true });
  });

  test('Criterion 5+6+12: dragging a tile to another level group reassigns its level', async () => {
    await clearEvents(page);

    // Find a tile in the first group and the dropzone of a different group.
    const firstGroup = page.locator('[data-testid^="level-group-level:"]').first();
    const sourceTile = firstGroup.locator('[data-testid^="project-tile-"]').first();
    const sourceTestId = await sourceTile.getAttribute('data-testid');
    const draggedName = sourceTestId.replace('project-tile-', '');

    const dropzones = page.locator('[data-testid^="level-group-dropzone-level:"]');
    const dropzoneCount = await dropzones.count();
    expect(dropzoneCount, 'needs ≥2 level groups to drag between').toBeGreaterThanOrEqual(2);

    // Snapshot the level before the drop, read from the live store.
    const levelBefore = await page.evaluate(name => {
      const s = window.useStore && window.useStore.getState && window.useStore.getState();
      const d = s && (s.dashboards || []).find(x => x.name === name);
      return d ? d.config?.level ?? null : undefined;
    }, draggedName);

    const targetZone = dropzones.nth(1);

    // dnd-kit PointerSensor needs an explicit down → move(s) → up with a small
    // initial nudge to clear the 5px activation distance.
    const tileBox = await sourceTile.boundingBox();
    const targetBox = await targetZone.boundingBox();
    expect(tileBox && targetBox).toBeTruthy();

    await page.mouse.move(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      tileBox.x + tileBox.width / 2 + 8,
      tileBox.y + tileBox.height / 2 + 8,
      { steps: 4 }
    );
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 12 }
    );
    // Capture the active drag overlay mid-flight.
    await page.screenshot({ path: 'e2e/stories/__screens__/vis805-05-drag-overlay.png', fullPage: true });
    await page.mouse.up();

    // Telemetry: reassign_level fired with the target level value.
    await expect
      .poll(async () => {
        const events = await readEvents(page);
        return events.some(
          e => e.eventName === 'project_editor_action' && e.payload?.kind === 'reassign_level'
        );
      }, { timeout: 8000 })
      .toBe(true);

    // The dashboard's level changed in the draft cache (zustand store). The
    // save round-trips through fetchDashboards, so poll for the new value.
    await expect
      .poll(
        async () =>
          page.evaluate(name => {
            const s = window.useStore && window.useStore.getState && window.useStore.getState();
            const d = s && (s.dashboards || []).find(x => x.name === name);
            return d ? d.config?.level ?? null : undefined;
          }, draggedName),
        { timeout: 10000 }
      )
      .not.toBe(levelBefore);

    // The grid still renders after the drop.
    await expect(page.getByTestId('project-editor')).toBeVisible();
    await page.screenshot({ path: 'e2e/stories/__screens__/vis805-06-after-drop.png', fullPage: true });
  });

  test('VIS-835: opening a dashboard via a tile populates the right-rail Outline (even over a stale dashboard URL)', async () => {
    // Repro the cross-path scope bug: the Outline must follow the dashboard the
    // user just opened from a tile, agreeing with the canvas, instead of
    // sticking to a previously-visited dashboard's URL.

    // 1) Open dashboard A by URL so the route param + Outline are populated.
    const firstTileId = await page
      .locator('[data-testid^="project-tile-"]')
      .first()
      .getAttribute('data-testid');
    const dashA = firstTileId.replace('project-tile-', '');
    await page.goto(`${WORKSPACE_URL}/dashboard/${dashA}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-middle-dashboard').waitFor({ timeout: WAIT_FOR_PAGE });

    // Show the Outline tab and assert it is scoped to A.
    await page.getByTestId('workspace-right-rail-tab-outline').click();
    await page.getByTestId('workspace-right-rail-outline').waitFor({ timeout: WAIT_FOR_PAGE });
    await expect(page.getByTestId('outline-tree-node-dashboard')).toContainText(dashA, {
      timeout: 10000,
    });

    // 2) Return to the Project Editor WITHOUT changing the route away from A's
    //    URL: click the project tab so the middle pane shows the tile grid while
    //    the `/workspace/dashboard/<A>` URL param lingers (the bug's setup). The
    //    project tab's id is `project:<projectName>`; select it by the
    //    `workspace-tab-select-project:` testid prefix.
    const projectTab = page.locator('[data-testid^="workspace-tab-select-project:"]').first();
    await projectTab.click();
    await page.getByTestId('project-editor').waitFor({ timeout: WAIT_FOR_PAGE });
    await page.locator('[data-testid^="project-tile-"]').first().waitFor({ timeout: WAIT_FOR_PAGE });

    // 3) Pick a DIFFERENT dashboard tile (B) and open it via the tile.
    const tiles = page.locator('[data-testid^="project-tile-"]');
    const count = await tiles.count();
    let dashB = null;
    for (let i = 0; i < count; i++) {
      const id = await tiles.nth(i).getAttribute('data-testid');
      const name = id.replace('project-tile-', '');
      if (name !== dashA) {
        dashB = name;
        await tiles.nth(i).click();
        break;
      }
    }
    expect(dashB, 'needs a second distinct dashboard tile').toBeTruthy();

    // Canvas switches to B.
    await expect(page.getByTestId('workspace-middle-dashboard')).toBeVisible({ timeout: 10000 });

    // 4) The Outline must now show B's tree — NOT the stale A — and must not be
    //    blank. (Before the fix, the URL param A won, leaving the Outline stuck.)
    await page.getByTestId('workspace-right-rail-tab-outline').click().catch(() => {});
    await page.getByTestId('workspace-right-rail-outline').waitFor({ timeout: WAIT_FOR_PAGE });
    await expect(page.getByTestId('outline-tree-no-dashboard')).toHaveCount(0);
    await expect(page.getByTestId('outline-tree-node-dashboard')).toContainText(dashB, {
      timeout: 10000,
    });
    await expect(page.getByTestId('outline-tree-node-dashboard')).not.toContainText(dashA);

    await page.screenshot({
      path: 'e2e/stories/__screens__/vis835-tile-outline-sync.png',
      fullPage: true,
    });

    // Reset to the unscoped pane for the remaining step.
    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('project-editor').waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test('No console errors during the happy path', async () => {
    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('ResizeObserver')
    );
    expect(realErrors).toHaveLength(0);
  });
});
