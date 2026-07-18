/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
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
  _openDraftSnapshots,
  _resetExplorationSnapshotsForTests,
} from './workspaceExplorationsStore';
import { buildPromoteChecklist } from './promoteChecklist';
import { findReclassifiedSlots } from '../components/views/common/pillFieldSwap';

jest.mock('../api/explorations');
jest.mock('./promoteChecklist', () => ({ buildPromoteChecklist: jest.fn() }));
jest.mock('../components/views/common/pillFieldSwap', () => ({
  findReclassifiedSlots: jest.fn(() => []),
}));

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
  _resetExplorationSnapshotsForTests();
  act(() => {
    useStore.setState({
      workspaceExplorations: { byId: {}, order: [] },
      workspaceTabs: [],
      workspaceToast: null,
      closeWorkspaceTab: jest.fn(),
      restoreExplorerWorkingState: jest.fn(),
      explorerInsightStates: {},
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
  _resetExplorationSnapshotsForTests();
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
      legacyState: null,
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

  // Explore 2.0 Phase 3b cutover (02-architecture.md §5): the dashboard-scoped
  // `/workspace/dashboard/:name/explorer` route mints a fresh exploration
  // carrying a return_to placement intent.
  test('passes a returnTo placement intent through as return_to', async () => {
    explorationsApi.createExploration.mockResolvedValueOnce(
      wireExploration({ return_to: { dashboard: 'sales' } })
    );

    await act(async () => {
      await useStore.getState().createExploration(null, { dashboard: 'sales' });
    });

    expect(explorationsApi.createExploration).toHaveBeenCalledWith({
      return_to: { dashboard: 'sales' },
    });
    expect(useStore.getState().workspaceExplorations.byId.exp_1.returnTo).toEqual({
      dashboard: 'sales',
    });
  });

  test('omits return_to entirely when neither seed nor returnTo is given', async () => {
    explorationsApi.createExploration.mockResolvedValueOnce(wireExploration());
    await act(async () => {
      await useStore.getState().createExploration();
    });
    expect(explorationsApi.createExploration).toHaveBeenCalledWith({});
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
      draft: {
        queries: [],
        insights: [],
        chart: null,
        computed_columns: [{ expression: 'a' }],
        legacy_state: null,
      },
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
      draft: {
        queries: [{ name: 'v3', sql: 'x' }],
        insights: [],
        chart: null,
        computed_columns: [],
        legacy_state: null,
      },
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
      draft: {
        queries: [{ name: 'q', sql: 'x' }],
        insights: [],
        chart: null,
        computed_columns: [],
        legacy_state: null,
      },
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

  // 01-ux-spec.md §4: "if that exploration's tab is open (even parked), the
  // tab force-closes with a toast."
  test('toasts when a bound tab was open (even parked/inactive)', async () => {
    seedRecord({ name: 'Churn dig' });
    act(() => {
      useStore.setState({ workspaceTabs: [{ id: 'exploration:exp_1', type: 'exploration', name: 'exp_1' }] });
    });
    explorationsApi.deleteExploration.mockResolvedValueOnce(true);

    await act(async () => {
      await useStore.getState().deleteExploration('exp_1');
    });

    expect(useStore.getState().closeWorkspaceTab).toHaveBeenCalledWith('exploration:exp_1');
    expect(useStore.getState().workspaceToast).toMatchObject({ message: 'Churn dig was deleted' });
  });

  test('does not toast when no tab was bound', async () => {
    seedRecord({ name: 'Churn dig' });
    act(() => {
      useStore.setState({ workspaceTabs: [] });
    });
    explorationsApi.deleteExploration.mockResolvedValueOnce(true);

    await act(async () => {
      await useStore.getState().deleteExploration('exp_1');
    });

    expect(useStore.getState().workspaceToast).toBeNull();
  });
});

describe('renameExploration', () => {
  test('optimistically renames, then persists via the generic update route', async () => {
    seedRecord({ name: 'Scratch' });
    explorationsApi.updateExploration.mockResolvedValueOnce(wireExploration({ name: 'Churn dig' }));

    let renamePromise;
    act(() => {
      renamePromise = useStore.getState().renameExploration('exp_1', 'Churn dig');
    });
    // Optimistic write lands synchronously, before the API call resolves.
    expect(useStore.getState().workspaceExplorations.byId.exp_1.name).toBe('Churn dig');

    const result = await act(async () => renamePromise);

    expect(explorationsApi.updateExploration).toHaveBeenCalledWith('exp_1', { name: 'Churn dig' });
    expect(result).toMatchObject({ success: true });
    expect(useStore.getState().workspaceExplorations.byId.exp_1.name).toBe('Churn dig');
  });

  test('rolls back the optimistic name on failure', async () => {
    seedRecord({ name: 'Scratch' });
    explorationsApi.updateExploration.mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      await useStore.getState().renameExploration('exp_1', 'Churn dig');
    });

    expect(useStore.getState().workspaceExplorations.byId.exp_1.name).toBe('Scratch');
  });

  test('is a no-op (no API call) when the name is unchanged or blank', async () => {
    seedRecord({ name: 'Scratch' });

    await act(async () => {
      await useStore.getState().renameExploration('exp_1', 'Scratch');
    });
    await act(async () => {
      await useStore.getState().renameExploration('exp_1', '   ');
    });

    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();
  });

  test('returns success:false for an unknown id', async () => {
    let result;
    await act(async () => {
      result = await useStore.getState().renameExploration('exp_missing', 'X');
    });
    expect(result).toEqual({ success: false, error: 'Exploration not found' });
  });
});

describe('VIS-1081 discard mechanics', () => {
  test('snapshotExplorationForDiscard captures the CURRENT persisted draft', () => {
    seedRecord({ draft: { queries: [{ name: 'q1', sql: 'SELECT 1' }], insights: [], chart: null, computedColumns: [] } });
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
    });
    expect(_openDraftSnapshots.get('exp_1').queries[0].name).toBe('q1');
  });

  test('clearExplorationDiscardSnapshot removes the bookkeeping', () => {
    seedRecord();
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
      useStore.getState().clearExplorationDiscardSnapshot('exp_1');
    });
    expect(_openDraftSnapshots.has('exp_1')).toBe(false);
  });

  test('discardExploration reverts the local draft to the open-time snapshot and POSTs it', async () => {
    const openSnapshot = { queries: [{ name: 'q1', sql: 'SELECT 1' }], insights: [], chart: null, computedColumns: [] };
    seedRecord({ draft: openSnapshot });
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
    });
    // Simulate edits made during the session (what the tab is discarding).
    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [{ name: 'q1', sql: 'SELECT 1 -- edited' }],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    explorationsApi.updateExploration.mockResolvedValueOnce(wireExploration({ draft: { queries: [{ name: 'q1', sql: 'SELECT 1' }], insights: [], chart: null, computed_columns: [] } }));

    let result;
    await act(async () => {
      result = await useStore.getState().discardExploration('exp_1');
    });

    expect(result).toEqual({ success: true, reverted: true });
    // The pending debounce (armed by updateExplorationDraft above) must be
    // cancelled — the discard POST is the only persist, not the debounce.
    expect(_pendingSyncTimers.has('exp_1')).toBe(false);
    expect(useStore.getState().workspaceExplorations.byId.exp_1.draft.queries[0].sql).toBe('SELECT 1');
    // Reverts the legacy explorerStore working state too (so the pane's own
    // unmount cleanup doesn't re-persist the discarded edit right after).
    expect(useStore.getState().restoreExplorerWorkingState).toHaveBeenCalled();
    expect(explorationsApi.updateExploration).toHaveBeenCalledWith('exp_1', {
      draft: {
        queries: [{ name: 'q1', sql: 'SELECT 1' }],
        insights: [],
        chart: null,
        computed_columns: [],
        legacy_state: null,
      },
    });
  });

  test('discardExploration cancels a pending debounce even when the fire-time POST would have raced it', async () => {
    seedRecord();
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
      useStore.getState().updateExplorationDraft('exp_1', { queries: [], insights: [], chart: null, computedColumns: [{ x: 1 }] });
    });
    explorationsApi.updateExploration.mockResolvedValue(wireExploration());

    await act(async () => {
      await useStore.getState().discardExploration('exp_1');
    });

    // Advance past the 1s debounce window — if the timer weren't cancelled,
    // this would fire a SECOND (discarded-content) update.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);
  });

  test('discardExploration with no snapshot (never activated) is a graceful no-op', async () => {
    seedRecord();
    let result;
    await act(async () => {
      result = await useStore.getState().discardExploration('exp_1');
    });
    expect(result).toEqual({ success: true, reverted: false });
    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();
  });

  test('discardExploration deletes the snapshot after use (one-shot per session)', async () => {
    seedRecord();
    explorationsApi.updateExploration.mockResolvedValueOnce(wireExploration());
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
    });
    await act(async () => {
      await useStore.getState().discardExploration('exp_1');
    });
    expect(_openDraftSnapshots.has('exp_1')).toBe(false);
  });

  test('discardExploration reports failure but still reports reverted:true when the revert POST fails (local revert already happened)', async () => {
    seedRecord();
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
    });
    explorationsApi.updateExploration.mockRejectedValueOnce(new Error('offline'));
    let result;
    await act(async () => {
      result = await useStore.getState().discardExploration('exp_1');
    });
    expect(result).toEqual({ success: false, reverted: true, error: 'offline' });
  });
});

describe('recordExplorationPromotion', () => {
  test('appends the promotion and mirrors the updated record locally', async () => {
    seedRecord();
    explorationsApi.recordPromotion.mockResolvedValueOnce(
      wireExploration({ promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' }] })
    );
    let result;
    await act(async () => {
      result = await useStore.getState().recordExplorationPromotion('exp_1', 'model', 'orders_q');
    });
    expect(result).toEqual({ success: true });
    expect(explorationsApi.recordPromotion).toHaveBeenCalledWith('exp_1', 'model', 'orders_q');
    expect(useStore.getState().workspaceExplorations.byId.exp_1.promoted).toEqual([
      { type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' },
    ]);
  });

  test('returns success:false on failure', async () => {
    seedRecord();
    explorationsApi.recordPromotion.mockRejectedValueOnce(new Error('boom'));
    let result;
    await act(async () => {
      result = await useStore.getState().recordExplorationPromotion('exp_1', 'model', 'orders_q');
    });
    expect(result).toEqual({ success: false, error: 'boom' });
  });
});

describe('promoteExploration', () => {
  const checklistRow = overrides => ({
    tier: 'model',
    type: 'model',
    name: 'orders_q',
    parentModel: null,
    status: 'new',
    valid: true,
    error: null,
    config: { sql: 'select 1' },
    ...overrides,
  });

  test('promotes only selected + valid rows, via the REAL saveX store action (not raw api calls)', async () => {
    buildPromoteChecklist.mockResolvedValue([
      checklistRow(),
      checklistRow({ type: 'insight', tier: 'insight', name: 'churn', config: { props: { type: 'scatter' } } }),
    ]);
    const saveModel = jest.fn().mockResolvedValue({ success: true });
    const saveInsight = jest.fn().mockResolvedValue({ success: true });
    seedRecord();
    act(() => {
      useStore.setState({ saveModel, saveInsight });
    });
    explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

    let result;
    await act(async () => {
      result = await useStore.getState().promoteExploration('exp_1', [{ type: 'model', name: 'orders_q' }]);
    });

    expect(saveModel).toHaveBeenCalledWith('orders_q', { sql: 'select 1' });
    expect(saveInsight).not.toHaveBeenCalled(); // not in selection
    expect(result.success).toBe(true);
    expect(result.results).toEqual([
      { type: 'model', name: 'orders_q', tier: 'model', success: true, error: null },
    ]);
  });

  test('never promotes a row the checklist marked invalid, even if it is in the selection', async () => {
    buildPromoteChecklist.mockResolvedValue([checklistRow({ valid: false, error: 'bad expression' })]);
    const saveModel = jest.fn();
    seedRecord();
    act(() => useStore.setState({ saveModel }));

    await act(async () => {
      await useStore.getState().promoteExploration('exp_1', [{ type: 'model', name: 'orders_q' }]);
    });

    expect(saveModel).not.toHaveBeenCalled();
  });

  test('promotes in dependency order: model before insight before chart, regardless of selection array order', async () => {
    const order = [];
    buildPromoteChecklist.mockResolvedValue([
      checklistRow({ type: 'chart', tier: 'chart', name: 'c' }),
      checklistRow({ type: 'insight', tier: 'insight', name: 'i' }),
      checklistRow({ type: 'model', tier: 'model', name: 'm' }),
    ]);
    seedRecord();
    act(() =>
      useStore.setState({
        saveChart: jest.fn(async () => { order.push('chart'); return { success: true }; }),
        saveInsight: jest.fn(async () => { order.push('insight'); return { success: true }; }),
        saveModel: jest.fn(async () => { order.push('model'); return { success: true }; }),
      })
    );
    explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

    await act(async () => {
      await useStore.getState().promoteExploration('exp_1', [
        { type: 'chart', name: 'c' },
        { type: 'insight', name: 'i' },
        { type: 'model', name: 'm' },
      ]);
    });

    expect(order).toEqual(['model', 'insight', 'chart']);
  });

  test('a failed row blocks only itself — partial promotion continues', async () => {
    buildPromoteChecklist.mockResolvedValue([
      checklistRow({ name: 'good_model' }),
      checklistRow({ name: 'bad_model' }),
    ]);
    seedRecord();
    const saveModel = jest.fn(async name =>
      name === 'bad_model' ? { success: false, error: 'server rejected it' } : { success: true }
    );
    act(() => useStore.setState({ saveModel }));
    explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

    let result;
    await act(async () => {
      result = await useStore.getState().promoteExploration('exp_1', [
        { type: 'model', name: 'good_model' },
        { type: 'model', name: 'bad_model' },
      ]);
    });

    expect(saveModel).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(result.results).toEqual(
      expect.arrayContaining([
        { type: 'model', name: 'good_model', tier: 'model', success: true, error: null },
        { type: 'model', name: 'bad_model', tier: 'model', success: false, error: 'server rejected it' },
      ])
    );
  });

  test('records a promotion for each successfully-saved row, never for a failed one', async () => {
    buildPromoteChecklist.mockResolvedValue([
      checklistRow({ name: 'good_model' }),
      checklistRow({ name: 'bad_model' }),
    ]);
    seedRecord();
    const saveModel = jest.fn(async name =>
      name === 'bad_model' ? { success: false } : { success: true }
    );
    act(() => useStore.setState({ saveModel }));
    explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

    await act(async () => {
      await useStore.getState().promoteExploration('exp_1', [
        { type: 'model', name: 'good_model' },
        { type: 'model', name: 'bad_model' },
      ]);
    });

    expect(explorationsApi.recordPromotion).toHaveBeenCalledTimes(1);
    expect(explorationsApi.recordPromotion).toHaveBeenCalledWith('exp_1', 'model', 'good_model');
  });

  test('surfaces reclassification offers when a promoted metric/dimension collides with a sibling bare-column ref (delta-review fix)', async () => {
    buildPromoteChecklist.mockResolvedValue([
      checklistRow({ type: 'metric', tier: 'field', name: 'region', config: { expression: 'x', parentModel: 'orders_q' } }),
    ]);
    findReclassifiedSlots.mockReturnValueOnce([
      { insightName: 'other_insight', location: 'prop', key: 'x', swapTo: { kind: 'metricRef', ref: 'region' } },
    ]);
    seedRecord();
    act(() =>
      useStore.setState({
        saveMetric: jest.fn().mockResolvedValue({ success: true }),
        explorerInsightStates: { other_insight: { props: { x: '?{${ref(orders_q).region}}' }, interactions: [] } },
      })
    );
    explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

    let result;
    await act(async () => {
      result = await useStore.getState().promoteExploration('exp_1', [{ type: 'metric', name: 'region' }]);
    });

    expect(findReclassifiedSlots).toHaveBeenCalledWith('region', 'metric', expect.any(Object));
    expect(result.reclassificationOffers).toEqual([
      {
        promotedType: 'metric',
        promotedName: 'region',
        slots: [{ insightName: 'other_insight', location: 'prop', key: 'x', swapTo: { kind: 'metricRef', ref: 'region' } }],
      },
    ]);
  });

  test('no reclassification offers for a promoted model/insight/chart (only metric/dimension trigger the scan)', async () => {
    buildPromoteChecklist.mockResolvedValue([checklistRow()]);
    seedRecord();
    act(() => useStore.setState({ saveModel: jest.fn().mockResolvedValue({ success: true }) }));
    explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

    let result;
    await act(async () => {
      result = await useStore.getState().promoteExploration('exp_1', [{ type: 'model', name: 'orders_q' }]);
    });

    expect(findReclassifiedSlots).not.toHaveBeenCalled();
    expect(result.reclassificationOffers).toEqual([]);
  });

  test('an empty selection promotes nothing and reports success:false (nothing to do is not a success)', async () => {
    buildPromoteChecklist.mockResolvedValue([checklistRow()]);
    seedRecord();
    let result;
    await act(async () => {
      result = await useStore.getState().promoteExploration('exp_1', []);
    });
    expect(result).toEqual({ success: false, results: [], reclassificationOffers: [] });
  });
});
