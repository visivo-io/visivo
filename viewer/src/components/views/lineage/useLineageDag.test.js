/* eslint-disable no-template-curly-in-string */
import { renderHook } from '@testing-library/react';
import useStore from '../../../stores/store';
import { useLineageDag } from './useLineageDag';

// Mock the store so we can drive each selector with controlled state.
jest.mock('../../../stores/store');

// Mock dagre's layout so the hook doesn't need a real DOM/graph engine — we
// only care about the nodes/edges the hook produces, not their positions.
jest.mock('dagre', () => ({
  graphlib: {
    Graph: class {
      setGraph() {}
      setDefaultEdgeLabel() {}
      setNode() {}
      setEdge() {}
      node() {
        return { x: 0, y: 0, width: 180, height: 50 };
      }
    },
  },
  layout: jest.fn(),
}));

/**
 * Build a fake store state and wire useStore (mocked) to resolve each selector
 * against it. The hook calls `useStore(state => state.X)` for every slice.
 */
function mockStoreState(state) {
  const fullState = {
    sources: [],
    models: [],
    dimensions: [],
    metrics: [],
    relations: [],
    insights: [],
    markdowns: [],
    charts: [],
    tables: [],
    dashboards: [],
    defaults: {},
    inputs: [],
    ...state,
  };
  useStore.mockImplementation(selector => selector(fullState));
}

const edgeTargetsFor = (edges, dashboardId) =>
  edges.filter(e => e.target === dashboardId).map(e => e.source);

describe('useLineageDag — dashboard edges come from child_item_names', () => {
  afterEach(() => jest.clearAllMocks());

  // The hook used to re-derive a dashboard's members by walking `config.rows`.
  // That could not see a TEMPLATE dashboard, whose members live in
  // `data-visivo-item` slots in HTML, so one drew as an isolated node. Every
  // other type here already reads `child_item_names`; dashboards now do too,
  // and the backend owns the walk (including the VIS-826 nesting, pinned in
  // tests/server/test_object_manager_child_items.py).

  it('builds an edge per child, whatever the layout nested them in', () => {
    mockStoreState({
      charts: [{ name: 'top-chart' }, { name: 'nested-chart' }, { name: 'deep-chart' }],
      tables: [{ name: 'nested-table' }],
      dashboards: [
        {
          name: 'dash',
          child_item_names: ['top-chart', 'nested-chart', 'nested-table', 'deep-chart'],
          config: { rows: [] },
        },
      ],
    });

    const sources = edgeTargetsFor(renderHook(() => useLineageDag()).result.current.edges, 'dashboard-dash');

    expect(sources).toEqual(
      expect.arrayContaining([
        'chart-top-chart',
        'chart-nested-chart',
        'table-nested-table',
        'chart-deep-chart',
      ])
    );
  });

  it('wires a template dashboard, which has no rows at all', () => {
    // The bug this change fixes: the dashboard drew with no edges.
    mockStoreState({
      charts: [{ name: 'revenue' }],
      tables: [{ name: 'orders' }],
      dashboards: [
        {
          name: 'tpl',
          child_item_names: ['revenue', 'orders'],
          config: {
            template: '<div data-visivo-item="revenue"></div><div data-visivo-item="orders"></div>',
          },
        },
      ],
    });

    const sources = edgeTargetsFor(renderHook(() => useLineageDag()).result.current.edges, 'dashboard-tpl');

    expect(sources).toEqual(expect.arrayContaining(['chart-revenue', 'table-orders']));
  });

  it('dedupes a child placed more than once', () => {
    mockStoreState({
      charts: [{ name: 'c' }],
      dashboards: [{ name: 'd', child_item_names: ['c', 'c'], config: {} }],
    });

    const sources = edgeTargetsFor(renderHook(() => useLineageDag()).result.current.edges, 'dashboard-d');

    expect(sources).toEqual(['chart-c']);
  });

  it('skips a child that is not an object in the project', () => {
    // A slot naming something that does not exist is valid config that fails
    // at compile — the graph draws what it can rather than inventing a node.
    mockStoreState({
      charts: [{ name: 'real' }],
      dashboards: [{ name: 'd', child_item_names: ['real', 'ghost'], config: {} }],
    });

    const sources = edgeTargetsFor(renderHook(() => useLineageDag()).result.current.edges, 'dashboard-d');

    expect(sources).toEqual(['chart-real']);
  });

  it('a dashboard with no children has no edges', () => {
    mockStoreState({ dashboards: [{ name: 'empty', config: {} }] });

    expect(edgeTargetsFor(renderHook(() => useLineageDag()).result.current.edges, 'dashboard-empty')).toEqual([]);
  });
});


describe('useLineageDag — soft-deleted objects (VIS-1234)', () => {
  test('a deleted object is not a node', () => {
    mockStoreState({
      sources: [{ name: 'db' }],
      models: [
        { name: 'orders', source: '${ref(db)}' },
        { name: 'gone', source: '${ref(db)}', status: 'deleted' },
      ],
    });

    const { result } = renderHook(() => useLineageDag());
    const names = result.current.nodes.map(n => n.data.name);

    expect(names).toContain('orders');
    expect(names).not.toContain('gone');
  });

  test('edges into and out of a deleted object go with it', () => {
    // A tombstoned node left its edges behind, so the graph drew arrows into
    // something that was no longer drawn.
    mockStoreState({
      sources: [{ name: 'db' }],
      models: [{ name: 'gone', source: '${ref(db)}', status: 'deleted' }],
      insights: [{ name: 'chart_feed', model: '${ref(gone)}' }],
    });

    const { result } = renderHook(() => useLineageDag());
    const touchesGone = result.current.edges.filter(
      e => `${e.source} ${e.target}`.includes('gone')
    );

    expect(touchesGone).toEqual([]);
  });

  test('every collection is filtered, not just models', () => {
    mockStoreState({
      sources: [{ name: 'live_source' }, { name: 'dead_source', status: 'deleted' }],
      models: [{ name: 'dead_model', status: 'deleted' }],
      insights: [{ name: 'dead_insight', status: 'deleted' }],
      charts: [{ name: 'dead_chart', status: 'deleted' }],
      tables: [{ name: 'dead_table', status: 'deleted' }],
      markdowns: [{ name: 'dead_markdown', status: 'deleted' }],
      inputs: [{ name: 'dead_input', status: 'deleted' }],
      dashboards: [{ name: 'dead_dashboard', status: 'deleted' }],
      dimensions: [{ name: 'dead_dimension', status: 'deleted' }],
      metrics: [{ name: 'dead_metric', status: 'deleted' }],
      relations: [{ name: 'dead_relation', status: 'deleted' }],
    });

    const { result } = renderHook(() => useLineageDag());
    const names = result.current.nodes.map(n => n.data.name);

    expect(names).toEqual(['live_source']);
  });
});
