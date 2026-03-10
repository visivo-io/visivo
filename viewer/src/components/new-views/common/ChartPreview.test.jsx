import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChartPreview from './ChartPreview';
import { useInsightPreviewData } from '../../../hooks/usePreviewData';

jest.mock('../../../hooks/usePreviewData', () => ({
  useInsightPreviewData: jest.fn(),
}));

jest.mock('../../items/Chart', () => {
  const ReactModule = require('react');
  const MockChart = ReactModule.forwardRef(({ chart, plotlyConfig, onRelayout, hideToolbar }, ref) => (
    <div data-testid="chart-component">
      <span data-testid="chart-name">{chart?.name}</span>
      <span data-testid="chart-insights">{JSON.stringify(chart?.insights)}</span>
      <span data-testid="chart-layout">{JSON.stringify(chart?.layout)}</span>
      <span data-testid="chart-config">{JSON.stringify(plotlyConfig)}</span>
      <span data-testid="chart-hide-toolbar">{String(hideToolbar)}</span>
      {onRelayout && (
        <button
          data-testid="trigger-relayout"
          onClick={() =>
            onRelayout({
              'title.text': 'Edited Title',
              'xaxis.title.text': 'Edited X',
            })
          }
        />
      )}
    </div>
  ));
  MockChart.displayName = 'MockChart';
  return MockChart;
});

describe('ChartPreview', () => {
  const defaultInsightConfig = {
    name: 'test_insight',
    props: { type: 'scatter', x: 'col_a', y: 'col_b' },
  };

  const defaultChartConfig = {
    name: 'my_chart',
    layout: { title: { text: 'My Chart' } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useInsightPreviewData.mockReturnValue({
      isLoading: false,
      error: null,
      progress: 0,
      progressMessage: '',
      previewInsightKey: '__preview__test_insight',
    });
  });

  it('renders chart when preview data is ready', () => {
    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    expect(screen.getByTestId('chart-preview')).toBeInTheDocument();
    expect(screen.getByTestId('chart-component')).toBeInTheDocument();
  });

  it('passes chart config to Chart component', () => {
    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    expect(screen.getByTestId('chart-name')).toHaveTextContent('my_chart');
    const layout = JSON.parse(screen.getByTestId('chart-layout').textContent);
    expect(layout.title.text).toBe('My Chart');
    expect(layout.autosize).toBe(true);
  });

  it('includes preview insight key in chart insights', () => {
    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    const insights = JSON.parse(screen.getByTestId('chart-insights').textContent);
    expect(insights).toEqual([{ name: '__preview__test_insight' }]);
  });

  it('passes editable plotly config by default', () => {
    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    const config = JSON.parse(screen.getByTestId('chart-config').textContent);
    expect(config.editable).toBe(true);
    expect(config.displayModeBar).toBe(false);
    expect(config.edits.titleText).toBe(true);
  });

  it('passes readonly config when editableLayout is false', () => {
    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
        editableLayout={false}
      />
    );

    const config = JSON.parse(screen.getByTestId('chart-config').textContent);
    expect(config.editable).toBeUndefined();
    expect(config.displayModeBar).toBe(false);
  });

  it('hides toolbar on Chart component', () => {
    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    expect(screen.getByTestId('chart-hide-toolbar')).toHaveTextContent('true');
  });

  it('calls onLayoutChange when Plotly edits happen', () => {
    const onLayoutChange = jest.fn();

    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
        onLayoutChange={onLayoutChange}
      />
    );

    screen.getByTestId('trigger-relayout').click();

    expect(onLayoutChange).toHaveBeenCalledWith({
      title: { text: 'Edited Title' },
      xaxis: { title: { text: 'Edited X' } },
    });
  });

  it('does not render relayout handler when editableLayout is false', () => {
    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
        editableLayout={false}
      />
    );

    expect(screen.queryByTestId('trigger-relayout')).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    useInsightPreviewData.mockReturnValue({
      isLoading: true,
      error: null,
      progress: 0.5,
      progressMessage: 'Running query...',
      previewInsightKey: '__preview__test_insight',
    });

    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    expect(screen.getByTestId('chart-preview-loading')).toBeInTheDocument();
    expect(screen.getByText('Running Preview')).toBeInTheDocument();
    expect(screen.getByText('Running query...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    useInsightPreviewData.mockReturnValue({
      isLoading: false,
      error: 'SQL syntax error near line 3',
      progress: 0,
      progressMessage: '',
      previewInsightKey: '__preview__test_insight',
    });

    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    expect(screen.getByTestId('chart-preview-error')).toBeInTheDocument();
    expect(screen.getByText('Preview Failed')).toBeInTheDocument();
    expect(screen.getByText('SQL syntax error near line 3')).toBeInTheDocument();
  });

  it('shows empty state when no preview key', () => {
    useInsightPreviewData.mockReturnValue({
      isLoading: false,
      error: null,
      progress: 0,
      progressMessage: '',
      previewInsightKey: null,
    });

    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    expect(screen.getByTestId('chart-preview-empty')).toBeInTheDocument();
    expect(screen.getByText('Run a query to see chart preview')).toBeInTheDocument();
  });

  it('uses default chart name when chartConfig has no name', () => {
    render(
      <ChartPreview
        chartConfig={{ layout: {} }}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    expect(screen.getByTestId('chart-name')).toHaveTextContent('Preview Chart');
  });

  it('renders empty insights when previewInsightKey is null', () => {
    useInsightPreviewData.mockReturnValue({
      isLoading: false,
      error: null,
      progress: 0,
      progressMessage: '',
      previewInsightKey: null,
    });

    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    // Should show empty state, not chart
    expect(screen.getByTestId('chart-preview-empty')).toBeInTheDocument();
  });

  it('passes insightConfig to useInsightPreviewData', () => {
    render(
      <ChartPreview
        chartConfig={defaultChartConfig}
        insightConfig={defaultInsightConfig}
        projectId="proj-1"
      />
    );

    expect(useInsightPreviewData).toHaveBeenCalledWith(defaultInsightConfig, {
      projectId: 'proj-1',
    });
  });
});
