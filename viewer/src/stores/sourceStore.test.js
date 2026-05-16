/**
 * Unit tests for sourceStore.saveSource branching on draft mode.
 *
 * These tests cover the new save-flow behavior introduced for the
 * "immediate write when draft mode is off" change. The store talks to
 * three API modules: sources, project (draft mode), and publish. We
 * mock all three so the test runs offline.
 */

import useStore from './store';

jest.mock('../api/sources', () => ({
  fetchAllSources: jest.fn().mockResolvedValue({ sources: [] }),
  saveSource: jest.fn().mockResolvedValue({ message: 'Source saved to cache' }),
  deleteSource: jest.fn().mockResolvedValue({}),
  testSourceConnection: jest.fn().mockResolvedValue({ status: 'connected' }),
}));

jest.mock('../api/project', () => ({
  fetchDraftMode: jest.fn().mockResolvedValue(true),
  fetchProject: jest.fn().mockResolvedValue(null),
}));

jest.mock('../api/publish', () => ({
  publishChanges: jest.fn().mockResolvedValue({ message: 'Changes published' }),
  getPublishStatus: jest.fn().mockResolvedValue({ has_unpublished_changes: false }),
  getPendingChanges: jest.fn().mockResolvedValue({ pending: [] }),
}));

const sourcesApi = require('../api/sources');
const projectApi = require('../api/project');
const publishApi = require('../api/publish');

describe('sourceStore.saveSource draft-mode branching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStore.setState({
      sources: [],
      sourcesLoading: false,
      sourcesError: null,
      hasUnpublishedChanges: false,
      pendingChanges: [],
      notifications: [],
    });
  });

  test('calls saveSource and immediately publishes when draft mode disabled', async () => {
    projectApi.fetchDraftMode.mockResolvedValueOnce(false);

    const result = await useStore.getState().saveSource('mydb', {
      name: 'mydb',
      type: 'sqlite',
      database: '/tmp/x.sqlite',
    });

    expect(sourcesApi.saveSource).toHaveBeenCalledWith('mydb', {
      name: 'mydb',
      type: 'sqlite',
      database: '/tmp/x.sqlite',
    });
    expect(publishApi.publishChanges).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.immediateWrite).toBe(true);

    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].variant).toBe('success');
    expect(notifications[0].message).toMatch(/project\.visivo\.yml/);
  });

  test('calls only saveSource (no publish) when draft mode enabled', async () => {
    projectApi.fetchDraftMode.mockResolvedValueOnce(true);

    const result = await useStore.getState().saveSource('mydb', {
      name: 'mydb',
      type: 'sqlite',
      database: '/tmp/x.sqlite',
    });

    expect(sourcesApi.saveSource).toHaveBeenCalledTimes(1);
    expect(publishApi.publishChanges).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.immediateWrite).toBe(false);

    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].variant).toBe('info');
    expect(notifications[0].message).toMatch(/draft/i);
    expect(notifications[0].message).toMatch(/Publish/);
  });

  test('falls back to draft toast and returns success when publish fails in immediate mode', async () => {
    projectApi.fetchDraftMode.mockResolvedValueOnce(false);
    publishApi.publishChanges.mockRejectedValueOnce(new Error('boom'));

    const result = await useStore.getState().saveSource('mydb', {
      name: 'mydb',
      type: 'sqlite',
      database: '/tmp/x.sqlite',
    });

    expect(sourcesApi.saveSource).toHaveBeenCalledTimes(1);
    expect(publishApi.publishChanges).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.immediateWrite).toBe(false);

    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].variant).toBe('warning');
    expect(notifications[0].message).toMatch(/boom/);
  });

  test('returns failure when saveSource itself errors', async () => {
    projectApi.fetchDraftMode.mockResolvedValueOnce(false);
    sourcesApi.saveSource.mockRejectedValueOnce(new Error('bad config'));

    const result = await useStore.getState().saveSource('mydb', {
      name: 'mydb',
      type: 'sqlite',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('bad config');
    expect(publishApi.publishChanges).not.toHaveBeenCalled();
  });
});
