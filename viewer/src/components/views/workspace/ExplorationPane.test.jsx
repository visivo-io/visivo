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
});
