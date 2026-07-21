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
  _resetExplorationWriteQueuesForTests,
} from './workspaceExplorationsStore';
import { buildPromoteChecklist } from './promoteChecklist';
import { setWorkspaceTelemetryListener } from '../components/views/workspace/telemetry';
import { findReclassifiedSlots } from '../components/views/common/pillFieldSwap';
import { buildInsightFreshnessSignature } from '../utils/insightFreshnessSignature';

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
  _resetExplorationWriteQueuesForTests();
  act(() => {
    useStore.setState({
      workspaceExplorations: { byId: {}, order: [] },
      workspaceTabs: [],
      workspaceToast: null,
      closeWorkspaceTab: jest.fn(),
      openWorkspaceTab: jest.fn(),
      restoreExplorerWorkingState: jest.fn(),
      explorerInsightStates: {},
      explorerModelStates: {},
      explorerPromotedSignatures: {},
      // Phase 6c-T1's content-signature computation reads these collections
      // at seed time (`computeSeedContentSignature`) — reset so one test's
      // seeded `models`/`insights`/`charts` never leaks into the next.
      models: [],
      insights: [],
      charts: [],
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
  _resetExplorationWriteQueuesForTests();
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
      // Phase 6c-T1: content_signature is null here because no `orders`
      // model is loaded in the store at seed time (this test's `beforeEach`
      // doesn't seed one) — see the drift-detection tests below for the
      // populated-collection case.
      seeded_from: { type: 'model', name: 'orders', content_signature: null },
      // Phase 6c-T5 (naming coherence): a seeded create gets a deterministic
      // default name derived from what was explored, rather than the
      // backend's generic 'Exploration N' counter.
      name: 'orders exploration',
    });
    expect(useStore.getState().workspaceExplorations.byId.exp_1.seededFrom).toEqual({
      type: 'model',
      name: 'orders',
      contentSignature: null,
    });
  });

  // Phase 6c-T1 (ux-audit.md existing-objects #8, drift detection): a
  // hashable seed type (model/insight/chart) whose object IS loaded in the
  // store at seed time gets its content hashed into `content_signature` —
  // the value `computeExplorationStaleness` later compares against on
  // resume to detect the source having been edited elsewhere.
  test('a hashable seed with a loaded model computes and sends a content_signature', async () => {
    useStore.setState({ models: [{ name: 'orders', config: { sql: 'SELECT 1' } }] });
    explorationsApi.createExploration.mockResolvedValueOnce(
      wireExploration({
        seeded_from: { type: 'model', name: 'orders', content_signature: 'irrelevant-for-this-assert' },
      })
    );

    await act(async () => {
      await useStore.getState().createExploration({ type: 'model', name: 'orders' });
    });

    const payload = explorationsApi.createExploration.mock.calls[0][0];
    expect(payload.seeded_from.type).toBe('model');
    expect(payload.seeded_from.name).toBe('orders');
    expect(typeof payload.seeded_from.content_signature).toBe('string');
    expect(payload.seeded_from.content_signature.length).toBeGreaterThan(0);
  });

  test('a source seed (not a hashable type) sends a null content_signature', async () => {
    explorationsApi.createExploration.mockResolvedValueOnce(
      wireExploration({ seeded_from: { type: 'source', name: 'warehouse' } })
    );

    await act(async () => {
      await useStore.getState().createExploration({ type: 'source', name: 'warehouse' });
    });

    const payload = explorationsApi.createExploration.mock.calls[0][0];
    expect(payload.seeded_from).toEqual({
      type: 'source',
      name: 'warehouse',
      content_signature: null,
    });
  });

  // VIS-1067 — "Explore this" hands in a fully-built legacy snapshot
  // (`explorerStore.js`'s `buildExplorationSeedState`) instead of relying on
  // `legacyStateForSeed`'s `type === 'source'`-only bridge.
  test('legacyStateOverride wins over legacyStateForSeed and is mapped into the draft', async () => {
    explorationsApi.createExploration.mockResolvedValueOnce(
      wireExploration({ seeded_from: { type: 'model', name: 'orders' } })
    );

    const override = {
      modelTabs: ['query_1'],
      activeModelName: 'query_1',
      modelStates: { query_1: { sql: 'SELECT * FROM ${ref(orders)}', sourceName: 'pg', isNew: true } },
      chartName: null,
      chartLayout: {},
      chartInsightNames: [],
      activeInsightName: null,
      insightStates: {},
    };

    await act(async () => {
      await useStore.getState().createExploration({ type: 'model', name: 'orders' }, null, override);
    });

    const payload = explorationsApi.createExploration.mock.calls[0][0];
    expect(payload.seeded_from).toEqual({ type: 'model', name: 'orders', content_signature: null });
    expect(payload.draft.queries).toEqual([
      { name: 'query_1', sql: 'SELECT * FROM ${ref(orders)}', source: 'pg' },
    ]);
    expect(payload.draft.legacy_state).toEqual(override);
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

  // VIS-1083: once a prior sync has 404'd (syncStatus 'deleted-remotely'),
  // further edits must never re-arm the sync loop against a record that will
  // 404 forever — but the local edit itself must still land (nothing lost).
  test('does NOT re-arm the sync loop once syncStatus is deleted-remotely, but keeps the local edit', () => {
    seedRecord({ syncStatus: 'deleted-remotely' });

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [{ name: 'q', sql: 'SELECT 2' }],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });

    const record = useStore.getState().workspaceExplorations.byId.exp_1;
    expect(record.draft.queries[0].sql).toBe('SELECT 2');
    expect(record.syncStatus).toBe('deleted-remotely'); // never flipped to 'saving'
    expect(_pendingSyncTimers.has('exp_1')).toBe(false);

    // Even after the usual debounce window, still no network call.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();
  });
});

describe('runSync — VIS-1083 deleted-remotely (404 handling)', () => {
  const notFoundError = () => {
    const error = new Error('Exploration not found');
    error.status = 404;
    return error;
  };

  test('a 404 on the debounced sync sets syncStatus to deleted-remotely, not the generic error', async () => {
    seedRecord();
    explorationsApi.updateExploration.mockRejectedValueOnce(notFoundError());

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

    expect(useStore.getState().workspaceExplorations.byId.exp_1.syncStatus).toBe(
      'deleted-remotely'
    );
  });

  test('a non-404 failure still sets the generic error status (regression guard)', async () => {
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

  test('flushExplorationSync surfaces deletedRemotely:true on a 404', async () => {
    seedRecord();
    explorationsApi.updateExploration.mockRejectedValueOnce(notFoundError());

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });

    let result;
    await act(async () => {
      result = await useStore.getState().flushExplorationSync('exp_1');
    });
    expect(result).toMatchObject({ success: false, deletedRemotely: true });
  });
});

describe('recreateExplorationFromDeleted (VIS-1083)', () => {
  test('mints a new exploration from the local draft, drops the dead record, force-closes its tab, and opens the new one', async () => {
    seedRecord({
      id: 'exp_1',
      name: 'Churn dig',
      syncStatus: 'deleted-remotely',
      draft: { queries: [{ name: 'q1', sql: 'SELECT 1' }], insights: [], chart: null, computedColumns: [] },
    });
    const closeWorkspaceTab = jest.fn();
    const openWorkspaceTab = jest.fn();
    useStore.setState({ closeWorkspaceTab, openWorkspaceTab });
    explorationsApi.createExploration.mockResolvedValueOnce(
      wireExploration({
        id: 'exp_2',
        name: 'Churn dig',
        draft: { queries: [{ name: 'q1', sql: 'SELECT 1' }], insights: [], chart: null, computed_columns: [] },
      })
    );

    let result;
    await act(async () => {
      result = await useStore.getState().recreateExplorationFromDeleted('exp_1');
    });

    expect(explorationsApi.createExploration).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Churn dig' })
    );
    expect(result).toMatchObject({ success: true, id: 'exp_2' });
    const state = useStore.getState().workspaceExplorations;
    expect(state.byId.exp_1).toBeUndefined();
    expect(state.byId.exp_2).toBeDefined();
    expect(closeWorkspaceTab).toHaveBeenCalledWith('exploration:exp_1');
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'exploration:exp_2',
      type: 'exploration',
      name: 'exp_2',
    });
  });

  test('returns success:false for an unknown id', async () => {
    let result;
    await act(async () => {
      result = await useStore.getState().recreateExplorationFromDeleted('exp_missing');
    });
    expect(result).toEqual({ success: false, error: 'Exploration not found' });
  });

  test('returns success:false when the create POST itself fails', async () => {
    seedRecord({ syncStatus: 'deleted-remotely' });
    explorationsApi.createExploration.mockRejectedValueOnce(new Error('offline'));

    let result;
    await act(async () => {
      result = await useStore.getState().recreateExplorationFromDeleted('exp_1');
    });
    expect(result).toEqual({ success: false, error: 'offline' });
    // The dead local record is left in place on failure — nothing to recover
    // into otherwise.
    expect(useStore.getState().workspaceExplorations.byId.exp_1).toBeDefined();
  });
});

describe('discardDeletedExploration (VIS-1083)', () => {
  test('drops the local record and force-closes its tab, without any network call', () => {
    seedRecord({ syncStatus: 'deleted-remotely' });
    const closeWorkspaceTab = jest.fn();
    useStore.setState({ closeWorkspaceTab });

    act(() => {
      useStore.getState().discardDeletedExploration('exp_1');
    });

    expect(useStore.getState().workspaceExplorations.byId.exp_1).toBeUndefined();
    expect(closeWorkspaceTab).toHaveBeenCalledWith('exploration:exp_1');
    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();
    expect(explorationsApi.deleteExploration).not.toHaveBeenCalled();
  });

  test('clears any still-pending sync timer so it can never fire after the tab is gone', () => {
    seedRecord({ syncStatus: 'saving' });
    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    expect(_pendingSyncTimers.has('exp_1')).toBe(true);

    act(() => {
      useStore.getState().discardDeletedExploration('exp_1');
    });
    expect(_pendingSyncTimers.has('exp_1')).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1000);
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
      seeded_from: { type: 'model', name: 'orders', content_signature: null },
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

  test('returns success:false when the create-copy API call itself fails', async () => {
    seedRecord({ name: 'Churn dig' });
    explorationsApi.createExploration.mockRejectedValueOnce(new Error('network down'));

    let result;
    await act(async () => {
      result = await useStore.getState().duplicateExploration('exp_1');
    });

    expect(result).toEqual({ success: false, error: 'network down' });
    expect(useStore.getState().workspaceExplorations.order).toEqual(['exp_1']);
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

  test('a 404 marks the record deleted-remotely instead of rolling back the name (VIS-1083)', async () => {
    seedRecord({ name: 'Scratch' });
    const error = new Error('Exploration not found');
    error.status = 404;
    explorationsApi.updateExploration.mockRejectedValueOnce(error);

    let result;
    await act(async () => {
      result = await useStore.getState().renameExploration('exp_1', 'Churn dig');
    });

    expect(result).toMatchObject({ success: false, deletedRemotely: true });
    expect(useStore.getState().workspaceExplorations.byId.exp_1.syncStatus).toBe(
      'deleted-remotely'
    );
  });
});

describe('VIS-1085 — per-id write serialization (rename vs debounced draft-sync)', () => {
  test('a rename fired while a draft-sync write is in flight for the SAME id waits for it (no concurrent update() calls)', async () => {
    seedRecord();
    let resolveDraftSync;
    explorationsApi.updateExploration.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveDraftSync = resolve;
        })
    );
    explorationsApi.updateExploration.mockResolvedValueOnce(wireExploration({ name: 'Renamed' }));

    // Arm + fire the debounced draft-sync — its own updateExploration call is
    // now in flight (deliberately left unresolved).
    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [{ name: 'q', sql: 'x' }],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);

    // Fire a rename WHILE that write is still unresolved — it must not
    // dispatch its own network call yet (queued behind the in-flight write).
    let renamePromise;
    act(() => {
      renamePromise = useStore.getState().renameExploration('exp_1', 'Renamed');
    });
    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);

    // Resolving the draft-sync's write unblocks the queued rename write.
    await act(async () => {
      resolveDraftSync(wireExploration());
      await renamePromise;
    });

    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(2);
    expect(explorationsApi.updateExploration).toHaveBeenNthCalledWith(2, 'exp_1', {
      name: 'Renamed',
    });
  });

  test('a debounced draft-sync fired while a rename is in flight for the SAME id waits for it (reverse ordering)', async () => {
    seedRecord();
    let resolveRename;
    explorationsApi.updateExploration.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRename = resolve;
        })
    );
    explorationsApi.updateExploration.mockResolvedValueOnce(wireExploration());

    let renamePromise;
    await act(async () => {
      renamePromise = useStore.getState().renameExploration('exp_1', 'Renamed');
      // Let the rename's own enqueueWrite microtask actually dispatch its
      // network call before asserting on the mock's call count below.
      await Promise.resolve();
    });
    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);

    // Arm + fire the debounced draft-sync while the rename's write is still
    // unresolved — it must queue behind it, not fire concurrently.
    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [{ name: 'q', sql: 'x' }],
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
      resolveRename(wireExploration({ name: 'Renamed' }));
      await renamePromise;
      // Let the now-unblocked draft-sync write's microtask actually dispatch.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(2);
    expect(explorationsApi.updateExploration).toHaveBeenNthCalledWith(2, 'exp_1', {
      draft: {
        queries: [{ name: 'q', sql: 'x' }],
        insights: [],
        chart: null,
        computed_columns: [],
        legacy_state: null,
      },
    });
  });

  test('writes for DIFFERENT ids are never serialized against each other', async () => {
    seedRecord({ id: 'exp_1' });
    act(() => {
      useStore.setState(state => ({
        workspaceExplorations: {
          byId: { ...state.workspaceExplorations.byId, exp_2: mappedRecord({ id: 'exp_2' }) },
          order: [...state.workspaceExplorations.order, 'exp_2'],
        },
      }));
    });
    let resolveFirst;
    explorationsApi.updateExploration.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve;
        })
    );
    explorationsApi.updateExploration.mockResolvedValueOnce(wireExploration({ id: 'exp_2' }));

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

    // A write for a DIFFERENT id must dispatch immediately, unblocked by
    // exp_1's still-in-flight write.
    act(() => {
      useStore.getState().updateExplorationDraft('exp_2', {
        queries: [],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveFirst(wireExploration());
    });
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

// VIS-1068 — dashboard round-trip completion: consuming the one-shot
// return_to intent (both on accept, after placement, and on decline).
describe('consumeExplorationReturnTo', () => {
  test('nulls return_to via the endpoint and mirrors it locally', async () => {
    seedRecord({ returnTo: { dashboard: 'sales' } });
    explorationsApi.consumeReturnTo.mockResolvedValueOnce(wireExploration({ return_to: null }));
    let result;
    await act(async () => {
      result = await useStore.getState().consumeExplorationReturnTo('exp_1');
    });
    expect(result).toEqual({ success: true });
    expect(explorationsApi.consumeReturnTo).toHaveBeenCalledWith('exp_1');
    expect(useStore.getState().workspaceExplorations.byId.exp_1.returnTo).toBeNull();
  });

  test('returns success:false on failure and leaves the local record untouched', async () => {
    seedRecord({ returnTo: { dashboard: 'sales' } });
    explorationsApi.consumeReturnTo.mockRejectedValueOnce(new Error('offline'));
    let result;
    await act(async () => {
      result = await useStore.getState().consumeExplorationReturnTo('exp_1');
    });
    expect(result).toEqual({ success: false, error: 'offline' });
    expect(useStore.getState().workspaceExplorations.byId.exp_1.returnTo).toEqual({
      dashboard: 'sales',
    });
  });

  test('is enqueued alongside other writers for the same id (waits for an in-flight draft-sync)', async () => {
    seedRecord({ returnTo: { dashboard: 'sales' } });
    let resolveDraftSync;
    explorationsApi.updateExploration.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveDraftSync = resolve;
        })
    );
    explorationsApi.consumeReturnTo.mockResolvedValueOnce(wireExploration({ return_to: null }));

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', { queries: [], insights: [], chart: null });
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);

    let consumePromise;
    act(() => {
      consumePromise = useStore.getState().consumeExplorationReturnTo('exp_1');
    });
    // The draft-sync write is still in flight — consume-return-to must not
    // have fired its POST yet.
    expect(explorationsApi.consumeReturnTo).not.toHaveBeenCalled();

    await act(async () => {
      resolveDraftSync(wireExploration());
      await consumePromise;
    });
    expect(explorationsApi.consumeReturnTo).toHaveBeenCalledWith('exp_1');
  });
});

// P4-D1 — a keyboard-driven tab switch mid-promote used to be able to race
// recordExplorationPromotion's append against a concurrent draft-sync/rename/
// discard write for the SAME id (both hit the same unlocked backend JSON
// document). Pins that recordExplorationPromotion now shares the same per-id
// write queue as every other writer — see the file docstring's "WRITE
// SERIALIZATION" note.
describe('recordExplorationPromotion — P4-D1 write serialization', () => {
  test('queues behind an in-flight draft-sync write for the same id (no concurrent requests)', async () => {
    seedRecord();
    let resolveDraftSync;
    explorationsApi.updateExploration.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveDraftSync = resolve;
        })
    );
    explorationsApi.recordPromotion.mockResolvedValueOnce(
      wireExploration({ promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' }] })
    );

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [{ name: 'q', sql: 'x' }],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);
    expect(explorationsApi.recordPromotion).not.toHaveBeenCalled();

    let promotionPromise;
    act(() => {
      promotionPromise = useStore.getState().recordExplorationPromotion('exp_1', 'model', 'orders_q');
    });
    // Must NOT fire yet — the draft-sync write is still unresolved.
    expect(explorationsApi.recordPromotion).not.toHaveBeenCalled();

    await act(async () => {
      resolveDraftSync(wireExploration());
      await promotionPromise;
    });

    expect(explorationsApi.recordPromotion).toHaveBeenCalledTimes(1);
    expect(explorationsApi.recordPromotion).toHaveBeenCalledWith('exp_1', 'model', 'orders_q');
  });

  test('a draft-sync fired while a promotion is in flight for the same id waits for it (reverse ordering)', async () => {
    seedRecord();
    let resolvePromotion;
    explorationsApi.recordPromotion.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolvePromotion = resolve;
        })
    );
    explorationsApi.updateExploration.mockResolvedValueOnce(wireExploration());

    let promotionPromise;
    await act(async () => {
      promotionPromise = useStore.getState().recordExplorationPromotion('exp_1', 'model', 'orders_q');
      await Promise.resolve();
    });
    expect(explorationsApi.recordPromotion).toHaveBeenCalledTimes(1);

    act(() => {
      useStore.getState().updateExplorationDraft('exp_1', {
        queries: [{ name: 'q', sql: 'x' }],
        insights: [],
        chart: null,
        computedColumns: [],
      });
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    // Queued behind the still-unresolved promotion write.
    expect(explorationsApi.updateExploration).not.toHaveBeenCalled();

    await act(async () => {
      resolvePromotion(
        wireExploration({ promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' }] })
      );
      await promotionPromise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(explorationsApi.updateExploration).toHaveBeenCalledTimes(1);
  });
});

// P4-D4 — "Close without saving" after a partial promote must never leave a
// ghost entry (an entry that gets silently wiped) OR a stale one — the
// discard revert's payload never mentions `promoted` (immutable via that
// route regardless), and once serialized (P4-D1), the revert's OWN response
// is the current server document, applied back so the Build-rail promoted
// trail (ExplorationBuildRail.jsx) never lags server truth after a discard.
describe('discardExploration — P4-D4 promoted[] integrity', () => {
  test('the revert POST payload never includes `promoted` or `name`, only `draft`', async () => {
    seedRecord({ promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' }] });
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
    });
    explorationsApi.updateExploration.mockResolvedValueOnce(
      wireExploration({ promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' }] })
    );

    await act(async () => {
      await useStore.getState().discardExploration('exp_1');
    });

    const payload = explorationsApi.updateExploration.mock.calls[0][1];
    expect(Object.keys(payload)).toEqual(['draft']);
  });

  test('after a successful revert, local promoted[] reflects the server response (re-reads server state post-discard)', async () => {
    seedRecord({ promoted: [] });
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
    });
    // The server's document already has a promotion recorded ahead of this
    // revert in the write queue (e.g. a promote that landed just before the
    // user chose "Close without saving") — the revert's own response is the
    // CURRENT document, including it.
    explorationsApi.updateExploration.mockResolvedValueOnce(
      wireExploration({ promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' }] })
    );

    await act(async () => {
      await useStore.getState().discardExploration('exp_1');
    });

    expect(useStore.getState().workspaceExplorations.byId.exp_1.promoted).toEqual([
      { type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' },
    ]);
  });

  test('a promotion recorded, then a discard, leaves promoted[] intact (no ghost erasure)', async () => {
    seedRecord({ promoted: [] });
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
    });
    explorationsApi.recordPromotion.mockResolvedValueOnce(
      wireExploration({ promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' }] })
    );
    await act(async () => {
      await useStore.getState().recordExplorationPromotion('exp_1', 'model', 'orders_q');
    });
    expect(useStore.getState().workspaceExplorations.byId.exp_1.promoted).toHaveLength(1);

    // The server's document (as this revert's response echoes) still carries
    // the promotion — because it's the SAME document the promotion just
    // wrote, and the two writes are serialized (never overlapping _read()s).
    explorationsApi.updateExploration.mockResolvedValueOnce(
      wireExploration({ promoted: [{ type: 'model', name: 'orders_q', promoted_at: '2026-07-18T00:00:00Z' }] })
    );
    await act(async () => {
      await useStore.getState().discardExploration('exp_1');
    });

    expect(useStore.getState().workspaceExplorations.byId.exp_1.promoted).toHaveLength(1);
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

  test('a row whose save action is not registered on the store fails cleanly (defensive guard)', async () => {
    buildPromoteChecklist.mockResolvedValue([checklistRow()]);
    seedRecord();
    // Simulate store-composition drift: SAVE_ACTION says 'model' -> 'saveModel',
    // but the action itself is missing from the composed store.
    act(() => {
      useStore.setState({ saveModel: undefined });
    });

    let result;
    await act(async () => {
      result = await useStore.getState().promoteExploration('exp_1', [{ type: 'model', name: 'orders_q' }]);
    });

    expect(result.success).toBe(false);
    expect(result.results).toEqual([
      {
        type: 'model',
        name: 'orders_q',
        tier: 'model',
        success: false,
        error: 'No save action registered for type "model"',
      },
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

  // VIS-1072 — flywheel telemetry: exploration_promoted's object_counts
  // (per-type, successes only) + update_vs_new (from the checklist row's
  // OWN status, not re-derived).
  describe('exploration_promoted telemetry (VIS-1072)', () => {
    let events;
    let unsubscribe;

    beforeEach(() => {
      events = [];
      unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
    });
    afterEach(() => unsubscribe());

    test('reports per-type object_counts and update_vs_new for successful rows only', async () => {
      buildPromoteChecklist.mockResolvedValue([
        checklistRow({ status: 'new' }),
        checklistRow({
          type: 'insight',
          tier: 'insight',
          name: 'churn',
          status: 'modified',
          config: { props: { type: 'scatter' } },
        }),
        checklistRow({ type: 'insight', tier: 'insight', name: 'flaky', status: 'new', config: {} }),
      ]);
      seedRecord();
      act(() => {
        useStore.setState({
          saveModel: jest.fn().mockResolvedValue({ success: true }),
          saveInsight: jest
            .fn()
            .mockImplementation(async name =>
              name === 'flaky' ? { success: false, error: 'boom' } : { success: true }
            ),
        });
      });
      explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

      await act(async () => {
        await useStore.getState().promoteExploration('exp_1', [
          { type: 'model', name: 'orders_q' },
          { type: 'insight', name: 'churn' },
          { type: 'insight', name: 'flaky' },
        ]);
      });

      const promoted = events.find(e => e.eventName === 'exploration_promoted');
      expect(promoted.payload.id).toBe('exp_1');
      // 'flaky' failed — excluded from every count.
      expect(promoted.payload.objectCounts).toEqual({ model: 1, insight: 1 });
      expect(promoted.payload.updateVsNew).toEqual({ updated: 1, new: 1 });
    });

    test('does not fire when nothing was actually attempted (empty selection)', async () => {
      buildPromoteChecklist.mockResolvedValue([checklistRow()]);
      seedRecord();
      await act(async () => {
        await useStore.getState().promoteExploration('exp_1', []);
      });
      expect(events.find(e => e.eventName === 'exploration_promoted')).toBeUndefined();
    });
  });

  // P6-D1/D2/D3/D8 closure (e2e-gap-review.md "Phase 6 delta pass"): the
  // promoted-lane freshness signature (ExplorerChartPreview.jsx) must be
  // captured HERE — synchronously, before any save/checklist await — never
  // at data-arrival (the replaced ref mechanism this closes out).
  describe('promoted-lane freshness signature (P6-D1/D2/D3/D8)', () => {
    test('records a frozen freshness signature for a promoted insight, keyed by name', async () => {
      buildPromoteChecklist.mockResolvedValue([
        checklistRow({
          type: 'insight',
          tier: 'insight',
          name: 'churn',
          config: { props: { type: 'scatter' } },
        }),
      ]);
      seedRecord();
      act(() => {
        useStore.setState({
          saveInsight: jest.fn().mockResolvedValue({ success: true }),
          explorerInsightStates: { churn: { type: 'scatter', props: { x: 'a' }, interactions: [] } },
          explorerModelStates: { m: { sql: 'select 1', sourceName: 'src', queryResult: { rows: [] } } },
        });
      });
      explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

      await act(async () => {
        await useStore.getState().promoteExploration('exp_1', [{ type: 'insight', name: 'churn' }]);
      });

      const expectedSig = buildInsightFreshnessSignature(
        { type: 'scatter', props: { x: 'a' }, interactions: [] },
        { m: { sql: 'select 1', sourceName: 'src', queryResult: { rows: [] } } }
      );
      expect(useStore.getState().explorerPromotedSignatures.churn).toBe(expectedSig);
    });

    test('captures the signature BEFORE any save await — a mid-save edit is never absorbed into the recorded signature', async () => {
      buildPromoteChecklist.mockResolvedValue([
        checklistRow({
          type: 'insight',
          tier: 'insight',
          name: 'churn',
          config: { props: { type: 'scatter' } },
        }),
      ]);
      seedRecord();
      act(() => {
        useStore.setState({
          explorerInsightStates: { churn: { type: 'scatter', props: { x: 'pre-edit' }, interactions: [] } },
          explorerModelStates: {},
        });
      });
      const preEditSignature = buildInsightFreshnessSignature(
        { type: 'scatter', props: { x: 'pre-edit' }, interactions: [] },
        {}
      );

      // saveInsight simulates an edit racing the save's own network await —
      // exactly the P6-D3/D8 scenario (an edit between promote-click and the
      // run/save completing).
      act(() => {
        useStore.setState({
          saveInsight: jest.fn(async () => {
            useStore.setState({
              explorerInsightStates: {
                churn: { type: 'scatter', props: { x: 'post-edit' }, interactions: [] },
              },
            });
            return { success: true };
          }),
        });
      });
      explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

      await act(async () => {
        await useStore.getState().promoteExploration('exp_1', [{ type: 'insight', name: 'churn' }]);
      });

      // Sanity: the mid-save edit really did land in the store...
      expect(useStore.getState().explorerInsightStates.churn.props.x).toBe('post-edit');
      // ...but the recorded signature reflects the PRE-edit config, frozen at
      // promote-invoke time, never the post-edit one.
      expect(useStore.getState().explorerPromotedSignatures.churn).toBe(preEditSignature);
    });

    test('never records a signature for a non-insight row (model/chart/metric/dimension)', async () => {
      buildPromoteChecklist.mockResolvedValue([checklistRow()]); // a model row
      seedRecord();
      act(() => useStore.setState({ saveModel: jest.fn().mockResolvedValue({ success: true }) }));
      explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

      await act(async () => {
        await useStore.getState().promoteExploration('exp_1', [{ type: 'model', name: 'orders_q' }]);
      });

      expect(useStore.getState().explorerPromotedSignatures).toEqual({});
    });

    test('never records a signature for an insight row whose save FAILED', async () => {
      buildPromoteChecklist.mockResolvedValue([
        checklistRow({ type: 'insight', tier: 'insight', name: 'bad_insight', config: { props: {} } }),
      ]);
      seedRecord();
      act(() => {
        useStore.setState({
          explorerInsightStates: { bad_insight: { type: 'scatter', props: {}, interactions: [] } },
          saveInsight: jest.fn().mockResolvedValue({ success: false, error: 'server rejected it' }),
        });
      });

      await act(async () => {
        await useStore.getState().promoteExploration('exp_1', [{ type: 'insight', name: 'bad_insight' }]);
      });

      expect(useStore.getState().explorerPromotedSignatures).toEqual({});
    });

    test('re-promoting the same insight OVERWRITES its previously-recorded signature, never accumulates stale entries', async () => {
      buildPromoteChecklist.mockResolvedValue([
        checklistRow({ type: 'insight', tier: 'insight', name: 'churn', config: { props: {} } }),
      ]);
      seedRecord();
      act(() => {
        useStore.setState({
          saveInsight: jest.fn().mockResolvedValue({ success: true }),
          explorerInsightStates: { churn: { type: 'scatter', props: { x: 'v1' }, interactions: [] } },
        });
      });
      explorationsApi.recordPromotion.mockResolvedValue(wireExploration());

      await act(async () => {
        await useStore.getState().promoteExploration('exp_1', [{ type: 'insight', name: 'churn' }]);
      });
      const firstSig = useStore.getState().explorerPromotedSignatures.churn;

      act(() => {
        useStore.setState({
          explorerInsightStates: { churn: { type: 'scatter', props: { x: 'v2' }, interactions: [] } },
        });
      });
      await act(async () => {
        await useStore.getState().promoteExploration('exp_1', [{ type: 'insight', name: 'churn' }]);
      });

      const secondSig = useStore.getState().explorerPromotedSignatures.churn;
      expect(secondSig).not.toBe(firstSig);
      expect(secondSig).toBe(
        buildInsightFreshnessSignature({ type: 'scatter', props: { x: 'v2' }, interactions: [] }, {})
      );
    });
  });
});

// VIS-1072 — flywheel telemetry for createExploration/duplicateExploration/
// discardExploration (promoteExploration's own event is covered above,
// alongside the checklist fixtures it needs).
describe('flywheel telemetry (VIS-1072)', () => {
  let events;
  let unsubscribe;

  beforeEach(() => {
    events = [];
    unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
  });
  afterEach(() => unsubscribe());

  test('createExploration fires exploration_created with the seed type', async () => {
    explorationsApi.createExploration.mockResolvedValueOnce(
      wireExploration({ seeded_from: { type: 'source', name: 'pg' } })
    );
    await act(async () => {
      await useStore.getState().createExploration({ type: 'source', name: 'pg' });
    });
    const created = events.find(e => e.eventName === 'exploration_created');
    expect(created.payload).toEqual({ seededFromType: 'source', hasReturnTo: false });
  });

  test('createExploration with no seed reports seededFromType: null', async () => {
    explorationsApi.createExploration.mockResolvedValueOnce(wireExploration());
    await act(async () => {
      await useStore.getState().createExploration();
    });
    const created = events.find(e => e.eventName === 'exploration_created');
    expect(created.payload.seededFromType).toBeNull();
  });

  test('duplicateExploration fires exploration_branched with the source id', async () => {
    seedRecord();
    explorationsApi.createExploration.mockResolvedValueOnce(wireExploration({ id: 'exp_2' }));
    await act(async () => {
      await useStore.getState().duplicateExploration('exp_1');
    });
    const branched = events.find(e => e.eventName === 'exploration_branched');
    expect(branched.payload).toEqual({ sourceId: 'exp_1' });
  });

  test('discardExploration fires exploration_discarded only on a real revert', async () => {
    seedRecord();
    act(() => {
      useStore.getState().snapshotExplorationForDiscard('exp_1');
    });
    explorationsApi.updateExploration.mockResolvedValueOnce(wireExploration());
    await act(async () => {
      await useStore.getState().discardExploration('exp_1');
    });
    expect(events.find(e => e.eventName === 'exploration_discarded')?.payload).toEqual({ id: 'exp_1' });
  });

  test('discardExploration does NOT fire when there was never a snapshot to revert (no-op path)', async () => {
    seedRecord();
    await act(async () => {
      await useStore.getState().discardExploration('exp_1');
    });
    expect(events.find(e => e.eventName === 'exploration_discarded')).toBeUndefined();
  });
});
