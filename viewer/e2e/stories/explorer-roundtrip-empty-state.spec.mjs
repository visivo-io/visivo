/**
 * Story: J-5 / VIS-789 — Explorer empty-state CTA parameterized from Build mode.
 *
 * When the Explorer left rail is empty AND Explorer was entered from Build mode
 * (`?return_to=workspace`), the empty-state copy spells out the full round-trip
 * ("Add a source first, then build your first insight … drop it back on your
 * dashboard") instead of the terse default. A search "no results" message always
 * takes precedence over the round-trip copy.
 *
 * The integration project's left rail is NOT empty, so the round-trip vs default
 * copy switch is verified at the unit level (ExplorerLeftPanel.test.jsx). Here we
 * harden the precedence rule: typing a no-match search query shows the search
 * "no results" message even under ?return_to=workspace.
 *
 * Precondition: sandbox (integration project).
 */

import { test, expect } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test.describe(`J-5 — empty-state round-trip copy (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test.setTimeout(90000);

    test('a no-match search shows "No results" even with ?return_to=workspace', async ({
      page,
    }) => {
      await page.goto('/explorer?return_to=workspace&dashboard=simple-dashboard');
      await page.waitForLoadState('networkidle');
      // Find the left-rail search box and type a query that matches nothing.
      const search = page.locator('[data-testid="left-panel-search"]').first();
      await expect(search).toBeVisible({ timeout: 15000 });
      await search.fill('zzz_no_such_object_qqq');
      const empty = page.locator('[data-testid="explorer-left-empty-state"]');
      await expect(empty).toBeVisible({ timeout: 10000 });
      await expect(empty).toContainText('No results');
      // Search "no results" takes precedence — the round-trip CTA copy is hidden.
      await expect(empty).not.toContainText('drop it back on your dashboard');
    });
  });
}
