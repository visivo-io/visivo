import { act, renderHook } from '@testing-library/react';
import useRenameFlow from './useRenameFlow';
import { fetchRenameImpact, renameResource } from '../api/rename';

let mockState;
jest.mock('../stores/store', () => ({
  __esModule: true,
  default: () => mockState,
}));

jest.mock('../api/rename', () => ({
  fetchRenameImpact: jest.fn(),
  renameResource: jest.fn(),
  renameSupported: jest.fn(() => true),
}));

const impactFor = (status, references = []) => ({
  supported: true,
  target: { type: 'sources', name: 'old', new_name: 'fresh', status },
  references,
});

const REFERENCED = [{ type: 'models', name: 'm1', status: 'published' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    project: { id: 'proj-1' },
    fetchSources: jest.fn(async () => {}),
    fetchModels: jest.fn(async () => {}),
    closeWorkspaceTab: jest.fn(),
    openWorkspaceTab: jest.fn(),
    checkCommitStatus: jest.fn(async () => {}),
  };
  renameResource.mockResolvedValue({ renamed: true, references: [] });
});

const renderFlow = (props = {}) =>
  renderHook(() => useRenameFlow({ type: 'source', recordName: 'old', name: 'fresh', ...props }));

describe('useRenameFlow', () => {
  test('nameChanged compares the form name with the saved name', () => {
    expect(renderFlow().result.current.nameChanged).toBe(true);
    expect(renderFlow({ name: 'old' }).result.current.nameChanged).toBe(false);
    expect(renderFlow({ recordName: '' }).result.current.nameChanged).toBe(false);
  });

  test('saves the other fields before it asks what the rename affects', async () => {
    fetchRenameImpact.mockResolvedValue(impactFor('published', REFERENCED));
    const saveFields = jest.fn(async () => true);
    const { result } = renderFlow();

    await act(() => result.current.start(saveFields));

    expect(saveFields).toHaveBeenCalledTimes(1);
    expect(saveFields.mock.invocationCallOrder[0]).toBeLessThan(
      fetchRenameImpact.mock.invocationCallOrder[0]
    );
    expect(fetchRenameImpact).toHaveBeenCalledWith('sources', 'old', 'fresh', {
      projectId: 'proj-1',
    });
    expect(result.current.dialogProps).toMatchObject({ loading: false, error: null });
    expect(renameResource).not.toHaveBeenCalled();
  });

  test('a failed field save does not rename', async () => {
    const { result } = renderFlow();

    await act(() => result.current.start(async () => false));

    expect(fetchRenameImpact).not.toHaveBeenCalled();
    expect(renameResource).not.toHaveBeenCalled();
    expect(result.current.isRenaming).toBe(false);
    expect(result.current.dialogProps).toBeNull();
  });

  test('confirming applies the rename, refetches what it touched and moves the tab', async () => {
    fetchRenameImpact.mockResolvedValue(impactFor('published', REFERENCED));
    renameResource.mockResolvedValue({ renamed: true, references: REFERENCED });
    const { result } = renderFlow();
    await act(() => result.current.start(async () => true));

    await act(() => result.current.dialogProps.onConfirm());

    expect(renameResource).toHaveBeenCalledWith('sources', 'old', 'fresh', { projectId: 'proj-1' });
    expect(mockState.fetchSources).toHaveBeenCalled();
    expect(mockState.fetchModels).toHaveBeenCalled();
    expect(mockState.closeWorkspaceTab).toHaveBeenCalledWith('source:old');
    expect(mockState.openWorkspaceTab).toHaveBeenCalledWith({
      id: 'source:fresh',
      type: 'source',
      name: 'fresh',
    });
    expect(mockState.checkCommitStatus).toHaveBeenCalled();
    expect(result.current.dialogProps).toBeNull();
  });

  test('a draft nothing references is renamed at once, with no dialog', async () => {
    fetchRenameImpact.mockResolvedValue(impactFor('new'));
    const { result } = renderFlow();

    await act(() => result.current.start(async () => true));

    expect(renameResource).toHaveBeenCalledWith('sources', 'old', 'fresh', { projectId: 'proj-1' });
    expect(mockState.openWorkspaceTab).toHaveBeenCalledWith({
      id: 'source:fresh',
      type: 'source',
      name: 'fresh',
    });
    expect(result.current.dialogProps).toBeNull();
  });

  test('a draft that something references still asks first', async () => {
    fetchRenameImpact.mockResolvedValue(impactFor('new', REFERENCED));
    const { result } = renderFlow();

    await act(() => result.current.start(async () => true));

    expect(renameResource).not.toHaveBeenCalled();
    expect(result.current.dialogProps).not.toBeNull();
  });

  test('a failed draft rename opens the dialog with the error', async () => {
    fetchRenameImpact.mockResolvedValue(impactFor('new'));
    renameResource.mockRejectedValue(new Error('disk full'));
    const { result } = renderFlow();

    await act(() => result.current.start(async () => true));

    expect(result.current.dialogProps).toMatchObject({ error: 'disk full', loading: false });
  });

  test('a rejected impact check shows the reason and never renames', async () => {
    fetchRenameImpact.mockRejectedValue(new Error("A resource named 'fresh' already exists."));
    const { result } = renderFlow();

    await act(() => result.current.start(async () => true));

    expect(result.current.dialogProps.error).toMatch('already exists');
    expect(renameResource).not.toHaveBeenCalled();
  });

  test('errors without a message fall back to a generic one', async () => {
    fetchRenameImpact.mockRejectedValueOnce({});
    const { result } = renderFlow();
    await act(() => result.current.start());
    expect(result.current.dialogProps.error).toBe('Could not check what this rename affects');

    fetchRenameImpact.mockResolvedValue(impactFor('published'));
    renameResource.mockRejectedValue({});
    await act(() => result.current.start());
    await act(() => result.current.dialogProps.onConfirm());
    expect(result.current.dialogProps.error).toBe('Failed to rename source');
  });

  test('cancel closes the dialog without renaming', async () => {
    fetchRenameImpact.mockResolvedValue(impactFor('published'));
    const { result } = renderFlow();
    await act(() => result.current.start());

    act(() => result.current.dialogProps.onCancel());

    expect(result.current.dialogProps).toBeNull();
    expect(result.current.isRenaming).toBe(false);
    expect(renameResource).not.toHaveBeenCalled();
  });

  test('works against a store without tab or commit actions', async () => {
    mockState = {};
    fetchRenameImpact.mockResolvedValue(impactFor('new'));
    const { result } = renderFlow();

    await act(() => result.current.start(async () => true));

    expect(renameResource).toHaveBeenCalledWith('sources', 'old', 'fresh', {
      projectId: undefined,
    });
    expect(result.current.dialogProps).toBeNull();
  });
});
