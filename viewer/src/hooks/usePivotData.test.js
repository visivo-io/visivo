/* eslint-disable no-template-curly-in-string -- fixtures use literal Visivo `${ref(...)}` strings */
/* global BigInt */
/**
 * usePivotData (VIS-1462 T1 + T6).
 *
 * T1: pivot / column-select tables must read the insight's INPUT-RESOLVED
 *     post-query result (the same rows the chart path renders), and re-run when
 *     a referenced input value changes — they used to read the raw parquet and
 *     ignored inputs entirely.
 * T6: a header must never show a hashed column name; an unaliased column maps
 *     back to its plain prop name, an aliased one keeps the alias verbatim.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePivotData } from './usePivotData';
import useStore from '../stores/store';
import * as queries from '../duckdb/queries';
import * as DuckDBContext from '../contexts/DuckDBContext';
import { Table, vectorFromArray, Int32, DateDay, TimestampMicrosecond } from 'apache-arrow';

jest.mock('../duckdb/queries');
jest.mock('../contexts/DuckDBContext');

const actualQueries = jest.requireActual('../duckdb/queries');

const HASH_TABLE = 'mwygzqlwplqyroayxvtjpiyehvwmb';
const X_HASH = 'mcyedxpzlvpskkv';
const Y_HASH = 'mooiuesfaeicewv';

// Shape of an insight job entry written by useInsightsData for a DYNAMIC insight
// (filter on an input): the parquet is the model's raw table, the post-query
// selects hashed props out of it with a `${input.accessor}` placeholder.
const insightSource = {
  name: 'ins',
  files: [{ name_hash: HASH_TABLE, signed_data_file_url: 'http://x/ins.parquet' }],
  query:
    `SELECT "${HASH_TABLE}"."x" AS "${X_HASH}", "${HASH_TABLE}"."y" AS "${Y_HASH}" ` +
    `FROM "${HASH_TABLE}" WHERE "${HASH_TABLE}"."x" > \${min_x_value.value}`,
  props_mapping: { 'props.x': X_HASH, 'props.y': Y_HASH },
  inputDependencies: ['min_x_value'],
  data: [{ [X_HASH]: 1, [Y_HASH]: 3 }],
};

const modelSource = {
  name: 'sales_data',
  files: [{ name_hash: 'model_hash', signed_data_file_url: 'http://x/m.parquet' }],
  props_mapping: {},
  data: [{ region: 'North' }],
};

const arrowResult = rows => ({ toArray: () => rows.map(r => ({ toJSON: () => r })) });

const HASH_LIKE = /[a-z]{14,}/;
const expectNoHash = headers => {
  for (const h of headers) {
    expect(h).not.toMatch(HASH_LIKE);
    expect(h).not.toContain(X_HASH);
    expect(h).not.toContain(Y_HASH);
  }
};

describe('usePivotData', () => {
  let executed;

  beforeEach(() => {
    jest.clearAllMocks();
    executed = [];
    DuckDBContext.useDuckDB.mockReturnValue({});
    queries.loadInsightParquetFiles.mockResolvedValue({ loaded: [HASH_TABLE], failed: [] });
    queries.prepPostQuery.mockImplementation(actualQueries.prepPostQuery);
    queries.runDuckDBQuery.mockImplementation((_db, sql) => {
      executed.push(sql);
      return Promise.resolve(arrowResult([{ [X_HASH]: 1, Alias: 3 }]));
    });
    act(() => {
      useStore.setState({ inputJobs: { min_x_value: { value: '3' }, other: { value: 'z' } } });
    });
  });

  describe('T1: reads the input-filtered post-query, not the raw parquet', () => {
    it('column-select wraps the prepared post-query as the FROM relation', async () => {
      const config = { columns: ['${ref(ins).x}', '${ref(ins).y} as Alias'] };
      const { result } = renderHook(() => usePivotData(config, insightSource));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(executed).toHaveLength(1);
      expect(executed[0]).toContain(`FROM (SELECT "${HASH_TABLE}"."x"`);
      expect(executed[0]).toContain('"x" > 3)');
      expect(executed[0]).toContain('AS "__visivo_source"');
      // The raw table is NOT the direct relation any more.
      expect(executed[0]).not.toMatch(new RegExp(`FROM "${HASH_TABLE}"\\s*$`));
      expect(result.current.rows).toEqual([{ [X_HASH]: 1, Alias: 3 }]);
    });

    it('pivot wraps the prepared post-query as the FROM relation', async () => {
      const config = {
        columns: ['${ref(ins).x}'],
        rows: ['${ref(ins).y}'],
        values: ['sum(${ref(ins).y})'],
      };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(arrowResult([{ [Y_HASH]: 3, 1: 3, 2: 8 }]));
      });
      const { result } = renderHook(() => usePivotData(config, insightSource));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(executed[0]).toMatch(/^PIVOT \(SELECT \* FROM \(SELECT /);
      expect(executed[0]).toContain('"x" > 3)');
      expect(executed[0]).toContain(`GROUP BY "${Y_HASH}"`);
    });

    it('re-runs with the new value when a referenced input changes', async () => {
      const config = { columns: ['${ref(ins).x}'] };
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(executed).toHaveLength(1);

      act(() => {
        useStore.setState({ inputJobs: { min_x_value: { value: '5' }, other: { value: 'z' } } });
      });

      await waitFor(() => expect(executed).toHaveLength(2));
      expect(executed[1]).toContain('"x" > 5)');
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it('does NOT re-run when an unrelated input changes', async () => {
      const config = { columns: ['${ref(ins).x}'] };
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        // The store spreads the existing entries on a write, so an unrelated
        // input's write leaves `min_x_value` untouched (same object).
        useStore.setState(s => ({ inputJobs: { ...s.inputJobs, other: { value: 'q' } } }));
      });

      // Give any (wrong) re-run a chance to fire.
      await new Promise(r => setTimeout(r, 50));
      expect(executed).toHaveLength(1);
    });

    it('reads the raw parquet table for a model source (no post-query)', async () => {
      const config = { columns: ['${ref(sales_data).region} as Region'] };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(arrowResult([{ Region: 'North' }]));
      });
      const { result } = renderHook(() => usePivotData(config, modelSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(executed[0]).toBe('SELECT "region" AS "Region" FROM "model_hash"');
      expect(result.current.columns.map(c => c.header)).toEqual(['Region']);
    });

    it('surfaces an error instead of querying when a referenced input is missing', async () => {
      act(() => {
        useStore.setState({ inputJobs: {} });
      });
      const config = { columns: ['${ref(ins).x}'] };
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(executed).toHaveLength(0);
      expect(result.current.error).toMatch(/Query preparation failed/);
    });

    it('stays idle while the insight is pending its inputs (data === null)', async () => {
      const config = { columns: ['${ref(ins).x}'] };
      const { result } = renderHook(() =>
        usePivotData(config, { ...insightSource, data: null })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(executed).toHaveLength(0);
    });

    it('does nothing without a config or a db', async () => {
      DuckDBContext.useDuckDB.mockReturnValue(null);
      const { result } = renderHook(() => usePivotData(null, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(executed).toHaveLength(0);
    });

    it('reports a DuckDB failure as the hook error', async () => {
      queries.runDuckDBQuery.mockRejectedValue(new Error('Binder Error: nope'));
      const config = { columns: ['${ref(ins).x}'] };
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe('Binder Error: nope');
    });

    it('runs nothing for a config that is neither pivot nor column-select', async () => {
      // columns + rows without values: the Table model rejects this, but the
      // hook must still settle without querying.
      const config = { columns: ['${ref(ins).x}'], rows: ['${ref(ins).y}'] };
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(executed).toHaveLength(0);
      expect(result.current.error).toBeNull();
    });
  });

  describe('T6: headers never show a hashed column name', () => {
    it('column-select: unaliased -> plain prop name, aliased -> alias verbatim', async () => {
      const config = { columns: ['${ref(ins).x}', '${ref(ins).y} as my_alias'] };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(arrowResult([{ [X_HASH]: 1, my_alias: 3 }]));
      });
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const headers = result.current.columns.map(c => c.header);
      expect(headers).toEqual(['X', 'my_alias']);
      expectNoHash(headers);
    });

    it('column-select: a composite key still containing a hash is de-hashed', async () => {
      const config = { columns: ['${ref(ins).x}'] };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(arrowResult([{ [`${X_HASH}_total`]: 1 }]));
      });
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const headers = result.current.columns.map(c => c.header);
      expect(headers).toEqual(['X Total']);
      expectNoHash(headers);
    });

    it('pivot: row column, pivot values and banner all use plain names', async () => {
      const config = {
        columns: ['${ref(ins).x}'],
        rows: ['${ref(ins).y}'],
        values: ['sum(${ref(ins).y})', 'avg(${ref(ins).y})'],
      };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(
          arrowResult([
            {
              [Y_HASH]: 3,
              [`1_sum("${Y_HASH}")`]: 3,
              [`1_avg("${Y_HASH}")`]: 3,
              [`2_sum("${Y_HASH}")`]: 8,
              [`2_avg("${Y_HASH}")`]: 8,
            },
          ])
        );
      });
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const headers = result.current.columns.map(c => c.header);
      expect(headers[0]).toBe('Y');
      expectNoHash(headers);

      const leafNames = [];
      const walk = cols =>
        cols.forEach(c => {
          if (c.columns) {
            leafNames.push(c.header);
            walk(c.columns);
          } else {
            leafNames.push(c.displayName);
          }
        });
      walk(result.current.nestedColumns);
      expectNoHash(leafNames);
      expect(leafNames).toContain('SUM of Y');

      const { aggregationLabel, pivotFieldName, rowFieldNames } = result.current.pivotMeta;
      expectNoHash([aggregationLabel, pivotFieldName, ...rowFieldNames]);
      expect(aggregationLabel).toBe('SUM of Y, AVG of Y');
      expect(pivotFieldName).toBe('X');
      expect(rowFieldNames).toEqual(['Y']);
    });

    it('pivot: single value without agg suffix keeps the pivot value as the header', async () => {
      const config = {
        columns: ['${ref(ins).x}'],
        rows: ['${ref(ins).y}'],
        values: ['sum(${ref(ins).y})'],
      };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(arrowResult([{ [Y_HASH]: 3, north_east: 3 }]));
      });
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const headers = result.current.columns.map(c => c.header);
      expect(headers).toEqual(['Y', 'North East']);
      expect(result.current.columns[0].isPivotRow).toBe(true);
    });

    it('pivot: multiple values with an unrecognised key still de-hash the header', async () => {
      const config = {
        columns: ['${ref(ins).x}'],
        rows: ['${ref(ins).y}'],
        values: ['sum(${ref(ins).y})', 'avg(${ref(ins).y})'],
      };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(arrowResult([{ [Y_HASH]: 3, [`north_${X_HASH}`]: 1 }]));
      });
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const headers = result.current.columns.map(c => c.header);
      expect(headers).toEqual(['Y', 'North X']);
      expectNoHash(headers);
    });

    it('pivot: an empty values list still de-hashes every header', async () => {
      const config = { columns: ['${ref(ins).x}'], rows: ['${ref(ins).y}'], values: [] };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(arrowResult([{ [Y_HASH]: 3, [`west_${X_HASH}`]: 1 }]));
      });
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const headers = result.current.columns.map(c => c.header);
      expect(headers).toEqual(['Y', 'West X']);
      expectNoHash(headers);
    });

    it('pivot: an empty result yields no columns and no nested headers', async () => {
      const config = {
        columns: ['${ref(ins).x}'],
        rows: ['${ref(ins).y}'],
        values: ['sum(${ref(ins).y})'],
      };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(arrowResult([]));
      });
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.columns).toEqual([]);
      expect(result.current.nestedColumns).toBeNull();
    });

    it('cleans bigint and typed-array cell values', async () => {
      const config = { columns: ['${ref(ins).x}'] };
      queries.runDuckDBQuery.mockImplementation((_db, sql) => {
        executed.push(sql);
        return Promise.resolve(
          arrowResult([
            { [X_HASH]: BigInt(7), big: new Int32Array([5]), empty: new Int32Array([]), nil: null },
          ])
        );
      });
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.rows[0]).toEqual({ [X_HASH]: 7, big: 5, empty: null, nil: null });
    });
  });

  describe('date and timestamp columns', () => {
    it('returns DATE and TIMESTAMP values as ISO strings', async () => {
      const config = { columns: ['${ref(ins).x}'] };
      queries.runDuckDBQuery.mockResolvedValue(
        new Table({
          n: vectorFromArray([1, 2], new Int32()),
          day: vectorFromArray([new Date('1990-06-01T00:00:00Z'), null], new DateDay()),
          at: vectorFromArray(
            [new Date('2021-01-01T08:30:15Z'), new Date('2021-01-02T00:00:00Z')],
            new TimestampMicrosecond()
          ),
        })
      );
      const { result } = renderHook(() => usePivotData(config, insightSource));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.rows).toEqual([
        { n: 1, day: '1990-06-01T00:00:00.000Z', at: '2021-01-01T08:30:15.000Z' },
        { n: 2, day: null, at: '2021-01-02T00:00:00.000Z' },
      ]);
    });
  });
});
