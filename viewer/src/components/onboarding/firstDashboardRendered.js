/* The terminal mark of the time-to-value ladder (Guided First Run W1, step 6).
 *
 * Shared rather than living in one view because two surfaces render a user's
 * first dashboard and the ladder ends on whichever they reach first:
 * `/project/:dashboardName` (components/project/Project.jsx) and
 * `/workspace/dashboard/:name` (views/project/canvas/ProjectCanvas.jsx), where
 * onboarding's connect-your-own-data path lands.
 *
 * The gate metric is `ms_since_first_run` filtered to `from_sample = false`, so
 * getting `from_sample` right is what makes the mark worth emitting at all.
 */

import { useEffect } from 'react';
import { markTimeToValueStep, TTV_STEPS, getSampleDashboardNames } from './timeToValue';
import { readOnboardingState } from './onboardingState';

/**
 * Count the leaf items in a dashboard config, recursing into `Item.rows` (the
 * nested-row layout primitive). Reads structure only, never a name or any other
 * content.
 */
export function countDashboardItems(dashboardConfig) {
  const countRows = rows =>
    (Array.isArray(rows) ? rows : []).reduce((total, row) => {
      const items = Array.isArray(row?.items) ? row.items : [];
      return (
        total +
        items.reduce((rowTotal, item) => {
          if (Array.isArray(item?.rows) && item.rows.length > 0) {
            return rowTotal + countRows(item.rows);
          }
          return rowTotal + 1;
        }, 0)
      );
    }, 0);
  return countRows(dashboardConfig?.rows);
}

/**
 * Is the dashboard being rendered one of the bundled examples?
 *
 * The local server names them (`sample_dashboards` on the injected journey,
 * read off visivo/templates/samples), so this is a fact about the dashboard.
 * Only when there is no server to ask — the cloud/dist viewer — does it fall
 * back to the onboarding path, which is the best signal available there.
 */
export function isSampleDashboard(dashboardName) {
  const sampleDashboards = getSampleDashboardNames();
  if (sampleDashboards) return sampleDashboards.includes(dashboardName);
  return (readOnboardingState() || {}).path === 'sample';
}

/**
 * Mark step 6 when a named dashboard with at least one item mounts.
 *
 * Gated on the item count so an empty shell doesn't stop the clock early.
 * `markTimeToValueStep` is idempotent per journey, so whichever surface the
 * user reaches first wins and the other is a no-op.
 *
 * @param {string} dashboardName
 * @param {object} dashboardConfig
 */
export function useFirstDashboardRenderedMark(dashboardName, dashboardConfig) {
  useEffect(() => {
    if (!dashboardName || !dashboardConfig) return;
    const itemCount = countDashboardItems(dashboardConfig);
    if (itemCount === 0) return;
    markTimeToValueStep(TTV_STEPS.FIRST_DASHBOARD_RENDERED, {
      item_count: itemCount,
      from_sample: isSampleDashboard(dashboardName),
    });
  }, [dashboardName, dashboardConfig]);
}
