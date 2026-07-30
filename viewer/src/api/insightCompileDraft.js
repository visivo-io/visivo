import { getUrl, isAvailable } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Explore 2.0 Phase 4 — the stateless draft-compile endpoint (S2's resolved
 * design, specs/plan/explorer-workspace-unification/research/
 * s2-draft-rendering-decision.md). Mirrors `api/expressions.js`'s
 * `translateExpressions` shape: a structurally similar "send draft config,
 * get back translated/resolved SQL" call.
 *
 * Never writes to disk, caches anything on the server, or runs a query
 * against a real source — it resolves a draft insight's props/interactions
 * into query text the client then runs itself via the DuckDB-WASM lane
 * (`useDraftInsightPreview.js`).
 *
 * @param {object} params
 * @param {object} params.insight - wire-shaped insight config, must include `name`.
 * @param {Array<{name:string, sql:string, source?:string}>} [params.draftModels]
 * @param {Array<object>} [params.draftMetrics]
 * @param {Array<object>} [params.draftDimensions]
 * @param {Record<string, Record<string,string>>} [params.modelSchemas] - client-
 *   known `{modelName: {column: type}}` for a scratch model that has never
 *   been run server-side (closes the S2 "run the query first" gap when the
 *   client already knows the columns from the SQL/results lane).
 * @returns {Promise<{
 *   post_query: string, pre_query: null, props_mapping: object,
 *   static_props: object, props_slices: object, split_key: string|null,
 *   type: string|null, models: Array<{name:string, name_hash:string}>,
 * }>}
 * @throws {Error} with `.errorType === 'model_not_run'` set when the backend
 *   returns the graceful 422 (a referenced scratch model has no schema yet
 *   and none was supplied via `modelSchemas`) — callers render the explicit
 *   "run the query first" state for this case, never a generic error.
 */
export const compileDraftInsight = async ({
  insight,
  draftModels = [],
  draftMetrics = [],
  draftDimensions = [],
  modelSchemas = {},
}) => {
  if (!isAvailable('insightCompileDraft')) {
    const err = new Error('Draft preview is not available in this deployment mode');
    err.errorType = 'unavailable';
    throw err;
  }

  const response = await apiFetch(getUrl('insightCompileDraft'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      insight,
      draft_models: draftModels,
      draft_metrics: draftMetrics,
      draft_dimensions: draftDimensions,
      model_schemas: modelSchemas,
    }),
  });

  if (response.status === 200) {
    return await response.json();
  }

  const data = await response.json().catch(() => ({}));
  const err = new Error(data.error || 'Failed to compile draft insight');
  if (data.error_type) err.errorType = data.error_type;
  if (data.model) err.modelName = data.model;
  throw err;
};
