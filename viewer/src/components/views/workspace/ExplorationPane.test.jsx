/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * ExplorationPane (Explore 2.0 Phase 2) — the MiddlePane branch for an
 * `exploration` document tab. Pins the not-found/loading states and the
 * state-bridge lifecycle (restore-on-activate, flush-on-deactivate, the
 * dirty-dot mirror) documented in `explorationLegacyBridge.js`.
 *
 * `ExplorationWorkbench` (the heavy legacy 3-panel bundle) is mocked — its
 * own composition/init behavior is covered by `ExplorationWorkbench`'s own
 * concerns; this file focuses on the bridge lifecycle.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ExplorationPane from './ExplorationPane';
import useStore from '../../../stores/store';
import { setWorkspaceTelemetryListener } from './telemetry';

jest.mock('./ExplorationWorkbench', () => ({
  __esModule: true,
  default: () => <div data-testid="exploration-workbench-mock" />,
}));

const record = overrides => ({
  id: 'exp_1',
  name: 'Churn dig',
  createdAt: '2026-07-17T18:00:00Z',
  updatedAt: '2026-07-17T18:00:00Z',
  seededFrom: null,
  returnTo: null,
  draft: { queries: [], insights: [], chart: null, computedColumns: [], legacyState: null },
  promoted: [],
  syncStatus: 'synced',
  staleness: null,
  ...overrides,
});

const seed = (extra = {}) => {
  act(() => {
    useStore.setState({
      workspaceExplorations: { byId: {}, order: [] },
      workspaceExplorationsFetched: true,
      restoreExplorerWorkingState: jest.fn(),
      snapshotExplorerWorkingState: jest.fn(() => ({ modelTabs: [] })),
      updateExplorationDraft: jest.fn(),
      flushExplorationSync: jest.fn().mockResolvedValue({ success: true }),
      renameExploration: jest.fn(),
      duplicateExploration: jest.fn().mockResolvedValue({ success: true, id: 'exp_2' }),
      setWorkspaceTabDirty: jest.fn(),
      openWorkspaceTab: jest.fn(),
      ...extra,
    });
  });
};

describe('ExplorationPane — loading / not-found states', () => {
  test('shows a loading state before the exploration list has been fetched', () => {
    seed({ workspaceExplorationsFetched: false });
    render(<ExplorationPane id="exp_1" />);
    expect(screen.getByTestId('workspace-middle-exploration-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('exploration-workbench-mock')).not.toBeInTheDocument();
  });

  test('shows a clean not-found state for an unknown id once the list has loaded', () => {
    seed({ workspaceExplorationsFetched: true });
    render(<ExplorationPane id="exp_ghost" />);
    expect(screen.getByTestId('workspace-middle-exploration-not-found')).toBeInTheDocument();
    expect(screen.getByText(/doesn't exist/i)).toBeInTheDocument();
    expect(screen.queryByTestId('exploration-workbench-mock')).not.toBeInTheDocument();
  });
});

describe('ExplorationPane — ready state', () => {
  test('renders the SubBar name + Duplicate button, and mounts the workbench', () => {
    seed({ workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] } });
    render(<ExplorationPane id="exp_1" />);
    expect(screen.getByTestId('workspace-middle-exploration')).toBeInTheDocument();
    expect(screen.getByText('Churn dig')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-duplicate-button')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-workbench-mock')).toBeInTheDocument();
  });

  test('restores the legacy working state from the record draft on mount', () => {
    const restoreExplorerWorkingState = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      restoreExplorerWorkingState,
    });
    render(<ExplorationPane id="exp_1" />);
    expect(restoreExplorerWorkingState).toHaveBeenCalledTimes(1);
  });

  test('flushes a snapshot on unmount (lossless park)', () => {
    const updateExplorationDraft = jest.fn();
    const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      updateExplorationDraft,
      flushExplorationSync,
    });
    const { unmount } = render(<ExplorationPane id="exp_1" />);
    unmount();
    expect(updateExplorationDraft).toHaveBeenCalledWith('exp_1', expect.any(Object));
    expect(flushExplorationSync).toHaveBeenCalledWith('exp_1');
  });

  // Phase 6c-T5 (ux-audit.md "⚠ conflicts-with-e2e Reload silently discards
  // recent SQL edits (autosave debounce race)" / "Edits made seconds before
  // closing the browser are silently lost"): flush BOTH the live-sync
  // debounce and the backend-persist debounce the instant the page starts
  // to leave — `visibilitychange`→'hidden' is the primary signal (fires
  // reliably before teardown); `pagehide`/`beforeunload` are the fallback
  // net. A real browser close/reload triggers NEITHER a React unmount nor
  // an `id` change, so nothing else in this component would ever catch it.
  describe('flush-on-page-leaving (Phase 6c-T5)', () => {
    const fireDocumentVisibilityHidden = () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };

    afterEach(() => {
      // Restore jsdom's default so later tests in this file (and other
      // files sharing the jsdom document) see a normal 'visible' state.
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    });

    test('document going hidden (tab close / reload / backgrounding) flushes the CURRENT draft immediately', () => {
      const updateExplorationDraft = jest.fn();
      const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
      const snapshotExplorerWorkingState = jest.fn(() => ({ modelTabs: ['query_1'] }));
      seed({
        workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
        updateExplorationDraft,
        flushExplorationSync,
        snapshotExplorerWorkingState,
      });
      render(<ExplorationPane id="exp_1" />);
      // Clear the mount-time calls (restore/snapshot bookkeeping) so the
      // assertion below is unambiguously about the visibilitychange flush.
      updateExplorationDraft.mockClear();
      flushExplorationSync.mockClear();

      fireDocumentVisibilityHidden();

      expect(updateExplorationDraft).toHaveBeenCalledWith('exp_1', expect.any(Object));
      expect(flushExplorationSync).toHaveBeenCalledWith('exp_1');
    });

    test('pagehide also flushes immediately (fallback net alongside visibilitychange)', () => {
      const updateExplorationDraft = jest.fn();
      const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
      seed({
        workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
        updateExplorationDraft,
        flushExplorationSync,
      });
      render(<ExplorationPane id="exp_1" />);
      updateExplorationDraft.mockClear();
      flushExplorationSync.mockClear();

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      expect(updateExplorationDraft).toHaveBeenCalledWith('exp_1', expect.any(Object));
      expect(flushExplorationSync).toHaveBeenCalledWith('exp_1');
    });

    test('beforeunload also flushes immediately', () => {
      const updateExplorationDraft = jest.fn();
      const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
      seed({
        workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
        updateExplorationDraft,
        flushExplorationSync,
      });
      render(<ExplorationPane id="exp_1" />);
      updateExplorationDraft.mockClear();
      flushExplorationSync.mockClear();

      act(() => {
        window.dispatchEvent(new Event('beforeunload'));
      });

      expect(updateExplorationDraft).toHaveBeenCalledWith('exp_1', expect.any(Object));
      expect(flushExplorationSync).toHaveBeenCalledWith('exp_1');
    });

    test('unmounting removes the listeners — no stale flush against a closed pane', () => {
      const updateExplorationDraft = jest.fn();
      const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
      seed({
        workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
        updateExplorationDraft,
        flushExplorationSync,
      });
      const { unmount } = render(<ExplorationPane id="exp_1" />);
      unmount();
      updateExplorationDraft.mockClear();
      flushExplorationSync.mockClear();

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      expect(updateExplorationDraft).not.toHaveBeenCalled();
      expect(flushExplorationSync).not.toHaveBeenCalled();
    });
  });

  test('switching id flushes the OLD exploration and restores the NEW one — two-tab isolation', () => {
    const restoreExplorerWorkingState = jest.fn();
    const updateExplorationDraft = jest.fn();
    const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
    seed({
      workspaceExplorations: {
        byId: { exp_1: record(), exp_2: record({ id: 'exp_2', name: 'Q3 refund spike' }) },
        order: ['exp_1', 'exp_2'],
      },
      restoreExplorerWorkingState,
      updateExplorationDraft,
      flushExplorationSync,
    });
    const { rerender } = render(<ExplorationPane id="exp_1" />);
    expect(restoreExplorerWorkingState).toHaveBeenCalledTimes(1);

    rerender(<ExplorationPane id="exp_2" />);

    // Old id flushed before the new one's restore.
    expect(updateExplorationDraft).toHaveBeenCalledWith('exp_1', expect.any(Object));
    expect(flushExplorationSync).toHaveBeenCalledWith('exp_1');
    expect(restoreExplorerWorkingState).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Q3 refund spike')).toBeInTheDocument();
  });

  test('mirrors syncStatus "saving" onto the tab dirty dot', () => {
    const setWorkspaceTabDirty = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: record({ syncStatus: 'saving' }) }, order: ['exp_1'] },
      setWorkspaceTabDirty,
    });
    render(<ExplorationPane id="exp_1" />);
    expect(setWorkspaceTabDirty).toHaveBeenCalledWith('exploration:exp_1', true);
  });

  test('mirrors syncStatus "synced" as not-dirty', () => {
    const setWorkspaceTabDirty = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: record({ syncStatus: 'synced' }) }, order: ['exp_1'] },
      setWorkspaceTabDirty,
    });
    render(<ExplorationPane id="exp_1" />);
    expect(setWorkspaceTabDirty).toHaveBeenCalledWith('exploration:exp_1', false);
  });
});

// Phase 6c-T5 coverage completion: the live-sync debounce itself (the actual
// "autosave while editing" mechanism this whole track is about) had never
// been exercised past its arm-and-schedule step — every existing test only
// asserted the unmount/deactivate flush, never the timer firing on its own,
// nor the flush-on-page-leaving effect cancelling an already-armed one.
describe('ExplorationPane — live-sync debounce firing (Phase 6c-T5)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('editing (a watched field changing) arms the debounce, which persists the CURRENT snapshot once it fires', () => {
    const updateExplorationDraft = jest.fn();
    const snapshotExplorerWorkingState = jest.fn(() => ({ modelTabs: ['query_1'] }));
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      updateExplorationDraft,
      snapshotExplorerWorkingState,
    });
    render(<ExplorationPane id="exp_1" />);
    updateExplorationDraft.mockClear();

    act(() => {
      useStore.setState({ explorerModelTabs: ['query_1'] });
    });
    expect(updateExplorationDraft).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(updateExplorationDraft).toHaveBeenCalledWith('exp_1', expect.any(Object));
  });

  test('a SECOND edit before the first debounce fires re-arms the timer (only the LATEST snapshot persists)', () => {
    const updateExplorationDraft = jest.fn();
    let snapshotCallCount = 0;
    const snapshotExplorerWorkingState = jest.fn(() => {
      snapshotCallCount += 1;
      return { modelTabs: [`query_${snapshotCallCount}`] };
    });
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      updateExplorationDraft,
      snapshotExplorerWorkingState,
    });
    render(<ExplorationPane id="exp_1" />);
    updateExplorationDraft.mockClear();

    act(() => {
      useStore.setState({ explorerModelTabs: ['query_1'] });
    });
    // Well before the 600ms debounce — a second edit re-arms it rather than
    // letting the first one fire.
    act(() => {
      jest.advanceTimersByTime(300);
    });
    act(() => {
      useStore.setState({ explorerModelTabs: ['query_1', 'query_2'] });
    });
    expect(updateExplorationDraft).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Only ONE persist fired — the re-armed one — not two.
    expect(updateExplorationDraft).toHaveBeenCalledTimes(1);
  });

  test('flush-on-page-leaving cancels an ALREADY-ARMED live-sync timer instead of double-firing', () => {
    const updateExplorationDraft = jest.fn();
    const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      updateExplorationDraft,
      flushExplorationSync,
    });
    render(<ExplorationPane id="exp_1" />);
    updateExplorationDraft.mockClear();
    flushExplorationSync.mockClear();

    // Arm the live-sync timer (an edit just happened) but don't let it fire yet.
    act(() => {
      useStore.setState({ explorerModelTabs: ['query_1'] });
    });
    expect(updateExplorationDraft).not.toHaveBeenCalled();

    // The page starts leaving before the debounce would have fired on its own.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(updateExplorationDraft).toHaveBeenCalledTimes(1);
    expect(flushExplorationSync).toHaveBeenCalledTimes(1);

    // Advancing time past the original debounce window must NOT fire a
    // second, stale persist — the timer was cancelled, not just raced.
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(updateExplorationDraft).toHaveBeenCalledTimes(1);
  });
});

// VIS-1083: a 404'd sync marks the record 'deleted-remotely' — the pane must
// surface the recovery banner (never stay silent) while still rendering the
// workbench underneath (the local draft is not lost).
describe('ExplorationPane — VIS-1083 deleted-remotely banner', () => {
  test('shows the banner when syncStatus is deleted-remotely', () => {
    seed({
      workspaceExplorations: {
        byId: { exp_1: record({ syncStatus: 'deleted-remotely' }) },
        order: ['exp_1'],
      },
    });
    render(<ExplorationPane id="exp_1" />);
    expect(screen.getByTestId('exploration-deleted-remotely-banner')).toBeInTheDocument();
    // The workbench keeps rendering underneath — nothing is lost, just unsaveable.
    expect(screen.getByTestId('exploration-workbench-mock')).toBeInTheDocument();
  });

  test('does NOT show the banner for any other syncStatus', () => {
    seed({
      workspaceExplorations: { byId: { exp_1: record({ syncStatus: 'saving' }) }, order: ['exp_1'] },
    });
    render(<ExplorationPane id="exp_1" />);
    expect(screen.queryByTestId('exploration-deleted-remotely-banner')).not.toBeInTheDocument();
  });
});

// VIS-1070 — resume-time staleness: re-runs ref checks against current
// collections right at activation and offers a non-blocking "re-check"
// banner (never a hard failure — the workbench keeps working regardless).
describe('ExplorationPane — staleness banner (VIS-1070)', () => {
  const withCollections = (extra = {}) => ({
    models: [{ name: 'orders_q' }],
    metrics: [],
    dimensions: [],
    sources: [{ name: 'warehouse' }],
    insights: [],
    charts: [],
    tables: [],
    markdowns: [],
    inputs: [],
    relations: [],
    dashboards: [],
    ...extra,
  });

  test('shows the banner + dangling ref when the draft references a deleted object', () => {
    seed({
      ...withCollections(),
      workspaceExplorations: {
        byId: {
          exp_1: record({
            draft: {
              queries: [],
              insights: [{ name: 'ins', props: { x: '?{${ref(deleted_model).col}}' }, interactions: [] }],
              chart: null,
              computedColumns: [],
              legacyState: null,
            },
          }),
        },
        order: ['exp_1'],
      },
    });
    render(<ExplorationPane id="exp_1" />);
    expect(screen.getByTestId('exploration-staleness-banner')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-staleness-banner')).toHaveTextContent('deleted_model');
  });

  test('does NOT show the banner for a draft with no dangling refs', () => {
    seed({
      ...withCollections(),
      workspaceExplorations: {
        byId: {
          exp_1: record({
            draft: {
              queries: [{ name: 'orders_q', sql: 'SELECT 1', source: 'warehouse' }],
              insights: [{ name: 'ins', props: { x: '?{${ref(orders_q).col}}' }, interactions: [] }],
              chart: null,
              computedColumns: [],
              legacyState: null,
            },
          }),
        },
        order: ['exp_1'],
      },
    });
    render(<ExplorationPane id="exp_1" />);
    expect(screen.queryByTestId('exploration-staleness-banner')).not.toBeInTheDocument();
  });

  test('Dismiss hides the banner without touching the exploration draft', () => {
    seed({
      ...withCollections(),
      workspaceExplorations: {
        byId: {
          exp_1: record({
            draft: {
              queries: [],
              insights: [{ name: 'ins', props: { x: '?{${ref(gone).col}}' }, interactions: [] }],
              chart: null,
              computedColumns: [],
              legacyState: null,
            },
          }),
        },
        order: ['exp_1'],
      },
    });
    render(<ExplorationPane id="exp_1" />);
    expect(screen.getByTestId('exploration-staleness-banner')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('exploration-staleness-dismiss'));
    expect(screen.queryByTestId('exploration-staleness-banner')).not.toBeInTheDocument();
  });

  test('"Re-check references" re-runs the check and clears the banner once the ref resolves again', () => {
    seed({
      ...withCollections(),
      workspaceExplorations: {
        byId: {
          exp_1: record({
            draft: {
              queries: [],
              insights: [{ name: 'ins', props: { x: '?{${ref(orders_q).col}}' }, interactions: [] }],
              chart: null,
              computedColumns: [],
              legacyState: null,
            },
          }),
        },
        order: ['exp_1'],
      },
      // Simulate the ref being dangling AT RESUME TIME by starting `models`
      // without `orders_q`, then "publishing" it before Re-check.
      models: [],
    });
    render(<ExplorationPane id="exp_1" />);
    expect(screen.getByTestId('exploration-staleness-banner')).toBeInTheDocument();

    act(() => {
      useStore.setState({ models: [{ name: 'orders_q' }] });
    });
    fireEvent.click(screen.getByTestId('exploration-staleness-recheck'));

    expect(screen.queryByTestId('exploration-staleness-banner')).not.toBeInTheDocument();
  });

  test('switching to a DIFFERENT exploration gets its own fresh check, never carries over a dismissal', () => {
    seed({
      ...withCollections(),
      workspaceExplorations: {
        byId: {
          exp_1: record({
            draft: {
              queries: [],
              insights: [{ name: 'a', props: { x: '?{${ref(gone_1).col}}' }, interactions: [] }],
              chart: null,
              computedColumns: [],
              legacyState: null,
            },
          }),
          exp_2: record({
            id: 'exp_2',
            name: 'Second',
            draft: {
              queries: [],
              insights: [{ name: 'b', props: { x: '?{${ref(gone_2).col}}' }, interactions: [] }],
              chart: null,
              computedColumns: [],
              legacyState: null,
            },
          }),
        },
        order: ['exp_1', 'exp_2'],
      },
    });
    const { rerender } = render(<ExplorationPane id="exp_1" />);
    fireEvent.click(screen.getByTestId('exploration-staleness-dismiss'));
    expect(screen.queryByTestId('exploration-staleness-banner')).not.toBeInTheDocument();

    rerender(<ExplorationPane id="exp_2" />);
    expect(screen.getByTestId('exploration-staleness-banner')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-staleness-banner')).toHaveTextContent('gone_2');
  });
});

describe('ExplorationPane — rename', () => {
  test('the pencil opens an inline input; committing calls renameExploration', () => {
    const renameExploration = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      renameExploration,
    });
    render(<ExplorationPane id="exp_1" />);

    fireEvent.click(screen.getByTestId('exploration-rename-start'));
    const input = screen.getByTestId('exploration-rename-input');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(renameExploration).toHaveBeenCalledWith('exp_1', 'Renamed');
  });

  test('Escape cancels without calling renameExploration', () => {
    const renameExploration = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      renameExploration,
    });
    render(<ExplorationPane id="exp_1" />);

    fireEvent.click(screen.getByTestId('exploration-rename-start'));
    const input = screen.getByTestId('exploration-rename-input');
    fireEvent.change(input, { target: { value: 'Should not save' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(renameExploration).not.toHaveBeenCalled();
    expect(screen.getByText('Churn dig')).toBeInTheDocument();
  });
});

describe('ExplorationPane — duplicate', () => {
  test('flushes, duplicates, and opens the new exploration tab', async () => {
    const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
    const duplicateExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_2' });
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      flushExplorationSync,
      duplicateExploration,
      openWorkspaceTab,
    });
    render(<ExplorationPane id="exp_1" />);

    fireEvent.click(screen.getByTestId('exploration-duplicate-button'));
    await waitFor(() => expect(openWorkspaceTab).toHaveBeenCalled());

    expect(flushExplorationSync).toHaveBeenCalledWith('exp_1');
    expect(duplicateExploration).toHaveBeenCalledWith('exp_1');
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'exploration:exp_2',
      type: 'exploration',
      name: 'exp_2',
    });
  });

  test('a failed duplicate never opens a tab', async () => {
    const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
    const duplicateExploration = jest.fn().mockResolvedValue({ success: false, error: 'boom' });
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      flushExplorationSync,
      duplicateExploration,
      openWorkspaceTab,
    });
    render(<ExplorationPane id="exp_1" />);

    fireEvent.click(screen.getByTestId('exploration-duplicate-button'));
    await waitFor(() => expect(duplicateExploration).toHaveBeenCalled());

    expect(openWorkspaceTab).not.toHaveBeenCalled();
  });

  // VIS-1086: double-clicking Duplicate must never fire two duplicate
  // round-trips.
  test('double-clicking Duplicate only calls duplicateExploration once', async () => {
    let resolveDuplicate;
    const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
    const duplicateExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveDuplicate = resolve;
        })
    );
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] },
      flushExplorationSync,
      duplicateExploration,
      openWorkspaceTab,
    });
    render(<ExplorationPane id="exp_1" />);

    const button = screen.getByTestId('exploration-duplicate-button');
    fireEvent.click(button);
    fireEvent.click(button); // fires before the first call resolves

    await waitFor(() => expect(duplicateExploration).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();

    await act(async () => {
      resolveDuplicate({ success: true, id: 'exp_2' });
    });
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(openWorkspaceTab).toHaveBeenCalledTimes(1);
  });

  test('the duplicate in-flight guard resets when the exploration id changes (switching tabs)', async () => {
    let resolveDuplicate;
    const flushExplorationSync = jest.fn().mockResolvedValue({ success: true });
    const duplicateExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveDuplicate = resolve;
        })
    );
    seed({
      workspaceExplorations: {
        byId: { exp_1: record(), exp_2: record({ id: 'exp_2', name: 'Q3 refund spike' }) },
        order: ['exp_1', 'exp_2'],
      },
      flushExplorationSync,
      duplicateExploration,
    });
    const { rerender } = render(<ExplorationPane id="exp_1" />);

    fireEvent.click(screen.getByTestId('exploration-duplicate-button'));
    expect(screen.getByTestId('exploration-duplicate-button')).toBeDisabled();
    // Let the handler's own awaited flushExplorationSync() microtask resolve
    // so duplicateExploration (and its deferred promise) has actually fired
    // before we switch tabs below.
    await waitFor(() => expect(duplicateExploration).toHaveBeenCalledTimes(1));

    // Switch to a DIFFERENT exploration WITHOUT the first duplicate ever
    // resolving — its own Duplicate button must not be stuck disabled.
    rerender(<ExplorationPane id="exp_2" />);
    expect(screen.getByTestId('exploration-duplicate-button')).not.toBeDisabled();

    await act(async () => {
      resolveDuplicate({ success: true, id: 'exp_3' });
    });
  });
});

// VIS-1072 — flywheel telemetry.
describe('ExplorationPane — exploration_opened telemetry (VIS-1072)', () => {
  let events;
  let unsubscribe;

  beforeEach(() => {
    events = [];
    unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
  });
  afterEach(() => unsubscribe());

  test('fires exploration_opened on activation', () => {
    seed({ workspaceExplorations: { byId: { exp_1: record() }, order: ['exp_1'] } });
    render(<ExplorationPane id="exp_1" />);
    expect(events.find(e => e.eventName === 'exploration_opened')?.payload).toEqual({ id: 'exp_1' });
  });

  test('fires again for a DIFFERENT exploration when switching tabs', () => {
    seed({
      workspaceExplorations: {
        byId: { exp_1: record(), exp_2: record({ id: 'exp_2', name: 'Second' }) },
        order: ['exp_1', 'exp_2'],
      },
    });
    const { rerender } = render(<ExplorationPane id="exp_1" />);
    rerender(<ExplorationPane id="exp_2" />);
    const opened = events.filter(e => e.eventName === 'exploration_opened');
    expect(opened.map(e => e.payload.id)).toEqual(['exp_1', 'exp_2']);
  });
});
