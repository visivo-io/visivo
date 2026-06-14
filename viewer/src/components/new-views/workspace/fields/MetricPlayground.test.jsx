/**
 * MetricPlayground tests (VIS-1009).
 *
 * The Field Lens body for a metric: a synthetic single-metric insight rendered
 * through the SAME `common/InsightPreview` the Explorer uses, plus always-
 * defaulted split-by + time-grain controls. We mock the Explorer preview (so we
 * can assert the synthetic insight config it receives) and seed the store with
 * the metric, its parent model, and a sibling dimension to split on.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import MetricPlayground from './MetricPlayground';
import useStore from '../../../../stores/store';

const mockPreviewSpy = jest.fn();
jest.mock('../../common/InsightPreview', () => ({
  __esModule: true,
  default: props => {
    mockPreviewSpy(props);
    return <div data-testid="explorer-insight-preview-mock">{props.insightConfig?.name}</div>;
  },
}));

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
  render(<MetricPlayground activeObject={{ type: 'metric', name }} projectId="p1" />);

describe('MetricPlayground (VIS-1009)', () => {
  beforeEach(() => mockPreviewSpy.mockClear());

  test('renders the metric expression, value preview, and split + time-grain controls', () => {
    seed({
      metrics: [{ name: 'avg_value', parentModel: 'daily', config: { expression: 'AVG(value)' } }],
      dimensions: [
        { name: 'category', parentModel: 'daily', config: { expression: 'category' } },
      ],
      models: [{ name: 'daily', config: { sql: 'SELECT 1' } }],
    });
    renderPlayground();

    expect(screen.getByTestId('metric-playground')).toBeInTheDocument();
    expect(screen.getByTestId('metric-playground-expression')).toHaveTextContent('AVG(value)');
    // The mini result mounts the shared Explorer insight preview (value + chart).
    expect(screen.getByTestId('metric-playground-result')).toBeInTheDocument();
    expect(screen.getByTestId('explorer-insight-preview-mock')).toBeInTheDocument();
    // Both controls render.
    expect(screen.getByTestId('metric-playground-split')).toBeInTheDocument();
    expect(screen.getByTestId('metric-playground-time-grain')).toBeInTheDocument();
  });

  test('builds a synthetic insight referencing the metric, defaulting the split to a sibling dimension', () => {
    seed({
      metrics: [{ name: 'avg_value', parentModel: 'daily', config: { expression: 'AVG(value)' } }],
      dimensions: [
        { name: 'category', parentModel: 'daily', config: { expression: 'category' } },
      ],
      models: [{ name: 'daily', config: { sql: 'SELECT 1' } }],
    });
    renderPlayground();

    const cfg = mockPreviewSpy.mock.calls.at(-1)[0].insightConfig;
    expect(cfg.props.type).toBe('bar');
    // y references the named metric on its parent model.
    expect(cfg.props.y).toContain('ref(daily).avg_value');
    // x + split default to the sibling dimension (always-defaulted, no user input).
    expect(cfg.props.x).toContain('ref(daily).category');
    expect(cfg.interactions[0].split).toContain('ref(daily).category');
  });

  test('a date split engages the time-grain control and date_trunc-buckets x', () => {
    seed({
      metrics: [{ name: 'avg_value', parentModel: 'daily', config: { expression: 'AVG(value)' } }],
      dimensions: [
        { name: 'formatted_date', parentModel: 'daily', config: { expression: "strftime(date)" } },
      ],
      models: [{ name: 'daily', config: { sql: 'SELECT 1' } }],
    });
    renderPlayground();

    // formatted_date is the only (and default) split → date-like → grain enabled.
    const grain = screen.getByTestId('metric-playground-time-grain');
    expect(grain).not.toBeDisabled();

    fireEvent.change(grain, { target: { value: 'quarter' } });
    const cfg = mockPreviewSpy.mock.calls.at(-1)[0].insightConfig;
    expect(cfg.props.x).toContain("date_trunc('quarter'");
    expect(cfg.props.x).toContain('ref(daily).formatted_date');
  });

  test('renders a no-parent callout when the metric has no owning model', () => {
    seed({
      metrics: [{ name: 'composite', config: { expression: 'a + b' } }],
      models: [],
    });
    renderPlayground('composite');
    expect(screen.getByTestId('metric-playground-no-parent')).toBeInTheDocument();
  });
});
