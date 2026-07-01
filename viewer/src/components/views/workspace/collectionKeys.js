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

export default COLLECTION_KEY;
