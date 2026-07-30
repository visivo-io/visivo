/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import { buildPromoteChecklist } from './promoteChecklist';
import { validateRecordConfig } from '../components/views/workspace/validateAgainstSchema';
import { checkRefTargets } from '../components/views/workspace/refPreflight';
import { checkExpressions } from '../components/views/workspace/expressionPreflight';

jest.mock('../components/views/workspace/validateAgainstSchema', () => ({
  validateRecordConfig: jest.fn(),
}));
jest.mock('../components/views/workspace/refPreflight', () => ({
  checkRefTargets: jest.fn(),
}));
jest.mock('../components/views/workspace/expressionPreflight', () => ({
  checkExpressions: jest.fn(),
}));

const VALID = { valid: true, errors: [] };

beforeEach(() => {
  jest.clearAllMocks();
  validateRecordConfig.mockResolvedValue(VALID);
  checkRefTargets.mockReturnValue(VALID);
  checkExpressions.mockResolvedValue(VALID);
});

const baseState = (overrides = {}) => ({
  explorerModelStates: {},
  explorerInsightStates: {},
  explorerChartName: null,
  explorerChartInsightNames: [],
  explorerChartLayout: {},
  models: [],
  metrics: [],
  dimensions: [],
  insights: [],
  charts: [],
  fetchExplorerDiff: jest.fn().mockResolvedValue({}),
  ...overrides,
});

describe('buildPromoteChecklist', () => {
  test('a new model produces a "model" tier row, status "new", valid by default', async () => {
    const state = baseState({
      explorerModelStates: {
        orders_q: { sql: 'select 1', sourceName: 'warehouse', isNew: true, computedColumns: [] },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tier: 'model', type: 'model', name: 'orders_q', status: 'new', valid: true });
  });

  test('a model with no sql yet (untouched empty tab) is never a candidate', async () => {
    const state = baseState({
      explorerModelStates: { blank: { sql: '', sourceName: null, isNew: true, computedColumns: [] } },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(0);
  });

  test('a model-scoped computed column produces a "field" tier row carrying parentModel', async () => {
    const state = baseState({
      explorerModelStates: {
        orders_q: {
          sql: 'select 1',
          sourceName: 'warehouse',
          isNew: false,
          computedColumns: [{ name: 'churn_rate', expression: 'SUM(x)', type: 'metric' }],
        },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    const field = rows.find(r => r.name === 'churn_rate');
    expect(field).toMatchObject({ tier: 'field', type: 'metric', parentModel: 'orders_q', status: 'new' });
    expect(field.config).toEqual({ expression: 'SUM(x)', parentModel: 'orders_q' });
  });

  test('dimension computed columns get type "dimension"', async () => {
    const state = baseState({
      explorerModelStates: {
        orders_q: {
          sql: 'select 1',
          sourceName: 'warehouse',
          computedColumns: [{ name: 'cohort', expression: 'date_trunc(x)', type: 'dimension' }],
        },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows.find(r => r.name === 'cohort').type).toBe('dimension');
  });

  test('an insight produces an "insight" tier row', async () => {
    const state = baseState({
      explorerInsightStates: {
        churn: { type: 'scatter', props: { x: '?{${ref(orders_q).region}}' }, interactions: [], isNew: true },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tier: 'insight', type: 'insight', name: 'churn', status: 'new' });
  });

  test('the chart produces a "chart" tier row when named and it references a real (non-scaffold) insight', async () => {
    const state = baseState({
      explorerChartName: 'churn_chart',
      explorerChartInsightNames: ['churn'],
      explorerInsightStates: {
        churn: { type: 'scatter', props: { x: '?{${ref(orders_q).region}}' }, interactions: [], isNew: true },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    const chartRow = rows.find(r => r.tier === 'chart');
    expect(chartRow).toMatchObject({ tier: 'chart', type: 'chart', name: 'churn_chart', status: 'new' });
    expect(chartRow.config.insights).toEqual(['ref(churn)']);
  });

  // Phase 6c-T5 (VIS-1102 / ux-audit.md's "Promote has no naming step —
  // project polluted with 'query_1' and 'insight'" finding): a brand-new,
  // unedited insight (no props, no interactions) is the auto-created
  // scaffold every fresh exploration mounts with, not authored content —
  // it must never be offered for "Save to Project".
  test('a brand-new insight with no props/interactions bound is never a candidate', async () => {
    const state = baseState({
      explorerInsightStates: {
        insight: { type: 'scatter', props: {}, interactions: [], isNew: true },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(0);
  });

  test('an EXISTING insight (isNew: false) with no props is still a candidate — the backend diff decides relevance', async () => {
    const state = baseState({
      explorerInsightStates: {
        published_insight: { type: 'scatter', props: {}, interactions: [], isNew: false },
      },
      fetchExplorerDiff: jest.fn().mockResolvedValue({ insights: { published_insight: 'modified' } }),
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'insight', name: 'published_insight', status: 'modified' });
  });

  test('a chart referencing ONLY a scaffold insight, with no layout config, is never a candidate', async () => {
    const state = baseState({
      explorerChartName: 'chart',
      explorerChartInsightNames: ['insight'],
      explorerInsightStates: {
        insight: { type: 'scatter', props: {}, interactions: [], isNew: true },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(0);
  });

  test('a chart with real layout config is a candidate even if its insight is still a scaffold', async () => {
    const state = baseState({
      explorerChartName: 'chart',
      explorerChartInsightNames: ['insight'],
      explorerChartLayout: { title: 'Revenue over time' },
      explorerInsightStates: {
        insight: { type: 'scatter', props: {}, interactions: [], isNew: true },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    const chartRow = rows.find(r => r.tier === 'chart');
    expect(chartRow).toBeTruthy();
  });

  test('an untouched seeded exploration (empty model, scaffold insight, scaffold chart) produces an EMPTY checklist', async () => {
    const state = baseState({
      explorerModelStates: {
        query_1: { sql: '', sourceName: 'local-duckdb', isNew: true, computedColumns: [] },
      },
      explorerChartName: 'chart',
      explorerChartInsightNames: ['insight'],
      explorerInsightStates: {
        insight: { type: 'scatter', props: {}, interactions: [], isNew: true },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(0);
  });

  test('rows are sorted in dependency order: model, field, insight, chart', async () => {
    const state = baseState({
      explorerChartName: 'c',
      explorerChartInsightNames: ['ins'],
      explorerInsightStates: {
        ins: { type: 'scatter', props: { x: '?{1}' }, interactions: [] },
      },
      explorerModelStates: {
        m: {
          sql: 'select 1',
          sourceName: 's',
          computedColumns: [{ name: 'metric_a', expression: 'x', type: 'metric' }],
        },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows.map(r => r.tier)).toEqual(['model', 'field', 'insight', 'chart']);
  });

  test('an unchanged (diff-null) object is dropped from the checklist entirely', async () => {
    const state = baseState({
      explorerModelStates: { orders_q: { sql: 'select 1', sourceName: 'w', isNew: false, computedColumns: [] } },
      fetchExplorerDiff: jest.fn().mockResolvedValue({ models: { orders_q: null } }),
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(0);
  });

  test('an unreachable diff endpoint fails open — every candidate falls back to "new"', async () => {
    const state = baseState({
      explorerModelStates: { orders_q: { sql: 'select 1', sourceName: 'w', isNew: true, computedColumns: [] } },
      fetchExplorerDiff: jest.fn().mockRejectedValue(new Error('network down')),
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'orders_q', status: 'new' });
  });

  test('diff "modified" status is honored', async () => {
    const state = baseState({
      explorerModelStates: { orders_q: { sql: 'select 1', sourceName: 'w', isNew: false, computedColumns: [] } },
      fetchExplorerDiff: jest.fn().mockResolvedValue({ models: { orders_q: 'modified' } }),
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows[0].status).toBe('modified');
  });

  test('a failed structural (AJV) verdict marks the row invalid with the first error message', async () => {
    validateRecordConfig.mockResolvedValueOnce({
      valid: false,
      errors: [{ path: 'sql', message: 'sql is required' }],
    });
    const state = baseState({
      explorerModelStates: { orders_q: { sql: 'select 1', sourceName: 'w', isNew: true, computedColumns: [] } },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows[0]).toMatchObject({ valid: false, error: 'sql is required' });
  });

  test('a dangling ref (checkRefTargets) marks the row invalid, structural still runs first', async () => {
    checkRefTargets.mockReturnValueOnce({
      valid: false,
      errors: [{ path: 'props.x', message: "ref 'missing_model' not found" }],
    });
    const state = baseState({
      explorerInsightStates: {
        churn: { type: 'scatter', props: { x: '?{${ref(missing_model).x}}' }, interactions: [] },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows[0]).toMatchObject({ valid: false, error: "ref 'missing_model' not found" });
  });

  test('a failed expression parse marks the row invalid', async () => {
    // `mockImplementation` (not `mockResolvedValueOnce`) — Promise.all runs
    // every row's gate concurrently, so which row's checkExpressions call
    // lands "first" is not guaranteed; key off the config instead of call order.
    checkExpressions.mockImplementation((type, config) =>
      Promise.resolve(
        config.expression === 'not valid sql ('
          ? { valid: false, errors: [{ path: 'expression', message: 'sqlglot parse error' }] }
          : VALID
      )
    );
    const state = baseState({
      explorerModelStates: {
        orders_q: {
          sql: 'select 1',
          sourceName: 'w',
          computedColumns: [{ name: 'bad_ratio', expression: 'not valid sql (', type: 'metric' }],
        },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows.find(r => r.name === 'bad_ratio')).toMatchObject({
      valid: false,
      error: 'sqlglot parse error',
    });
  });

  test('a gate crash fails OPEN (valid: true) rather than blocking the row', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    validateRecordConfig.mockRejectedValueOnce(new Error('AJV compile exploded'));
    const state = baseState({
      explorerModelStates: { orders_q: { sql: 'select 1', sourceName: 'w', isNew: true, computedColumns: [] } },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows[0].valid).toBe(true);
    spy.mockRestore();
  });

  test('parentModel is stripped before the config reaches the validation gate (extra="forbid" avoidance)', async () => {
    const state = baseState({
      explorerModelStates: {
        orders_q: {
          sql: 'select 1',
          sourceName: 'w',
          computedColumns: [{ name: 'churn_rate', expression: 'SUM(x)', type: 'metric' }],
        },
      },
    });
    await buildPromoteChecklist(() => state);
    expect(validateRecordConfig).toHaveBeenCalledWith('metric', { expression: 'SUM(x)' });
    expect(checkExpressions).toHaveBeenCalledWith('metric', { expression: 'SUM(x)' });
  });

  test('a chart referencing a sibling brand-new insight in the SAME checklist is valid via the synthetic-sibling stub', async () => {
    checkRefTargets.mockImplementation((config, state) => {
      // Real refPreflight-shaped behavior: valid only if every ref target
      // resolves against state.insights.
      const names = (state.insights || []).map(i => i.name);
      if (config.insights?.every(ref => names.includes(ref.replace('ref(', '').replace(')', '')))) {
        return VALID;
      }
      return { valid: false, errors: [{ path: 'insights', message: 'dangling insight ref' }] };
    });
    const state = baseState({
      explorerChartName: 'churn_chart',
      explorerChartInsightNames: ['brand_new_insight'],
      explorerInsightStates: {
        brand_new_insight: { type: 'scatter', props: { x: '?{1}' }, interactions: [], isNew: true },
      },
      insights: [], // NOT yet published for real
    });
    const rows = await buildPromoteChecklist(() => state);
    const chartRow = rows.find(r => r.type === 'chart');
    expect(chartRow.valid).toBe(true);
  });

  // Coverage-completion pass (Jared's 95%+ stmts+branch bar) — every test
  // below targets a SPECIFIC uncovered branch identified from the raw
  // istanbul branchMap, not a guess. Each asserts real, distinct behavior;
  // none are render-smoke/assertion-free.

  test('a failed structural verdict with no errors array falls back to a generic message', async () => {
    validateRecordConfig.mockResolvedValueOnce({ valid: false, errors: [] });
    const state = baseState({
      explorerModelStates: { orders_q: { sql: 'select 1', sourceName: 'w', isNew: true, computedColumns: [] } },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows[0]).toMatchObject({ valid: false, error: 'Invalid configuration' });
  });

  test('a dangling ref with no errors array falls back to a generic message', async () => {
    checkRefTargets.mockReturnValueOnce({ valid: false, errors: [] });
    const state = baseState({
      explorerInsightStates: {
        churn: { type: 'scatter', props: { x: '?{1}' }, interactions: [], isNew: true },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows[0]).toMatchObject({ valid: false, error: 'Broken reference' });
  });

  test('a failed expression parse with no errors array falls back to a generic message', async () => {
    // mockImplementation (not mockResolvedValueOnce) — this state has TWO
    // candidates (model + field), and Promise.all runs both rows' gates
    // concurrently, so call order isn't guaranteed (same reasoning as the
    // existing "failed expression parse" test above).
    checkExpressions.mockImplementation((type, config) =>
      Promise.resolve(config.expression === 'bad_expr' ? { valid: false, errors: [] } : VALID)
    );
    const state = baseState({
      explorerModelStates: {
        orders_q: {
          sql: 'select 1',
          sourceName: 'w',
          isNew: true,
          computedColumns: [{ name: 'bad', expression: 'bad_expr', type: 'metric' }],
        },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows.find(r => r.name === 'bad')).toMatchObject({
      valid: false,
      error: 'Expression failed to parse',
    });
  });

  test('a completely uninitialized legacy state (every collection undefined, not just empty) produces an empty checklist without crashing', async () => {
    // Not routed through baseState()'s defaults — this simulates
    // buildPromoteChecklist being called against a genuinely fresh/
    // not-yet-hydrated store slice, where every `|| {}`/`|| []` fallback in
    // the function (model/insight state maps, the four synthetic-sibling
    // collections, the chart's own insightNames/layout reads) is load-
    // bearing, not decorative.
    const state = {
      explorerModelStates: undefined,
      explorerInsightStates: undefined,
      explorerChartName: null,
      explorerChartInsightNames: undefined,
      explorerChartLayout: undefined,
      models: undefined,
      metrics: undefined,
      dimensions: undefined,
      insights: undefined,
      charts: undefined,
      fetchExplorerDiff: jest.fn().mockResolvedValue({}),
    };
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toEqual([]);
  });

  test('a model state with no sourceName omits the `source` ref from its config entirely', async () => {
    const state = baseState({
      explorerModelStates: { scratch: { sql: 'select 1', isNew: true, computedColumns: [] } },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows[0].config).toEqual({ sql: 'select 1' });
  });

  test('a model state with `computedColumns` entirely omitted produces just the model row, no crash', async () => {
    const state = baseState({
      explorerModelStates: { orders_q: { sql: 'select 1', sourceName: 'w', isNew: true } },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(1);
    expect(rows[0].tier).toBe('model');
  });

  test('an insight state with `props` entirely omitted (not just {}) still reads as scaffold', async () => {
    const state = baseState({
      explorerInsightStates: { insight: { type: 'scatter', interactions: [], isNew: true } },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(0);
  });

  test('an insight state with `interactions` entirely omitted (not just []) still reads as scaffold', async () => {
    const state = baseState({
      explorerInsightStates: { insight: { type: 'scatter', props: {}, isNew: true } },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(0);
  });

  test('an insight with a bound interaction and NO field props is authored content, not scaffold', async () => {
    const state = baseState({
      explorerInsightStates: {
        churn: {
          type: 'scatter',
          props: {},
          interactions: [{ type: 'filter', value: "${ref(orders_q).region} = 'US'" }],
          isNew: true,
        },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(1);
    expect(rows[0].config.interactions).toEqual([{ filter: "${ref(orders_q).region} = 'US'" }]);
  });

  test('a chart made valid by real layout config (no meaningful insight), with chartInsightNames entirely omitted, serializes an empty insights list', async () => {
    const state = baseState({
      explorerChartName: 'chart',
      explorerChartInsightNames: undefined,
      explorerChartLayout: { title: 'Revenue' },
      explorerInsightStates: {
        insight: { type: 'scatter', props: {}, interactions: [], isNew: true }, // still scaffold
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    const chartRow = rows.find(r => r.tier === 'chart');
    expect(chartRow.config.insights).toEqual([]);
  });

  test('a chart made valid by a meaningful insight, with chartLayout entirely omitted, serializes an empty layout object', async () => {
    const state = baseState({
      explorerChartName: 'chart',
      explorerChartInsightNames: ['churn'],
      explorerChartLayout: undefined,
      explorerInsightStates: {
        churn: { type: 'scatter', props: { x: '?{1}' }, interactions: [], isNew: true },
      },
    });
    const rows = await buildPromoteChecklist(() => state);
    const chartRow = rows.find(r => r.tier === 'chart');
    expect(chartRow.config.layout).toEqual({});
  });

  test('an unchanged (diff-null) chart is dropped, regardless of its sibling insight\'s own status', async () => {
    const state = baseState({
      explorerChartName: 'chart',
      explorerChartInsightNames: ['churn'],
      explorerInsightStates: {
        churn: { type: 'scatter', props: { x: '?{1}' }, interactions: [], isNew: true },
      },
      fetchExplorerDiff: jest.fn().mockResolvedValue({ chart: null }),
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows.find(r => r.tier === 'chart')).toBeUndefined();
    expect(rows.find(r => r.tier === 'insight')).toBeTruthy();
  });

  test('fetchExplorerDiff resolving to a falsy value (not a rejection) also fails open to "new"', async () => {
    const state = baseState({
      explorerModelStates: { orders_q: { sql: 'select 1', sourceName: 'w', isNew: true, computedColumns: [] } },
      fetchExplorerDiff: jest.fn().mockResolvedValue(null),
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows[0]).toMatchObject({ name: 'orders_q', status: 'new' });
  });
});
