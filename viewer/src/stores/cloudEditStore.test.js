import createCloudEditSlice from './cloudEditStore';
import * as cloudEditingApi from '../api/cloudEditing';

jest.mock('../api/cloudEditing');

global.console.error = jest.fn();

// Mirror the lightweight slice harness used in storeSlices.test.js.
const makeStore = (slice, initial = {}) => {
  let state = { ...initial };
  const set = patch => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  const get = () => state;
  state = { ...state, ...slice(set, get) };
  return { get };
};

beforeEach(() => jest.clearAllMocks());

describe('cloudEditStore', () => {
  const build = (initial = { project: { id: 'proj-1' }, setProject: jest.fn() }) =>
    makeStore(createCloudEditSlice, initial);

  describe('fetchCapabilities', () => {
    it('stores the capabilities the endpoint returns', async () => {
      const caps = {
        can_view: true,
        can_edit: true,
        can_branch: false,
        is_default_stage: true,
        edit_action: 'edit',
      };
      cloudEditingApi.fetchCapabilities.mockResolvedValueOnce(caps);
      const store = build();
      await store.get().fetchCapabilities();
      expect(cloudEditingApi.fetchCapabilities).toHaveBeenCalledWith('proj-1');
      expect(store.get().capabilities).toEqual(caps);
    });

    it('returns null and does not call the endpoint without a project', async () => {
      const store = build({ project: null, setProject: jest.fn() });
      const result = await store.get().fetchCapabilities();
      expect(result).toBeNull();
      expect(cloudEditingApi.fetchCapabilities).not.toHaveBeenCalled();
    });
  });

  describe('startEdit', () => {
    it('creates a draft and retargets the active project (merged) to it', async () => {
      const draft = { id: 'draft-9', name: 'p' };
      cloudEditingApi.createDraft.mockResolvedValueOnce(draft);
      cloudEditingApi.fetchCapabilities.mockResolvedValueOnce({ can_edit: true });
      const setProject = jest.fn();
      const store = build({ project: { id: 'proj-1', project_json: { x: 1 } }, setProject });
      const result = await store.get().startEdit();
      expect(cloudEditingApi.createDraft).toHaveBeenCalledWith('proj-1');
      // Merged: keeps existing project data, retargets the id.
      expect(setProject).toHaveBeenCalledWith({ id: 'draft-9', name: 'p', project_json: { x: 1 } });
      expect(result).toEqual({ success: true, project: draft });
    });

    it('reports failure and does not flip the project on error', async () => {
      cloudEditingApi.createDraft.mockRejectedValueOnce(new Error('no draft'));
      const setProject = jest.fn();
      const store = build({ project: { id: 'proj-1' }, setProject });
      const result = await store.get().startEdit();
      expect(setProject).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false, error: 'no draft' });
      expect(store.get().cloudEditError).toBe('no draft');
    });
  });

  describe('startBranch', () => {
    it('forks a new stage and retargets the active project to the branch', async () => {
      const branch = { id: 'branch-3', name: 'p' };
      cloudEditingApi.createBranch.mockResolvedValueOnce(branch);
      cloudEditingApi.fetchCapabilities.mockResolvedValueOnce({ can_edit: true });
      const setProject = jest.fn();
      const store = build({ project: { id: 'proj-1' }, setProject });
      const result = await store.get().startBranch({
        fromStage: 'prod',
        projectName: 'p',
        newStageName: 'scratch',
      });
      expect(cloudEditingApi.createBranch).toHaveBeenCalledWith({
        fromStage: 'prod',
        projectName: 'p',
        newStageName: 'scratch',
      });
      expect(setProject).toHaveBeenCalledWith({ id: 'branch-3', name: 'p' });
      expect(result.success).toBe(true);
    });
  });
});
