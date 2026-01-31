import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditorNew from './EditorNew';
import useStore from '../../../stores/store';

// Mock the store
jest.mock('../../../stores/store');

// Mock Material UI icons used in child components
jest.mock('@mui/icons-material/Storage', () => () => <span data-testid="storage-icon" />);
jest.mock('@mui/icons-material/TableChart', () => () => <span data-testid="table-icon" />);
jest.mock('@mui/icons-material/Add', () => () => <span data-testid="add-icon" />);
jest.mock('@mui/icons-material/Close', () => () => <span data-testid="close-icon" />);
jest.mock('@mui/icons-material/DeleteOutline', () => () => <span data-testid="delete-icon" />);
jest.mock('@mui/icons-material/CheckCircle', () => () => <span data-testid="check-icon" />);
jest.mock('@mui/icons-material/ErrorOutline', () => () => <span data-testid="error-icon" />);

// Mock EditPanel since it has complex dependencies
jest.mock('../common/EditPanel', () => ({ editItem, isCreate, onClose }) => (
  <div data-testid="edit-panel">
    {editItem?.type === 'source' && <span>Editing source: {editItem.object?.name}</span>}
    {editItem?.type === 'model' && <span>Editing model: {editItem.object?.name}</span>}
    {isCreate && <span>Creating new object</span>}
    <button onClick={onClose}>Close</button>
  </div>
));

describe('EditorNew', () => {
  const mockFetchProject = jest.fn();
  const mockFetchSources = jest.fn();
  const mockFetchModels = jest.fn();
  const mockFetchDimensions = jest.fn();
  const mockFetchMetrics = jest.fn();
  const mockFetchRelations = jest.fn();
  const mockFetchInsights = jest.fn();
  const mockFetchInputs = jest.fn();
  const mockFetchMarkdowns = jest.fn();
  const mockFetchCharts = jest.fn();
  const mockFetchTables = jest.fn();
  const mockFetchDashboards = jest.fn();
  const mockFetchCsvScriptModels = jest.fn();
  const mockFetchLocalMergeModels = jest.fn();
  const mockFetchDefaults = jest.fn();
  const mockSaveModel = jest.fn();
  const mockSaveChart = jest.fn();
  const mockSaveTable = jest.fn();
  const mockSaveDashboard = jest.fn();
  const mockSaveCsvScriptModel = jest.fn();
  const mockSaveLocalMergeModel = jest.fn();

  const defaultStoreState = {
    project: null,
    fetchProject: mockFetchProject,
    sources: [],
    fetchSources: mockFetchSources,
    sourcesLoading: false,
    sourcesError: null,
    models: [],
    fetchModels: mockFetchModels,
    saveModel: mockSaveModel,
    modelsLoading: false,
    modelsError: null,
    dimensions: [],
    fetchDimensions: mockFetchDimensions,
    dimensionsLoading: false,
    dimensionsError: null,
    metrics: [],
    fetchMetrics: mockFetchMetrics,
    metricsLoading: false,
    metricsError: null,
    relations: [],
    fetchRelations: mockFetchRelations,
    relationsLoading: false,
    relationsError: null,
    insights: [],
    fetchInsights: mockFetchInsights,
    insightsLoading: false,
    insightsError: null,
    inputs: [],
    fetchInputs: mockFetchInputs,
    inputsLoading: false,
    inputsError: null,
    markdowns: [],
    fetchMarkdowns: mockFetchMarkdowns,
    markdownsLoading: false,
    markdownsError: null,
    charts: [],
    fetchCharts: mockFetchCharts,
    saveChart: mockSaveChart,
    chartsLoading: false,
    chartsError: null,
    tables: [],
    fetchTables: mockFetchTables,
    saveTable: mockSaveTable,
    tablesLoading: false,
    tablesError: null,
    dashboards: [],
    fetchDashboards: mockFetchDashboards,
    saveDashboard: mockSaveDashboard,
    dashboardsLoading: false,
    dashboardsError: null,
    csvScriptModels: [],
    fetchCsvScriptModels: mockFetchCsvScriptModels,
    saveCsvScriptModel: mockSaveCsvScriptModel,
    csvScriptModelsLoading: false,
    csvScriptModelsError: null,
    localMergeModels: [],
    fetchLocalMergeModels: mockFetchLocalMergeModels,
    saveLocalMergeModel: mockSaveLocalMergeModel,
    localMergeModelsLoading: false,
    localMergeModelsError: null,
    defaults: null,
    fetchDefaults: mockFetchDefaults,
    defaultsLoading: false,
    defaultsError: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useStore.mockImplementation(selector => {
      if (typeof selector === 'function') {
        return selector(defaultStoreState);
      }
      return defaultStoreState;
    });
  });

  it('renders empty state when no sources or models exist', () => {
    render(<EditorNew />);

    expect(screen.getByText('Select an object to edit')).toBeInTheDocument();
    expect(screen.getByText('or click the + button to create a new object')).toBeInTheDocument();
  });

  it('fetches sources, models, dimensions, metrics, and relations on mount', () => {
    render(<EditorNew />);

    expect(mockFetchSources).toHaveBeenCalled();
    expect(mockFetchModels).toHaveBeenCalled();
    expect(mockFetchDimensions).toHaveBeenCalled();
    expect(mockFetchMetrics).toHaveBeenCalled();
    expect(mockFetchRelations).toHaveBeenCalled();
  });

  it('displays loading state', () => {
    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, sourcesLoading: true };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<EditorNew />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays error state when sources fail to load', () => {
    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, sourcesError: 'Failed to fetch sources' };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<EditorNew />);

    expect(screen.getByText(/Failed to fetch sources/)).toBeInTheDocument();
  });

  it('displays sources list when sources exist', () => {
    const mockSources = [
      { name: 'source1', type: 'sqlite', status: 'published' },
      { name: 'source2', type: 'postgresql', status: 'new' },
    ];

    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, sources: mockSources };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<EditorNew />);

    expect(screen.getByText('source1')).toBeInTheDocument();
    expect(screen.getByText('source2')).toBeInTheDocument();
  });

  it('displays models list when models exist', () => {
    const mockModels = [
      { name: 'model1', sql: 'SELECT * FROM test', status: 'published' },
      { name: 'model2', sql: 'SELECT * FROM users', status: 'modified' },
    ];

    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, models: mockModels };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<EditorNew />);

    expect(screen.getByText('model1')).toBeInTheDocument();
    expect(screen.getByText('model2')).toBeInTheDocument();
  });

  it('opens edit panel when source is selected', async () => {
    const mockSources = [{ name: 'test_source', type: 'sqlite', status: 'published' }];

    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, sources: mockSources };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<EditorNew />);

    const sourceButton = screen.getByText('test_source');
    fireEvent.click(sourceButton);

    await waitFor(() => {
      expect(screen.getByTestId('edit-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('Editing source: test_source')).toBeInTheDocument();
  });

  it('opens edit panel when model is selected', async () => {
    const mockModels = [{ name: 'test_model', sql: 'SELECT 1', status: 'published' }];

    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, models: mockModels };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<EditorNew />);

    const modelButton = screen.getByText('test_model');
    fireEvent.click(modelButton);

    await waitFor(() => {
      expect(screen.getByTestId('edit-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('Editing model: test_model')).toBeInTheDocument();
  });

  it('filters sources by search query', async () => {
    const mockSources = [
      { name: 'production_db', type: 'postgresql', status: 'published' },
      { name: 'test_db', type: 'sqlite', status: 'published' },
    ];

    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, sources: mockSources };
      return typeof selector === 'function' ? selector(state) : state;
    });

    const user = userEvent.setup();
    render(<EditorNew />);

    // Both sources should be visible initially
    expect(screen.getByText('production_db')).toBeInTheDocument();
    expect(screen.getByText('test_db')).toBeInTheDocument();

    // Type in search
    const searchInput = screen.getByPlaceholderText('Search by name...');
    await user.type(searchInput, 'production');

    // Only production_db should be visible
    expect(screen.getByText('production_db')).toBeInTheDocument();
    expect(screen.queryByText('test_db')).not.toBeInTheDocument();
  });

  it('filters models by search query', async () => {
    const mockModels = [
      { name: 'user_model', sql: 'SELECT * FROM users', status: 'published' },
      { name: 'order_model', sql: 'SELECT * FROM orders', status: 'published' },
    ];

    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, models: mockModels };
      return typeof selector === 'function' ? selector(state) : state;
    });

    const user = userEvent.setup();
    render(<EditorNew />);

    // Both models should be visible initially
    expect(screen.getByText('user_model')).toBeInTheDocument();
    expect(screen.getByText('order_model')).toBeInTheDocument();

    // Type in search
    const searchInput = screen.getByPlaceholderText('Search by name...');
    await user.type(searchInput, 'order');

    // Only order_model should be visible
    expect(screen.queryByText('user_model')).not.toBeInTheDocument();
    expect(screen.getByText('order_model')).toBeInTheDocument();
  });

  it('closes edit panel when close button is clicked', async () => {
    const mockSources = [{ name: 'test_source', type: 'sqlite', status: 'published' }];

    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, sources: mockSources };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<EditorNew />);

    // Open the panel
    fireEvent.click(screen.getByText('test_source'));
    await waitFor(() => {
      expect(screen.getByTestId('edit-panel')).toBeInTheDocument();
    });

    // Close the panel
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByTestId('edit-panel')).not.toBeInTheDocument();
    });
  });

  it('displays correct object counts in type filter', () => {
    const mockSources = [
      { name: 'source1', type: 'sqlite', status: 'published' },
      { name: 'source2', type: 'postgresql', status: 'new' },
    ];
    const mockModels = [{ name: 'model1', sql: 'SELECT 1', status: 'published' }];

    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, sources: mockSources, models: mockModels };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<EditorNew />);

    // Check that the counts are displayed (Sources (2) and Models (1))
    expect(screen.getByText('Sources (2)')).toBeInTheDocument();
    expect(screen.getByText('Models (1)')).toBeInTheDocument();
  });
});
