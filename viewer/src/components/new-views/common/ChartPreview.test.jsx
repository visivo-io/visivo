import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChartPreview from './ChartPreview';

jest.mock('../../items/Chart', () => {
  const ReactModule = require('react');
  const MockChart = ReactModule.forwardRef(({ chart, plotlyConfig, onRelayout }, ref) => (
    <div data-testid="chart-component">
      <span data-testid="chart-name">{chart?.name}</span>
      <span data-testid="chart-insights">{JSON.stringify(chart?.insights)}</span>
      <span data-testid="chart-layout">{JSON.stringify(chart?.layout)}</span>
      <span data-testid="chart-config">{JSON.stringify(plotlyConfig)}</span>
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

describe('ChartPreview (presentational)', () => {
  const chartConfig = {
    name: 'my_chart',
    layout: { title: { text: 'My Chart' } },
  };

  it('renders chart with insight keys as chart.insights', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a', '__preview__b']}
        projectId="proj-1"
      />
    );

    expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    const insights = JSON.parse(screen.getByTestId('chart-insights').textContent);
    expect(insights).toEqual([{ name: '__preview__a' }, { name: '__preview__b' }]);
  });

  it('forwards chart name and layout', () => {
    render(
      <ChartPreview chartConfig={chartConfig} insightKeys={['__preview__a']} projectId="p" />
    );
    expect(screen.getByTestId('chart-name')).toHaveTextContent('my_chart');
    const layout = JSON.parse(screen.getByTestId('chart-layout').textContent);
    expect(layout.title.text).toBe('My Chart');
  });

  it('filters falsy keys', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={[null, '__preview__a', undefined, '__preview__b', '']}
        projectId="p"
      />
    );
    const insights = JSON.parse(screen.getByTestId('chart-insights').textContent);
    expect(insights).toEqual([{ name: '__preview__a' }, { name: '__preview__b' }]);
  });

  it('shows loading state when isLoading is true', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        isLoading={true}
        progress={0.5}
        progressMessage="Running query"
      />
    );
    expect(screen.getByTestId('chart-preview-loading')).toBeInTheDocument();
    expect(screen.getByText('Running query')).toBeInTheDocument();
  });

  it('shows error state when error prop is set', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        error="Something went wrong"
      />
    );
    expect(screen.getByTestId('chart-preview-error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows empty state when insightKeys is empty', () => {
    render(<ChartPreview chartConfig={chartConfig} insightKeys={[]} projectId="p" />);
    expect(screen.getByTestId('chart-preview-empty')).toBeInTheDocument();
  });

  it('shows empty state when insightKeys contains only falsy values', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={[null, undefined, '']}
        projectId="p"
      />
    );
    expect(screen.getByTestId('chart-preview-empty')).toBeInTheDocument();
  });

  it('calls onLayoutChange with extracted title edits from relayout', () => {
    const onLayoutChange = jest.fn();
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        onLayoutChange={onLayoutChange}
        editableLayout={true}
      />
    );
    fireEvent.click(screen.getByTestId('trigger-relayout'));
    expect(onLayoutChange).toHaveBeenCalledWith({
      title: { text: 'Edited Title' },
      xaxis: { title: { text: 'Edited X' } },
    });
  });

  it('uses readonly plotly config when editableLayout=false', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        editableLayout={false}
      />
    );
    const config = JSON.parse(screen.getByTestId('chart-config').textContent);
    expect(config.editable).toBeUndefined();
  });

  it('uses editable plotly config when editableLayout=true', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        editableLayout={true}
      />
    );
    const config = JSON.parse(screen.getByTestId('chart-config').textContent);
    expect(config.editable).toBe(true);
  });
});
