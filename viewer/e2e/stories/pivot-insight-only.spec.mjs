/**
 * Story: a pivot table renders its insight when nothing else on the dashboard
 * reads that insight (VIS-1701).
 *
 * `pivot-insight-only-dashboard` holds one pivot over `pivot-only-insight`. No
 * chart and no `data:` table uses the insight. The dashboard used to ask for the
 * insight as a model, got no output, and the table said "No data".
 *
 * The story also checks the requests: the insight is asked for as an insight,
 * and never as a model.
 *
 * Precondition: a sandbox serving test-projects/integration, e.g.
 *   VISIVO_SANDBOX_BACKEND_PORT=8041 VISIVO_SANDBOX_FRONTEND_PORT=3041 \
 *   VISIVO_SANDBOX_NAME=vis1701 bash scripts/sandbox.sh start
 *   cd viewer && PLAYWRIGHT_BASE_URL=http://localhost:3041 \
 *   npx playwright test e2e/stories/pivot-insight-only.spec.mjs --reporter=list
 */

import { test, expect } from '@playwright/test';

const DASHBOARD_PATH = '/project/pivot-insight-only-dashboard';
const TABLE_ID = 'insight-only-pivot-table';
const INSIGHT = 'pivot-only-insight';
const SCREENS = 'e2e/stories/__screens__';
const WAIT = 40000;

const namesAsked = (requests, pathPart) =>
  requests
    .filter(url => url.pathname.includes(pathPart))
    .flatMap(url => [
      ...url.searchParams.getAll('insight_names'),
      ...url.searchParams.getAll('model_names'),
      ...url.searchParams.getAll('names'),
    ])
    .flatMap(value => value.split(','));

test.describe('Pivot table on an insight that no chart uses (VIS-1701)', () => {
  test.setTimeout(120000);

  for (const viewport of [
    { label: 'desktop', width: 1280, height: 900 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    test(`the pivot fills with rows on ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const requests = [];
      page.on('request', request => requests.push(new URL(request.url())));

      await page.goto(DASHBOARD_PATH);
      await page.waitForLoadState('networkidle');

      const table = page.locator(`#${TABLE_ID}`);
      await expect(table).toBeVisible({ timeout: WAIT });
      await expect(table.getByText(/^r\d\d$/).first()).toBeVisible({ timeout: WAIT });
      await expect(table.getByText(/No data/i)).toHaveCount(0);
      await expect(table.getByText(/60 total rows/i)).toBeVisible();

      expect(namesAsked(requests, '/api/insight-jobs/')).toContain(INSIGHT);
      expect(namesAsked(requests, '/api/model-jobs/')).not.toContain(INSIGHT);

      await page.screenshot({ path: `${SCREENS}/pivot-insight-only-${viewport.label}.png` });
    });
  }
});
