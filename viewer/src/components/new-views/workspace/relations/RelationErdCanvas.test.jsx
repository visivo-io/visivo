/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import RelationErdCanvas from './RelationErdCanvas';
import useStore from '../../../../stores/store';
import { useRelationErdDag } from './useRelationErdDag';
import { useModelColumns } from './useModelColumns';

jest.mock('../../../../stores/store');
// Mock only the dag HOOK; keep the real `relationModelNames` helper so the
// component's scope derivation runs against the genuine ref-parsing logic.
jest.mock('./useRelationErdDag', () => ({
  ...jest.requireActual('./useRelationErdDag'),
  useRelationErdDag: jest.fn(),
}));
jest.mock('./useModelColumns');

// The canvas drop zone uses dnd-kit's useDroppable; stub it so the test doesn't
// need a DndContext provider.
jest.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: jest.fn() }),
}));

// ObjectCanvasFrame's dirty context — RelationErdCanvas calls useObjectCanvasDirty.
jest.mock('../ObjectCanvasFrame', () => ({
  useObjectCanvasDirty: () => ({ setDirty: jest.fn(), dirty: false }),
}));

// Capture the props handed to <ReactFlow> so tests can drive onNodesChange /
// onNodeDragStop and assert nodesDraggable / edgeTypes wiring.
const rfProps = { current: null };
const mockFitView = jest.fn();

// Mock reactflow: render each node + edge as a testable div, expose the connect
// callbacks, and provide a passthrough ReactFlowProvider + applyNodeChanges +
// useReactFlow so the controlled-drag + imperative-fit wiring runs.
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
    useNodesInitialized: () => true,
    // RelationPillEdge module-level imports (it's required transitively).
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }) => children,
    getBezierPath: () => ['M0,0 L1,1', 0, 0],
    useStore: () => new Map(),
    useStoreApi: () => ({ getState: () => ({ nodeInternals: new Map() }) }),
  };
});

// react-flow's CSS import is a no-op in jest.
jest.mock('reactflow/dist/style.css', () => ({}), { virtual: true });

const mockFetchModels = jest.fn();
const mockFetchRelations = jest.fn();
const mockSetErdNodePositions = jest.fn();
const mockClearErdLayout = jest.fn();

function mockStore(models, extra = {}) {
  const state = {
    models,
    relations: [],
    fetchModels: mockFetchModels,
    fetchRelations: mockFetchRelations,
    getRelationByName: name => (state.relations || []).find(r => r.name === name),
    workspaceActiveObject: null,
    // Session-only ERD layout slice.
    getErdLayout: () => ({ nodes: {}, waypoints: {} }),
    workspaceErdLayoutVersion: {},
    setErdNodePositions: mockSetErdNodePositions,
    clearErdLayout: mockClearErdLayout,
    ...extra,
  };
  useStore.mockImplementation(selector => selector(state));
}

describe('RelationErdCanvas', () => {
  beforeEach(() => {
    useModelColumns.mockReturnValue({ columnsByModel: {}, loading: false });
  });
  afterEach(() => jest.clearAllMocks());

  it('renders a model node card per model from the dag', () => {
    mockStore([
      { name: 'orders', columns: ['id', 'user_id'] },
      { name: 'users', columns: ['id'] },
    ]);
    useRelationErdDag.mockReturnValue({
      nodes: [
        {
          id: 'erd-model-orders',
          type: 'erdModelNode',
          position: { x: 0, y: 0 },
          data: { name: 'orders', objectType: 'model', columns: ['id', 'user_id'] },
        },
        {
          id: 'erd-model-users',
          type: 'erdModelNode',
          position: { x: 0, y: 0 },
          data: { name: 'users', objectType: 'model', columns: ['id'] },
        },
      ],
      edges: [],
    });

    render(<RelationErdCanvas />);

    expect(screen.getByTestId('relation-erd')).toBeInTheDocument();
    expect(screen.getByTestId('rf-node-erd-model-orders')).toBeInTheDocument();
    expect(screen.getByTestId('rf-node-erd-model-users')).toBeInTheDocument();
    // The ErdModelNode header renders the model name + a column row.
    expect(screen.getByTestId('erd-model-node-orders')).toBeInTheDocument();
    expect(screen.getByTestId('erd-column-orders-user_id')).toBeInTheDocument();
  });

  it('renders existing relations as edges', () => {
    mockStore([
      { name: 'orders', columns: ['user_id'] },
      { name: 'users', columns: ['id'] },
    ]);
    useRelationErdDag.mockReturnValue({
      nodes: [
        {
          id: 'erd-model-orders',
          type: 'erdModelNode',
          position: { x: 0, y: 0 },
          data: { name: 'orders', columns: ['user_id'] },
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
          sourceHandle: 'user_id',
          targetHandle: 'id',
        },
      ],
    });

    render(<RelationErdCanvas />);
    expect(screen.getByTestId('rf-edge-erd-rel-orders_to_users')).toBeInTheDocument();
  });

  it('shows the empty state when there are no models', () => {
    mockStore([]);
    useRelationErdDag.mockReturnValue({ nodes: [], edges: [] });

    render(<RelationErdCanvas />);
    expect(screen.getByTestId('relation-erd-empty')).toBeInTheDocument();
  });

  it('renders the @-mention add-model toolbar', () => {
    mockStore([{ name: 'orders', columns: ['id'] }]);
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

    render(<RelationErdCanvas />);
    expect(screen.getByTestId('relation-erd-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('relation-erd-add-model-input')).toBeInTheDocument();
  });

  it('passes the active relation’s models as the dag scope', () => {
    mockStore([{ name: 'orders' }, { name: 'users' }, { name: 'extra' }], {
      relations: [
        {
          name: 'orders_to_users',
          config: { condition: '${ref(orders).id} = ${ref(users).id}' },
        },
      ],
      workspaceActiveObject: { type: 'relation', name: 'orders_to_users' },
    });
    useRelationErdDag.mockReturnValue({ nodes: [], edges: [] });

    render(<RelationErdCanvas activeObject={{ type: 'relation', name: 'orders_to_users' }} />);

    expect(useRelationErdDag).toHaveBeenCalledWith(
      expect.objectContaining({ scopeModelNames: ['orders', 'users'] })
    );
  });

  // ---- Step 5 wiring: controlled drag + provider + edgeTypes + Tidy + fitView ----

  const oneModel = () => {
    mockStore([{ name: 'orders', columns: ['id'] }]);
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

  it('wraps the canvas in a ReactFlowProvider and registers the relationEdge type', () => {
    oneModel();
    render(<RelationErdCanvas />);
    expect(screen.getByTestId('rf-provider')).toBeInTheDocument();
    expect(rfProps.current.edgeTypes).toHaveProperty('relationEdge');
    expect(rfProps.current.nodesDraggable).toBe(true);
    expect(typeof rfProps.current.onNodesChange).toBe('function');
    expect(typeof rfProps.current.onNodeDragStop).toBe('function');
  });

  it('onNodeDragStop persists the moved node via setErdNodePositions(scope, ...)', () => {
    oneModel();
    render(<RelationErdCanvas />);
    // The mount fit already fired; clear it so we can assert the DRAG-STOP alone
    // does NOT trigger fitView (the hard §6 test — fit must not fight the drag).
    mockFitView.mockClear();
    act(() => {
      rfProps.current.onNodeDragStop({}, { id: 'erd-model-orders', position: { x: 42, y: 7 } });
    });
    expect(mockSetErdNodePositions).toHaveBeenCalledWith('relation:__all__', {
      'erd-model-orders': { x: 42, y: 7 },
    });
    // fitView is NOT called as a result of a drag-stop.
    expect(mockFitView).not.toHaveBeenCalled();
  });

  it('the Tidy button clears the scope layout and re-fits', () => {
    jest.useFakeTimers();
    oneModel();
    render(<RelationErdCanvas />);
    const tidy = screen.getByTestId('relation-erd-reset-layout');
    act(() => {
      tidy.click();
    });
    expect(mockClearErdLayout).toHaveBeenCalledWith('relation:__all__');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockFitView).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
