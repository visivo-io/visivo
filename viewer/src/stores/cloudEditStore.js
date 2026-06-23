import * as branchingApi from '../api/branching';

/**
 * Editing slice — backend-agnostic.
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
const createCloudEditSlice = (set, get) => ({
  // {can_view, can_edit, can_branch, is_default_stage, edit_action} | null
  capabilities: null,
  cloudEditError: null,

  fetchCapabilities: async () => {
    const projectId = get().project?.id;
    if (!projectId) return null;
    try {
      const capabilities = await branchingApi.fetchCapabilities(projectId);
      set({ capabilities });
      return capabilities;
    } catch (error) {
      set({ cloudEditError: error.message });
      return null;
    }
  },

  // Edit: resolve-or-create the draft for this project, then edit in place.
  startEdit: async () => {
    const projectId = get().project?.id;
    if (!projectId) return { success: false, error: 'No active project' };
    set({ cloudEditError: null });
    try {
      const draft = await branchingApi.createDraft(projectId);
      get().setProject?.({ ...get().project, ...draft });
      await get().fetchCapabilities?.();
      return { success: true, project: draft };
    } catch (error) {
      set({ cloudEditError: error.message });
      return { success: false, error: error.message };
    }
  },

  // Branch: fork onto a new stage, then edit it.
  startBranch: async ({ fromStage, projectName, newStageName }) => {
    set({ cloudEditError: null });
    try {
      const branch = await branchingApi.createBranch({ fromStage, projectName, newStageName });
      get().setProject?.({ ...get().project, ...branch });
      await get().fetchCapabilities?.();
      return { success: true, project: branch };
    } catch (error) {
      set({ cloudEditError: error.message });
      return { success: false, error: error.message };
    }
  },
});

export default createCloudEditSlice;
