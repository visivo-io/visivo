import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LineageNew from './LineageNew';
import useStore from '../../../stores/store';
import { useLineageDag } from './useLineageDag';

// Mock the store
jest.mock('../../../stores/store');

// Mock the useLineageDag hook
jest.mock('./useLineageDag');

// Mock the computeLayout function to avoid dagre issues in tests
jest.mock('./useLineageDag', () => ({
  useLineageDag: jest.fn(),
  computeLayout: jest.fn((nodes, edges, fixedNode) => {
    // In tests, just return nodes with dummy positions
    return nodes.map((node, index) => ({
      ...node,
      position: { x: index * 200, y: 100 },
    }));
  }),
}));

// Mock reactflow
jest.mock('reactflow', () => {
  const MockReactFlow = ({ nodes, edges, onNodeClick, children }) => (
    <div data-testid="react-flow">
      {nodes.map(node => (
        <div
          key={node.id}
          data-testid={`node-${node.id}`}
          onClick={e => onNodeClick && onNodeClick(e, node)}
        >
          {node.data.label}
        </div>
      ))}
      {edges.map(edge => (
        <div key={edge.id} data-testid={`edge-${edge.id}`}>
          {edge.source} -&gt; {edge.target}
        </div>
      ))}
      {children}
    </div>
  );
  MockReactFlow.displayName = 'MockReactFlow';
  return {
    __esModule: true,
    default: MockReactFlow,
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    MiniMap: () => <div data-testid="minimap" />,
    addEdge: jest.fn(),
    applyEdgeChanges: jest.fn(),
  };
});

// Mock react-icons
jest.mock('react-icons/md', () => ({
  MdOutlineZoomOutMap: () => <span data-testid="zoom-icon" />,
}));

// Mock Material UI icons
jest.mock('@mui/icons-material/Storage', () => () => <span data-testid="storage-icon" />);
jest.mock('@mui/icons-material/TableChart', () => () => <span data-testid="table-icon" />);
jest.mock('@mui/icons-material/Add', () => () => <span data-testid="add-icon" />);
jest.mock('@mui/icons-material/Close', () => () => <span data-testid="close-icon" />);

// Mock EditPanel
jest.mock('../common/EditPanel', () => ({ editItem, isCreate, onClose }) => (
  <div data-testid="edit-panel">
    {editItem?.type === 'source' && <span>Editing source: {editItem.object?.name}</span>}
    {editItem?.type === 'model' && <span>Editing model: {editItem.object?.name}</span>}
    {isCreate && <span>Creating new object</span>}
    <button onClick={onClose}>Close</button>
  </div>
));

describe('LineageNew', () => {
  const mockFetchSources = jest.fn();
  const mockFetchModels = jest.fn();
  const mockFetchDimensions = jest.fn();
  const mockFetchMetrics = jest.fn();
  const mockFetchRelations = jest.fn();
  const mockFetchInsights = jest.fn();
  const mockFetchMarkdowns = jest.fn();
  const mockFetchCharts = jest.fn();
  const mockFetchTables = jest.fn();
  const mockFetchDashboards = jest.fn();
  const mockFetchCsvScriptModels = jest.fn();
  const mockFetchLocalMergeModels = jest.fn();
  const mockFetchInputs = jest.fn();
  const mockFetchDefaults = jest.fn();
  const mockSaveModel = jest.fn();

  const defaultStoreState = {
    sources: [],
    fetchSources: mockFetchSources,
    sourcesError: null,
    models: [],
    fetchModels: mockFetchModels,
    saveModel: mockSaveModel,
    dimensions: [],
    fetchDimensions: mockFetchDimensions,
    metrics: [],
    fetchMetrics: mockFetchMetrics,
    relations: [],
    fetchRelations: mockFetchRelations,
    insights: [],
    fetchInsights: mockFetchInsights,
    markdowns: [],
    fetchMarkdowns: mockFetchMarkdowns,
    charts: [],
    fetchCharts: mockFetchCharts,
    tables: [],
    fetchTables: mockFetchTables,
    dashboards: [],
    fetchDashboards: mockFetchDashboards,
    csvScriptModels: [],
    fetchCsvScriptModels: mockFetchCsvScriptModels,
    localMergeModels: [],
    fetchLocalMergeModels: mockFetchLocalMergeModels,
    inputs: [],
    fetchInputs: mockFetchInputs,
    defaults: null,
    fetchDefaults: mockFetchDefaults,
  };

  const emptyDagData = {
    nodes: [],
    edges: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Make all fetch functions return resolved promises
    mockFetchSources.mockResolvedValue();
    mockFetchModels.mockResolvedValue();
    mockFetchDimensions.mockResolvedValue();
    mockFetchMetrics.mockResolvedValue();
    mockFetchRelations.mockResolvedValue();
    mockFetchInsights.mockResolvedValue();
    mockFetchMarkdowns.mockResolvedValue();
    mockFetchCharts.mockResolvedValue();
    mockFetchTables.mockResolvedValue();
    mockFetchDashboards.mockResolvedValue();
    mockFetchCsvScriptModels.mockResolvedValue();
    mockFetchLocalMergeModels.mockResolvedValue();
    mockFetchInputs.mockResolvedValue();
    mockFetchDefaults.mockResolvedValue();

    useStore.mockImplementation(selector => {
      if (typeof selector === 'function') {
        return selector(defaultStoreState);
      }
      return defaultStoreState;
    });
    useLineageDag.mockReturnValue(emptyDagData);
  });

  it('renders empty state when no sources or models exist', async () => {
    render(<LineageNew />);

    expect(await screen.findByText('No sources or models yet')).toBeInTheDocument();
    expect(
      screen.getByText('Click the + button to create your first source or model')
    ).toBeInTheDocument();
  });

  it('fetches all object types on mount', () => {
    render(<LineageNew />);

    expect(mockFetchSources).toHaveBeenCalled();
    expect(mockFetchModels).toHaveBeenCalled();
    expect(mockFetchDimensions).toHaveBeenCalled();
    expect(mockFetchMetrics).toHaveBeenCalled();
    expect(mockFetchRelations).toHaveBeenCalled();
  });

  it('displays loading state before initial load completes', () => {
    render(<LineageNew />);

    // Loading shows immediately because initialLoadDone starts as false
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays error state when sources fail to load', () => {
    useStore.mockImplementation(selector => {
      const state = { ...defaultStoreState, sourcesError: 'Failed to fetch sources' };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<LineageNew />);

    expect(screen.getByText(/Failed to fetch sources/)).toBeInTheDocument();
  });

  it('renders nodes from useLineageDag', async () => {
    useLineageDag.mockReturnValue({
      nodes: [
        { id: 'source-db', data: { label: 'db', name: 'db', objectType: 'source' } },
        { id: 'model-users', data: { label: 'users', name: 'users', objectType: 'model' } },
      ],
      edges: [{ id: 'edge-1', source: 'source-db', target: 'model-users' }],
    });

    render(<LineageNew />);

    expect(await screen.findByTestId('node-source-db')).toBeInTheDocument();
    expect(screen.getByTestId('node-model-users')).toBeInTheDocument();
    expect(screen.getByTestId('edge-edge-1')).toBeInTheDocument();
  });

  it('has selector input for filtering nodes', () => {
    useLineageDag.mockReturnValue({
      nodes: [
        { id: 'source-db', data: { label: 'db', name: 'db', objectType: 'source' } },
        { id: 'model-users', data: { label: 'users', name: 'users', objectType: 'model' } },
      ],
      edges: [],
    });

    render(<LineageNew />);

    const input = screen.getByPlaceholderText("e.g., 'source_name', 'model_name', or '+name+'");
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('clears selector when Clear button is clicked', async () => {
    useLineageDag.mockReturnValue({
      nodes: [{ id: 'source-db', data: { label: 'db', name: 'db', objectType: 'source' } }],
      edges: [],
    });

    const user = userEvent.setup();
    render(<LineageNew />);

    const input = screen.getByPlaceholderText("e.g., 'source_name', 'model_name', or '+name+'");

    // Type something in the selector
    await user.type(input, 'source-db');
    expect(input.value).toBe('source-db');

    // Click clear
    fireEvent.click(screen.getByText('Clear'));

    expect(input.value).toBe('');
  });

  it('shows no matching objects message when selector matches nothing', async () => {
    useLineageDag.mockReturnValue({
      nodes: [{ id: 'source-db', data: { label: 'db', name: 'db', objectType: 'source' } }],
      edges: [],
    });

    const user = userEvent.setup();
    render(<LineageNew />);

    // Wait for initial load to complete
    await screen.findByTestId('node-source-db');

    const input = screen.getByPlaceholderText("e.g., 'source_name', 'model_name', or '+name+'");

    // Type a selector that doesn't match anything
    await user.type(input, 'nonexistent');

    expect(screen.getByText('No matching objects')).toBeInTheDocument();
    expect(screen.getByText('Try a different selector or click Clear')).toBeInTheDocument();
  });

  it('filters nodes based on selector', async () => {
    useLineageDag.mockReturnValue({
      nodes: [
        { id: 'source-db', data: { label: 'db', name: 'db', objectType: 'source' } },
        { id: 'model-users', data: { label: 'users', name: 'users', objectType: 'model' } },
      ],
      edges: [],
    });

    const user = userEvent.setup();
    render(<LineageNew />);

    // Wait for initial load, then both nodes should be visible
    expect(await screen.findByTestId('node-source-db')).toBeInTheDocument();
    expect(screen.getByTestId('node-model-users')).toBeInTheDocument();

    const input = screen.getByPlaceholderText("e.g., 'source_name', 'model_name', or '+name+'");

    // Type a selector to filter to just the source
    await user.type(input, 'db');

    // Only source-db should be visible
    expect(screen.getByTestId('node-source-db')).toBeInTheDocument();
    expect(screen.queryByTestId('node-model-users')).not.toBeInTheDocument();
  });

  it('filters to node dependencies when node is clicked', async () => {
    const mockSource = { name: 'db', type: 'sqlite' };
    const mockModel = { name: 'users', sql: 'SELECT * FROM users' };

    useLineageDag.mockReturnValue({
      nodes: [
        { id: 'source-db', data: { label: 'db', name: 'db', objectType: 'source', source: mockSource } },
        { id: 'model-users', data: { label: 'users', name: 'users', objectType: 'model', model: mockModel } },
      ],
      edges: [],
    });

    render(<LineageNew />);

    // Wait for initial load
    await screen.findByTestId('node-source-db');

    // Click the source node
    fireEvent.click(screen.getByTestId('node-source-db'));

    // Should update the selector to show dependencies
    const input = screen.getByPlaceholderText("e.g., 'source_name', 'model_name', or '+name+'");
    await waitFor(() => {
      expect(input.value).toBe('+db+');
    });
  });

  it('renders ReactFlow with proper structure', () => {
    useLineageDag.mockReturnValue({
      nodes: [{ id: 'source-db', data: { label: 'db', name: 'db', objectType: 'source' } }],
      edges: [],
    });

    render(<LineageNew />);

    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    expect(screen.getByTestId('background')).toBeInTheDocument();
    expect(screen.getByTestId('controls')).toBeInTheDocument();
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });
});
