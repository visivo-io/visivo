import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Branching API — the shape of the project you are editing: capabilities,
 * draft, branch, discard, the pending-changes set, and commit.
 *
 * Runs live in api/runs.js and user preferences in api/preferences.js. They were
 * here once only because the cloud endpoints landed together; a run is the
 * execution of a project, not an operation on its branching state.
 *
 * `fetchCapabilities` is the mode probe. Note it is no longer a cloud-only
 * signal: local `visivo serve` implements it too (returning can_branch: false,
 * draft_id: null), so a NULL return means "no such endpoint at all" — dist —
 * rather than "local serve". Branch on the values, not on null.
 */

/**
 * What the requesting user may do with this project's stage.
 * GET /api/projects/<id>/capabilities/ ->
 *   {can_view, can_edit, can_branch, is_default_stage, edit_action}
 * Returns null on 404 (local serve has no such endpoint).
 */
export const fetchCapabilities = async projectId => {
  const response = await apiFetch(getUrl('projectCapabilities', { projectId }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error('Failed to fetch project capabilities');
};

/**
 * Edit: resolve-or-create the requesting user's draft on the same stage.
 * POST /api/projects/<id>/draft/ -> the draft project envelope (a NEW id).
 */
export const createDraft = async projectId => {
  const response = await apiFetch(getUrl('projectDraft', { projectId }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (response.status === 200 || response.status === 201) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.detail || errorData.error || 'Failed to create draft');
};

/**
 * Branch: branch this project onto a brand-new stage.
 * POST /api/projects/<id>/branch/ {new_stage_name}
 *   -> the branch project envelope (a NEW id on the new stage).
 */
export const createBranch = async ({ projectId, newStageName }) => {
  const response = await apiFetch(getUrl('projectBranch', { projectId }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_stage_name: newStageName }),
  });
  if (response.status === 201) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.errors || errorData.detail || 'Failed to create branch');
};

/**
 * Discard (delete) a draft entirely — drop the working copy and return to the
 * published project. DELETE /api/projects/<draftId>/discard/.
 */
export const discardDraft = async draftId => {
  const response = await apiFetch(getUrl('projectDiscard', { projectId: draftId }), {
    method: 'DELETE',
  });
  if (response.status === 204 || response.status === 200) {
    return true;
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.detail || errorData.error || 'Failed to discard draft');
};

/**
 * The dirty set a commit would publish for a draft.
 * GET /api/projects/<id>/changes/ ->
 *   {to_publish:[{name,type,status}], to_remove:[{name,type,status}], has_changes}
 */
export const fetchChanges = async projectId => {
  const response = await apiFetch(getUrl('projectChanges', { projectId }));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch changes');
};

/**
 * Commit (publish) a draft. POST /api/projects/<id>/commit/ {message}.
 *
 * Returns the raw {status, body} so the caller can branch on the gates the
 * endpoint enforces (it does NOT throw on a non-2xx):
 *   201 {commit_id, published_project, next_draft}  — published
 *   200 {committed:false}                            — nothing to commit
 *   409 {action: run_required|run_in_progress|run_failed}
 *   403 {action: branch_required}
 *   422 {action: invalid, errors}
 */
export const commitDraft = async (projectId, message = '') => {
  const response = await apiFetch(getUrl('projectCommit', { projectId }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
};
