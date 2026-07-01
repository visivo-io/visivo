/**
 * Q22 metrics aggregate test (VIS-799 / Track K).
 *
 * Phase 5 gate: proves the four headline metrics from
 * `specs/dashboard-building/04-open-questions.md` Q22 are computable from the
 * telemetry events as instrumented (§3.4 taxonomy), before Phase 6 dogfood
 * runs against real data. The synthetic stream below mimics two users across
 * three Build-mode sessions plus one legacy form edit, and every expected
 * value is asserted EXACTLY.
 */
import {
  computeDashboardBuildingMetrics,
  LEGACY_FORM_EDIT_EVENT,
} from './dashboardBuildingMetrics';

// Helper mirroring the `emitWorkspaceEvent` event shape.
const ev = (eventName, payload = {}, ts = 0) => ({ eventName, payload, ts });

/**
 * Synthetic stream — two users, three Build-mode sessions, one legacy edit:
 *
 *   Session A (user 1): enters Build mode, 3 canvas actions, publishes
 *     after 120s.
 *   Session B (user 1): re-enters Build mode, 2 canvas actions, publishes
 *     after 60s. Switches the right rail Outline → Edit → Outline.
 *   Session C (user 2): enters Build mode, 1 canvas action, abandons
 *     without publishing. Switches the right rail to Edit once.
 *   Legacy: one form-based dashboard edit (no Build mode).
 */
const STREAM = [
  // Session A
  ev('workspace_mode_entered', { dashboardName: 'sales', scope: 'dashboard' }, 1000),
  ev('canvas_action', { kind: 'add_row', template: 'blank' }, 2000),
  ev('canvas_action', { kind: 'add_item', type: 'chart', name: 'rev' }, 3000),
  ev('canvas_action', { kind: 'resize_item', fluid: true, axis: 'height' }, 4000),
  ev('time_to_first_publish_in_build_mode', { msSinceBuildModeEntered: 120000 }, 121000),

  // Session B
  ev('workspace_mode_entered', { dashboardName: 'sales', scope: 'dashboard' }, 200000),
  ev('canvas_action', { kind: 'move_row', from: 1, to: 0 }, 201000),
  ev('canvas_action', { kind: 'wrap_in_container', path: 'row.0.item.0' }, 202000),
  ev('right_rail_tab_switched', { tab: 'outline' }, 202500),
  ev('right_rail_tab_switched', { tab: 'edit' }, 202600),
  ev('right_rail_tab_switched', { tab: 'outline' }, 202700),
  ev('time_to_first_publish_in_build_mode', { msSinceBuildModeEntered: 60000 }, 260000),

  // Session C (no publish)
  ev('workspace_mode_entered', { dashboardName: null, scope: 'root' }, 300000),
  ev('canvas_action', { kind: 'move_item', rowPath: 'row.0', from: 0 }, 301000),
  ev('right_rail_tab_switched', { tab: 'edit' }, 302000),
  ev('middle_pane_toggled', { pane: 'lineage', scope: 'dashboard' }, 303000),
  ev('middle_pane_toggled', { pane: 'canvas', scope: 'dashboard' }, 304000),
  ev('item_flipped', { surface: 'build', type: 'chart', name: 'rev' }, 305000),
  ev('inline_create_used', { source: 'library', kind: 'chart' }, 306000),

  // Legacy form-based dashboard edit
  ev(LEGACY_FORM_EDIT_EVENT, { dashboardName: 'ops' }, 400000),
];

describe('computeDashboardBuildingMetrics (Q22)', () => {
  test('computes all four headline metrics exactly from the synthetic stream', () => {
    const metrics = computeDashboardBuildingMetrics(STREAM);

    // 1. Time-to-first-saved-dashboard: mean(120000, 60000) = 90000ms (1.5
    //    min — under the <3 min target).
    expect(metrics.timeToFirstSavedDashboardMs).toBe(90000);

    // 2. Build-mode adoption: 3 build entries ÷ (3 + 1 form edit) = 75%
    //    (over the >70% target).
    expect(metrics.buildModeAdoptionPct).toBe(75);

    // 3. Avg canvas actions per Publish: 6 canvas actions ÷ 2 publishes = 3.
    expect(metrics.avgCanvasActionsPerPublish).toBe(3);

    // 4. Outline-tab usage: 2 outline switches ÷ 4 switches = 50%
    //    (informational — no target).
    expect(metrics.outlineTabUsagePct).toBe(50);
  });

  test('an empty stream yields null for every metric (no signal ≠ zero)', () => {
    expect(computeDashboardBuildingMetrics([])).toEqual({
      timeToFirstSavedDashboardMs: null,
      buildModeAdoptionPct: null,
      avgCanvasActionsPerPublish: null,
      outlineTabUsagePct: null,
    });
    expect(computeDashboardBuildingMetrics(undefined)).toEqual({
      timeToFirstSavedDashboardMs: null,
      buildModeAdoptionPct: null,
      avgCanvasActionsPerPublish: null,
      outlineTabUsagePct: null,
    });
  });

  test('null first-publish durations are excluded from the timing mean but still count as publishes', () => {
    const metrics = computeDashboardBuildingMetrics([
      ev('workspace_mode_entered', { dashboardName: 'a', scope: 'dashboard' }),
      ev('canvas_action', { kind: 'add_row' }),
      ev('canvas_action', { kind: 'add_row' }),
      // Publish without a recorded Build-mode entry (legacy /editor surface).
      ev('time_to_first_publish_in_build_mode', { msSinceBuildModeEntered: null }),
      ev('time_to_first_publish_in_build_mode', { msSinceBuildModeEntered: 30000 }),
    ]);
    expect(metrics.timeToFirstSavedDashboardMs).toBe(30000);
    expect(metrics.avgCanvasActionsPerPublish).toBe(1);
  });

  test('a workspace-only stream (no legacy form edits) reads as 100% adoption', () => {
    const metrics = computeDashboardBuildingMetrics([
      ev('workspace_mode_entered', { dashboardName: 'a', scope: 'dashboard' }),
      ev('workspace_mode_entered', { dashboardName: 'b', scope: 'dashboard' }),
    ]);
    expect(metrics.buildModeAdoptionPct).toBe(100);
  });

  test('publish-less streams yield null actions-per-publish (not Infinity)', () => {
    const metrics = computeDashboardBuildingMetrics([
      ev('canvas_action', { kind: 'add_row' }),
      ev('canvas_action', { kind: 'move_row' }),
    ]);
    expect(metrics.avgCanvasActionsPerPublish).toBeNull();
  });
});
