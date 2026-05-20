/**
 * useLibraryData behaviour (VIS-769 / Track C C1).
 *
 * Verifies the hook partitions the project's collections into the five
 * sections (Insert · Charts · Insights · Models · Sources) the Library
 * design expects, with stable ids and `Models` being the union of
 * sql_model + csv_script_model + local_merge_model.
 */
import { renderHook, act } from '@testing-library/react';
import useStore from '../../../../stores/store';
import useLibraryData from './useLibraryData';

const resetStore = () => {
  act(() => {
    useStore.setState({
      charts: [],
      insights: [],
      models: [],
      csvScriptModels: [],
      localMergeModels: [],
      sources: [],
    });
  });
};

describe('useLibraryData', () => {
  beforeEach(() => {
    resetStore();
  });

  test('always exposes the four built-in Insert primitives', () => {
    const { result } = renderHook(() => useLibraryData());
    const ids = result.current.insert.map((r) => r.id);
    expect(ids).toEqual([
      'insert:dashboard',
      'insert:row',
      'insert:item',
      'insert:markdown',
    ]);
    result.current.insert.forEach((r) => {
      expect(r.type).toBe('insert');
      expect(r.subtype).toBeTruthy();
    });
  });

  test('maps charts and insights into rows with stable ids', () => {
    act(() => {
      useStore.setState({
        charts: [{ name: 'waterfall', status: 'published' }],
        insights: [{ name: 'revenue_growth', status: 'new' }],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.charts).toEqual([
      { id: 'chart:waterfall', type: 'chart', name: 'waterfall', status: 'published' },
    ]);
    expect(result.current.insights).toEqual([
      { id: 'insight:revenue_growth', type: 'insight', name: 'revenue_growth', status: 'new' },
    ]);
  });

  test('models row is the union of sql / csv-script / local-merge models', () => {
    act(() => {
      useStore.setState({
        models: [{ name: 'monthly_revenue', status: 'published' }],
        csvScriptModels: [{ name: 'fibonacci_seed', status: 'new' }],
        localMergeModels: [{ name: 'daily_join', status: 'modified' }],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.models).toHaveLength(3);
    expect(result.current.models.map((m) => m.subtype)).toEqual([
      'sql_model',
      'csv_script_model',
      'local_merge_model',
    ]);
    expect(result.current.models.map((m) => m.name)).toEqual([
      'monthly_revenue',
      'fibonacci_seed',
      'daily_join',
    ]);
  });

  test('sources expose the underlying source subtype', () => {
    act(() => {
      useStore.setState({
        sources: [
          { name: 'local-duck', type: 'duckdb', status: 'published' },
          { name: 'pg', type: 'postgresql', status: null },
        ],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.sources).toEqual([
      {
        id: 'source:local-duck',
        type: 'source',
        name: 'local-duck',
        subtype: 'duckdb',
        status: 'published',
      },
      {
        id: 'source:pg',
        type: 'source',
        name: 'pg',
        subtype: 'postgresql',
        status: null,
      },
    ]);
  });

  test('returns empty arrays for missing collections (no crash)', () => {
    act(() => {
      useStore.setState({
        charts: undefined,
        insights: undefined,
        models: undefined,
        csvScriptModels: undefined,
        localMergeModels: undefined,
        sources: undefined,
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.charts).toEqual([]);
    expect(result.current.insights).toEqual([]);
    expect(result.current.models).toEqual([]);
    expect(result.current.sources).toEqual([]);
  });
});
