/**
 * useLibraryData behaviour (VIS-769 / Track C C1).
 *
 * Verifies the hook partitions the project's collections into the C-1
 * design's two sections — Layout Items (chart · table · markdown · input ·
 * dashboard) and Data Layer (source · model · dimension · metric · relation ·
 * insight)
 * — with stable ids and model rows carrying a subtype + canonicalType.
 */
import { renderHook, act } from '@testing-library/react';
import useStore from '../../../../stores/store';
import useLibraryData from './useLibraryData';

const resetStore = () => {
  act(() => {
    useStore.setState({
      charts: [],
      tables: [],
      markdowns: [],
      inputs: [],
      dashboards: [],
      sources: [],
      models: [],
      dimensions: [],
      metrics: [],
      relations: [],
      insights: [],
    });
  });
};

describe('useLibraryData', () => {
  beforeEach(() => {
    resetStore();
  });

  test('partitions the store into layoutItems and dataLayer groups', () => {
    const { result } = renderHook(() => useLibraryData());
    expect(Object.keys(result.current.layoutItems).sort()).toEqual([
      'chart',
      'dashboard',
      'input',
      'markdown',
      'table',
    ]);
    expect(Object.keys(result.current.dataLayer).sort()).toEqual([
      'dimension',
      'insight',
      'metric',
      'model',
      'relation',
      'source',
    ]);
  });

  test('maps the four Layout-Item collections into typed rows with stable ids', () => {
    act(() => {
      useStore.setState({
        charts: [{ name: 'waterfall', status: 'published' }],
        tables: [{ name: 'revenue_rows', status: 'new' }],
        markdowns: [{ name: 'notes', status: 'modified' }],
        inputs: [{ name: 'date_range', status: 'published' }],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.layoutItems.chart).toEqual([
      { id: 'chart:waterfall', type: 'chart', name: 'waterfall', status: 'published' },
    ]);
    expect(result.current.layoutItems.table).toEqual([
      { id: 'table:revenue_rows', type: 'table', name: 'revenue_rows', status: 'new' },
    ]);
    expect(result.current.layoutItems.markdown[0].type).toBe('markdown');
    expect(result.current.layoutItems.input[0].type).toBe('input');
  });

  test('maps dashboards into Layout-Item rows with stable ids (VIS-824)', () => {
    act(() => {
      useStore.setState({
        dashboards: [
          { name: 'overview', status: 'published' },
          { name: 'sales', status: 'new' },
        ],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.layoutItems.dashboard).toEqual([
      { id: 'dashboard:overview', type: 'dashboard', name: 'overview', status: 'published' },
      { id: 'dashboard:sales', type: 'dashboard', name: 'sales', status: 'new' },
    ]);
  });

  test('maps the data-layer collections into typed rows', () => {
    act(() => {
      useStore.setState({
        dimensions: [{ name: 'period' }],
        metrics: [{ name: 'revenue' }],
        relations: [{ name: 'customers_orders' }],
        insights: [{ name: 'revenue_growth', status: 'new' }],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.dataLayer.dimension).toEqual([
      { id: 'dimension:period', type: 'dimension', name: 'period', status: null },
    ]);
    expect(result.current.dataLayer.metric[0].type).toBe('metric');
    expect(result.current.dataLayer.relation[0].type).toBe('relation');
    expect(result.current.dataLayer.insight).toEqual([
      { id: 'insight:revenue_growth', type: 'insight', name: 'revenue_growth', status: 'new' },
    ]);
  });

  test('model rows carry a subtype and the canonical type used for routing', () => {
    act(() => {
      useStore.setState({
        models: [{ name: 'monthly_revenue', status: 'published' }],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.dataLayer.model).toHaveLength(1);
    expect(result.current.dataLayer.model.map(m => m.subtype)).toEqual(['sql_model']);
    expect(result.current.dataLayer.model.map(m => m.name)).toEqual(['monthly_revenue']);
    expect(result.current.dataLayer.model.every(m => m.type === 'model')).toBe(true);
    // Rows carry the REAL type for tab opens / edit routing — routing by
    // anything else resolves a null record and drops the rail into create mode.
    expect(result.current.dataLayer.model.map(m => m.canonicalType)).toEqual(['model']);
  });

  test('sources expose the underlying source subtype + status passthrough', () => {
    act(() => {
      useStore.setState({
        sources: [
          { name: 'local-duck', type: 'duckdb', status: 'published' },
          { name: 'pg', type: 'postgresql', status: null },
        ],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.dataLayer.source).toEqual([
      {
        id: 'source:local-duck',
        type: 'source',
        name: 'local-duck',
        subtype: 'duckdb',
        status: 'published',
      },
      { id: 'source:pg', type: 'source', name: 'pg', subtype: 'postgresql', status: null },
    ]);
  });

  test('returns empty arrays for missing collections (no crash)', () => {
    act(() => {
      useStore.setState({
        charts: undefined,
        tables: undefined,
        markdowns: undefined,
        inputs: undefined,
        dashboards: undefined,
        sources: undefined,
        models: undefined,
        dimensions: undefined,
        metrics: undefined,
        relations: undefined,
        insights: undefined,
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.layoutItems.chart).toEqual([]);
    expect(result.current.layoutItems.table).toEqual([]);
    expect(result.current.layoutItems.dashboard).toEqual([]);
    expect(result.current.dataLayer.model).toEqual([]);
    expect(result.current.dataLayer.insight).toEqual([]);
  });
});
