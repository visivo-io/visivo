import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerLeftPanel from './ExplorerLeftPanel';
import useStore from '../../stores/store';

jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    isDragging: false,
  }),
}));

jest.mock('../new-views/lineage/EmbeddedPill', () => {
  return function MockEmbeddedPill({ objectType, label, as }) {
    const Tag = as === 'div' ? 'div' : 'button';
    return (
      <Tag data-testid={`embedded-pill-${objectType}-${label}`} data-object-type={objectType}>
        {label}
      </Tag>
    );
  };
});

jest.mock('./SourceBrowser', () => {
  return function MockSourceBrowser() {
    return <div data-testid="source-browser">SourceBrowser</div>;
  };
});

jest.mock('../new-views/common/ObjectList', () => {
  return function MockObjectList({ objects, selectedName, onSelect, title, objectType }) {
    return (
      <div data-testid={`object-list-${objectType}`} data-title={title}>
        {objects.map((obj) => (
          <button
            key={obj.name}
            data-testid={`object-item-${objectType}-${obj.name}`}
            onClick={() => onSelect(obj)}
          >
            {obj.name}
          </button>
        ))}
      </div>
    );
  };
});

const mockFetchModels = jest.fn();
const mockFetchMetrics = jest.fn();
const mockFetchDimensions = jest.fn();
const mockFetchInsights = jest.fn();
const mockFetchCharts = jest.fn();
const mockFetchInputs = jest.fn();
const mockToggleExplorerLeftNavCollapsed = jest.fn();
const mockLoadModel = jest.fn();
const mockLoadChart = jest.fn();
const mockSetActiveInsight = jest.fn();
const mockHandleTableSelect = jest.fn();
const mockSetExplorerSources = jest.fn();
const mockSetActiveModelSource = jest.fn();

const defaultState = {
  explorerLeftNavCollapsed: false,
  toggleExplorerLeftNavCollapsed: mockToggleExplorerLeftNavCollapsed,
  handleTableSelect: mockHandleTableSelect,
  loadModel: mockLoadModel,
  loadChart: mockLoadChart,
  setActiveInsight: mockSetActiveInsight,
  setExplorerSources: mockSetExplorerSources,
  setActiveModelSource: mockSetActiveModelSource,
  explorerActiveModelName: null,
  explorerModelStates: {},
  explorerSources: [],
  models: [
    { name: 'orders_model', config: {} },
    { name: 'users_model', config: {} },
  ],
  modelsLoading: false,
  fetchModels: mockFetchModels,
  metrics: [
    { name: 'total_revenue', config: { expression: 'SUM(amount)' } },
    { name: 'order_count', config: { expression: 'COUNT(*)' } },
  ],
  metricsLoading: false,
  fetchMetrics: mockFetchMetrics,
  dimensions: [
    { name: 'order_date', config: { expression: 'DATE(created_at)' } },
  ],
  dimensionsLoading: false,
  fetchDimensions: mockFetchDimensions,
  insights: [
    { name: 'revenue_insight', config: {} },
  ],
  insightsLoading: false,
  fetchInsights: mockFetchInsights,
  charts: [
    { name: 'revenue_chart', config: { insights: ['ref(revenue_insight)'] } },
  ],
  chartsLoading: false,
  fetchCharts: mockFetchCharts,
  inputs: [
    { name: 'date_input', config: {} },
  ],
  inputsLoading: false,
  fetchInputs: mockFetchInputs,
};

describe('ExplorerLeftPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStore.setState(defaultState);
  });

  it('renders collapsed icon rail when explorerLeftNavCollapsed is true', () => {
    useStore.setState({ explorerLeftNavCollapsed: true });

    render(<ExplorerLeftPanel />);

    const panel = screen.getByTestId('left-panel');
    expect(panel).toBeInTheDocument();
    expect(panel.className).toContain('w-12');
    expect(screen.getByTestId('expand-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('left-panel-search')).not.toBeInTheDocument();
  });

  it('renders expanded panel with search input when not collapsed', () => {
    render(<ExplorerLeftPanel />);

    const panel = screen.getByTestId('left-panel');
    expect(panel).toBeInTheDocument();
    expect(panel.className).not.toContain('w-12');
    expect(screen.getByTestId('left-panel-search')).toBeInTheDocument();
    expect(screen.getByTestId('collapse-sidebar')).toBeInTheDocument();
  });

  it('calls fetchModels, fetchMetrics, fetchDimensions, fetchInsights, fetchCharts, fetchInputs on mount', () => {
    render(<ExplorerLeftPanel />);

    expect(mockFetchModels).toHaveBeenCalledTimes(1);
    expect(mockFetchMetrics).toHaveBeenCalledTimes(1);
    expect(mockFetchDimensions).toHaveBeenCalledTimes(1);
    expect(mockFetchInsights).toHaveBeenCalledTimes(1);
    expect(mockFetchCharts).toHaveBeenCalledTimes(1);
    expect(mockFetchInputs).toHaveBeenCalledTimes(1);
  });

  it('search input filters items by name', () => {
    render(<ExplorerLeftPanel />);

    expect(screen.getByTestId('object-item-model-orders_model')).toBeInTheDocument();
    expect(screen.getByTestId('object-item-model-users_model')).toBeInTheDocument();
    expect(screen.getByTestId('draggable-metric-total_revenue')).toBeInTheDocument();
    expect(screen.getByTestId('draggable-metric-order_count')).toBeInTheDocument();

    const searchInput = screen.getByTestId('left-panel-search');
    fireEvent.change(searchInput, { target: { value: 'orders' } });

    expect(screen.getByTestId('object-item-model-orders_model')).toBeInTheDocument();
    expect(screen.queryByTestId('object-item-model-users_model')).not.toBeInTheDocument();
    expect(screen.queryByTestId('draggable-metric-total_revenue')).not.toBeInTheDocument();
    expect(screen.queryByTestId('draggable-metric-order_count')).not.toBeInTheDocument();
  });

  it('clicking a model item calls loadModel', () => {
    render(<ExplorerLeftPanel />);

    fireEvent.click(screen.getByTestId('object-item-model-orders_model'));

    expect(mockLoadModel).toHaveBeenCalledWith({ name: 'orders_model', config: {} });
  });

  it('clicking a chart item calls loadChart with resolved insights and models', () => {
    useStore.setState({
      insights: [
        { name: 'revenue_insight', config: { props: { x: 'ref(orders_model).date' } } },
      ],
      charts: [
        { name: 'revenue_chart', config: { insights: ['ref(revenue_insight)'] } },
      ],
      models: [
        { name: 'orders_model', config: {} },
        { name: 'users_model', config: {} },
      ],
    });

    render(<ExplorerLeftPanel />);

    fireEvent.click(screen.getByTestId('object-item-chart-revenue_chart'));

    expect(mockLoadChart).toHaveBeenCalledTimes(1);
    const [chart, resolvedInsights, resolvedModels] = mockLoadChart.mock.calls[0];
    expect(chart.name).toBe('revenue_chart');
    expect(resolvedInsights).toHaveLength(1);
    expect(resolvedInsights[0].name).toBe('revenue_insight');
    expect(resolvedModels).toHaveLength(1);
    expect(resolvedModels[0].name).toBe('orders_model');
  });

  it('clicking toggle button calls toggleExplorerLeftNavCollapsed', () => {
    render(<ExplorerLeftPanel />);

    fireEvent.click(screen.getByTestId('collapse-sidebar'));

    expect(mockToggleExplorerLeftNavCollapsed).toHaveBeenCalledTimes(1);
  });

  it('clicking expand button in collapsed mode calls toggleExplorerLeftNavCollapsed', () => {
    useStore.setState({ explorerLeftNavCollapsed: true });

    render(<ExplorerLeftPanel />);

    fireEvent.click(screen.getByTestId('expand-sidebar'));

    expect(mockToggleExplorerLeftNavCollapsed).toHaveBeenCalledTimes(1);
  });

  it('renders DraggableItem for each metric with correct type', () => {
    render(<ExplorerLeftPanel />);

    expect(screen.getByTestId('draggable-metric-total_revenue')).toBeInTheDocument();
    expect(screen.getByTestId('draggable-metric-order_count')).toBeInTheDocument();
  });

  it('renders DraggableItem for each dimension with correct type', () => {
    render(<ExplorerLeftPanel />);

    expect(screen.getByTestId('draggable-dimension-order_date')).toBeInTheDocument();
  });

  it('shows empty state when no items match search', () => {
    render(<ExplorerLeftPanel />);

    const searchInput = screen.getByTestId('left-panel-search');
    fireEvent.change(searchInput, { target: { value: 'zzzznonexistent' } });

    expect(screen.getByText('No results for "zzzznonexistent"')).toBeInTheDocument();
  });

  it('shows empty-state CTA when no project objects defined', () => {
    useStore.setState({
      models: [],
      metrics: [],
      dimensions: [],
      insights: [],
      charts: [],
      inputs: [],
    });

    render(<ExplorerLeftPanel />);

    expect(screen.getByText('No data sources yet')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-primary')).toHaveTextContent('Add Source');
  });

  it('renders SourceBrowser', () => {
    render(<ExplorerLeftPanel />);

    expect(screen.getByTestId('source-browser')).toBeInTheDocument();
  });

  it('renders ObjectList for insights', () => {
    render(<ExplorerLeftPanel />);

    expect(screen.getByTestId('object-list-insight')).toBeInTheDocument();
    expect(screen.getByTestId('object-item-insight-revenue_insight')).toBeInTheDocument();
  });

  it('renders inputs as draggable items', () => {
    render(<ExplorerLeftPanel />);

    expect(screen.getByTestId('section-inputs')).toBeInTheDocument();
    expect(screen.getByTestId('draggable-input-date_input')).toBeInTheDocument();
  });

  it('shows loading indicator when any data is loading', () => {
    useStore.setState({ modelsLoading: true });

    render(<ExplorerLeftPanel />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('DraggableItem shows expression when available', () => {
    render(<ExplorerLeftPanel />);

    const draggable = screen.getByTestId('draggable-metric-total_revenue');
    expect(draggable).toHaveTextContent('total_revenue');
    expect(draggable).toHaveTextContent('SUM(amount)');
  });

  it('search is case-insensitive', () => {
    render(<ExplorerLeftPanel />);

    const searchInput = screen.getByTestId('left-panel-search');
    fireEvent.change(searchInput, { target: { value: 'ORDERS' } });

    expect(screen.getByTestId('object-item-model-orders_model')).toBeInTheDocument();
    expect(screen.queryByTestId('object-item-model-users_model')).not.toBeInTheDocument();
  });
});
