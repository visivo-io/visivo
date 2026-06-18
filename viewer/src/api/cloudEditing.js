import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Cloud-editing API (core/Django only).
 *
 * These endpoints exist only in the cloud (core) backend, not in local
 * `visivo serve` (Flask). `fetchCapabilities` is the mode probe: a 200 means
 * we're in the cloud and the Edit/Branch/commit flow applies; a 404 means
 * local serve, where the legacy always-editable Flask commit flow stays in
 * charge (see api/commit.js + commitStore).
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
 * Branch: fork the live project onto a brand-new stage.
 * POST /api/stages/branch/ {from_stage, project_name, new_stage_name}
 *   -> the branch project envelope (a NEW id on the new stage).
 */
export const createBranch = async ({ fromStage, projectName, newStageName }) => {
  const response = await apiFetch(getUrl('stageBranch'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_stage: fromStage,
      project_name: projectName,
      new_stage_name: newStageName,
    }),
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
 * The draft's recent runs (status of each auto-run). GET /api/projects/<id>/run/
 * -> [{id, state, created_at, dag_filter, execution_name, error_json, ...}].
 */
export const fetchRuns = async projectId => {
  const response = await apiFetch(getUrl('projectRun', { projectId }));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch runs');
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
