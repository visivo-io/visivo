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

  it('shows error state when error prop is set, with the raw message tucked behind technical details', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        error="Something went wrong"
      />
    );
    expect(screen.getByTestId('chart-preview-error')).toBeInTheDocument();
    expect(screen.getByText('This preview failed to run.')).toBeInTheDocument();
    expect(screen.getByTestId('chart-preview-error-technical')).toHaveTextContent(
      'Something went wrong'
    );
  });

  // ux-audit.md "error translation" finding (cold-start #1, promote-roundtrip
  // #1/#2, pills #3): a hashed internal table name must never appear as the
  // prominent headline — only inside the collapsed technical details.
  it('translates a hashed-table catalog error to plain language, hiding the hash from the headline', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        error='Catalog Error: Table with name mfiawdybhqqkwzuxbjzfxqbvbaibc does not exist! Did you mean "pg_index"?'
      />
    );
    // The headline and hint are exact, hash-free strings — the hash exists
    // ONLY inside the collapsed technical-details block below.
    expect(screen.getByText("This chart hasn't loaded any data yet.")).toBeInTheDocument();
    expect(
      screen.getByText('Run your query, then come back to this tab to see a preview.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('chart-preview-error-technical')).toHaveTextContent(
      'mfiawdybhqqkwzuxbjzfxqbvbaibc'
    );
  });

  it('translates "has no dependent models" jargon to a plain drag-a-column hint', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        error="Insight 'insight' has no dependent models"
      />
    );
    const errorPanel = screen.getByTestId('chart-preview-error');
    expect(errorPanel).toHaveTextContent("isn't connected to any data yet");
    expect(errorPanel).toHaveTextContent('Drag a column from the Library');
  });

  it('accepts an Error-shaped object (not just a string) for the error prop', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        error={new Error('boom from an Error object')}
      />
    );
    expect(screen.getByTestId('chart-preview-error-technical')).toHaveTextContent(
      'boom from an Error object'
    );
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
