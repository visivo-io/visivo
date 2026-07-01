/**
 * Dashboard-building headline metrics (VIS-799 / Track K, Q22).
 *
 * Pure aggregation over a workspace telemetry event stream — the four
 * headline metrics from `specs/dashboard-building/04-open-questions.md` Q22:
 *
 *   1. Time-to-first-saved-dashboard (target < 3 min) — from
 *      `time_to_first_publish_in_build_mode` payloads.
 *   2. Build-mode adoption % (target > 70%) — `workspace_mode_entered`
 *      entries ÷ all dashboard edits (build entries + legacy form edits).
 *   3. Avg canvas actions per Publish (target ≈ 1) — `canvas_action` count
 *      ÷ publish count.
 *   4. Outline-tab usage % (informational, no target) — per the Q22 revision
 *      of 2026-05-16 the obsolete "Outline-lens usage" metric became
 *      `right_rail_tab_switched` characterization: the share of right-rail
 *      tab switches that landed on the Outline tab.
 *
 * Notes on denominators:
 *   - Publishes are counted via `time_to_first_publish_in_build_mode` — the
 *     only publish-shaped event in the §3.4 seven-event taxonomy (it fires on
 *     the FIRST publish after each Build-mode entry; re-entering re-arms it).
 *   - "All dashboard edits" needs a marker for legacy form-based edits, which
 *     the §3.4 taxonomy doesn't carry; `LEGACY_FORM_EDIT_EVENT` names the
 *     event the legacy surface will emit. Streams without it yield 100%
 *     adoption — correct for a workspace-only stream.
 *
 * Events are `{ eventName, payload, ts }` — the exact shape
 * `emitWorkspaceEvent` produces (and the `visivo:workspace-telemetry`
 * CustomEvent `detail` carries), so a captured session stream can be fed in
 * unmodified. This module is intentionally framework-free so the same
 * computation can run in tests, notebooks, or a PostHog-export script.
 */

/** Event name the legacy (form-based) dashboard-edit surface emits. */
export const LEGACY_FORM_EDIT_EVENT = 'dashboard_form_edit';

const countByName = (events, name) => events.filter(e => e && e.eventName === name).length;

/**
 * Compute the four Q22 headline metrics from a workspace event stream.
 *
 * Every metric is `null` when its denominator is empty (no signal ≠ zero) —
 * callers must treat `null` as "not measurable from this stream".
 *
 * @param {Array<{eventName: string, payload?: object, ts?: number}>} events
 * @returns {{
 *   timeToFirstSavedDashboardMs: number|null,
 *   buildModeAdoptionPct: number|null,
 *   avgCanvasActionsPerPublish: number|null,
 *   outlineTabUsagePct: number|null,
 * }}
 */
export function computeDashboardBuildingMetrics(events) {
  const stream = Array.isArray(events) ? events.filter(Boolean) : [];

  // 1. Time-to-first-saved-dashboard: mean of the recorded elapsed times.
  // Null payload values (publish without a recorded Build-mode entry, e.g.
  // from the legacy surface) carry no timing signal and are excluded.
  const firstPublishDurations = stream
    .filter(e => e.eventName === 'time_to_first_publish_in_build_mode')
    .map(e => e.payload && e.payload.msSinceBuildModeEntered)
    .filter(ms => typeof ms === 'number' && Number.isFinite(ms));
  const timeToFirstSavedDashboardMs = firstPublishDurations.length
    ? firstPublishDurations.reduce((sum, ms) => sum + ms, 0) / firstPublishDurations.length
    : null;

  // 2. Build-mode adoption %: build entries ÷ (build entries + form edits).
  const buildEntries = countByName(stream, 'workspace_mode_entered');
  const formEdits = countByName(stream, LEGACY_FORM_EDIT_EVENT);
  const totalEdits = buildEntries + formEdits;
  const buildModeAdoptionPct = totalEdits > 0 ? (buildEntries / totalEdits) * 100 : null;

  // 3. Avg canvas actions per Publish.
  const canvasActions = countByName(stream, 'canvas_action');
  const publishes = countByName(stream, 'time_to_first_publish_in_build_mode');
  const avgCanvasActionsPerPublish = publishes > 0 ? canvasActions / publishes : null;

  // 4. Outline-tab usage % (Q22 revision of "Outline-lens usage").
  const tabSwitches = stream.filter(e => e.eventName === 'right_rail_tab_switched');
  const outlineSwitches = tabSwitches.filter(e => e.payload && e.payload.tab === 'outline');
  const outlineTabUsagePct = tabSwitches.length
    ? (outlineSwitches.length / tabSwitches.length) * 100
    : null;

  return {
    timeToFirstSavedDashboardMs,
    buildModeAdoptionPct,
    avgCanvasActionsPerPublish,
    outlineTabUsagePct,
  };
}
