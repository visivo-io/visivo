import * as cloudEditingApi from '../api/cloudEditing';

/**
 * Cloud-edit slice (core/Django only).
 *
 * Drives the cloud-editing entry. It asks core what the user may do with the
 * current project's stage (capabilities), then creates a draft (Edit) or a
 * branch (Branch) and — crucially — flips the active project to the returned
 * draft/branch id via `setProject(...)`. Because every resource store reads
 * `get().project?.id` and the api layer appends `?project_id=`, flipping the
 * active project automatically retargets all saves/reads at the draft.
 *
 * In local `visivo serve` (Flask) the capabilities endpoint 404s, so
 * `isCloud` stays false and none of this engages — the legacy Flask commit
 * flow (commitStore) stays in charge.
 */
const createCloudEditSlice = (set, get) => ({
  // {can_view, can_edit, can_branch, is_default_stage, edit_action} | null
  capabilities: null,
  // true once a capabilities response confirms we're talking to core
  isCloud: false,
  // dirty set for the active draft (cloud commit panel)
  cloudPendingChanges: [],
  cloudEditError: null,

  // Probe capabilities for the active project. null (404) => local serve.
  fetchCapabilities: async () => {
    const projectId = get().project?.id;
    if (!projectId) return null;
    try {
      const capabilities = await cloudEditingApi.fetchCapabilities(projectId);
      set({ capabilities, isCloud: capabilities !== null });
      return capabilities;
    } catch (error) {
      set({ cloudEditError: error.message });
      return null;
    }
  },

  // Edit: resolve-or-create the per-user draft on the same stage, switch to it.
  startEdit: async () => {
    const projectId = get().project?.id;
    if (!projectId) return { success: false, error: 'No active project' };
    set({ cloudEditError: null });
    try {
      const draft = await cloudEditingApi.createDraft(projectId);
      get().setProject?.(draft);
      // Refresh capabilities for the draft's stage (edit gating may differ).
      await get().fetchCapabilities?.();
      return { success: true, project: draft };
    } catch (error) {
      set({ cloudEditError: error.message });
      return { success: false, error: error.message };
    }
  },

  // Branch: fork the live project onto a new stage, switch to it.
  startBranch: async ({ fromStage, projectName, newStageName }) => {
    set({ cloudEditError: null });
    try {
      const branch = await cloudEditingApi.createBranch({
        fromStage,
        projectName,
        newStageName,
      });
      get().setProject?.(branch);
      await get().fetchCapabilities?.();
      return { success: true, project: branch };
    } catch (error) {
      set({ cloudEditError: error.message });
      return { success: false, error: error.message };
    }
  },

  // Cloud commit panel: the dirty set a commit would publish.
  fetchCloudChanges: async () => {
    const projectId = get().project?.id;
    if (!projectId) return { has_changes: false };
    try {
      const changes = await cloudEditingApi.fetchChanges(projectId);
      const pending = [...(changes.to_publish || []), ...(changes.to_remove || [])];
      // Cloud reuses the shared commit badge (hasUncommittedChanges).
      set({ cloudPendingChanges: pending, hasUncommittedChanges: !!changes.has_changes });
      return changes;
    } catch (error) {
      set({ cloudPendingChanges: [], hasUncommittedChanges: false, cloudEditError: error.message });
      return { has_changes: false };
    }
  },

  // Cloud commit (publish). Surfaces the endpoint's run/role gates via `action`.
  commitCloud: async (message = '') => {
    const projectId = get().project?.id;
    if (!projectId) return { success: false, error: 'No active project' };
    set({ cloudEditError: null });
    const { status, body } = await cloudEditingApi.commitDraft(projectId, message);
    if (status === 201) {
      // Published — switch to the fresh next draft so editing continues.
      if (body.next_draft) get().setProject?.(body.next_draft);
      set({ cloudPendingChanges: [] });
      return { success: true, ...body };
    }
    if (status === 200) {
      // Nothing to commit — not an error.
      return { success: false, committed: false, detail: body.detail };
    }
    // 409 (run_required/run_in_progress/run_failed), 403 (branch_required),
    // 422 (invalid) — carry an `action` the UI surfaces.
    const error =
      body.detail || (body.errors && JSON.stringify(body.errors)) || 'Commit failed';
    set({ cloudEditError: error });
    return { success: false, action: body.action, error };
  },
});

export default createCloudEditSlice;
