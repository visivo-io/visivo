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
    it('marks isCloud true and stores capabilities on a 200 response', async () => {
      const caps = {
        can_view: true,
        can_edit: true,
        can_branch: true,
        is_default_stage: false,
        edit_action: 'edit',
      };
      cloudEditingApi.fetchCapabilities.mockResolvedValueOnce(caps);
      const store = build();
      await store.get().fetchCapabilities();
      expect(cloudEditingApi.fetchCapabilities).toHaveBeenCalledWith('proj-1');
      expect(store.get().capabilities).toEqual(caps);
      expect(store.get().isCloud).toBe(true);
    });

    it('stays local (isCloud false) when capabilities is null (404 = Flask serve)', async () => {
      cloudEditingApi.fetchCapabilities.mockResolvedValueOnce(null);
      const store = build();
      await store.get().fetchCapabilities();
      expect(store.get().isCloud).toBe(false);
      expect(store.get().capabilities).toBeNull();
    });

    it('fails closed (no project id => no call)', async () => {
      const store = build({ project: null, setProject: jest.fn() });
      const result = await store.get().fetchCapabilities();
      expect(result).toBeNull();
      expect(cloudEditingApi.fetchCapabilities).not.toHaveBeenCalled();
    });
  });

  describe('startEdit', () => {
    it('creates a draft and flips the active project to it', async () => {
      const draft = { id: 'draft-9', name: 'p' };
      cloudEditingApi.createDraft.mockResolvedValueOnce(draft);
      cloudEditingApi.fetchCapabilities.mockResolvedValueOnce({ can_edit: true });
      const setProject = jest.fn();
      const store = build({ project: { id: 'proj-1' }, setProject });
      const result = await store.get().startEdit();
      expect(cloudEditingApi.createDraft).toHaveBeenCalledWith('proj-1');
      expect(setProject).toHaveBeenCalledWith(draft);
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
    it('forks a new stage and flips the active project to the branch', async () => {
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
      expect(setProject).toHaveBeenCalledWith(branch);
      expect(result.success).toBe(true);
    });
  });

  describe('fetchCloudChanges', () => {
    it('flattens to_publish + to_remove into the pending list', async () => {
      cloudEditingApi.fetchChanges.mockResolvedValueOnce({
        to_publish: [{ name: 'a', type: 'chart', status: 'new' }],
        to_remove: [{ name: 'b', type: 'table', status: 'deleted' }],
        has_changes: true,
      });
      const store = build();
      await store.get().fetchCloudChanges();
      expect(store.get().cloudPendingChanges).toEqual([
        { name: 'a', type: 'chart', status: 'new' },
        { name: 'b', type: 'table', status: 'deleted' },
      ]);
      // Cloud changes also drive the shared commit badge.
      expect(store.get().hasUncommittedChanges).toBe(true);
    });
  });

  describe('commitCloud', () => {
    it('publishes on 201 and switches to the next draft', async () => {
      cloudEditingApi.commitDraft.mockResolvedValueOnce({
        status: 201,
        body: { commit_id: 'c1', published_project: { id: 'proj-1' }, next_draft: { id: 'draft-2' } },
      });
      const setProject = jest.fn();
      const store = build({ project: { id: 'draft-1' }, setProject, cloudPendingChanges: [{ name: 'a' }] });
      const result = await store.get().commitCloud('ship');
      expect(cloudEditingApi.commitDraft).toHaveBeenCalledWith('draft-1', 'ship');
      expect(setProject).toHaveBeenCalledWith({ id: 'draft-2' });
      expect(result.success).toBe(true);
      expect(store.get().cloudPendingChanges).toEqual([]);
    });

    it('surfaces the run/role gate action on 409/403', async () => {
      cloudEditingApi.commitDraft.mockResolvedValueOnce({
        status: 409,
        body: { action: 'run_required', detail: 'Run the draft before committing.' },
      });
      const store = build({ project: { id: 'draft-1' }, setProject: jest.fn() });
      const result = await store.get().commitCloud();
      expect(result).toEqual({
        success: false,
        action: 'run_required',
        error: 'Run the draft before committing.',
      });
    });

    it('treats 200 committed:false as a no-op, not an error', async () => {
      cloudEditingApi.commitDraft.mockResolvedValueOnce({
        status: 200,
        body: { committed: false, detail: 'Nothing to commit.' },
      });
      const store = build({ project: { id: 'draft-1' }, setProject: jest.fn() });
      const result = await store.get().commitCloud();
      expect(result.success).toBe(false);
      expect(result.committed).toBe(false);
    });
  });
});
