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
    csvScriptModels: [],
    localMergeModels: [],
    ...state,
  };
  useStore.mockImplementation(selector => selector(fullState));
}

const edgeTargetsFor = (edges, dashboardId) =>
  edges.filter(e => e.target === dashboardId).map(e => e.source);

describe('useLineageDag — dashboard recurses into nested Item.rows (VIS-826)', () => {
  afterEach(() => jest.clearAllMocks());

  it('builds dashboard edges for charts/tables nested inside container item.rows', () => {
    mockStoreState({
      charts: [
        { name: 'top-chart' },
        { name: 'nested-chart' },
        { name: 'deep-chart' },
      ],
      tables: [{ name: 'nested-table' }],
      dashboards: [
        {
          name: 'dash',
          config: {
            rows: [
              {
                items: [
                  // Top-level leaf
                  { chart: '${ref(top-chart)}' },
                  // Container item with nested rows
                  {
                    rows: [
                      {
                        items: [
                          { chart: '${ref(nested-chart)}' },
                          { table: '${ref(nested-table)}' },
                          // A deeper container nested one more level
                          {
                            rows: [
                              {
                                items: [{ chart: '${ref(deep-chart)}' }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    const { result } = renderHook(() => useLineageDag());
    const { edges } = result.current;

    const dashboardId = 'dashboard-dash';
    const sources = edgeTargetsFor(edges, dashboardId);

    // Every nested member must feed the dashboard — not just the top-level one.
    expect(sources).toEqual(
      expect.arrayContaining([
        'chart-top-chart',
        'chart-nested-chart',
        'table-nested-table',
        'chart-deep-chart',
      ])
    );
    // Fan-out is real: more than the single top-level chart.
    expect(sources.length).toBeGreaterThan(1);
  });

  it('handles inline-object item refs (.name) at nested depth', () => {
    mockStoreState({
      charts: [{ name: 'inline-nested-chart' }],
      dashboards: [
        {
          name: 'dash2',
          config: {
            rows: [
              {
                items: [
                  {
                    rows: [
                      {
                        items: [{ chart: { name: 'inline-nested-chart' } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    const { result } = renderHook(() => useLineageDag());
    const sources = edgeTargetsFor(result.current.edges, 'dashboard-dash2');
    expect(sources).toContain('chart-inline-nested-chart');
  });
});
