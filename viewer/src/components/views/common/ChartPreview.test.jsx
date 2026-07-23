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
        <>
          <button
            data-testid="trigger-relayout"
            onClick={() =>
              onRelayout({
                'title.text': 'Edited Title',
                'xaxis.title.text': 'Edited X',
              })
            }
          />
          <button
            data-testid="trigger-relayout-yaxis"
            onClick={() => onRelayout({ 'yaxis.title.text': 'Edited Y' })}
          />
          <button
            data-testid="trigger-relayout-irrelevant"
            onClick={() => onRelayout({ 'some.other.key': 'ignored' })}
          />
          <button data-testid="trigger-relayout-falsy" onClick={() => onRelayout(null)} />
        </>
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

  it('shows empty state when insightKeys is omitted entirely (insightKeys || [] fallback)', () => {
    render(<ChartPreview chartConfig={chartConfig} projectId="p" />);
    expect(screen.getByTestId('chart-preview-empty')).toBeInTheDocument();
  });

  it('accepts an error object with no .message property at all (String() fallback)', () => {
    render(
      <ChartPreview
        chartConfig={chartConfig}
        insightKeys={['__preview__a']}
        projectId="p"
        error={{ code: 'WEIRD_FAILURE' }}
      />
    );
    expect(screen.getByTestId('chart-preview-error-technical')).toHaveTextContent('[object Object]');
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

  it('calls onLayoutChange with an extracted yaxis title edit from relayout', () => {
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
    fireEvent.click(screen.getByTestId('trigger-relayout-yaxis'));
    expect(onLayoutChange).toHaveBeenCalledWith({ yaxis: { title: { text: 'Edited Y' } } });
  });

  it('never calls onLayoutChange when the relayout update carries no recognized keys', () => {
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
    fireEvent.click(screen.getByTestId('trigger-relayout-irrelevant'));
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('a falsy relayout update is a no-op, never throws and never calls onLayoutChange', () => {
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
    expect(() => fireEvent.click(screen.getByTestId('trigger-relayout-falsy'))).not.toThrow();
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('relayout is a safe no-op (never throws) when no onLayoutChange callback was provided at all', () => {
    render(
      <ChartPreview chartConfig={chartConfig} insightKeys={['__preview__a']} projectId="p" editableLayout={true} />
    );
    expect(() => fireEvent.click(screen.getByTestId('trigger-relayout'))).not.toThrow();
  });

  it('falls back to a default name and default layout margins when chartConfig is omitted entirely', () => {
    render(<ChartPreview insightKeys={['__preview__a']} projectId="p" />);
    expect(screen.getByTestId('chart-name')).toHaveTextContent('Preview Chart');
    const layout = JSON.parse(screen.getByTestId('chart-layout').textContent);
    expect(layout).toEqual({ autosize: true, margin: { l: 70, r: 70, t: 50, b: 70 } });
  });
});
