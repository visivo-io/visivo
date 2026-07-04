/**
 * useCanvasRecord (VIS-1001) — resolve a type's record from its store collection.
 */
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import useStore from '../../../stores/store';
import { useCanvasRecord } from './useCanvasRecord';

const seed = state => act(() => useStore.setState(state));

describe('useCanvasRecord', () => {
  test('resolves a record by name and unwraps config (ready)', () => {
    seed({ charts: [{ name: 'rev', config: { x: 'ref-m' } }], fetchCharts: jest.fn() });
    const { result } = renderHook(() => useCanvasRecord('chart', 'rev'));
    expect(result.current.status).toBe('ready');
    expect(result.current.config).toEqual({ name: 'rev', x: 'ref-m' });
  });

  test('records without a nested config are returned flat', () => {
    seed({ tables: [{ name: 't1', data: 'ref-d' }], fetchTables: jest.fn() });
    const { result } = renderHook(() => useCanvasRecord('table', 't1'));
    expect(result.current.config).toEqual({ name: 't1', data: 'ref-d' });
  });

  test('a populated collection with no match is not-found', () => {
    seed({ charts: [{ name: 'other' }], fetchCharts: jest.fn() });
    const { result } = renderHook(() => useCanvasRecord('chart', 'missing'));
    expect(result.current.status).toBe('not-found');
    expect(result.current.config).toBeNull();
  });

  test('an unfetched collection reads as loading (and triggers the fetch)', () => {
    const fetchCharts = jest.fn();
    seed({ charts: undefined, fetchCharts });
    const { result } = renderHook(() => useCanvasRecord('chart', 'rev'));
    expect(result.current.status).toBe('loading');
    expect(fetchCharts).toHaveBeenCalled();
  });

  test('csvScriptModel resolves from its own collection (not models)', () => {
    seed({
      csvScriptModels: [{ name: 'seed', config: { table: 'x' } }],
      fetchCsvScriptModels: jest.fn(),
      models: [],
    });
    const { result } = renderHook(() => useCanvasRecord('csvScriptModel', 'seed'));
    expect(result.current.status).toBe('ready');
    expect(result.current.config).toEqual({ name: 'seed', table: 'x' });
  });

  test('an unknown type is not-found', () => {
    const { result } = renderHook(() => useCanvasRecord('mystery', 'x'));
    expect(result.current.status).toBe('not-found');
  });

  test('an empty fetch result is terminal (not-found) — no refetch loop', () => {
    const fetchCharts = jest.fn(() => useStore.setState({ chartsLoading: true }));
    seed({ charts: [], chartsLoading: false, fetchCharts });
    const { result } = renderHook(() => useCanvasRecord('chart', 'ghost'));

    expect(result.current.status).toBe('loading');
    expect(fetchCharts).toHaveBeenCalledTimes(1);

    // The fetch completes: the slice writes a FRESH empty array (a project
    // with zero charts). The new identity re-runs the effect, which must NOT
    // fetch again, and the status must settle on not-found (not eternal
    // loading).
    seed({ charts: [], chartsLoading: false });

    expect(fetchCharts).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('not-found');

    // Any further identity churn on the empty collection stays quiet too.
    seed({ charts: [] });
    expect(fetchCharts).toHaveBeenCalledTimes(1);
  });
});
