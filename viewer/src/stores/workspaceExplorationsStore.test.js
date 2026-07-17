/**
 * workspaceExplorations store slice (Explore 2.0 Phase 1 — backend + slice,
 * no visible UI yet).
 *
 * Pins: byId/order hydration + insertion order, the create/duplicate/delete
 * CRUD actions, the ~1s debounced optimistic sync (coalescing + clobber-
 * safety), the flush-on-unmount primitive, and per-record syncStatus.
 */
import { act } from '@testing-library/react';
import useStore from './store';
import * as explorationsApi from '../api/explorations';
import {
  _pendingSyncTimers,
  _resetExplorationSyncTimersForTests,
} from './workspaceExplorationsStore';

jest.mock('../api/explorations');

const wireExploration = overrides => ({
  id: 'exp_1',
  name: 'Scratch',
  created_at: '2026-07-17T18:00:00Z',
  updated_at: '2026-07-17T18:00:00Z',
  seeded_from: null,
  return_to: null,
  draft: { queries: [], insights: [], chart: null, computed_columns: [] },
  promoted: [],
  ...overrides,
});

const mappedRecord = overrides => ({
  id: 'exp_1',
  name: 'Scratch',
  createdAt: '2026-07-17T18:00:00Z',
  updatedAt: '2026-07-17T18:00:00Z',
  seededFrom: null,
  returnTo: null,
  draft: { queries: [], insights: [], chart: null, computedColumns: [] },
  promoted: [],
  syncStatus: 'synced',
  staleness: null,
  ...overrides,
});

/** Seed the store with an already-loaded (camelCase) record, as if it had
 * come from a prior fetchExplorations/createExploration call. */
const seedRecord = (overrides = {}) => {
  const record = mappedRecord(overrides);
  act(() => {
    useStore.setState({
      workspaceExplorations: { byId: { [record.id]: record }, order: [record.id] },
    });
  });
  return record;
};

const reset = () => {
  _resetExplorationSyncTimersForTests();
  act(() => {
    useStore.setState({
      workspaceExplorations: { byId: {}, order: [] },
      closeWorkspaceTab: jest.fn(),
    });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  reset();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
  _resetExplorationSyncTimersForTests();
});

describe('fetchExplorations', () => {
  test('hydrates byId/order from the server list, preserving server order', async () => {
    explorationsApi.fetchExplorations.mockResolvedValueOnce([
      wireExploration({ id: 'exp_a', name: 'A' }),
      wireExploration({ id: 'exp_b', name: 'B' }),
    ]);

    await act(async () => {
      await useStore.getState().fetchExplorations();
    });

    const state = useStore.getState().workspaceExplorations;
    expect(state.order).toEqual(['exp_a', 'exp_b']);
    expect(state.byId.exp_a).toMatchObject({ id: 'exp_a', name: 'A', syncStatus: 'synced' });
  });

  test('maps snake_case draft fields to camelCase', async () => {
    explorationsApi.fetchExplorations.mockResolvedValueOnce([
      wireExploration({
        draft: {
          queries: [{ name: 'q1', sql: 'SELECT 1', source: 'warehouse' }],
          insights: [{ x: 1 }],
          chart: { y: 2 },
          computed_columns: [{ expression: 'a+b' }],
        },
      }),
    ]);

    await act(async () => {
      await useStore.getState().fetchExplorations();
    });

    expect(useStore.getState().workspaceExplorations.byId.exp_1.draft).toEqual({
      queries: [{ name: 'q1', sql: 'SELECT 1', source: 'warehouse' }],
      insights: [{ x: 1 }],
      chart: { y: 2 },
      computedColumns: [{ expression: 'a+b' }],
    });
  });

  test('returns success:false on failure without throwing', async () => {
    explorationsApi.fetchExplorations.mockRejectedValueOnce(new Error('network down'));

    let result;
    await act(async () => {
      result = await useStore.getState().fetchExplorations();
    });

    expect(result).toEqual({ success: false, error: 'network down' });
  });
});

describe('createExploration', () => {
  test('creates with no seed, POSTs {}, and inserts at the front of order', async () => {
    explorationsApi.createExploration.mockResolvedValueOnce(wireExploration({ name: 'Scratch' }));

    let result;
    await act(async () => {
      result = await useStore.getState().createExploration();
    });

    expect(explorationsApi.createExploration).toHaveBeenCalledWith({});
    expect(result).toMatchObject({ success: true, id: 'exp_1' });
    const state = useStore.getState().workspaceExplorations;
    expect(state.order[0]).toBe('exp_1');
    expect(state.byId.exp_1).toMatchObject({ name: 'Scratch', syncStatus: 'synced' });
  });

  test('passes a seed through as seeded_from', async () => {
    explorationsApi.createExploration.mockResolvedValueOnce(
      wireExploration({ seeded_from: { type: 'model', name: 'orders' } })
    );

    await act(async () => {
      await useStore.getState().createExploration({ type: 'model', name: 'orders' });
    });

    expect(explorationsApi.createExploration).toHaveBeenCalledWith({
      seeded_from: { type: 'model', name: 'orders' },
    });
    expect(useStore.getState().workspaceExplorations.byId.exp_1.seededFrom).toEqual({
      type: 'model',
      name: 'orders',
    });
  });

  test('newer creations land ahead of older ones in order', async () => {
    explorationsApi.createExploration.mockResolvedValueOnce(wireExploration({ id: 'exp_a' }));
    await act(async () => {
      await useStore.getState().createExploration();
    });
    explorationsApi.createExploration.mockResolvedValueOnce(wireExploration({ id: 'exp_b' }));
    await act(async () => {
      await useStore.getState().createExploration();
    });

    expect(useStore.getState().workspaceExplorations.order).toEqual(['exp_b', 'exp_a']);
  });

  test('returns success:false on failure and does not touch the collection', async () => {
    explorationsApi.createExploration.mockRejectedValueOnce(new Error('boom'));

    let result;
    await act(async () => {
      result = await useStore.getState().createExploration();
    });

    expect(result).toEqual({ success: false, error: 'boom' });
    expect(useStore.getState().workspaceExplorations.order).toEqual([]);
  });
});

describe('updateExplorationDraft', () => {
  test('writes optimistically (syncStatus "saving") before the debounce fires', () => {
    seedRecord();
    const nextDraft = { queries: [{ name: 'q', sql: 'SELECT 1' }], insights: [], chart: null, computedColumns: [] };

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', nextDraft);
    });

    const record = useStore.getState().workspaceExplorations.byId.exp_1;
    expect(record.draft).toEqual(nextDraft);
    expect(record.syncStatus).toBe('saving');
    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();
  });

  test('persists (wire-shaped) after the ~1s debounce and flips to synced', async () => {
    seedRecord();
    const nextDraft = { queries: [], insights: [], chart: null, computedColumns: [{ expression: 'a' }] };
    explorationsApi.updateExploration.mockResolvedValueOnce(
      wireExploration({ draft: { queries: [], insights: [], chart: null, computed_columns: [{ expression: 'a' }] } })
    );

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', nextDraft);
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(explorationsApi.updateExploration).toHaveBeenCalledWith('exp_1', {
      draft: { queries: [], insights: [], chart: null, computed_columns: [{ expression: 'a' }] },
    });
    expect(useStore.getState().workspaceExplorations.byId.exp_1.syncStatus).toBe('synced');
  });

  test('coalesces rapid edits into a single request with the LATEST draft', async () => {
    seedRecord();
    explorationsApi.updateExploration.mockResolvedValue(wireExploration());

    await act(async () => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [{ name: 'v1', sql: 'x' }],
        insights: [],
        chart: null,
        computedColumns: [],
      });
      jest.advanceTimersByTime(400);
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [{ name: 'v2', sql: 'x' }],
        insights: [],
        chart: null,
        computedColumns: [],
      });
      jest.advanceTimersByTime(400);
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [{ name: 'v3', sql: 'x' }],
        insights: [],
        chart: null,
        computedColumns: [],
      });
      jest.advanceTimersByTime(1000);
    });

    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);
    expect(explorationsApi.updateExploration).toHaveBeenCalledWith('exp_1', {
      draft: { queries: [{ name: 'v3', sql: 'x' }], insights: [], chart: null, computed_columns: [] },
    });
  });

  test('sets syncStatus to error when the persist fails', async () => {
    seedRecord();
    explorationsApi.updateExploration.mockRejectedValueOnce(new Error('offline'));

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(useStore.getState().workspaceExplorations.byId.exp_1.syncStatus).toBe('error');
  });

  test('is a no-op for an unknown id (no crash, no API call)', () => {
    act(() => {
      useStore.getState().updateExplorationDraft('exp_nope', { queries: [] });
    });
    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();
  });
});

describe('flushExplorationSync', () => {
  test('fires the pending sync immediately instead of waiting the full debounce', async () => {
    seedRecord();
    explorationsApi.updateExploration.mockResolvedValueOnce(wireExploration());

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();

    let result;
    await act(async () => {
      result = await useStore.getState().flushExplorationSync('exp_1');
    });

    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true, flushed: true });
    expect(_pendingSyncTimers.has('exp_1')).toBe(false);
  });

  test('is a no-op when nothing is pending', async () => {
    seedRecord();
    let result;
    await act(async () => {
      result = await useStore.getState().flushExplorationSync('exp_1');
    });
    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, flushed: false });
  });

  test('does not double-fire once the debounce has already run', async () => {
    seedRecord();
    explorationsApi.updateExploration.mockResolvedValue(wireExploration());

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);

    await act(async () => {
      await useStore.getState().flushExplorationSync('exp_1');
    });
    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);
  });
});

describe('duplicateExploration', () => {
  test('creates a copy seeded from the source draft + provenance, named "<name> copy"', async () => {
    seedRecord({
      name: 'Churn dig',
      seededFrom: { type: 'model', name: 'orders' },
      draft: { queries: [{ name: 'q', sql: 'x' }], insights: [], chart: null, computedColumns: [] },
    });
    explorationsApi.createExploration.mockResolvedValueOnce(
      wireExploration({ id: 'exp_2', name: 'Churn dig copy' })
    );

    let result;
    await act(async () => {
      result = await useStore.getState().duplicateExploration('exp_1');
    });

    expect(explorationsApi.createExploration).toHaveBeenCalledWith({
      name: 'Churn dig copy',
      seeded_from: { type: 'model', name: 'orders' },
      draft: { queries: [{ name: 'q', sql: 'x' }], insights: [], chart: null, computed_columns: [] },
    });
    expect(result).toMatchObject({ success: true, id: 'exp_2' });
    expect(useStore.getState().workspaceExplorations.order).toEqual(['exp_2', 'exp_1']);
  });

  test('returns success:false for an unknown id without calling the API', async () => {
    let result;
    await act(async () => {
      result = await useStore.getState().duplicateExploration('exp_missing');
    });
    expect(result).toEqual({ success: false, error: 'Exploration not found' });
    expect(explorationsApi.createExploration).not.toHaveBeenCalled();
  });
});

describe('deleteExploration', () => {
  test('deletes via the API, force-closes a bound tab, and drops the record', async () => {
    seedRecord();
    explorationsApi.deleteExploration.mockResolvedValueOnce(true);

    let result;
    await act(async () => {
      result = await useStore.getState().deleteExploration('exp_1');
    });

    expect(explorationsApi.deleteExploration).toHaveBeenCalledWith('exp_1');
    expect(useStore.getState().closeWorkspaceTab).toHaveBeenCalledWith('exploration:exp_1');
    expect(result).toEqual({ success: true });
    const state = useStore.getState().workspaceExplorations;
    expect(state.byId.exp_1).toBeUndefined();
    expect(state.order).toEqual([]);
  });

  test('clears an armed debounced sync so it cannot fire against a deleted record', async () => {
    seedRecord();
    explorationsApi.deleteExploration.mockResolvedValueOnce(true);

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    await act(async () => {
      await useStore.getState().deleteExploration('exp_1');
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();
  });

  test('returns success:false on failure and leaves the record in place', async () => {
    seedRecord();
    explorationsApi.deleteExploration.mockRejectedValueOnce(new Error('locked'));

    let result;
    await act(async () => {
      result = await useStore.getState().deleteExploration('exp_1');
    });

    expect(result).toEqual({ success: false, error: 'locked' });
    expect(useStore.getState().workspaceExplorations.byId.exp_1).toBeDefined();
    expect(useStore.getState().closeWorkspaceTab).not.toHaveBeenCalled();
  });
});
