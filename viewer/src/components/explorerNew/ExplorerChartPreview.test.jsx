import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerChartPreview from './ExplorerChartPreview';
import useStore from '../../stores/store';

// Override the global react-plotly.js mock to capture props
let lastPlotProps = null;
jest.mock('react-plotly.js', () => {
  return function MockPlot(props) {
    lastPlotProps = props;
    return <div data-testid="plotly-chart">Mock Plot</div>;
  };
});

const mockQueryResult = {
  columns: ['date', 'amount', 'category'],
  rows: [
    { date: '2024-01', amount: 100, category: 'A' },
    { date: '2024-02', amount: 200, category: 'B' },
    { date: '2024-03', amount: 150, category: 'A' },
  ],
};

describe('ExplorerChartPreview', () => {
  beforeEach(() => {
    lastPlotProps = null;
    useStore.setState({
      explorerQueryResult: null,
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerChartLayout: {},
      syncPlotlyEditsToChartLayout: jest.fn(),
    });
  });

  it('shows empty state when no query results', () => {
    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-empty-no-results')).toBeInTheDocument();
    expect(screen.getByText('Run a query to see chart preview')).toBeInTheDocument();
  });

  it('shows empty state when results exist but no axis mapping', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-empty-no-axes')).toBeInTheDocument();
  });

  it('renders Plotly chart when results and axes are configured', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-preview')).toBeInTheDocument();
    expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
  });

  it('maps query result columns to Plotly trace data', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount', mode: 'lines+markers' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPlotProps.data).toHaveLength(1);
    expect(lastPlotProps.data[0]).toEqual(
      expect.objectContaining({
        type: 'scatter',
        x: ['2024-01', '2024-02', '2024-03'],
        y: [100, 200, 150],
        mode: 'lines+markers',
      })
    );
  });

  it('creates bar chart traces correctly', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'bar', x: 'category', y: 'amount' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPlotProps.data[0].type).toBe('bar');
    expect(lastPlotProps.data[0].x).toEqual(['A', 'B', 'A']);
  });

  it('splits traces by color column', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount', color: 'category' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPlotProps.data).toHaveLength(2);
    expect(lastPlotProps.data[0].name).toBe('A');
    expect(lastPlotProps.data[0].x).toEqual(['2024-01', '2024-03']);
    expect(lastPlotProps.data[0].y).toEqual([100, 150]);
    expect(lastPlotProps.data[1].name).toBe('B');
    expect(lastPlotProps.data[1].x).toEqual(['2024-02']);
    expect(lastPlotProps.data[1].y).toEqual([200]);
  });

  it('maps size column to marker.size', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount', size: 'amount' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPlotProps.data[0].marker.size).toEqual([100, 200, 150]);
  });

  it('applies default layout with colorway', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPlotProps.layout.colorway).toEqual(
      expect.arrayContaining(['#713B57', '#FFB400'])
    );
    expect(lastPlotProps.layout.autosize).toBe(true);
  });

  it('merges explorerChartLayout into Plotly layout', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount' },
      },
      explorerChartLayout: {
        title: { text: 'My Chart' },
        xaxis: { title: { text: 'Date' } },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPlotProps.layout.title).toEqual({ text: 'My Chart' });
    expect(lastPlotProps.layout.xaxis).toEqual({ title: { text: 'Date' } });
  });

  it('enables editable mode in Plotly config', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPlotProps.config.editable).toBe(true);
    expect(lastPlotProps.config.edits).toEqual(
      expect.objectContaining({ titleText: true, axisTitleText: true })
    );
    expect(lastPlotProps.config.responsive).toBe(true);
  });

  it('syncs Plotly title edits to store via onRelayout', () => {
    const mockSync = jest.fn();
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount' },
      },
      syncPlotlyEditsToChartLayout: mockSync,
    });

    render(<ExplorerChartPreview />);

    // Simulate Plotly relayout event for title edit
    lastPlotProps.onRelayout({ 'title.text': 'New Title' });

    expect(mockSync).toHaveBeenCalledWith({ title: { text: 'New Title' } });
  });

  it('syncs axis title edits to store', () => {
    const mockSync = jest.fn();
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount' },
      },
      syncPlotlyEditsToChartLayout: mockSync,
    });

    render(<ExplorerChartPreview />);

    lastPlotProps.onRelayout({
      'xaxis.title.text': 'Date Column',
      'yaxis.title.text': 'Amount',
    });

    expect(mockSync).toHaveBeenCalledWith({
      xaxis: { title: { text: 'Date Column' } },
      yaxis: { title: { text: 'Amount' } },
    });
  });

  it('does not sync non-edit relayout events (e.g., zoom)', () => {
    const mockSync = jest.fn();
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount' },
      },
      syncPlotlyEditsToChartLayout: mockSync,
    });

    render(<ExplorerChartPreview />);

    // Simulate zoom event (not a title edit)
    lastPlotProps.onRelayout({ 'xaxis.range[0]': 0, 'xaxis.range[1]': 10 });

    expect(mockSync).not.toHaveBeenCalled();
  });

  it('renders with only y axis configured', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'bar', y: 'amount' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-preview')).toBeInTheDocument();
    expect(lastPlotProps.data[0].y).toEqual([100, 200, 150]);
    expect(lastPlotProps.data[0].x).toBeUndefined();
  });

  it('handles empty rows gracefully', () => {
    useStore.setState({
      explorerQueryResult: { columns: ['date', 'amount'], rows: [] },
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-preview')).toBeInTheDocument();
    expect(lastPlotProps.data).toEqual([]);
  });

  it('uses useResizeHandler for responsive sizing', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerInsightConfig: {
        name: 'test',
        props: { type: 'scatter', x: 'date', y: 'amount' },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPlotProps.useResizeHandler).toBe(true);
    expect(lastPlotProps.style).toEqual({ width: '100%', height: '100%' });
  });
});
