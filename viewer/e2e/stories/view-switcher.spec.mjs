/**
 * Story: Destination view switcher (D1, Explore 2.0 Phase 0).
 *
 * Covers `specs/plan/explorer-workspace-unification/01-ux-spec.md` §1 end to
 * end against a real cursor + real URL navigation:
 *   1. The three destinations (Project / Semantic Layer / Explorer) render in
 *      the LeftRail's switcher; clicking one shows its Home and navigates the URL.
 *   2. Opening a document tab PARKS whichever view was active (the tab stays
 *      open, unfocused); the switcher shows no active row while a tab owns
 *      the center; clicking the tab re-takes the center.
 *   3. Reloading at a view's URL (`/workspace/semantic-layer`) restores that
 *      view's Home directly from the URL.
 *   4. The Semantic Layer switcher row and its Home pane resolve the SAME
 *      icon (B1 fix — no more TabStrip-fallback / borrowed-relation-icon
 *      mismatch).
 *   5. Deep-linking a document owned by a non-Project destination (a
 *      relation, owned by Semantic Layer) sets the active destination as a
 *      side effect; closing the tab lands on THAT destination's Home, not
 *      Project's.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=viewSwitcher VISIVO_SANDBOX_BACKEND_PORT=8042 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3042 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3042 npx playwright test view-switcher
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';

async function gotoWorkspace(page, path = '/workspace') {
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-view-switcher')).toBeVisible({ timeout: 15000 });
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

test.describe('Destination view switcher (D1, Explore 2.0 Phase 0)', () => {
  test('the three destinations render with icon + label; clicking each shows its Home and navigates the URL', async ({
    page,
  }) => {
    await gotoWorkspace(page);

    // Project is the default.
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'true'
    );
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/workspace');

    // Semantic Layer.
    const semanticRow = page.getByTestId('workspace-view-switcher-semantic-layer');
    await expect(semanticRow).toHaveTextContent('Semantic Layer');
    await semanticRow.hover();
    await semanticRow.click();
    await expect(semanticRow).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible();
    await expect(page.getByTestId('semantic-layer-erd')).toBeVisible({ timeout: 20000 });
    expect(new URL(page.url()).pathname).toBe('/workspace/semantic-layer');

    // Explorer (Phase 0 placeholder Home).
    const explorerRow = page.getByTestId('workspace-view-switcher-explorer');
    await expect(explorerRow).toHaveTextContent('Explorer');
    await explorerRow.hover();
    await explorerRow.click();
    await expect(explorerRow).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible();
    await expect(page.getByText(/Explorer arrives with explorations/i)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/workspace/exploration');

    // Back to Project.
    const projectRow = page.getByTestId('workspace-view-switcher-project');
    await projectRow.hover();
    await projectRow.click();
    await expect(projectRow).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/workspace');
  });

  test('opening a document tab parks the active view; the switcher shows no active row while a tab owns the center', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    const chartTab = page.getByTestId('workspace-tab-chart:simple-scatter-chart');
    await expect(chartTab).toHaveAttribute('data-active', 'true');

    // NO view row is active — a document tab owns the center.
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'false'
    );
    await expect(page.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'false'
    );

    // Switching to Explorer parks the chart tab — it stays OPEN, just unfocused.
    const explorerRow = page.getByTestId('workspace-view-switcher-explorer');
    await explorerRow.hover();
    await explorerRow.click();
    await expect(chartTab).toBeVisible();
    await expect(chartTab).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible();

    // Clicking the parked tab re-takes the center; the view no longer shows active.
    const chartSelect = page.getByTestId('workspace-tab-select-chart:simple-scatter-chart');
    await chartSelect.hover();
    await chartSelect.click();
    await expect(chartTab).toHaveAttribute('data-active', 'true');
    await expect(explorerRow).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('workspace-middle-chart')).toBeVisible();
  });

  test('reloading at a view URL restores that Home directly from the URL', async ({ page }) => {
    await gotoWorkspace(page, '/workspace/semantic-layer');
    await expect(page.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true'
    );
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true'
    );
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible();
  });

  test('the Semantic Layer switcher row and its Home pane resolve the SAME icon (B1 fix)', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    const switcherIcon = page
      .getByTestId('workspace-view-switcher-semantic-layer')
      .locator('svg')
      .first();
    const switcherTestId = await switcherIcon.getAttribute('data-testid');
    expect(switcherTestId).toBeTruthy();

    const semanticRow = page.getByTestId('workspace-view-switcher-semantic-layer');
    await semanticRow.hover();
    await semanticRow.click();
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible();

    const paneIcon = page
      .getByTestId('workspace-subbar-semantic-layer')
      .locator('svg')
      .first();
    const paneTestId = await paneIcon.getAttribute('data-testid');

    // Both resolve the SAME `objectTypeConfigs` entry — no more TabStrip
    // fallback icon / MiddlePane borrowing `relation`'s AccountTreeIcon.
    expect(paneTestId).toBe(switcherTestId);
    expect(paneTestId).not.toBe('AccountTreeIcon');
  });

  test('deep-linking a Semantic-Layer-owned document sets the active destination; closing it lands on Semantic Layer Home, not Project', async ({
    page,
  }) => {
    await gotoWorkspace(page, '/workspace?edit=relation:local_to_local');
    const relationTab = page.getByTestId('workspace-tab-relation:local_to_local');
    await expect(relationTab).toHaveAttribute('data-active', 'true');

    const activeView = await page.evaluate(() => window.useStore.getState().workspaceActiveView);
    expect(activeView).toBe('semantic-layer');

    const closeBtn = page.getByTestId('workspace-tab-close-relation:local_to_local');
    await closeBtn.hover();
    await closeBtn.click();

    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible();
    await expect(page.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true'
    );
  });
});
