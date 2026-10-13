import * as branchingApi from '../api/branching';

// VIS-1025: `capabilities` is null under local serve (always editable); in cloud
// `can_edit === false` marks the branch read-only. Shared by every write path.
export const isReadOnly = state => {
  const caps = state?.capabilities;
  return !!(caps && caps.can_edit === false);
};

/**
 * Branching slice — backend-agnostic.
 *
 * The viewer always probes capabilities and creates a draft/branch through the
 * same project-scoped endpoints; each server (Flask local, Django cloud) returns
 * the appropriate values. There is NO local-vs-cloud branching here — behavior
 * is driven entirely by what the endpoints return.
 *
 * startEdit/startBranch flip the active project to the returned draft/branch id
 * (merged onto the loaded project so its data isn't dropped). Every resource
 * store reads `get().project?.id` and the api layer appends `?project_id=`, so
 * the flip retargets all saves at the draft.
 */
const createBranchingSlice = (set, get) => ({
  // {can_view, can_edit, can_branch, is_default_branch, edit_action} | null
  capabilities: null,
  branchError: null,

  fetchCapabilities: async () => {
    const projectId = get().project?.id;
    if (!projectId) return null;
    try {
      const capabilities = await branchingApi.fetchCapabilities(projectId);
      set({ capabilities });
      return capabilities;
    } catch (error) {
      set({ branchError: error.message });
      return null;
    }
  },

  // Edit: resolve-or-create the draft for this project, then edit in place.
  startEdit: async () => {
    const projectId = get().project?.id;
    if (!projectId) return { success: false, error: 'No active project' };
    set({ branchError: null });
    try {
      const draft = await branchingApi.createDraft(projectId);
      get().setProject?.({ ...get().project, ...draft });
      await get().fetchCapabilities?.();
      return { success: true, project: draft };
    } catch (error) {
      set({ branchError: error.message });
      return { success: false, error: error.message };
    }
  },

  // Branch: branch this project onto a new branch, then edit it.
  startBranch: async ({ newBranchName }) => {
    const projectId = get().project?.id;
    if (!projectId) return { success: false, error: 'No active project' };
    set({ branchError: null });
    try {
      const branch = await branchingApi.createBranch({ projectId, newBranchName });
      get().setProject?.({ ...get().project, ...branch });
      await get().fetchCapabilities?.();
      return { success: true, project: branch };
    } catch (error) {
      set({ branchError: error.message });
      return { success: false, error: error.message };
    }
  },
});

export default createBranchingSlice;
