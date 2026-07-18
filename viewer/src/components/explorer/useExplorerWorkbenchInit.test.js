/**
 * useExplorerWorkbenchInit — Phase 3a regression coverage (VIS-1053).
 *
 * `explorerSources` used to be populated only as a side effect of
 * `ExplorerLeftPanel`'s nested `SourceBrowser` mounting. Phase 3a's DnD
 * unification removed `ExplorerLeftPanel` from `ExplorationWorkbench`
 * entirely, which silently starved `explorerSources` to `[]` forever in the
 * new surface — no query ever auto-created (the auto-create-model-tab effect
 * gates on `explorerSources.length > 0`), and every e2e test that created a
 * fresh exploration timed out waiting for `explorerActiveModelName`. This
 * hook now fetches sources itself so both hosts get them regardless of
 * whether a browse-panel component is mounted.
 */
import { renderHook, waitFor } from '@testing-library/react';
import useStore from '../../stores/store';
import useExplorerWorkbenchInit from './useExplorerWorkbenchInit';
import { fetchSourceSchemaJobs } from '../../api/sourceSchemaJobs';

jest.mock('../../api/sourceSchemaJobs', () => ({
  fetchSourceSchemaJobs: jest.fn(),
}));

const resetStore = () => {
  useStore.setState({
    explorerModelTabs: [],
    explorerModelStates: {},
    explorerSources: [],
    explorerChartInsightNames: [],
    explorerInsightStates: {},
    explorerChartName: null,
    explorerChartLayout: {},
    createModelTab: jest.fn(),
    createInsight: jest.fn(),
    fetchDefaults: jest.fn(),
    fetchExplorerDiff: jest.fn(),
    setExplorerSources: sources => useStore.setState({ explorerSources: sources }),
  });
};

describe('useExplorerWorkbenchInit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  test('fetches explorerSources on mount when empty', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'local-duckdb' }]);
    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() => expect(fetchSourceSchemaJobs).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(useStore.getState().explorerSources).toEqual([{ source_name: 'local-duckdb' }])
    );
  });

  test('does NOT re-fetch when explorerSources is already populated', () => {
    useStore.setState({ explorerSources: [{ source_name: 'already-loaded' }] });
    renderHook(() => useExplorerWorkbenchInit());
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();
  });

  test('a fetch failure is swallowed (best-effort, mirrors SourceBrowser)', async () => {
    fetchSourceSchemaJobs.mockRejectedValue(new Error('boom'));
    expect(() => renderHook(() => useExplorerWorkbenchInit())).not.toThrow();
    await waitFor(() => expect(fetchSourceSchemaJobs).toHaveBeenCalled());
  });

  // The actual regression: sources arriving must unblock the pre-existing
  // auto-create-model-tab effect.
  test('once sources arrive, auto-creates a model tab (the fixed end-to-end path)', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'local-duckdb' }]);
    const createModelTab = jest.fn();
    useStore.setState({ createModelTab });

    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() => expect(useStore.getState().explorerSources).toHaveLength(1));
    await waitFor(() => expect(createModelTab).toHaveBeenCalledTimes(1));
  });

  test('does not create a model tab if one already exists, even once sources arrive', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'local-duckdb' }]);
    const createModelTab = jest.fn();
    useStore.setState({ createModelTab, explorerModelTabs: ['existing_q'] });

    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() => expect(useStore.getState().explorerSources).toHaveLength(1));
    expect(createModelTab).not.toHaveBeenCalled();
  });
});
