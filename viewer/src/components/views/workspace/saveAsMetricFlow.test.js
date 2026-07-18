/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import { saveAsMetric, suggestMetricName } from './saveAsMetricFlow';
import { translateExpressions } from '../../../api/expressions';

jest.mock('../../../api/expressions', () => ({ translateExpressions: jest.fn() }));

const pillState = () => ({ kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });

const baseState = (overrides = {}) => ({
  metrics: [],
  explorerInsightStates: {},
  setInsightProp: jest.fn(),
  saveMetric: jest.fn().mockResolvedValue({ success: true }),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  translateExpressions.mockResolvedValue({
    translations: [{ detected_type: 'metric' }],
    errors: [],
  });
});

describe('suggestMetricName', () => {
  test('builds <query>_<col>_<agg> per 06 §4', () => {
    expect(suggestMetricName(pillState())).toBe('orders_q_amount_sum');
  });

  test('sanitizes non-identifier characters', () => {
    expect(suggestMetricName({ ref: 'my model', column: 'total $', agg: 'sum' })).toBe(
      'my_model_total___sum'
    );
  });
});

describe('saveAsMetric', () => {
  test('requires a non-blank name', async () => {
    const result = await saveAsMetric({
      pillState: pillState(),
      name: '   ',
      insightName: 'i',
      path: 'y',
      getState: () => baseState(),
    });
    expect(result).toEqual({ success: false, error: 'A metric name is required.' });
  });

  test('hard-blocks on a name collision with an existing metric', async () => {
    const state = baseState({ metrics: [{ name: 'total_amount' }] });
    const result = await saveAsMetric({
      pillState: pillState(),
      name: 'total_amount',
      insightName: 'i',
      path: 'y',
      getState: () => state,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
    expect(state.saveMetric).not.toHaveBeenCalled();
  });

  test('calls translateExpressions with the model-scoped (non-ref-wrapped) expression', async () => {
    const state = baseState();
    await saveAsMetric({
      pillState: pillState(),
      name: 'total_amount',
      insightName: 'i',
      path: 'y',
      sourceDialect: 'snowflake',
      getState: () => state,
    });
    expect(translateExpressions).toHaveBeenCalledWith(
      [{ name: 'total_amount', expression: 'sum(amount)', type: '' }],
      'snowflake'
    );
  });

  test('blocks on a server-side parse error', async () => {
    translateExpressions.mockResolvedValueOnce({
      translations: [],
      errors: [{ name: 'total_amount', error: 'sqlglot parse error' }],
    });
    const state = baseState();
    const result = await saveAsMetric({
      pillState: pillState(),
      name: 'total_amount',
      insightName: 'i',
      path: 'y',
      getState: () => state,
    });
    expect(result).toEqual({ success: false, error: 'sqlglot parse error' });
    expect(state.saveMetric).not.toHaveBeenCalled();
  });

  test('blocks a non-aggregate expression (detected_type !== "metric")', async () => {
    translateExpressions.mockResolvedValueOnce({
      translations: [{ detected_type: 'dimension' }],
      errors: [],
    });
    const state = baseState();
    const result = await saveAsMetric({
      pillState: pillState(),
      name: 'x',
      insightName: 'i',
      path: 'y',
      getState: () => state,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not an aggregate');
    expect(state.saveMetric).not.toHaveBeenCalled();
  });

  test('fails OPEN when the aggregate-ness endpoint is unreachable — proceeds to save', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    translateExpressions.mockRejectedValueOnce(new Error('network down'));
    const state = baseState();
    const result = await saveAsMetric({
      pillState: pillState(),
      name: 'total_amount',
      insightName: 'i',
      path: 'y',
      getState: () => state,
    });
    expect(result.success).toBe(true);
    expect(state.saveMetric).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('calls saveMetric with the model-scoped expression, born BOUND to parentModel (closes B12)', async () => {
    const state = baseState();
    await saveAsMetric({
      pillState: pillState(),
      name: 'total_amount',
      insightName: 'i',
      path: 'y',
      getState: () => state,
    });
    expect(state.saveMetric).toHaveBeenCalledWith('total_amount', {
      expression: 'sum(amount)',
      parentModel: 'orders_q',
    });
  });

  test('surfaces a saveMetric failure without swapping the slot', async () => {
    const state = baseState({ saveMetric: jest.fn().mockResolvedValue({ success: false, error: 'server rejected it' }) });
    const result = await saveAsMetric({
      pillState: pillState(),
      name: 'total_amount',
      insightName: 'i',
      path: 'y',
      getState: () => state,
    });
    expect(result).toEqual({ success: false, error: 'server rejected it' });
    expect(state.setInsightProp).not.toHaveBeenCalled();
  });

  test('on success, swaps the slot to a metricRef pill via setInsightProp', async () => {
    const state = baseState();
    await saveAsMetric({
      pillState: pillState(),
      name: 'total_amount',
      insightName: 'churn_by_cohort',
      path: 'y',
      getState: () => state,
    });
    expect(state.setInsightProp).toHaveBeenCalledWith(
      'churn_by_cohort',
      'y',
      '?{${ref(total_amount)}}'
    );
  });

  test('returns dedupOffer:null when no sibling slot matches the promoted expression', async () => {
    const state = baseState({
      explorerInsightStates: {
        churn_by_cohort: { props: { y: '?{sum(${ref(orders_q).amount})}' }, interactions: [] },
      },
    });
    const result = await saveAsMetric({
      pillState: pillState(),
      name: 'total_amount',
      insightName: 'churn_by_cohort',
      path: 'y',
      getState: () => state,
    });
    expect(result.dedupOffer).toBeNull();
  });

  test('returns a dedupOffer for sibling slots with the IDENTICAL expression (06 §8), excluding the slot just promoted', async () => {
    const state = baseState({
      explorerInsightStates: {
        churn_by_cohort: {
          props: { y: '?{sum(${ref(orders_q).amount})}', y2: '?{sum(${ref(orders_q).amount})}' },
          interactions: [],
        },
        other_chart: { props: { y: '?{sum(${ref(orders_q).amount})}' }, interactions: [] },
      },
    });
    const result = await saveAsMetric({
      pillState: pillState(),
      name: 'total_amount',
      insightName: 'churn_by_cohort',
      path: 'y',
      getState: () => state,
    });
    expect(result.dedupOffer).toEqual({
      promotedType: 'metric',
      promotedName: 'total_amount',
      slots: expect.arrayContaining([
        expect.objectContaining({ insightName: 'churn_by_cohort', key: 'y2' }),
        expect.objectContaining({ insightName: 'other_chart', key: 'y' }),
      ]),
    });
    expect(result.dedupOffer.slots).toHaveLength(2);
  });
});
