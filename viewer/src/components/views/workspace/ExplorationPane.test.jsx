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
