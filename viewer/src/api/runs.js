import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Run API — launching a run, watching it, and reading what it produced.
 *
 * Split out of branching.js: a run is not a branching operation. Branching is
 * draft / branch / changes / commit — the shape of the project you are editing.
 * A run is the execution of that project, with its own lifecycle (queued →
 * running → succeeded/failed/canceled) and its own consumers (runStore, the
 * Runs view). They only ever met because the cloud endpoints arrived together.
 *
 * Both servers implement these: Django in cloud, Flask under `visivo serve`.
 * There is no local-vs-cloud branching here — behaviour follows what the
 * endpoints return.
 */

/**
 * The draft's recent runs (status of each auto-run). GET /api/projects/<id>/run/
 * -> [{id, state, created_at, dag_filter, error_json, is_superseded, ...}].
 */
export const fetchRuns = async projectId => {
  const response = await apiFetch(getUrl('projectRun', { projectId }));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch runs');
};

/**
 * Launch a run. POST /api/projects/<id>/run/.
 *
 * Send NO dag_filter to build what's staged — the button's normal action, scoped
 * to exactly the list the Run view is showing. Send an explicit `dag_filter: ''`
 * to rebuild everything ("Run all"), which is the only way back when outputs are
 * missing but the fingerprints claim they're built. Absent and empty are
 * genuinely different requests; don't collapse them.
 *
 * Returns the raw {status, body} like cancelRun/commitDraft, because 409
 * ("a run is already in flight") is a state to render, not an exception.
 */
export const triggerRun = async (projectId, { dagFilter } = {}) => {
  const response = await apiFetch(getUrl('projectRun', { projectId }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dagFilter === undefined ? {} : { dag_filter: dagFilter }),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
};

/**
 * A single run's captured log. GET /api/runs/<id>/logs/ -> {state, logs,
 * error_json}. The runner streams the log live while the run executes (the
 * editor tail-polls this), then it settles into the final static log.
 */
export const fetchRunLog = async runId => {
  const response = await apiFetch(getUrl('runLogs', { runId }));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch run log');
};

/**
 * Stop a run in flight. POST /api/runs/<id>/cancel/.
 *
 * Returns the raw {status, body} rather than throwing, because 409 isn't an
 * error the user needs shouting about — it just means the run reached a terminal
 * state before their click landed, and a refetch will show that.
 *   200 {state, execution_stopped}  — canceled
 *   409 {detail}                    — already finished
 */
export const cancelRun = async runId => {
  const response = await apiFetch(getUrl('runCancel', { runId }), { method: 'POST' });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
};
