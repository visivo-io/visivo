/**
 * collectionKeys — the single source of truth mapping an object `type` to the
 * Zustand store collection that holds its records.
 *
 * Lifted out of RightRailEditPanel so the right rail, `useCanvasRecord`, and the
 * object-canvas registry all key off ONE map and can never drift. The store's
 * fetch action for a collection is `fetch` + PascalCase(collectionKey)
 * (e.g. `csvScriptModels` → `fetchCsvScriptModels`).
 */
export const COLLECTION_KEY = {
  chart: 'charts',
  table: 'tables',
  markdown: 'markdowns',
  input: 'inputs',
  source: 'sources',
  model: 'models',
  csvScriptModel: 'csvScriptModels',
  localMergeModel: 'localMergeModels',
  dimension: 'dimensions',
  metric: 'metrics',
  relation: 'relations',
  insight: 'insights',
  dashboard: 'dashboards',
};

/**
 * SAVE_ACTION — the single source of truth mapping an object `type` to the
 * Zustand store action that persists it (the same `saveX` actions the retired
 * `useObjectSave` switch dispatched to). Keyed identically to COLLECTION_KEY so
 * the optimistic write (collection) and the persist (action) can never drift.
 * Consumed by the unified `useRecordSave` backbone (VIS-1018).
 */
export const SAVE_ACTION = {
  source: 'saveSource',
  model: 'saveModel',
  dimension: 'saveDimension',
  metric: 'saveMetric',
  relation: 'saveRelation',
  insight: 'saveInsight',
  markdown: 'saveMarkdown',
  chart: 'saveChart',
  table: 'saveTable',
  dashboard: 'saveDashboard',
  csvScriptModel: 'saveCsvScriptModel',
  localMergeModel: 'saveLocalMergeModel',
  input: 'saveInput',
};

export default COLLECTION_KEY;
