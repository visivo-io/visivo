/**
 * useLibraryFilter behaviour (VIS-773 / Track C C2).
 *
 * Pin the pure-function behaviour of the search + type-filter logic so the
 * UI tests can focus on rendering without re-asserting filter rules.
 */
import { renderHook } from '@testing-library/react';
import useLibraryFilter from './useLibraryFilter';

const ROWS = [
  { id: 'chart:revenue', type: 'chart', name: 'revenue_chart' },
  { id: 'table:waterfall', type: 'table', name: 'waterfall_table' },
  { id: 'chart:fib', type: 'chart', name: 'fibonacci_growth' },
  { id: 'model:fib', type: 'model', name: 'fib_model', subtype: 'csv_script_model' },
];

describe('useLibraryFilter', () => {
  test('passes rows through untouched when no search/type-filter active', () => {
    const { result } = renderHook(() =>
      useLibraryFilter({ rows: ROWS, search: '', typeFilter: null })
    );
    expect(result.current).toEqual(ROWS);
  });

  test('filters by case-insensitive substring on row name', () => {
    const { result } = renderHook(() =>
      useLibraryFilter({ rows: ROWS, search: 'FIB', typeFilter: null })
    );
    expect(result.current.map(r => r.id)).toEqual(['chart:fib', 'model:fib']);
  });

  test('matches on the row subtype too', () => {
    const { result } = renderHook(() =>
      useLibraryFilter({ rows: ROWS, search: 'csv_script', typeFilter: null })
    );
    expect(result.current.map(r => r.id)).toEqual(['model:fib']);
  });

  test('the type filter keeps only rows of the active type', () => {
    const { result } = renderHook(() =>
      useLibraryFilter({ rows: ROWS, search: '', typeFilter: 'chart' })
    );
    expect(result.current.map(r => r.id)).toEqual(['chart:revenue', 'chart:fib']);
  });

  test('search and type-filter compose', () => {
    const { result } = renderHook(() =>
      useLibraryFilter({ rows: ROWS, search: 'fib', typeFilter: 'chart' })
    );
    expect(result.current.map(r => r.id)).toEqual(['chart:fib']);
  });

  test('returns an empty array for a non-array input', () => {
    const { result } = renderHook(() =>
      useLibraryFilter({ rows: undefined, search: '', typeFilter: null })
    );
    expect(result.current).toEqual([]);
  });
});
