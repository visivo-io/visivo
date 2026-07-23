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

  test('the chart produces a "chart" tier row when named', async () => {
    const state = baseState({
      explorerChartName: 'churn_chart',
      explorerChartInsightNames: ['churn'],
    });
    const rows = await buildPromoteChecklist(() => state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tier: 'chart', type: 'chart', name: 'churn_chart', status: 'new' });
    expect(rows[0].config.insights).toEqual(['ref(churn)']);
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
});
