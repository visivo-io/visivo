/**
 * Story: Library per-type subsections default to COLLAPSED (VIS-828)
 *
 * The Library left rail keeps the two top sections (Layout Items / Data Layer)
 * expanded, but every per-type subsection (Charts / Tables / … / Insights)
 * starts COLLAPSED so the user sees a tidy list of section headers + counts
 * instead of an overwhelming wall of rows. Expanding a type on demand reveals
 * its item rows, and that explicit preference persists across reloads.
 *
 * Precondition: Sandbox running on the configured frontend port.
 *   VISIVO_SANDBOX_BACKEND_PORT=8024 VISIVO_SANDBOX_FRONTEND_PORT=3024 \
 *     VISIVO_SANDBOX_NAME=vis828 bash scripts/sandbox.sh start
 *
 * The base URL defaults to the vis828 sandbox (:3024); override with
 * E2E_BASE_URL when running against the shared :3001 sandbox.
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3024';
const SCREENS = 'e2e/stories/__screens__';

// Per-type subsections owned by the two sections, in display order.
const LAYOUT_TYPES = ['chart', 'table', 'markdown', 'input', 'dashboard'];
const DATA_TYPES = ['source', 'model', 'dimension', 'metric', 'relation', 'insight'];

// Reset persisted Library collapse prefs so the run starts from a clean
// "no saved preference" state (the scenario under test).
const clearLibraryPrefs = async page => {
  await page.addInitScript(() => {
    try {
      const raw = window.localStorage.getItem('common-storage');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.state) {
        parsed.state.libraryCollapsedSections = {};
        parsed.state.libraryCollapsedSubsections = {};
        window.localStorage.setItem('common-storage', JSON.stringify(parsed));
      }
    } catch {
      /* non-critical — fall through to defaults */
    }
  });
};

test.describe('Library — subsections default to collapsed (VIS-828)', () => {
  test('Step 1: subsections render collapsed by default in the flat list', async ({
    page,
  }) => {
    await clearLibraryPrefs(page);
    await page.goto(`${BASE}/workspace`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: 15000 });

    // The shared search + filter dropdown are always visible above the list.
    await expect(page.getByTestId('library-search')).toBeVisible();
    await expect(page.getByTestId('library-filter-toggle')).toBeVisible();

    // Every per-type subsection renders collapsed: header + count visible,
    // body (item rows) hidden.
    for (const t of [...LAYOUT_TYPES, ...DATA_TYPES]) {
      await expect(page.getByTestId(`library-subsection-${t}`)).toHaveAttribute(
        'data-collapsed',
        'true'
      );
      await expect(page.getByTestId(`library-subsection-${t}-header`)).toBeVisible();
      await expect(page.getByTestId(`library-subsection-${t}-body`)).toHaveCount(0);
    }

    // No item rows are rendered while every subsection is collapsed.
    await expect(page.locator('[data-testid^="library-row-"]')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/vis828-01-subsections-collapsed.png`, fullPage: true });
  });

  test('Step 2: expanding a subsection reveals its item rows', async ({ page }) => {
    await clearLibraryPrefs(page);
    await page.goto(`${BASE}/workspace`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: 15000 });

    // Pick a subsection that has rows in the integration project — fall back
    // across a few likely-populated types so the story isn't brittle to the
    // exact fixture contents.
    let opened = null;
    for (const t of ['source', 'model', 'chart', 'table']) {
      const header = page.getByTestId(`library-subsection-${t}-header`);
      if ((await header.count()) === 0) continue;
      await header.click();
      const body = page.getByTestId(`library-subsection-${t}-body`);
      await expect(body).toBeVisible();
      const rows = body.locator('[data-testid^="library-row-"]');
      if ((await rows.count()) > 0) {
        opened = t;
        break;
      }
    }

    expect(opened, 'expected at least one populated subsection to expand').not.toBeNull();

    // The opened subsection is now expanded with visible rows.
    await expect(page.getByTestId(`library-subsection-${opened}`)).toHaveAttribute(
      'data-collapsed',
      'false'
    );
    await expect(
      page.getByTestId(`library-subsection-${opened}-body`).locator('[data-testid^="library-row-"]').first()
    ).toBeVisible();

    await page.screenshot({ path: `${SCREENS}/vis828-02-subsection-expanded.png`, fullPage: true });
  });
});
