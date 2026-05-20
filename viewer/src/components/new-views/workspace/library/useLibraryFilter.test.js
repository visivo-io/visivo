/**
 * useLibraryFilter behaviour (VIS-773 / Track C C2).
 *
 * Pin the pure-function behaviour of the search + scope-chip filter so the
 * UI tests can focus on rendering without re-asserting filter rules.
 */
import { renderHook } from '@testing-library/react';
import useLibraryFilter from './useLibraryFilter';

const ROWS = [
  { id: 'chart:revenue', type: 'chart', name: 'revenue_chart' },
  { id: 'chart:waterfall', type: 'chart', name: 'waterfall_chart' },
  { id: 'chart:fib', type: 'chart', name: 'fibonacci_growth' },
];

describe('useLibraryFilter', () => {
  test('passes rows through untouched when no search/scope active', () => {
    const { result } = renderHook(() =>
      useLibraryFilter({ rows: ROWS, search: '', scopeChip: 'all', scope: 'root' })
    );
    expect(result.current).toEqual(ROWS);
  });

  test('filters by case-insensitive substring on row name', () => {
    const { result } = renderHook(() =>
      useLibraryFilter({ rows: ROWS, search: 'FIB', scopeChip: 'all', scope: 'root' })
    );
    expect(result.current).toEqual([
      { id: 'chart:fib', type: 'chart', name: 'fibonacci_growth' },
    ]);
  });

  test('falls back to subtype + label match for Insert primitives', () => {
    const insertRows = [
      { id: 'insert:dashboard', type: 'insert', subtype: 'dashboard', name: 'Dashboard', label: 'Dashboard' },
      { id: 'insert:row', type: 'insert', subtype: 'row', name: 'Row', label: 'Row' },
    ];
    const { result } = renderHook(() =>
      useLibraryFilter({ rows: insertRows, search: 'row', scopeChip: 'all', scope: 'root' })
    );
    expect(result.current.map((r) => r.id)).toEqual(['insert:row']);
  });

  test('respects the `usedHere` chip only when a non-root scope and usedNames are provided', () => {
    // Without usedNames (still loading), no filter is applied.
    const { result: result1 } = renderHook(() =>
      useLibraryFilter({
        rows: ROWS,
        search: '',
        scopeChip: 'usedHere',
        scope: 'dashboard',
        usedNames: [],
      })
    );
    expect(result1.current).toEqual(ROWS);

    // With usedNames populated, only matching rows pass.
    const { result: result2 } = renderHook(() =>
      useLibraryFilter({
        rows: ROWS,
        search: '',
        scopeChip: 'usedHere',
        scope: 'dashboard',
        usedNames: ['revenue_chart', 'fibonacci_growth'],
      })
    );
    expect(result2.current.map((r) => r.name)).toEqual([
      'revenue_chart',
      'fibonacci_growth',
    ]);
  });

  test('`compatible` chip filters by type list when a compatibleTypes set is provided', () => {
    const mixed = [
      { id: 'chart:a', type: 'chart', name: 'a' },
      { id: 'insight:b', type: 'insight', name: 'b' },
      { id: 'model:c', type: 'model', name: 'c' },
    ];
    const { result } = renderHook(() =>
      useLibraryFilter({
        rows: mixed,
        search: '',
        scopeChip: 'compatible',
        scope: 'item',
        compatibleTypes: ['chart', 'insight'],
      })
    );
    expect(result.current.map((r) => r.id)).toEqual(['chart:a', 'insight:b']);
  });

  test('search and scope filters compose', () => {
    const { result } = renderHook(() =>
      useLibraryFilter({
        rows: ROWS,
        search: 'chart',
        scopeChip: 'usedHere',
        scope: 'dashboard',
        usedNames: ['revenue_chart'],
      })
    );
    expect(result.current.map((r) => r.id)).toEqual(['chart:revenue']);
  });
});
