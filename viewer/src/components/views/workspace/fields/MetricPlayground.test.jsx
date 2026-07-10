/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * MetricPlayground tests (VIS-1009 / VIS-1026).
 *
 * The Field Lens body for a metric. VIS-1026: the preview no longer routes a
 * synthetic insight through the deleted insight-preview pipeline — it runs the
 * parent model via `useModelQueryJob` and aggregates the metric locally in
 * DuckDB (`runMetricPreview`). We mock the model job + DuckDB + the local
 * aggregate (unit-tested in metricPreview.test.js) and assert the wiring: the
 * Run button, the built preview spec, and the rendered bars.
 */
import React from 'react';
import { render, screen, act, fireEvent, within, waitFor } from '@testing-library/react';
import selectEvent from 'react-select-event';
import MetricPlayground from './MetricPlayground';
import useStore from '../../../../stores/store';

// The model-query job — a mutable handle so a test can flip it to "completed".
let mockJob;
jest.mock('../../../../hooks/useModelQueryJob', () => ({
  __esModule: true,
  useModelQueryJob: () => mockJob,
}));
jest.mock('../../../../contexts/DuckDBContext', () => ({
  __esModule: true,
  useDuckDB: () => ({ __fakeDb: true }),
}));
// The local aggregate is unit-tested separately; here we assert the SPEC it
// receives and render its returned rows.
const mockRunMetricPreview = jest.fn();
jest.mock('./metricPreview', () => ({
  __esModule: true,
  runMetricPreview: (...args) => mockRunMetricPreview(...args),
}));

const idleJob = () => ({
  status: 'idle',
  result: null,
  error: null,
  isRunning: false,
  executeQuery: jest.fn(() => Promise.resolve()),
  reset: jest.fn(),
});

const completedJob = (rows = [{ id: 1 }]) => ({
  ...idleJob(),
  status: 'completed',
  result: { rows },
});

const seed = ({ metrics = [], dimensions = [], models = [] } = {}) => {
  act(() => {
    useStore.setState({
      metrics,
      dimensions,
      models,
      sources: [],
      defaults: null,
      fetchMetrics: jest.fn(),
      fetchDimensions: jest.fn(),
      fetchModels: jest.fn(),
      fetchSources: jest.fn(),
      fetchDefaults: jest.fn(),
    });
  });
};

const renderPlayground = (name = 'avg_value') =>
  render(<MetricPlayground activeObject={{ type: 'metric', name }} />);

const DAILY = {
  metrics: [{ name: 'avg_value', parentModel: 'daily', config: { expression: 'AVG(value)' } }],
  dimensions: [{ name: 'category', parentModel: 'daily', config: { expression: 'category' } }],
  models: [{ name: 'daily', config: { sql: 'SELECT 1', source: 'db' } }],
};

beforeEach(() => {
  mockJob = idleJob();
  mockRunMetricPreview.mockReset();
  mockRunMetricPreview.mockResolvedValue([{ x: 'a', y: 10 }]);
});

describe('MetricPlayground (VIS-1026)', () => {
  test('renders the expression, both controls, the Run button, and the pre-run prompt', () => {
    seed(DAILY);
    renderPlayground();
    expect(screen.getByTestId('metric-playground-expression')).toHaveTextContent('AVG(value)');
    expect(screen.getByTestId('metric-playground-split')).toBeInTheDocument();
    expect(screen.getByTestId('metric-playground-time-grain')).toBeInTheDocument();
    expect(screen.getByTestId('metric-playground-run')).toBeInTheDocument();
    // No auto-preview: the pre-run prompt shows until Run.
    expect(screen.getByTestId('metric-playground-prompt')).toBeInTheDocument();
  });

  test('Run executes the parent model, then aggregates + renders bars from the result', async () => {
    seed(DAILY);
    // Job already reports a completed model run so the aggregate effect fires
    // as soon as Run flags this metric.
    mockJob = completedJob([{ category: 'a', value: 10 }]);
    renderPlayground();

    fireEvent.click(screen.getByTestId('metric-playground-run'));
    expect(mockJob.executeQuery).toHaveBeenCalledWith('db', 'SELECT 1');

    // Flush the model-job → local-aggregate promise chain INSIDE act so the
    // resulting setState lands wrapped, then assert the bars + read the spec.
    expect(await screen.findByTestId('metric-playground-bars')).toBeInTheDocument();
    const { spec, modelRows } = mockRunMetricPreview.mock.calls.at(-1)[0];
    expect(spec.metricExpr).toBe('AVG(value)');
    expect(spec.splitExpr).toBe('category'); // default sibling dimension's raw expr
    expect(modelRows).toEqual([{ category: 'a', value: 10 }]);
  });

  test('a date split enables the grain control and buckets the split expression', async () => {
    seed({
      ...DAILY,
      dimensions: [
        { name: 'formatted_date', parentModel: 'daily', config: { expression: 'strftime(dt)' } },
      ],
    });
    mockJob = completedJob([{ dt: '2020-01-01' }]);
    renderPlayground();

    const grain = screen.getByTestId('metric-playground-time-grain');
    expect(within(grain).getByRole('combobox')).not.toBeDisabled();
    selectEvent.openMenu(within(grain).getByRole('combobox'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'Quarter'));

    fireEvent.click(screen.getByTestId('metric-playground-run'));
    expect(await screen.findByTestId('metric-playground-bars')).toBeInTheDocument();
    const { spec } = mockRunMetricPreview.mock.calls.at(-1)[0];
    expect(spec.splitExpr).toBe('strftime(dt)');
    expect(spec.showGrain).toBe(true);
    expect(spec.grain).toBe('quarter');
  });

  test('changing Split-by after a Run re-aggregates locally without a new model run', async () => {
    seed({
      ...DAILY,
      dimensions: [
        { name: 'category', parentModel: 'daily', config: { expression: 'category' } },
        { name: 'region', parentModel: 'daily', config: { expression: 'region' } },
      ],
    });
    mockJob = completedJob([{ category: 'a', region: 'x', value: 10 }]);
    renderPlayground();

    fireEvent.click(screen.getByTestId('metric-playground-run'));
    expect(await screen.findByTestId('metric-playground-bars')).toBeInTheDocument();
    expect(mockRunMetricPreview.mock.calls.at(-1)[0].spec.splitExpr).toBe('category');
    const aggregatesAfterRun = mockRunMetricPreview.mock.calls.length;
    const modelRunsAfterRun = mockJob.executeQuery.mock.calls.length;

    // Switch Split-by to 'region' — must re-aggregate over the SAME model rows.
    const split = screen.getByTestId('metric-playground-split');
    selectEvent.openMenu(within(split).getByRole('combobox'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'region'));

    await waitFor(() =>
      expect(mockRunMetricPreview.mock.calls.at(-1)[0].spec.splitExpr).toBe('region')
    );
    // A fresh local aggregate ran…
    expect(mockRunMetricPreview.mock.calls.length).toBeGreaterThan(aggregatesAfterRun);
    // …but NO new server model run was triggered.
    expect(mockJob.executeQuery.mock.calls.length).toBe(modelRunsAfterRun);
  });

  test('selecting "(none)" clears the split — the auto-default does not re-populate it', async () => {
    seed(DAILY);
    mockJob = completedJob([{ category: 'a', value: 10 }]);
    renderPlayground();

    // The split auto-defaults to the first candidate; pick "(none)" instead.
    const split = screen.getByTestId('metric-playground-split');
    selectEvent.openMenu(within(split).getByRole('combobox'));
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === '(none)'));

    fireEvent.click(screen.getByTestId('metric-playground-run'));
    expect(await screen.findByTestId('metric-playground-bars')).toBeInTheDocument();
    // "(none)" stuck → the aggregate runs with no split (a plain AVG(value)).
    expect(mockRunMetricPreview.mock.calls.at(-1)[0].spec.splitExpr).toBeNull();
  });

  test('surfaces a model-run error', async () => {
    seed(DAILY);
    mockJob = { ...idleJob(), status: 'failed', error: 'connection refused' };
    renderPlayground();
    fireEvent.click(screen.getByTestId('metric-playground-run'));
    expect(await screen.findByTestId('metric-playground-error')).toHaveTextContent(
      'connection refused'
    );
  });

  test('switching metrics resets the run (new metric shows the prompt again)', () => {
    seed({
      metrics: [
        { name: 'avg_value', parentModel: 'daily', config: { expression: 'AVG(value)' } },
        { name: 'sum_total', parentModel: 'weekly', config: { expression: 'SUM(total)' } },
      ],
      dimensions: [
        { name: 'category', parentModel: 'daily', config: { expression: 'category' } },
        { name: 'region', parentModel: 'weekly', config: { expression: 'region' } },
      ],
      models: [
        { name: 'daily', config: { sql: 'SELECT 1', source: 'db' } },
        { name: 'weekly', config: { sql: 'SELECT 2', source: 'db' } },
      ],
    });
    const { rerender } = renderPlayground();
    fireEvent.click(screen.getByTestId('metric-playground-run'));

    rerender(<MetricPlayground activeObject={{ type: 'metric', name: 'sum_total' }} />);
    // The reset clears hasRun → the new metric is back to its pre-run prompt.
    expect(screen.getByTestId('metric-playground-prompt')).toBeInTheDocument();
    expect(mockJob.reset).toHaveBeenCalled();
  });

  test('offers dimensions bound via a raw ${ref(model)} string as split candidates', async () => {
    seed({
      ...DAILY,
      dimensions: [
        { name: 'category', config: { expression: 'category', model: '${ref(daily)}' } },
      ],
    });
    mockJob = completedJob([{ category: 'a' }]);
    renderPlayground();
    fireEvent.click(screen.getByTestId('metric-playground-run'));
    expect(await screen.findByTestId('metric-playground-bars')).toBeInTheDocument();
    expect(mockRunMetricPreview.mock.calls.at(-1)[0].spec.splitExpr).toBe('category');
  });

  test('renders a no-parent callout when the metric has no owning model', () => {
    seed({ metrics: [{ name: 'composite', config: { expression: 'a + b' } }], models: [] });
    renderPlayground('composite');
    expect(screen.getByTestId('metric-playground-no-parent')).toBeInTheDocument();
  });
});
