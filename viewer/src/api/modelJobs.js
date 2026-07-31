import { getUrl, isAvailable } from '../contexts/URLContext';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';
import { DEFAULT_RUN_ID } from '../constants';

/**
 * Model data as a file reference — the sibling of `insightJobs` / `inputJobs`.
 *
 * Asks the server which of the named models have built data and where it is,
 * rather than fetching the rows. The caller loads the returned
 * `signed_data_file_url` (DuckDB-WASM, via `loadInsightParquetFiles`), which is
 * how insight data has always been read.
 *
 * Two reasons this exists rather than `api/modelData.js`'s
 * `/api/models/<name>/data/`:
 *
 * 1. That endpoint reads the parquet server-side and inlines up to 10k rows —
 *    the server pays the memory and the result is silently truncated.
 * 2. It cannot work in cloud at all. There `signed_data_file_url` is a storage
 *    URL the server signs; a client cannot construct one, so a client that
 *    builds its own file path is limited to local.
 *
 * Returns `[]` where the endpoint is unavailable (a dist build has no
 * model-jobs manifest), so callers degrade rather than throw.
 */
export const fetchModelJobs = async (modelNames, { runId = DEFAULT_RUN_ID, projectId = null } = {}) => {
  if (!isAvailable('modelJobsQuery')) return [];
  const names = (modelNames || []).filter(Boolean);
  if (!names.length) return [];

  const params = new URLSearchParams();
  names.forEach(name => params.append('model_names', name));
  if (runId) params.append('run_id', runId);

  const url = withProjectId(`${getUrl('modelJobsQuery')}?${params.toString()}`, projectId);
  const response = await apiFetch(url);

  // 404 means none of the named models have built data — a normal state (never
  // run, or run before the model existed), not a failure to report.
  if (response.status === 404) return [];
  if (response.status !== 200) {
    throw new Error(`Failed to fetch model jobs (${response.status})`);
  }
  return await response.json();
};
