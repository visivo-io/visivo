import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LineageNew from './LineageNew';
import useStore from '../../../stores/store';
import { useLineageDag } from './useLineageDag';

// Mock the store
jest.mock('../../../stores/store');

// Mock the useLineageDag hook
jest.mock('./useLineageDag');

// Mock react-flow-renderer
jest.mock('react-flow-renderer', () => {
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
jest.mock('../common/EditPanel', () => ({ source, model, isCreate, onClose }) => (
  <div data-testid="edit-panel">
    {source && <span>Editing source: {source.name}</span>}
    {model && <span>Editing model: {model.name}</span>}
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
  const mockSaveModel = jest.fn();

  const defaultStoreState = {
    sources: [],
    fetchSources: mockFetchSources,
    sourcesLoading: false,
    sourcesError: null,
    models: [],
    fetchModels: mockFetchModels,
    saveModel: mockSaveModel,
    modelsLoading: false,
    dimensions: [],
    fetchDimensions: mockFetchDimensions,
    dimensionsLoading: false,
    metrics: [],
    fetchMetrics: mockFetchMetrics,
    metricsLoading: false,
    relations: [],
    fetchRelations: mockFetchRelations,
    relationsLoading: false,
  };

  const emptyDagData = {
    nodes: [],
    edges: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useStore.mockImplementation(selector => {
      if (typeof selector === 'function') {
        return selector(defaultStoreState);
      }
      return defaultStoreState;
    });
    useLineageDag.mockReturnValue(emptyDagData);
  });

  it('renders empty state when no sources or models exist', () => {
    render(<LineageNew />);

    expect(screen.getByText('No sources or models yet')).toBeInTheDocument();
    expect(screen.getByText('Click the + button to create your first source or model')).toBeInTheDocument();
  });

  it('fetches all object types on mount', () => {
    render(<LineageNew />);

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

    render(<LineageNew />);

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

  it('renders nodes from useLineageDag', () => {
    useLineageDag.mockReturnValue({
      nodes: [
        { id: 'source-db', data: { label: 'db', objectType: 'source' } },
        { id: 'model-users', data: { label: 'users', objectType: 'model' } },
      ],
      edges: [
        { id: 'edge-1', source: 'source-db', target: 'model-users' },
      ],
    });

    render(<LineageNew />);

    expect(screen.getByTestId('node-source-db')).toBeInTheDocument();
    expect(screen.getByTestId('node-model-users')).toBeInTheDocument();
    expect(screen.getByTestId('edge-edge-1')).toBeInTheDocument();
  });

  it('opens edit panel when node is clicked', async () => {
    const mockSource = { name: 'db', type: 'sqlite' };
    const mockModel = { name: 'users', sql: 'SELECT * FROM users' };

    useLineageDag.mockReturnValue({
      nodes: [
        { id: 'source-db', data: { label: 'db', objectType: 'source', source: mockSource } },
        { id: 'model-users', data: { label: 'users', objectType: 'model', model: mockModel } },
      ],
      edges: [],
    });

    render(<LineageNew />);

    // Click the source node
    fireEvent.click(screen.getByTestId('node-source-db'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('Editing source: db')).toBeInTheDocument();
  });

  it('closes edit panel when close button is clicked', async () => {
    const mockSource = { name: 'db', type: 'sqlite' };

    useLineageDag.mockReturnValue({
      nodes: [
        { id: 'source-db', data: { label: 'db', objectType: 'source', source: mockSource } },
      ],
      edges: [],
    });

    render(<LineageNew />);

    // Click the source node to open panel
    fireEvent.click(screen.getByTestId('node-source-db'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-panel')).toBeInTheDocument();
    });

    // Close the panel
    fireEvent.click(screen.getByText('Close'));

    await waitFor(() => {
      expect(screen.queryByTestId('edit-panel')).not.toBeInTheDocument();
    });
  });

  it('renders ReactFlow with proper structure', () => {
    useLineageDag.mockReturnValue({
      nodes: [
        { id: 'source-db', data: { label: 'db', objectType: 'source' } },
      ],
      edges: [],
    });

    render(<LineageNew />);

    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    expect(screen.getByTestId('background')).toBeInTheDocument();
    expect(screen.getByTestId('controls')).toBeInTheDocument();
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });
});
