/* The terminal mark of the time-to-value ladder (Guided First Run W1, step 6).
 *
 * Lives here rather than in one view because there are TWO surfaces on which a
 * user's first dashboard actually renders, and the ladder has to end on
 * whichever they reach first:
 *
 *   /project/:dashboardName          → components/project/Project.jsx (View mode)
 *   /workspace/dashboard/:name       → views/project/canvas/ProjectCanvas.jsx
 *
 * The workspace canvas is not an editor mock-up — it wraps the same render-only
 * <Dashboard>, so a user watching their first chart paint there has reached
 * value. It is also where onboarding's DATA path lands: `completeAndNavigate`
 * sends a user who connected their own source to `/workspace/…`, i.e. exactly
 * the cohort the exit gate measures. Wiring the mark to View mode alone left
 * that cohort contributing no data point at all.
 *
 * `from_sample` is finding TTV-5, and it is decided from the DASHBOARD, not
 * from the onboarding branch the user took. Rendering the bundled example takes
 * ~1s while rendering a dashboard built from the user's own data took field
 * testers 26-108 minutes, and the gate metric is `ms_since_first_run` where
 * `from_sample = false`. The onboarding `path` is written once at the end of the
 * flow and never updated, so reading it is wrong in both directions: a user who
 * SKIPPED onboarding and opened the bundled example reported `false` (a ~1s
 * render landing in the gate metric — the very trap the property exists to
 * close), and a user who took the sample tour and then built a real dashboard
 * forty minutes later reported `true` and was filtered OUT of it.
 */

import { useEffect } from 'react';
import { markTimeToValueStep, TTV_STEPS, getSampleDashboardNames } from './timeToValue';
import { readOnboardingState } from './onboardingState';

/**
 * Count the leaf items in a dashboard config, recursing into `Item.rows`
 * (the nested-row layout primitive). Used only to decide whether the
 * dashboard about to render is a real one and to report `item_count` on the
 * time-to-value terminal mark — never to read a name or any other content.
 */
export function countDashboardItems(dashboardConfig) {
  const countRows = rows =>
    (Array.isArray(rows) ? rows : []).reduce((total, row) => {
      const items = Array.isArray(row?.items) ? row.items : [];
      return (
        total +
        items.reduce((rowTotal, item) => {
          // An item that is itself a stack of rows contributes its leaves, not
          // itself — otherwise a row-first dashboard reports 1 for any depth.
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
