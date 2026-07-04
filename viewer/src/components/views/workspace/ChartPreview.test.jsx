/**
 * ChartPreview tests (VIS-784 / N-1).
 *
 * The Track-N chart preview reuses the EXISTING <Chart> renderer, resolving the
 * saved chart from the chart store by name and normalizing its insight refs
 * into { name } objects (the VIS-827 normalization) so <Chart> loads the right
 * data. <Chart> and the data hooks are mocked so this stays a focused unit test.
 */
/* eslint-disable no-template-curly-in-string -- literal ${ref(...)} strings under test */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ChartPreview from './ChartPreview';
import useStore from '../../../stores/store';

// Capture the chart prop handed to the (mocked) renderer so we can assert the
// resolved/normalized config.
const mockChartSpy = jest.fn();
jest.mock('../../items/Chart', () => ({
  __esModule: true,
  default: props => {
    mockChartSpy(props);
    return <div data-testid="chart-renderer-mock">{props.chart?.name}</div>;
  },
}));
jest.mock('../../../hooks/useInsightsData', () => ({
  useInsightsData: jest.fn(),
}));
jest.mock('../../../hooks/useInputsData', () => ({
  useInputsData: jest.fn(),
}));
// Spy on the Input widget so we can assert controls render OUTSIDE the mocked
// Chart (above it), independent of the chart's spinner gate.
jest.mock('../../items/Input', () => ({
  __esModule: true,
  default: ({ input }) => <div data-testid="input-component">{input?.name}</div>,
}));

const seed = (charts = [], { inputs = [], insightJobs = {} } = {}) => {
  act(() => {
    useStore.setState({
      charts,
      fetchCharts: jest.fn(),
      insightJobs,
      inputs,
      fetchInputs: jest.fn(),
    });
  });
};

describe('ChartPreview (VIS-784)', () => {
  beforeEach(() => mockChartSpy.mockClear());

  test('renders the existing Chart renderer for a saved chart', () => {
    seed([
      { name: 'revenue', config: { insights: ['${ref(rev-insight)}'], layout: { title: 'Rev' } } },
    ]);
    render(<ChartPreview activeObject={{ type: 'chart', name: 'revenue' }} projectId="p1" />);
    expect(screen.getByTestId('chart-preview')).toBeInTheDocument();
    expect(screen.getByTestId('chart-renderer-mock')).toHaveTextContent('revenue');
  });

  test('normalizes string insight refs into { name } objects for the renderer', () => {
    seed([{ name: 'revenue', config: { insights: ['${ref(rev-insight)}'] } }]);
    render(<ChartPreview activeObject={{ type: 'chart', name: 'revenue' }} projectId="p1" />);
    const passedChart = mockChartSpy.mock.calls[0][0].chart;
    expect(passedChart.insights).toEqual([{ name: 'rev-insight' }]);
    expect(passedChart.name).toBe('revenue');
  });

  test('preserves embedded insight objects untouched', () => {
    seed([{ name: 'revenue', config: { insights: [{ name: 'inline', props: { type: 'bar' } }] } }]);
    render(<ChartPreview activeObject={{ type: 'chart', name: 'revenue' }} projectId="p1" />);
    const passedChart = mockChartSpy.mock.calls[0][0].chart;
    expect(passedChart.insights).toEqual([{ name: 'inline', props: { type: 'bar' } }]);
  });

  test('renders an empty state when the chart is not found', () => {
    seed([]);
    render(<ChartPreview activeObject={{ type: 'chart', name: 'missing' }} projectId="p1" />);
    expect(screen.getByTestId('chart-preview-empty')).toHaveTextContent(/not found/i);
  });

  // VIS-1003: input-driven chart renders its control widget ABOVE the chart,
  // outside the spinner gate, from the union of its parent insights' deps.
  test('renders input controls outside the Chart for an input-driven chart', () => {
    seed(
      [{ name: 'revenue', config: { insights: ['${ref(rev-insight)}'] } }],
      {
        inputs: [{ name: 'region', config: { name: 'region', type: 'single-select' } }],
        insightJobs: { 'rev-insight': { inputDependencies: ['region'], pendingInputs: null } },
      }
    );
    render(<ChartPreview activeObject={{ type: 'chart', name: 'revenue' }} projectId="p1" />);

    // Control strip renders, with the resolved input widget, alongside the chart.
    expect(screen.getByTestId('input-controls-section')).toBeInTheDocument();
    expect(screen.getByTestId('input-component')).toHaveTextContent('region');
    expect(screen.getByTestId('chart-renderer-mock')).toBeInTheDocument();
  });

  test('renders no control strip for a chart with no input dependencies', () => {
    seed(
      [{ name: 'revenue', config: { insights: ['${ref(rev-insight)}'] } }],
      { insightJobs: { 'rev-insight': { inputDependencies: [], pendingInputs: [] } } }
    );
    render(<ChartPreview activeObject={{ type: 'chart', name: 'revenue' }} projectId="p1" />);

    expect(screen.queryByTestId('input-controls-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('chart-renderer-mock')).toBeInTheDocument();
  });
});
