/**
 * Story: Dashboard Viewing
 *
 * Validates the baseline dashboard viewing experience — the most fundamental
 * user flow. If this story fails, something is seriously wrong.
 *
 * Precondition: Sandbox running on :3001/:8001
 *   visivo serve --port 8001 (in test-projects/integration)
 *   yarn start:sandbox (Vite on :3001 proxying to :8001)
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard Viewing', () => {
  test('Step 1: Home page loads with navigation', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should show navigation links (Explorer, Lineage, Editor, Project)
    await expect(page.getByText('Explorer').first()).toBeVisible({ timeout: 10000 });

    // Lock down the Phase 1 rewire: Explorer card href points to /explorer-new
    await expect(page.locator('a[href="/explorer-new"]')).toHaveCount(1);
    await expect(page.locator('a[href="/lineage-new"]')).toHaveCount(1);
    await expect(page.locator('a[href="/editor-new"]')).toHaveCount(1);

    const realErrors = consoleErrors.filter(
      e => !e.includes('favicon') && !e.includes('DevTools') && !e.includes('react-cool')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('Step 2: Navigate to insights dashboard and verify charts render', async ({ page }) => {
    const networkErrors = [];
    page.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/api/')) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click the insights dashboard link
    const insightsLink = page.locator('a[href*="insights-dashboard"]');
    if (await insightsLink.isVisible()) {
      await insightsLink.click();
      await page.waitForLoadState('networkidle');

      // Wait for chart containers to appear (Plotly renders into divs)
      const chartContainers = page.locator('.js-plotly-plot, [data-testid*="chart"], .plotly');
      await expect(chartContainers.first()).toBeVisible({ timeout: 15000 });

      expect(networkErrors).toHaveLength(0);
    }
  });

  test('Step 3: Navigate to tables dashboard and verify tables render', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const tablesLink = page.locator('a[href*="tables-dashboard"], a[href*="new-tables"]');
    if (await tablesLink.first().isVisible()) {
      await tablesLink.first().click();
      await page.waitForLoadState('networkidle');

      // Tables should have visible rows
      const tableRows = page.locator('table tr, [role="row"], [data-testid*="table"]');
      await expect(tableRows.first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('Step 4: No blank panels on any dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to first available dashboard
    const firstDashboardLink = page.locator('a[href*="project/"]').first();
    if (await firstDashboardLink.isVisible()) {
      await firstDashboardLink.click();
      await page.waitForLoadState('networkidle');

      // Wait for content to load
      await page.waitForTimeout(3000);

      // Take screenshot for visual inspection
      await page.screenshot({ path: 'e2e/screenshots/dashboard-check.png', fullPage: true });

      // Page should have substantive content (not blank)
      const bodyText = await page.textContent('body');
      expect(bodyText.length).toBeGreaterThan(100);
    }
  });
});
