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

const seed = (charts = []) => {
  act(() => {
    useStore.setState({ charts, fetchCharts: jest.fn(), insightJobs: {} });
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
});
