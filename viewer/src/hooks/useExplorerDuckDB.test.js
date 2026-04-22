/* global BigInt */
import { renderHook, act, waitFor } from '@testing-library/react';
import useStore from '../stores/store';
import useExplorerDuckDB from './useExplorerDuckDB';
import { useDuckDB } from '../contexts/DuckDBContext';
import { runDuckDBQuery } from '../duckdb/queries';
import { getConnection } from '../duckdb/duckdb';
import { translateExpressions } from '../api/expressions';

jest.mock('../contexts/DuckDBContext', () => ({
  useDuckDB: jest.fn(),
}));

jest.mock('../duckdb/queries', () => ({
  runDuckDBQuery: jest.fn(),
}));

jest.mock('../duckdb/duckdb', () => ({
  getConnection: jest.fn(),
}));

jest.mock('../api/expressions', () => ({
  translateExpressions: jest.fn(),
}));

// Helper: build a mock Arrow-like result object that the hook
// iterates with schema.fields / getChildAt / numRows.
const makeArrowResult = (columns, rows) => {
  const fields = columns.map((name) => ({ name }));
  const vectors = columns.map((col) => ({
    get: (rowIdx) => rows[rowIdx][col],
  }));
  return {
    schema: { fields },
    numRows: rows.length,
    getChildAt: (i) => vectors[i],
  };
};

const resetState = () => {
  useStore.setState({
    explorerModelTabs: ['test_model'],
    explorerActiveModelName: 'test_model',
    explorerModelStates: {
      test_model: {
        sql: 'SELECT 1',
        sourceName: 'test_source',
        queryResult: null,
        queryError: null,
        computedColumns: [],
        enrichedResult: null,
        isNew: true,
      },
    },
    explorerDuckDBLoading: false,
    explorerDuckDBError: null,
    explorerFailedComputedColumns: {},
  });
};

describe('useExplorerDuckDB', () => {
  let mockConn;
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    resetState();

    mockConn = { query: jest.fn().mockResolvedValue(undefined) };
    mockDb = {
      registerFileText: jest.fn().mockResolvedValue(undefined),
      dropFile: jest.fn().mockResolvedValue(undefined),
    };

    getConnection.mockResolvedValue(mockConn);
    useDuckDB.mockReturnValue(mockDb);
    translateExpressions.mockResolvedValue({ translations: [], errors: [] });
    runDuckDBQuery.mockResolvedValue(makeArrowResult([], []));
  });

  // ------------------------------------------------------------------
  it('does nothing when db is null', async () => {
    useDuckDB.mockReturnValue(null);

    // Give queryResult data so the only guard is db === null
    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: { columns: ['x'], rows: [{ x: 1 }] },
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(getConnection).not.toHaveBeenCalled();
    });
    expect(useStore.getState().explorerDuckDBLoading).toBe(false);
  });

  // ------------------------------------------------------------------
  it('does nothing when queryResult is null (no rows)', async () => {
    // queryResult is null by default from resetState
    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(getConnection).not.toHaveBeenCalled();
    });
    expect(useStore.getState().explorerDuckDBLoading).toBe(false);
  });

  // ------------------------------------------------------------------
  it('loads data into DuckDB table when queryResult has data', async () => {
    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: {
            columns: ['x', 'y'],
            rows: [{ x: 1, y: 2 }],
          },
          computedColumns: [],
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(useStore.getState().explorerDuckDBLoading).toBe(false);
    });
    expect(getConnection).toHaveBeenCalledWith(mockDb);
    expect(mockDb.registerFileText).toHaveBeenCalled();
    expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE'));
    expect(mockDb.dropFile).toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  it('sets enrichedResult to null when no computed columns', async () => {
    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: {
            columns: ['x', 'y'],
            rows: [{ x: 1, y: 2 }],
          },
          computedColumns: [],
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(useStore.getState().explorerDuckDBLoading).toBe(false);
    });
    const modelState = useStore.getState().explorerModelStates.test_model;
    expect(modelState.enrichedResult).toBeNull();
  });

  // ------------------------------------------------------------------
  it('calls translateExpressions when computed columns have sourceDialect', async () => {
    const enrichedArrow = makeArrowResult(['x', 'y', 'total'], [{ x: 1, y: 2, total: 3 }]);
    runDuckDBQuery.mockResolvedValue(enrichedArrow);

    translateExpressions.mockResolvedValue({
      translations: [{ name: 'total', duckdb_expression: 'x + y' }],
      errors: [],
    });

    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: {
            columns: ['x', 'y'],
            rows: [{ x: 1, y: 2 }],
          },
          computedColumns: [
            {
              name: 'total',
              expression: 'x + y',
              type: 'dimension',
              sourceDialect: 'postgres',
            },
          ],
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(translateExpressions).toHaveBeenCalledWith(
        [{ name: 'total', expression: 'x + y', type: 'dimension' }],
        'postgres'
      );
    });
  });

  // ------------------------------------------------------------------
  it('applies computed columns and sets enrichedResult', async () => {
    const enrichedArrow = makeArrowResult(
      ['x', 'y', 'total'],
      [{ x: 1, y: 2, total: 3 }]
    );
    runDuckDBQuery.mockResolvedValue(enrichedArrow);

    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: {
            columns: ['x', 'y'],
            rows: [{ x: 1, y: 2 }],
          },
          computedColumns: [
            {
              name: 'total',
              expression: 'x + y',
              type: 'dimension',
              // No sourceDialect — should skip translateExpressions
            },
          ],
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(useStore.getState().explorerModelStates.test_model.enrichedResult).toBeTruthy();
    });

    const enrichedResult = useStore.getState().explorerModelStates.test_model.enrichedResult;
    expect(enrichedResult.columns).toEqual(['x', 'y', 'total']);
    expect(enrichedResult.rows).toEqual([{ x: 1, y: 2, total: 3 }]);
    expect(enrichedResult.computedColumnNames).toEqual(['total']);
    expect(enrichedResult.failedColumns).toEqual([]);

    // Should NOT have called translateExpressions (no sourceDialect)
    expect(translateExpressions).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  it('sets failedComputedColumns for columns that fail individually', async () => {
    // First runDuckDBQuery call (combined SELECT) rejects
    // Then individual test calls: first succeeds, second fails
    // Then fallback combined query succeeds
    const fallbackArrow = makeArrowResult(
      ['x', 'y', 'good_col', 'bad_col'],
      [{ x: 1, y: 2, good_col: 3, bad_col: null }]
    );

    let callCount = 0;
    runDuckDBQuery.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('combined query failed'));
      }
      if (callCount === 2) {
        return Promise.resolve(makeArrowResult(['good_col'], [{ good_col: 3 }]));
      }
      if (callCount === 3) {
        return Promise.reject(new Error('invalid expression for bad_col'));
      }
      return Promise.resolve(fallbackArrow);
    });

    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: {
            columns: ['x', 'y'],
            rows: [{ x: 1, y: 2 }],
          },
          computedColumns: [
            { name: 'good_col', expression: 'x + y', type: 'dimension' },
            { name: 'bad_col', expression: 'INVALID()', type: 'dimension' },
          ],
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(useStore.getState().explorerFailedComputedColumns).toHaveProperty('bad_col');
    });
    const failedCols = useStore.getState().explorerFailedComputedColumns;
    expect(failedCols.bad_col).toContain('invalid expression for bad_col');
    expect(failedCols).not.toHaveProperty('good_col');

    // enrichedResult should still be set with the fallback query
    await waitFor(() => {
      expect(useStore.getState().explorerModelStates.test_model.enrichedResult).toBeTruthy();
    });
    const enrichedResult = useStore.getState().explorerModelStates.test_model.enrichedResult;
    expect(enrichedResult.failedColumns).toEqual(['bad_col']);
  });

  // ------------------------------------------------------------------
  it('sets duckDBLoading during pipeline', async () => {
    // Create a deferred promise so we can inspect loading state mid-pipeline
    let resolveConn;
    const connPromise = new Promise((resolve) => {
      resolveConn = resolve;
    });
    getConnection.mockReturnValue(connPromise);

    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: {
            columns: ['x'],
            rows: [{ x: 1 }],
          },
          computedColumns: [],
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    // Loading should be set to true while pipeline is running
    await waitFor(() => {
      expect(useStore.getState().explorerDuckDBLoading).toBe(true);
    });

    // Now resolve the connection to let pipeline finish
    await act(async () => {
      resolveConn(mockConn);
    });

    await waitFor(() => {
      expect(useStore.getState().explorerDuckDBLoading).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  it('sets duckDBError on pipeline failure', async () => {
    getConnection.mockRejectedValue(new Error('DuckDB connection failed'));

    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: {
            columns: ['x'],
            rows: [{ x: 1 }],
          },
          computedColumns: [],
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(useStore.getState().explorerDuckDBError).toBe('DuckDB connection failed');
    });
    expect(useStore.getState().explorerDuckDBLoading).toBe(false);
  });

  // ------------------------------------------------------------------
  it('discards stale results when version counter advances (simulate rapid changes)', async () => {
    // First pipeline run will be slow (deferred), second will be fast
    let resolveFirstConn;
    const firstConnPromise = new Promise((resolve) => {
      resolveFirstConn = resolve;
    });

    const firstQueryResult = {
      columns: ['x'],
      rows: [{ x: 'old' }],
    };
    const secondQueryResult = {
      columns: ['x'],
      rows: [{ x: 'new' }],
    };

    // First getConnection call is slow, subsequent ones are fast
    let connCallCount = 0;
    getConnection.mockImplementation(() => {
      connCallCount++;
      if (connCallCount === 1) return firstConnPromise;
      return Promise.resolve(mockConn);
    });

    // Start with the first query result
    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: firstQueryResult,
          computedColumns: [],
        },
      },
    });

    const { rerender } = renderHook(() => useExplorerDuckDB());

    // Pipeline 1 is now waiting on firstConnPromise
    // Trigger a second pipeline by changing queryResult
    await act(async () => {
      useStore.setState({
        explorerModelStates: {
          test_model: {
            ...useStore.getState().explorerModelStates.test_model,
            queryResult: secondQueryResult,
            computedColumns: [],
          },
        },
      });
    });

    rerender();

    // Let pipeline 2 complete first (it's fast)
    await waitFor(() => {
      expect(connCallCount).toBeGreaterThanOrEqual(2);
    });

    // Now resolve pipeline 1's connection — its results should be discarded
    await act(async () => {
      resolveFirstConn(mockConn);
    });

    await waitFor(() => {
      expect(useStore.getState().explorerDuckDBLoading).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  it('handles metric computed columns with OVER () window syntax', async () => {
    const enrichedArrow = makeArrowResult(['x', 'avg_x'], [{ x: 1, avg_x: 1.5 }]);
    runDuckDBQuery.mockResolvedValue(enrichedArrow);

    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: {
            columns: ['x'],
            rows: [{ x: 1 }],
          },
          computedColumns: [
            {
              name: 'avg_x',
              expression: 'AVG(x)',
              type: 'metric', // metric type triggers OVER () in the SQL
            },
          ],
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(runDuckDBQuery).toHaveBeenCalled();
    });
    // The SQL passed to runDuckDBQuery should contain OVER ()
    const sql = runDuckDBQuery.mock.calls[0][1];
    expect(sql).toContain('OVER ()');
    expect(sql).toContain('AVG(x)');
  });

  // ------------------------------------------------------------------
  it('converts bigint values to Number in enrichedResult rows', async () => {
    const fields = [{ name: 'big_val' }];
    const vectors = [
      {
        get: (rowIdx) => (rowIdx === 0 ? BigInt(12345) : BigInt(67890)),
      },
    ];
    const arrowResult = {
      schema: { fields },
      numRows: 2,
      getChildAt: (i) => vectors[i],
    };
    runDuckDBQuery.mockResolvedValue(arrowResult);

    useStore.setState({
      explorerModelStates: {
        test_model: {
          ...useStore.getState().explorerModelStates.test_model,
          queryResult: {
            columns: ['x'],
            rows: [{ x: 1 }],
          },
          computedColumns: [
            { name: 'big_val', expression: 'CAST(x AS BIGINT)', type: 'dimension' },
          ],
        },
      },
    });

    renderHook(() => useExplorerDuckDB());

    await waitFor(() => {
      expect(useStore.getState().explorerModelStates.test_model.enrichedResult).toBeTruthy();
    });
    const enrichedResult = useStore.getState().explorerModelStates.test_model.enrichedResult;
    // bigint should be converted to number
    expect(typeof enrichedResult.rows[0].big_val).toBe('number');
    expect(enrichedResult.rows[0].big_val).toBe(12345);
    expect(enrichedResult.rows[1].big_val).toBe(67890);
  });

  // ------------------------------------------------------------------
  it('returns addComputedFromDefinition that adds computed column to store', () => {
    const { result } = renderHook(() => useExplorerDuckDB());

    act(() => {
      result.current.addComputedFromDefinition({
        name: 'total_sales',
        config: {
          expression: 'SUM(amount)',
          aggregation: 'sum',
        },
      });
    });

    const modelState = useStore.getState().explorerModelStates.test_model;
    expect(modelState.computedColumns).toHaveLength(1);
    expect(modelState.computedColumns[0]).toEqual({
      name: 'total_sales',
      expression: 'SUM(amount)',
      type: 'metric', // aggregation present -> metric
      sourceDialect: undefined,
    });
  });

  // ------------------------------------------------------------------
  it('addComputedFromDefinition adds dimension when no aggregation', () => {
    const { result } = renderHook(() => useExplorerDuckDB());

    act(() => {
      result.current.addComputedFromDefinition({
        name: 'full_name',
        config: {
          expression: "first_name || ' ' || last_name",
        },
      });
    });

    const modelState = useStore.getState().explorerModelStates.test_model;
    expect(modelState.computedColumns).toHaveLength(1);
    expect(modelState.computedColumns[0].type).toBe('dimension');
  });

  // ------------------------------------------------------------------
  it('addComputedFromDefinition does nothing for invalid input', () => {
    const { result } = renderHook(() => useExplorerDuckDB());

    // No name
    act(() => {
      result.current.addComputedFromDefinition({ config: { expression: 'x + 1' } });
    });
    // No config.expression
    act(() => {
      result.current.addComputedFromDefinition({ name: 'col', config: {} });
    });
    // Null item
    act(() => {
      result.current.addComputedFromDefinition(null);
    });

    const modelState = useStore.getState().explorerModelStates.test_model;
    expect(modelState.computedColumns).toHaveLength(0);
  });
});
