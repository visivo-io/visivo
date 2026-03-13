/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerChartPreview from './ExplorerChartPreview';
import useStore from '../../stores/store';

jest.mock('../new-views/common/ChartPreview', () => {
  return function MockChartPreview({
    chartConfig,
    insightConfig,
    projectId,
    onLayoutChange,
    editableLayout,
    contextObjects,
  }) {
    return (
      <div data-testid="chart-preview-component">
        <span data-testid="cp-chart-name">{chartConfig?.name}</span>
        <span data-testid="cp-insight-name">{insightConfig?.name}</span>
        <span data-testid="cp-insight-type">{insightConfig?.props?.type}</span>
        <span data-testid="cp-insight-props">{JSON.stringify(insightConfig?.props)}</span>
        <span data-testid="cp-project-id">{projectId}</span>
        <span data-testid="cp-editable">{String(editableLayout)}</span>
        <span data-testid="cp-layout">{JSON.stringify(chartConfig?.layout)}</span>
        <span data-testid="cp-context-objects">{JSON.stringify(contextObjects)}</span>
        {onLayoutChange && (
          <button
            data-testid="cp-trigger-layout"
            onClick={() => onLayoutChange({ title: { text: 'Edited' } })}
          />
        )}
      </div>
    );
  };
});

const mockQueryResult = {
  columns: ['date', 'amount'],
  rows: [{ date: '2024-01', amount: 100 }],
  row_count: 1,
};

describe('ExplorerChartPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStore.setState({
      explorerQueryResult: null,
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerChartLayout: {},
      explorerActiveModelName: null,
      syncPlotlyEditsToChartLayout: jest.fn(),
      explorerSql: 'SELECT * FROM users',
      explorerSourceName: 'pg',
      explorerComputedColumns: [],
      project: { id: 'proj-1' },
    });
  });

  it('shows empty state when no query results', () => {
    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-empty-no-results')).toBeInTheDocument();
    expect(screen.getByText('Run a query to see chart preview')).toBeInTheDocument();
  });

  it('shows empty config state when insight has no data props beyond type', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-empty-no-config')).toBeInTheDocument();
    expect(
      screen.getByText('Drag columns to axis fields to see chart preview')
    ).toBeInTheDocument();
  });

  it('renders ChartPreview when results, active model, and data props exist', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-preview-component')).toBeInTheDocument();
  });

  it('constructs backend insight config with actual model name', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: {
        name: '',
        props: {
          type: 'scatter',
          x: '?{${ref(sales_model).date}}',
          y: '?{${ref(sales_model).amount}}',
        },
      },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('cp-insight-name')).toHaveTextContent('sales_model_preview_insight');
    expect(screen.getByTestId('cp-insight-type')).toHaveTextContent('scatter');
  });

  it('passes chart layout from store', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      explorerChartLayout: { title: { text: 'My Chart' } },
    });

    render(<ExplorerChartPreview />);

    const layout = JSON.parse(screen.getByTestId('cp-layout').textContent);
    expect(layout.title.text).toBe('My Chart');
  });

  it('passes projectId from store', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      project: { id: 'my-project-123' },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('cp-project-id')).toHaveTextContent('my-project-123');
  });

  it('enables editable layout', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('cp-editable')).toHaveTextContent('true');
  });

  it('passes syncPlotlyEdits as onLayoutChange', () => {
    const mockSync = jest.fn();
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      syncPlotlyEditsToChartLayout: mockSync,
    });

    render(<ExplorerChartPreview />);

    screen.getByTestId('cp-trigger-layout').click();
    expect(mockSync).toHaveBeenCalledWith({ title: { text: 'Edited' } });
  });

  it('uses chart name from active model name', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'my_model',
      explorerInsightConfig: { name: '', props: { type: 'bar', x: 'date', y: 'amount' } },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('cp-chart-name')).toHaveTextContent('my_model_chart');
  });

  it('builds contextObjects with model from SQL and source', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      explorerSql: 'SELECT * FROM sales',
      explorerSourceName: 'pg',
    });

    render(<ExplorerChartPreview />);

    const ctx = JSON.parse(screen.getByTestId('cp-context-objects').textContent);
    expect(ctx.models).toEqual([
      { name: 'sales_model', sql: 'SELECT * FROM sales', source: '${ref(pg)}' },
    ]);
  });

  it('includes computed columns as dimensions/metrics in contextObjects', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      explorerSql: 'SELECT * FROM sales',
      explorerSourceName: 'pg',
      explorerComputedColumns: [
        { name: 'order_month', expression: "DATE_TRUNC('month', date)", type: 'dimension' },
        { name: 'total_rev', expression: 'SUM(amount)', type: 'metric' },
      ],
    });

    render(<ExplorerChartPreview />);

    const ctx = JSON.parse(screen.getByTestId('cp-context-objects').textContent);
    expect(ctx.models).toEqual([
      {
        name: 'sales_model',
        sql: 'SELECT * FROM sales',
        source: '${ref(pg)}',
        dimensions: [{ name: 'order_month', expression: "DATE_TRUNC('month', date)" }],
        metrics: [{ name: 'total_rev', expression: 'SUM(amount)' }],
      },
    ]);
  });

  it('contextObjects is null when SQL or source missing', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      explorerSql: '',
      explorerSourceName: 'pg',
    });

    render(<ExplorerChartPreview />);

    const ctx = screen.getByTestId('cp-context-objects').textContent;
    expect(ctx).toBe('null');
  });

  it('uses preview_model as fallback model name in contextObjects', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: null,
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      explorerSql: 'SELECT 1',
      explorerSourceName: 'pg',
    });

    render(<ExplorerChartPreview />);

    const ctx = JSON.parse(screen.getByTestId('cp-context-objects').textContent);
    expect(ctx.models[0].name).toBe('preview_model');
  });
});
