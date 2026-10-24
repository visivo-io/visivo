/**
 * useExplorerWorkbenchInit — the Explore 2.0 workbench's init effects.
 *
 * `explorerSources` is derived from the Library's `sources` list, so drafts
 * (saved, not committed) are selectable in the Explorer (VIS-1550).
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import useStore from '../../stores/store';
import useExplorerWorkbenchInit from './useExplorerWorkbenchInit';

const librarySource = (name, status = 'published', type = 'duckdb') => ({
  name,
  status,
  config: { name, type },
});

const resetStore = () => {
  useStore.setState({
    sources: [],
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

  test('lists draft sources next to committed ones, and leaves out deleted ones', async () => {
    useStore.setState({
      sources: [
        librarySource('warehouse'),
        librarySource('draft_db', 'new'),
        librarySource('gone', 'deleted'),
      ],
    });

    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() =>
      expect(useStore.getState().explorerSources).toEqual([
        { source_name: 'warehouse', source_type: 'duckdb' },
        { source_name: 'draft_db', source_type: 'duckdb' },
      ])
    );
  });

  test('a source saved after the workbench mounted becomes selectable', async () => {
    useStore.setState({ sources: [librarySource('warehouse')] });
    renderHook(() => useExplorerWorkbenchInit());
    await waitFor(() => expect(useStore.getState().explorerSources).toHaveLength(1));

    act(() => {
      useStore.setState({ sources: [librarySource('warehouse'), librarySource('draft_db', 'new')] });
    });

    await waitFor(() =>
      expect(useStore.getState().explorerSources.map(s => s.source_name)).toEqual([
        'warehouse',
        'draft_db',
      ])
    );
  });

  test('an identical source list does not replace explorerSources', async () => {
    useStore.setState({ sources: [librarySource('warehouse')] });
    renderHook(() => useExplorerWorkbenchInit());
    await waitFor(() => expect(useStore.getState().explorerSources).toHaveLength(1));
    const first = useStore.getState().explorerSources;

    act(() => {
      useStore.setState({ sources: [librarySource('warehouse')] });
    });

    expect(useStore.getState().explorerSources).toBe(first);
  });

  test('once sources arrive, auto-creates a model tab', async () => {
    const createModelTab = jest.fn();
    useStore.setState({ createModelTab, sources: [librarySource('local-duckdb')] });

    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() => expect(useStore.getState().explorerSources).toHaveLength(1));
    await waitFor(() => expect(createModelTab).toHaveBeenCalledTimes(1));
  });

  test('does not create a model tab if one already exists, even once sources arrive', async () => {
    const createModelTab = jest.fn();
    useStore.setState({
      createModelTab,
      explorerModelTabs: ['existing_q'],
      sources: [librarySource('local-duckdb')],
    });

    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() => expect(useStore.getState().explorerSources).toHaveLength(1));
    expect(createModelTab).not.toHaveBeenCalled();
  });

  // VIS-1228: StrictMode double-invokes the layout effect's setup; it must
  // still create only one tab.
  test('does not double-create a model tab under StrictMode when sources are present at mount', async () => {
    const createModelTab = jest.fn(() => 'model');
    useStore.setState({
      createModelTab,
      sources: [librarySource('local-duckdb')],
      explorerSources: [{ source_name: 'local-duckdb', source_type: 'duckdb' }],
    });

    renderHook(() => useExplorerWorkbenchInit(), { wrapper: React.StrictMode });

    await waitFor(() => expect(createModelTab).toHaveBeenCalled());
    expect(createModelTab).toHaveBeenCalledTimes(1);
  });
});

// VIS-1550: "Explore" from the Semantic Layer seeds a query tab before the
// Explorer has loaded `defaults`, so a model with no `source:` got none.
describe('useExplorerWorkbenchInit — unset sources resolve once defaults load', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  const seed = modelStates =>
    useStore.setState({
      explorerModelTabs: Object.keys(modelStates),
      explorerModelStates: modelStates,
      sources: [librarySource('first'), librarySource('second')],
    });

  test('a seeded tab with no source gets the project default once defaults arrive', async () => {
    const applyResolvedDefaultSource = jest.fn();
    useStore.setState({ applyResolvedDefaultSource });
    seed({ query_1: { sourceName: null, sql: 'select 1' } });

    renderHook(() => useExplorerWorkbenchInit());
    expect(applyResolvedDefaultSource).not.toHaveBeenCalled();

    act(() => {
      useStore.setState({ defaults: { source_name: 'second' } });
    });

    await waitFor(() =>
      expect(applyResolvedDefaultSource).toHaveBeenCalledWith('query_1', 'second')
    );
  });

  test('with no project default it falls back to the first source, like a new tab', async () => {
    const applyResolvedDefaultSource = jest.fn();
    useStore.setState({ applyResolvedDefaultSource, defaults: {} });
    seed({ query_1: { sourceName: null } });

    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() =>
      expect(applyResolvedDefaultSource).toHaveBeenCalledWith('query_1', 'first')
    );
  });

  test('tabs that already have a source, or whose source the user cleared, are left alone', async () => {
    const applyResolvedDefaultSource = jest.fn();
    useStore.setState({ applyResolvedDefaultSource, defaults: { source_name: 'second' } });
    seed({
      bound: { sourceName: 'first' },
      cleared: { sourceName: null, sourceEdited: true },
    });

    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() => expect(useStore.getState().explorerSources).toHaveLength(2));
    expect(applyResolvedDefaultSource).not.toHaveBeenCalled();
  });

  test('nothing to resolve to means nothing is applied', async () => {
    const applyResolvedDefaultSource = jest.fn();
    useStore.setState({ applyResolvedDefaultSource, defaults: {} });
    useStore.setState({
      explorerModelTabs: ['query_1'],
      explorerModelStates: { query_1: { sourceName: null } },
    });

    renderHook(() => useExplorerWorkbenchInit());

    expect(applyResolvedDefaultSource).not.toHaveBeenCalled();
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
    const createModelTab = jest.fn(() => 'model');
    const applyResolvedDefaultSource = jest.fn();
    useStore.setState({
      createModelTab,
      applyResolvedDefaultSource,
      defaults: null,
      sources: [librarySource('local-duckdb')],
    });

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
    const createModelTab = jest.fn(() => 'model');
    const applyResolvedDefaultSource = jest.fn();
    useStore.setState({
      createModelTab,
      applyResolvedDefaultSource,
      defaults: { source_name: 'already-correct' },
      sources: [librarySource('local-duckdb')],
    });

    renderHook(() => useExplorerWorkbenchInit());

    await waitFor(() => expect(createModelTab).toHaveBeenCalledTimes(1));
    // createModelTab itself already resolved the right source at creation
    // time (defaults were present) — no rebind is ever needed or fired.
    expect(applyResolvedDefaultSource).not.toHaveBeenCalled();
  });
});
