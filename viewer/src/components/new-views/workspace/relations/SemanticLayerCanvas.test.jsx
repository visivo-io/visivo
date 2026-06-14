/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import SemanticLayerCanvas from './SemanticLayerCanvas';
import useStore from '../../../../stores/store';
import { useRelationErdDag } from './useRelationErdDag';
import { useModelColumns } from './useModelColumns';

jest.mock('../../../../stores/store');
jest.mock('./useRelationErdDag', () => ({
  ...jest.requireActual('./useRelationErdDag'),
  useRelationErdDag: jest.fn(),
}));
jest.mock('./useModelColumns');

const rfProps = { current: null };
const mockFitView = jest.fn();

jest.mock('reactflow', () => {
  const MockReactFlow = props => {
    rfProps.current = props;
    const { nodes, edges, nodeTypes, children } = props;
    return (
      <div data-testid="react-flow">
        {nodes.map(node => {
          const NodeComp = nodeTypes?.[node.type];
          return (
            <div key={node.id} data-testid={`rf-node-${node.id}`}>
              {NodeComp ? <NodeComp data={node.data} selected={false} /> : node.data?.name}
            </div>
          );
        })}
        {edges.map(edge => (
          <div key={edge.id} data-testid={`rf-edge-${edge.id}`}>
            {edge.source} -&gt; {edge.target}
          </div>
        ))}
        {children}
      </div>
    );
  };
  MockReactFlow.displayName = 'MockReactFlow';
  return {
    __esModule: true,
    default: MockReactFlow,
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    MiniMap: () => <div data-testid="minimap" />,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed', Arrow: 'arrow' },
    ReactFlowProvider: ({ children }) => <div data-testid="rf-provider">{children}</div>,
    applyNodeChanges: (changes, nodes) => nodes,
    useReactFlow: () => ({ fitView: mockFitView, screenToFlowPosition: p => p }),
    // RelationPillEdge module-level imports (it's required transitively).
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }) => children,
    getBezierPath: () => ['M0,0 L1,1', 0, 0],
    useStore: () => new Map(),
    useStoreApi: () => ({ getState: () => ({ nodeInternals: new Map() }) }),
  };
});
jest.mock('reactflow/dist/style.css', () => ({}), { virtual: true });

const mockSetErdNodePositions = jest.fn();
const mockClearErdLayout = jest.fn();

function mockStore(state) {
  const full = {
    models: [],
    relations: [],
    metrics: [],
    dimensions: [],
    fetchModels: jest.fn(),
    fetchRelations: jest.fn(),
    fetchMetrics: jest.fn(),
    fetchDimensions: jest.fn(),
    getRelationByName: () => undefined,
    getErdLayout: () => ({ nodes: {}, waypoints: {} }),
    workspaceErdLayoutVersion: {},
    setErdNodePositions: mockSetErdNodePositions,
    clearErdLayout: mockClearErdLayout,
    ...state,
  };
  useStore.mockImplementation(selector => selector(full));
}

describe('SemanticLayerCanvas', () => {
  beforeEach(() => {
    useModelColumns.mockReturnValue({ columnsByModel: {}, loading: false });
  });
  afterEach(() => jest.clearAllMocks());

  it('renders an empty state when there are no models', () => {
    mockStore({ models: [] });
    useRelationErdDag.mockReturnValue({ nodes: [], edges: [] });
    render(<SemanticLayerCanvas />);
    expect(screen.getByTestId('semantic-layer-erd-empty')).toBeInTheDocument();
  });

  it('renders a model node with its metric + dimension pills', () => {
    mockStore({
      models: [
        {
          name: 'orders',
          config: {
            metrics: [{ name: 'total' }],
            dimensions: [{ name: 'status' }],
          },
        },
      ],
    });
    // The hook now folds metrics/dimensions onto each node (so it can also size
    // the card for the grid layout); the canvas renders whatever it returns.
    useRelationErdDag.mockReturnValue({
      nodes: [
        {
          id: 'erd-model-orders',
          type: 'erdModelNode',
          position: { x: 0, y: 0 },
          data: {
            name: 'orders',
            columns: ['id'],
            metrics: ['total'],
            dimensions: ['status'],
          },
        },
      ],
      edges: [],
    });

    render(<SemanticLayerCanvas />);
    expect(screen.getByTestId('semantic-erd-model-node-orders')).toBeInTheDocument();
    expect(screen.getByTestId('erd-metric-pill-total')).toBeInTheDocument();
    expect(screen.getByTestId('erd-dimension-pill-status')).toBeInTheDocument();
  });

  it('renders relations as edges', () => {
    mockStore({ models: [{ name: 'orders' }, { name: 'users' }] });
    useRelationErdDag.mockReturnValue({
      nodes: [
        {
          id: 'erd-model-orders',
          type: 'erdModelNode',
          position: { x: 0, y: 0 },
          data: { name: 'orders', columns: ['id'] },
        },
        {
          id: 'erd-model-users',
          type: 'erdModelNode',
          position: { x: 0, y: 0 },
          data: { name: 'users', columns: ['id'] },
        },
      ],
      edges: [
        {
          id: 'erd-rel-orders_to_users',
          source: 'erd-model-orders',
          target: 'erd-model-users',
        },
      ],
    });

    render(<SemanticLayerCanvas />);
    expect(screen.getByTestId('rf-edge-erd-rel-orders_to_users')).toBeInTheDocument();
  });

  it('drives the dag with the project fields and a tiled grid layout', () => {
    mockStore({ models: [{ name: 'orders' }] });
    useRelationErdDag.mockReturnValue({ nodes: [], edges: [] });
    render(<SemanticLayerCanvas />);
    // No scope → every model renders; fields are folded in by the hook; the
    // overview lays out as a tiled grid (not dagre rows).
    expect(useRelationErdDag).toHaveBeenCalledWith(
      expect.objectContaining({ layout: 'grid', fieldsByModel: expect.any(Object) })
    );
    const call = useRelationErdDag.mock.calls[0][0];
    expect(call.scopeModelNames == null).toBe(true);
  });

  // ---- Step 5 wiring ----

  const oneModel = () => {
    mockStore({ models: [{ name: 'orders' }] });
    useRelationErdDag.mockReturnValue({
      nodes: [
        {
          id: 'erd-model-orders',
          type: 'erdModelNode',
          position: { x: 0, y: 0 },
          data: { name: 'orders', columns: ['id'] },
        },
      ],
      edges: [],
    });
  };

  it('wraps in a provider, registers relationEdge, and drives controlled drag', () => {
    oneModel();
    render(<SemanticLayerCanvas />);
    expect(screen.getByTestId('rf-provider')).toBeInTheDocument();
    expect(rfProps.current.edgeTypes).toHaveProperty('relationEdge');
    expect(rfProps.current.nodesDraggable).toBe(true);
  });

  it('passes the saved layout overlays + layoutVersion into the dag hook', () => {
    oneModel();
    render(<SemanticLayerCanvas />);
    expect(useRelationErdDag).toHaveBeenCalledWith(
      expect.objectContaining({
        savedPositions: expect.any(Object),
        savedWaypoints: expect.any(Object),
        layoutVersion: 0,
      })
    );
  });

  it('onNodeDragStop persists to the semantic-layer scope', () => {
    oneModel();
    render(<SemanticLayerCanvas />);
    act(() => {
      rfProps.current.onNodeDragStop({}, { id: 'erd-model-orders', position: { x: 9, y: 9 } });
    });
    expect(mockSetErdNodePositions).toHaveBeenCalledWith('semantic-layer', {
      'erd-model-orders': { x: 9, y: 9 },
    });
  });

  it('the Tidy button clears the semantic-layer layout and re-fits', () => {
    jest.useFakeTimers();
    oneModel();
    render(<SemanticLayerCanvas />);
    act(() => screen.getByTestId('semantic-layer-erd-reset-layout').click());
    expect(mockClearErdLayout).toHaveBeenCalledWith('semantic-layer');
    act(() => jest.runOnlyPendingTimers());
    expect(mockFitView).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
