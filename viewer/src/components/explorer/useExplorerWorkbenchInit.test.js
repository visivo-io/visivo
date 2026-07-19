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
import { act, renderHook, waitFor } from '@testing-library/react';
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
    defaults: null,
    createModelTab: jest.fn(),
    createInsight: jest.fn(),
    fetchDefaults: jest.fn(),
    fetchExplorerDiff: jest.fn(),
    setExplorerSources: sources => useStore.setState({ explorerSources: sources }),
    applyResolvedDefaultSource: jest.fn(),
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

// VIS-1082 — cold-session default-source race: sources can arrive (unblocking
// the auto-create-model-tab effect above) before `defaults` does, since
// `fetchDefaults()` is a separate, unordered effect. The auto-created tab
// must get rebound to the real project default once it lands, rather than
// silently keeping whatever "first available source" guess `createModelTab`
// made at creation time.
describe('useExplorerWorkbenchInit — VIS-1082 default-source rebind', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  test('rebinds the auto-created tab once defaults arrive AFTER it was created', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'local-duckdb' }]);
    const createModelTab = jest.fn(() => 'model');
    const applyResolvedDefaultSource = jest.fn();
    useStore.setState({ createModelTab, applyResolvedDefaultSource, defaults: null });

    renderHook(() => useExplorerWorkbenchInit());

    // Sources land; defaults still haven't — the tab is auto-created with
    // `defaults` still null at that moment.
    await waitFor(() => expect(createModelTab).toHaveBeenCalledTimes(1));
    expect(applyResolvedDefaultSource).not.toHaveBeenCalled();

    // Defaults land afterward — the pending tab must be rebound.
    act(() => {
      useStore.setState({ defaults: { source_name: 'the-real-default' } });
    });

    await waitFor(() =>
      expect(applyResolvedDefaultSource).toHaveBeenCalledWith('model', 'the-real-default')
    );
  });

  test('does NOT rebind when defaults had already arrived before the tab was created', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'local-duckdb' }]);
    const createModelTab = jest.fn(() => 'model');
    const applyResolvedDefaultSource = jest.fn();
    useStore.setState({
      createModelTab,
      applyResolvedDefaultSource,
      defaults: { source_name: 'already-correct' },
    });

    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() => expect(createModelTab).toHaveBeenCalledTimes(1));
    // createModelTab itself already resolved the right source at creation
    // time (defaults were present) — no rebind is ever needed or fired.
    expect(applyResolvedDefaultSource).not.toHaveBeenCalled();
  });
});
