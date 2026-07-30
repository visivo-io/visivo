import { getUrl, isAvailable } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Explore 2.0 state fix, Phase 3 — the server-side EXECUTE lane for an aggregate
 * draft preview. Mirrors `compileDraftInsight`'s request shape, but hits
 * `/api/insight-execute-draft/`, which runs the insight's query against the FULL
 * source and returns the final chart rows (aggregations / relation joins already
 * applied). The client routes here only when the compile endpoint classified the
 * insight `requires_full_source: true` and it has no unresolved input deps — a
 * raw-column projection stays on the instant client-side DuckDB lane.
 *
 * @param {object} params
 * @param {object} params.insight - wire-shaped insight config, must include `name`.
 * @param {Array<{name:string, sql:string, source?:string}>} [params.draftModels]
 * @param {Array<object>} [params.draftMetrics]
 * @param {Array<object>} [params.draftDimensions]
 * @param {Record<string, Record<string,string>>} [params.modelSchemas]
 * @returns {Promise<{
 *   columns: string[], rows: object[], row_count: number,
 *   execution_time_ms: number, props_mapping: object, static_props: object,
 *   props_slices: object, split_key: string|null, type: string|null,
 *   models: Array<{name:string, name_hash:string}>,
 * }>} — `rows` ARE the final chart rows; bind them through `props_mapping`.
 * @throws {Error} with `.errorType`:
 *   - `'requires_client_lane'` (409): the insight is dynamic (references an
 *     input), so the server can't bake it — the caller falls back to the client
 *     DuckDB sample lane.
 *   - `'model_not_run'` (422): a referenced scratch model has no schema.
 *   - `'unavailable'`: draft preview isn't available in this deployment mode.
 */
export const executeDraftInsight = async ({
  insight,
  draftModels = [],
  draftMetrics = [],
  draftDimensions = [],
  modelSchemas = {},
}) => {
  if (!isAvailable('insightExecuteDraft')) {
    const err = new Error('Draft preview is not available in this deployment mode');
    err.errorType = 'unavailable';
    throw err;
  }

  const response = await apiFetch(getUrl('insightExecuteDraft'), {
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
  const err = new Error(data.error || 'Failed to execute draft insight');
  if (data.error_type) err.errorType = data.error_type;
  if (data.model) err.modelName = data.model;
  throw err;
};
