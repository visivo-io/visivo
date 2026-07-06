/**
 * metricPreview — the local metric aggregate (VIS-1026). Pure SQL builder +
 * the DuckDB run path with mocked connection/query.
 */
import { buildMetricPreviewSql, runMetricPreview } from './metricPreview';

describe('buildMetricPreviewSql', () => {
  it('no split → the single aggregate value', () => {
    const sql = buildMetricPreviewSql({
      baseTable: 'base',
      metricExpr: 'sum(amount)',
      splitExpr: null,
    });
    expect(sql).toBe('SELECT (sum(amount)) AS y FROM "base"');
  });

  it('split → grouped aggregate ordered + capped', () => {
    const sql = buildMetricPreviewSql({
      baseTable: 'base',
      metricExpr: 'sum(amount)',
      splitExpr: 'region',
      showGrain: false,
    });
    expect(sql).toBe(
      'SELECT (region) AS x, (sum(amount)) AS y FROM "base" GROUP BY 1 ORDER BY 1 LIMIT 50'
    );
  });

  it('date grain → the split is date_trunc-bucketed over a TIMESTAMP cast', () => {
    const sql = buildMetricPreviewSql({
      baseTable: 'base',
      metricExpr: 'count(*)',
      splitExpr: 'created_at',
      showGrain: true,
      grain: 'month',
    });
    expect(sql).toContain("date_trunc('month', CAST(created_at AS TIMESTAMP))");
    expect(sql).toContain('(count(*)) AS y');
  });
});

describe('runMetricPreview', () => {
  const makeDeps = (arrowRows, capture = {}) => {
    const conn = { query: jest.fn(async sql => { capture.lastSql = sql; }) };
    return {
      db: { registerFileText: jest.fn(async () => {}), dropFile: jest.fn(async () => {}) },
      getConnection: jest.fn(async () => conn),
      runQuery: jest.fn(async () => ({ toArray: () => arrowRows })),
      capture,
      conn,
    };
  };

  it('returns [] for empty model rows', async () => {
    const d = makeDeps([]);
    const out = await runMetricPreview({ ...d, modelRows: [], spec: { metricExpr: 'sum(x)' } });
    expect(out).toEqual([]);
  });

  it('normalizes grouped rows (x + y, bigint coerced)', async () => {
    const d = makeDeps([
      { toJSON: () => ({ x: 'east', y: 100n }) },
      { toJSON: () => ({ x: 'west', y: 40 }) },
    ]);
    const out = await runMetricPreview({
      ...d,
      modelRows: [{ region: 'east', amount: 1 }],
      spec: { metricExpr: 'sum(amount)', splitExpr: 'region', showGrain: false },
    });
    expect(out).toEqual([
      { x: 'east', y: 100 },
      { x: 'west', y: 40 },
    ]);
  });

  it('a no-split result normalizes the lone aggregate to x="(total)"', async () => {
    const d = makeDeps([{ toJSON: () => ({ y: 512 }) }]);
    const out = await runMetricPreview({
      ...d,
      modelRows: [{ amount: 1 }],
      spec: { metricExpr: 'sum(amount)', splitExpr: null },
    });
    expect(out).toEqual([{ x: '(total)', y: 512 }]);
  });

  it('drops the transient base table even when the query throws', async () => {
    const capture = {};
    const conn = {
      query: jest.fn(async sql => {
        if (sql.startsWith('CREATE TABLE')) return;
        if (sql.startsWith('DROP TABLE')) { capture.dropped = true; return; }
      }),
    };
    const db = { registerFileText: jest.fn(async () => {}), dropFile: jest.fn(async () => {}) };
    const runQuery = jest.fn(async () => {
      throw new Error('bad sql');
    });
    await expect(
      runMetricPreview({
        db,
        getConnection: async () => conn,
        runQuery,
        modelRows: [{ amount: 1 }],
        spec: { metricExpr: 'sum(amount)', splitExpr: 'region', showGrain: false },
      })
    ).rejects.toThrow('bad sql');
    expect(capture.dropped).toBe(true);
    expect(db.dropFile).toHaveBeenCalled();
  });
});
