import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerChartPreview from './ExplorerChartPreview';
import useStore from '../../stores/store';

jest.mock('../new-views/common/ChartPreview', () => {
  return function MockChartPreview({ chartConfig, insightConfig, projectId, onLayoutChange, editableLayout }) {
    return (
      <div data-testid="chart-preview-component">
        <span data-testid="cp-chart-name">{chartConfig?.name}</span>
        <span data-testid="cp-insight-name">{insightConfig?.name}</span>
        <span data-testid="cp-insight-type">{insightConfig?.props?.type}</span>
        <span data-testid="cp-insight-props">{JSON.stringify(insightConfig?.props)}</span>
        <span data-testid="cp-project-id">{projectId}</span>
        <span data-testid="cp-editable">{String(editableLayout)}</span>
        <span data-testid="cp-layout">{JSON.stringify(chartConfig?.layout)}</span>
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

jest.mock('../../hooks/useDebounce', () => ({
  useDebounce: (value) => value,
}));

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
      saveModelToCache: jest.fn().mockResolvedValue(undefined),
      saveInsightToCache: jest.fn().mockResolvedValue(undefined),
      explorerSql: 'SELECT * FROM users',
      explorerSourceName: 'pg',
      project: { id: 'proj-1' },
    });
  });

  it('shows empty state when no query results', () => {
    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-empty-no-results')).toBeInTheDocument();
    expect(screen.getByText('Run a query to see chart preview')).toBeInTheDocument();
  });

  it('auto-generates preview_model when no active model set', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: null,
    });

    render(<ExplorerChartPreview />);

    // Should auto-set explorerActiveModelName to 'preview_model'
    expect(useStore.getState().explorerActiveModelName).toBe('preview_model');
    // But with only {type: 'scatter'} and no data props, shows empty config state
    expect(screen.getByTestId('chart-empty-no-config')).toBeInTheDocument();
  });

  it('shows empty config state when insight has no data props beyond type', () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
    });

    render(<ExplorerChartPreview />);

    expect(screen.getByTestId('chart-empty-no-config')).toBeInTheDocument();
    expect(screen.getByText('Drag columns to axis fields to see chart preview')).toBeInTheDocument();
  });

  it('renders ChartPreview when results, active model, data props, and model saved', async () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
    });

    await act(async () => {
      render(<ExplorerChartPreview />);
    });

    expect(screen.getByTestId('chart-preview-component')).toBeInTheDocument();
  });

  it('constructs backend insight config with actual model name', async () => {
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

    await act(async () => {
      render(<ExplorerChartPreview />);
    });

    expect(screen.getByTestId('cp-insight-name')).toHaveTextContent('sales_model_preview_insight');
    expect(screen.getByTestId('cp-insight-type')).toHaveTextContent('scatter');
  });

  it('passes chart layout from store', async () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      explorerChartLayout: { title: { text: 'My Chart' } },
    });

    await act(async () => {
      render(<ExplorerChartPreview />);
    });

    const layout = JSON.parse(screen.getByTestId('cp-layout').textContent);
    expect(layout.title.text).toBe('My Chart');
  });

  it('passes projectId from store', async () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      project: { id: 'my-project-123' },
    });

    await act(async () => {
      render(<ExplorerChartPreview />);
    });

    expect(screen.getByTestId('cp-project-id')).toHaveTextContent('my-project-123');
  });

  it('enables editable layout', async () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
    });

    await act(async () => {
      render(<ExplorerChartPreview />);
    });

    expect(screen.getByTestId('cp-editable')).toHaveTextContent('true');
  });

  it('passes syncPlotlyEdits as onLayoutChange', async () => {
    const mockSync = jest.fn();
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'sales_model',
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'date', y: 'amount' } },
      syncPlotlyEditsToChartLayout: mockSync,
    });

    await act(async () => {
      render(<ExplorerChartPreview />);
    });

    screen.getByTestId('cp-trigger-layout').click();
    expect(mockSync).toHaveBeenCalledWith({ title: { text: 'Edited' } });
  });

  it('saves model to cache when query result arrives', async () => {
    const mockSaveModel = jest.fn().mockResolvedValue(undefined);
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: null,
      saveModelToCache: mockSaveModel,
    });

    await act(async () => {
      render(<ExplorerChartPreview />);
    });

    expect(mockSaveModel).toHaveBeenCalledWith('preview_model', expect.objectContaining({
      name: 'preview_model',
      sql: 'SELECT * FROM users',
      source: 'ref(pg)',
    }));
  });

  it('uses chart name from active model name', async () => {
    useStore.setState({
      explorerQueryResult: mockQueryResult,
      explorerActiveModelName: 'my_model',
      explorerInsightConfig: { name: '', props: { type: 'bar', x: 'date', y: 'amount' } },
    });

    await act(async () => {
      render(<ExplorerChartPreview />);
    });

    expect(screen.getByTestId('cp-chart-name')).toHaveTextContent('my_model_chart');
  });

  it('does not save insight without query results', () => {
    const mockSaveInsight = jest.fn().mockResolvedValue(undefined);
    useStore.setState({
      explorerQueryResult: null,
      explorerActiveModelName: null,
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      saveInsightToCache: mockSaveInsight,
    });

    render(<ExplorerChartPreview />);

    expect(mockSaveInsight).not.toHaveBeenCalled();
  });
});
