/**
 * Story: Switching destination mid-drag (e2e-gap-review.md finding #16).
 * Companion to `exploration-dnd-pull-in.spec.mjs` — reuses its manual
 * mouse-driven drag pattern, split into explicit `mouse.down`/`mouse.move`
 * steps WITHOUT `mouse.up()` so a keyboard shortcut can fire mid-drag.
 *
 * `WorkspaceDndContext` (VIS-802 / G-1) is mounted exactly ONCE at
 * `WorkspaceShell`, wrapping `MiddlePane` — it never unmounts on a
 * destination switch. `MiddlePane`'s dispatch is a plain conditional swap:
 * switching destination while `ExplorationPane` is mounted unmounts it (and
 * every `useDroppable` registration inside it, including
 * `sql-editor-drop-zone`) in favor of `DestinationHome`, but the DnD
 * context's `activeDrag` state + `<DragOverlay>` survive untouched, since
 * they live one level up. `routeWorkspaceDragEnd`/`routeExplorationDragEnd`
 * dispatch purely by payload SHAPE (dragData/dropData), with no check that
 * the drop's surface matches the drag's origin surface — this story drives
 * the actual release and confirms the outcome is a graceful no-op (no
 * crash, no corrupted exploration state, no stuck DnD context), not a
 * silent misroute.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=dndMidDrag VISIVO_SANDBOX_BACKEND_PORT=8049 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3049 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3049 npx playwright test workspace-dnd-mid-drag-destination-switch
 *
 * Runs in playwright.config.mjs's `exploration-mutations` project (serial,
 * no retries) — mints a real backend exploration record, same reasoning as
 * exploration-dnd-pull-in.spec.mjs.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiBase } from '../helpers/sandbox.mjs';

// Tall viewport — same rationale as exploration-dnd-pull-in.spec.mjs: keeps
// every drop target comfortably away from any auto-scroll edge.
test.use({ viewport: { width: 1280, height: 1600 } });

const SOURCE = 'local-duckdb';
const TABLE = 'test_table';

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
}

async function newExploration(page) {
  await page.getByTestId('explorer-home-new-exploration').click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  return new URL(page.url()).pathname.split('/').pop();
}

const chips = page => page.locator('[data-testid^="query-chip-"][data-active]');

async function expandSourceTable(page) {
  const sourceHeader = page.getByTestId('library-subsection-source-header');
  const sourceBody = page.getByTestId('library-subsection-source-body');
  if (!(await sourceBody.isVisible().catch(() => false))) await sourceHeader.click();
  await expect(sourceBody).toBeVisible({ timeout: 5000 });

  await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
  const tableRow = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
  await expect(tableRow).toBeVisible({ timeout: 15000 });
  return tableRow;
}

async function listExplorationIds(page) {
  const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
  if (!res || !res.ok()) return [];
  return ((await res.json().catch(() => [])) || []).map(e => e.id);
}

test.describe('Switching destination mid-drag (Explore 2.0 cross-feature #518 x #520)', () => {
  // Headroom for combined-load contention against the shared sandbox
  // (mirrors exploration-lifecycle.spec.mjs's own rationale).
  test.describe.configure({ timeout: 60000 });

  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    const idsAfter = await listExplorationIds(page);
    for (const id of idsAfter.filter(i => !idsBeforeTest.includes(i))) {
      await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('Cmd/Ctrl+1 mid-drag switches destination without crashing; the drag ends as a clean no-op and the exploration is untouched', async ({
    page,
  }) => {
    // Track uncaught JS exceptions (a real crash) and any 4xx/5xx from an
    // ACTUAL api call — deliberately NOT a blanket "no console.error"
    // check, which would also flag incidental static-asset 404s
    // (favicons/icons) unrelated to the drag interruption this test cares
    // about.
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    const apiFailures = [];
    page.on('response', res => {
      if (res.status() >= 400 && res.url().includes('/api/')) {
        apiFailures.push(`${res.status()} ${res.url()}`);
      }
    });

    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const existingChips = await chips(page).count();

    const tableRow = await expandSourceTable(page);
    const dropZone = page.getByTestId('sql-editor-drop-zone');
    const sourceBox = await tableRow.boundingBox();
    const targetBox = await dropZone.boundingBox();
    expect(sourceBox && targetBox, 'both drag endpoints have a box').toBeTruthy();

    const sourceX = sourceBox.x + sourceBox.width / 2;
    const sourceY = sourceBox.y + sourceBox.height / 2;
    const targetX = targetBox.x + targetBox.width / 2;
    const targetY = targetBox.y + targetBox.height / 2;

    // Manual drag, split into explicit steps — NO mouse.up() yet, so the
    // gesture is genuinely mid-flight when the keyboard shortcut fires.
    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    await page.mouse.move(sourceX + 10, sourceY, { steps: 3 });
    await page.waitForTimeout(100);
    await page.mouse.move((sourceX + targetX) / 2, (sourceY + targetY) / 2, { steps: 8 });
    await page.waitForTimeout(100);

    // Confirm the drag is genuinely live before doing anything else.
    await expect(page.getByTestId('library-drag-preview')).toBeVisible({ timeout: 5000 });

    // Mid-drag destination switch — mouse button is still physically held.
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+1' : 'Control+1');

    // The destination switch happens; ExplorationPane (and its
    // sql-editor-drop-zone) unmounts in favor of Project Home, but the
    // DragOverlay survives (WorkspaceDndContext is shell-level).
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('library-drag-preview')).toBeVisible();

    // Release over whatever's now under the cursor in the NEW destination —
    // move onto the Project pane's body first, matching the recommended
    // story's "release over whatever's now under the cursor" step.
    const projectBox = await page.getByTestId('workspace-middle-project').boundingBox();
    await page.mouse.move(
      projectBox.x + projectBox.width / 2,
      projectBox.y + projectBox.height / 2,
      { steps: 6 }
    );
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(300);

    // The drag ends cleanly — no lingering overlay, no crash, destination
    // unchanged (no forced bounce back to Explorer).
    await expect(page.getByTestId('library-drag-preview')).not.toBeVisible();
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();

    expect(pageErrors, 'no uncaught JS exceptions from the interrupted drag').toEqual([]);
    expect(apiFailures, 'no failed API calls from the interrupted drag').toEqual([]);

    // The exploration itself is untouched — no phantom/garbage query chip
    // was created by the orphaned drop, and the source table drag never
    // reached a valid target.
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await page.getByTestId(`workspace-tab-select-exploration:${id}`).click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect(chips(page)).toHaveCount(existingChips);

    // The DnD context isn't left in a stuck "always dragging" state — a
    // FRESH, complete drag-and-drop still works normally afterward.
    const freshDropZone = page.getByTestId('sql-editor-drop-zone');
    const tableRow2 = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
    const src2 = await tableRow2.boundingBox();
    const tgt2 = await freshDropZone.boundingBox();
    await page.mouse.move(src2.x + src2.width / 2, src2.y + src2.height / 2);
    await page.mouse.down();
    await page.mouse.move(src2.x + src2.width / 2 + 10, src2.y + src2.height / 2, { steps: 3 });
    await page.waitForTimeout(100);
    await page.mouse.move(tgt2.x + tgt2.width / 2, tgt2.y + tgt2.height / 2, { steps: 12 });
    await page.mouse.move(tgt2.x + tgt2.width / 2, tgt2.y + tgt2.height / 2, { steps: 4 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(300);

    await expect(chips(page)).toHaveCount(existingChips + 1, { timeout: 10000 });
  });
});
