/**
 * explorationLegacyBridge — pure mapping between the legacy `explorerStore.js`
 * working-state snapshot (`snapshotExplorerWorkingState`/
 * `restoreExplorerWorkingState`, `stores/explorerStore.js`) and an
 * exploration's `draft` (the internal slice shape used by
 * `workspaceExplorationsStore.js`'s `updateExplorationDraft`, which itself
 * maps `computedColumns` <-> `computed_columns` for the wire).
 *
 * Explore 2.0 Phase 2 (specs/plan/explorer-workspace-unification/
 * 02-architecture.md §1, §5): the legacy explorer model is multi-model /
 * multi-insight working state (SQL text, source, computed columns per model
 * tab; type/props/interactions/typePropsCache per insight; a chart layout +
 * ordered insight list) — richer than the four typed `draft` fields
 * (`queries`/`insights`/`chart`/`computedColumns`) the exploration contract
 * defines. Rather than lossily squeezing it into those four shapes (or
 * inventing a fifth), this bridge:
 *
 *   1. Projects a THIN, best-effort mapping onto the typed fields — good
 *      enough for the Home gallery's "n queries · n insights" summary and any
 *      future consumer that only cares about the contract shape.
 *   2. Carries the FULL, lossless snapshot under `draft.legacyState` — the
 *      sanctioned escape hatch 02 §5 names explicitly ("carry the remainder
 *      under a draft key like `legacy_state`"; `visivo/models/exploration.py`
 *      declares this field). Restore always prefers `legacyState` when
 *      present, so round-tripping through park/resume/reload never drops the
 *      chip-per-query / insight-props / chart-layout detail the projection
 *      can't fully capture (e.g. it only takes each model's FIRST computed
 *      column set for `draft.computedColumns` — see below).
 */

/** Build the exploration `draft` (internal-slice shape) from a legacy working-
 * state snapshot (`snapshotExplorerWorkingState()`'s return shape). */
export const legacyStateToDraft = snapshot => {
  const snap = snapshot || {};
  const modelStates = snap.modelStates || {};

  const queries = (snap.modelTabs || []).map(name => {
    const modelState = modelStates[name] || {};
    return {
      name,
      sql: modelState.sql || '',
      source: modelState.sourceName || null,
    };
  });

  const insights = Object.entries(snap.insightStates || {}).map(([name, insightState]) => ({
    name,
    type: insightState.type,
    props: insightState.props || {},
    interactions: insightState.interactions || [],
    isNew: insightState.isNew !== false,
  }));

  const chart = snap.chartName
    ? {
        name: snap.chartName,
        layout: snap.chartLayout || {},
        insightNames: snap.chartInsightNames || [],
      }
    : null;

  // Thin projection only — one entry per model's computed columns, tagged
  // with the owning model name. `legacyState` is the lossless source of
  // truth on restore; this exists for contract-shape consumers only.
  const computedColumns = [];
  for (const [modelName, modelState] of Object.entries(modelStates)) {
    for (const col of modelState.computedColumns || []) {
      computedColumns.push({ ...col, modelName });
    }
  }

  return { queries, insights, chart, computedColumns, legacyState: snap };
};

/**
 * Build a legacy working-state snapshot (`restoreExplorerWorkingState()`'s
 * input shape) from an exploration `draft`. Prefers `draft.legacyState`
 * (lossless round-trip) when present. Falls back to reconstructing a minimal
 * snapshot from the thin typed fields — the case for an exploration that was
 * never opened as a legacy workbench yet (e.g. `duplicateExploration` off a
 * record whose draft only ever went through the typed projection, or a future
 * non-viewer client that only writes the typed fields).
 */
export const draftToLegacyState = draft => {
  if (draft && draft.legacyState) return draft.legacyState;

  const safeDraft = draft || {};
  const modelTabs = [];
  const modelStates = {};
  for (const query of safeDraft.queries || []) {
    if (!query || !query.name) continue;
    modelTabs.push(query.name);
    modelStates[query.name] = {
      sql: query.sql || '',
      sourceName: query.source || null,
      sourceEdited: false,
      computedColumns: (safeDraft.computedColumns || []).filter(c => c.modelName === query.name),
      isNew: true,
    };
  }

  const insightStates = {};
  const chartInsightNames = [];
  for (const insight of safeDraft.insights || []) {
    if (!insight || !insight.name) continue;
    chartInsightNames.push(insight.name);
    insightStates[insight.name] = {
      type: insight.type || 'scatter',
      props: insight.props || {},
      interactions: insight.interactions || [],
      typePropsCache: {},
      isNew: insight.isNew !== false,
    };
  }

  return {
    modelTabs,
    activeModelName: modelTabs[0] || null,
    modelStates,
    chartName: safeDraft.chart?.name || null,
    chartLayout: safeDraft.chart?.layout || {},
    chartInsightNames: safeDraft.chart?.insightNames || chartInsightNames,
    activeInsightName: chartInsightNames[0] || null,
    insightStates,
    leftNavCollapsed: false,
    centerMode: 'split',
    isEditorCollapsed: false,
  };
};

/**
 * A brand-new, never-opened exploration seeded from a source
 * (`seededFrom: {type: 'source', name}` — Explorer Home's "Start from a
 * source" tile, 01-ux-spec.md §2) gets one empty model tab pre-wired to that
 * source, so the SQL editor opens ready to query it instead of blank with no
 * source selected.
 */
export const legacyStateForSeed = seededFrom => {
  if (!seededFrom || seededFrom.type !== 'source' || !seededFrom.name) return null;
  const modelName = 'query_1';
  return {
    modelTabs: [modelName],
    activeModelName: modelName,
    modelStates: {
      [modelName]: {
        sql: '',
        sourceName: seededFrom.name,
        sourceEdited: false,
        computedColumns: [],
        isNew: true,
      },
    },
    chartName: null,
    chartLayout: {},
    chartInsightNames: [],
    activeInsightName: null,
    insightStates: {},
    leftNavCollapsed: false,
    centerMode: 'split',
    isEditorCollapsed: false,
  };
};

/** A rough "n queries · n insights" summary for the Home gallery card, read
 * straight off the persisted draft (no need to mount the legacy store). */
export const draftSummary = draft => {
  const safeDraft = draft || {};
  const queryCount = safeDraft.legacyState?.modelTabs?.length ?? (safeDraft.queries || []).length;
  const insightCount =
    safeDraft.legacyState?.chartInsightNames?.length ?? (safeDraft.insights || []).length;
  return { queryCount, insightCount };
};
