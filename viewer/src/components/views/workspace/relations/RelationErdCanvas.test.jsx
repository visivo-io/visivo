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
// need a DndContext provider — and capture the droppable config so tests can
// drive the `onAddModel` callback the shared drag router would invoke.
jest.mock('@dnd-kit/core', () => {
  const mockDropCapture = { current: null };
  return {
    useDroppable: cfg => {
      mockDropCapture.current = cfg;
      return { setNodeRef: jest.fn() };
    },
    __dropCapture: mockDropCapture,
  };
});
const { __dropCapture: dropCapture } = require('@dnd-kit/core');

// The authoring popover is exercised by its own suite; stub it here so the
// connect-gesture tests assert the WIRING (which endpoints it opens with, and
// the saved/closed round-trip) without mounting the real form.
jest.mock('./JoinOperatorPopover', () => ({
  __esModule: true,
  default: ({ initialA, initialB, onSaved, onClose }) => (
    <div
      data-testid="join-popover-stub"
      data-a={`${initialA.model}:${initialA.column}`}
      data-b={`${initialB.model}:${initialB.column}`}
    >
      <button type="button" data-testid="join-popover-stub-saved" onClick={() => onSaved({})} />
      <button type="button" data-testid="join-popover-stub-close" onClick={onClose} />
    </div>
  ),
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
    // Apply position changes for real so the controlled-drag round-trip is
    // observable (a change flows back into the `nodes` prop).
    applyNodeChanges: (changes, nodes) =>
      nodes.map(node => {
        const change = changes.find(c => c.id === node.id && c.position);
        return change ? { ...node, position: change.position } : node;
      }),
    useReactFlow: () => ({ fitView: mockFitView, screenToFlowPosition: p => p }),
    useNodesInitialized: () => true,
    // RelationLinkEdge module-level imports (it's required transitively).
    BaseEdge: () => null,
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
const mockOpenEditRelationModal = jest.fn();

function mockStore(models, extra = {}) {
  const state = {
    models,
    relations: [],
    fetchModels: mockFetchModels,
    fetchRelations: mockFetchRelations,
    getRelationByName: name => (state.relations || []).find(r => r.name === name),
    openEditRelationModal: mockOpenEditRelationModal,
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

  it('renders a relation as its own node plus two link edges', () => {
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
        {
          id: 'erd-relnode-orders_to_users',
          type: 'relationNode',
          position: { x: 0, y: 0 },
          data: { relationName: 'orders_to_users', isDefault: false },
        },
      ],
      edges: [
        {
          id: 'erd-reledge-orders_to_users-a',
          type: 'relationLinkEdge',
          source: 'erd-model-orders',
          target: 'erd-relnode-orders_to_users',
          sourceHandle: 'user_id',
          data: { relationName: 'orders_to_users', modelEnd: 'source', column: 'user_id' },
        },
        {
          id: 'erd-reledge-orders_to_users-b',
          type: 'relationLinkEdge',
          source: 'erd-relnode-orders_to_users',
          target: 'erd-model-users',
          targetHandle: 'id',
          data: { relationName: 'orders_to_users', modelEnd: 'target', column: 'id' },
        },
      ],
    });

    render(<RelationErdCanvas />);
    // The relation renders as a first-class node (a pill), not an edge label.
    expect(screen.getByTestId('rf-node-erd-relnode-orders_to_users')).toBeInTheDocument();
    expect(screen.getByTestId('erd-relation-node-orders_to_users')).toBeInTheDocument();
    // Two undirected link edges attach it to the two model cards.
    expect(screen.getByTestId('rf-edge-erd-reledge-orders_to_users-a')).toBeInTheDocument();
    expect(screen.getByTestId('rf-edge-erd-reledge-orders_to_users-b')).toBeInTheDocument();
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

  it('wraps the canvas in a ReactFlowProvider and registers the relationLinkEdge + relationNode types', () => {
    oneModel();
    render(<RelationErdCanvas />);
    expect(screen.getByTestId('rf-provider')).toBeInTheDocument();
    expect(rfProps.current.edgeTypes).toHaveProperty('relationLinkEdge');
    expect(rfProps.current.nodeTypes).toHaveProperty('erdModelNode');
    expect(rfProps.current.nodeTypes).toHaveProperty('relationNode');
    expect(rfProps.current.nodesDraggable).toBe(true);
    expect(typeof rfProps.current.onNodesChange).toBe('function');
    expect(typeof rfProps.current.onNodeDragStop).toBe('function');
    expect(typeof rfProps.current.onNodeClick).toBe('function');
  });

  it('onNodeClick on a relationNode opens the relation editor via the store', () => {
    mockStore([{ name: 'orders' }, { name: 'users' }], {
      relations: [{ name: 'orders_to_users', condition: 'x = y' }],
    });
    useRelationErdDag.mockReturnValue({
      nodes: [
        {
          id: 'erd-relnode-orders_to_users',
          type: 'relationNode',
          position: { x: 0, y: 0 },
          data: { relationName: 'orders_to_users' },
        },
      ],
      edges: [],
    });
    render(<RelationErdCanvas />);
    act(() => {
      rfProps.current.onNodeClick(
        {},
        { type: 'relationNode', data: { relationName: 'orders_to_users' } }
      );
    });
    expect(mockOpenEditRelationModal).toHaveBeenCalledTimes(1);
    expect(mockOpenEditRelationModal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'orders_to_users' })
    );
  });

  it('onNodeClick on a model node does NOT open the relation editor', () => {
    oneModel();
    render(<RelationErdCanvas />);
    act(() => {
      rfProps.current.onNodeClick({}, { type: 'erdModelNode', data: { name: 'orders' } });
    });
    expect(mockOpenEditRelationModal).not.toHaveBeenCalled();
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

  // ---- Controlled drag round-trip + Library model drop + connect gesture ----

  const twoModels = () => {
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
          position: { x: 260, y: 0 },
          data: { name: 'users', columns: ['id'] },
        },
      ],
      edges: [],
    });
  };

  it('onNodesChange applies node changes back into the controlled nodes prop', () => {
    oneModel();
    render(<RelationErdCanvas />);
    act(() => {
      rfProps.current.onNodesChange([
        { id: 'erd-model-orders', type: 'position', position: { x: 77, y: 88 } },
      ]);
    });
    const moved = rfProps.current.nodes.find(n => n.id === 'erd-model-orders');
    expect(moved.position).toEqual({ x: 77, y: 88 });
  });

  it('a Library model dropped on the canvas joins the scoped set (no duplicates)', () => {
    mockStore([{ name: 'orders' }, { name: 'users' }, { name: 'events' }], {
      relations: [
        {
          name: 'orders_to_users',
          config: { condition: '${ref(orders).id} = ${ref(users).id}' },
        },
      ],
    });
    useRelationErdDag.mockReturnValue({ nodes: [], edges: [] });
    render(<RelationErdCanvas activeObject={{ type: 'relation', name: 'orders_to_users' }} />);

    // The canvas registered its droppable with the shared-router contract.
    expect(dropCapture.current.data.kind).toBe('erd-canvas');

    act(() => {
      dropCapture.current.data.onAddModel('events');
    });
    expect(useRelationErdDag).toHaveBeenLastCalledWith(
      expect.objectContaining({ extraModelNames: ['events'] })
    );

    // Re-dropping the same model (or a null name) never duplicates the entry.
    act(() => {
      dropCapture.current.data.onAddModel('events');
    });
    act(() => {
      dropCapture.current.data.onAddModel(null);
    });
    expect(useRelationErdDag).toHaveBeenLastCalledWith(
      expect.objectContaining({ extraModelNames: ['events'] })
    );
  });

  it('a column→column connect opens the authoring popover pre-filled with both endpoints', () => {
    twoModels();
    render(<RelationErdCanvas />);
    act(() => {
      rfProps.current.onConnect({
        source: 'erd-model-orders',
        target: 'erd-model-users',
        sourceHandle: 'user_id',
        targetHandle: 'id',
      });
    });
    const popover = screen.getByTestId('join-popover-stub');
    expect(popover).toHaveAttribute('data-a', 'orders:user_id');
    expect(popover).toHaveAttribute('data-b', 'users:id');
  });

  it('a same-model (or unresolvable) connect never opens the popover', () => {
    twoModels();
    render(<RelationErdCanvas />);
    act(() => {
      rfProps.current.onConnect({
        source: 'erd-model-orders',
        target: 'erd-model-orders',
        sourceHandle: 'user_id',
        targetHandle: 'user_id',
      });
    });
    act(() => {
      rfProps.current.onConnect({
        source: 'erd-model-ghost',
        target: 'erd-model-users',
        sourceHandle: 'x',
        targetHandle: 'id',
      });
    });
    expect(screen.queryByTestId('join-popover-stub')).not.toBeInTheDocument();
    // And self-connections are rejected up front.
    expect(rfProps.current.isValidConnection({ source: 'a', target: 'a' })).toBe(false);
    expect(rfProps.current.isValidConnection({ source: 'a', target: 'b' })).toBe(true);
  });

  it('dropping a connect on the empty pane opens the popover with only side A filled', () => {
    twoModels();
    render(<RelationErdCanvas />);
    const pane = document.createElement('div');
    pane.classList.add('react-flow__pane');
    act(() => {
      rfProps.current.onConnectStart({}, { nodeId: 'erd-model-orders', handleId: 'user_id' });
    });
    act(() => {
      rfProps.current.onConnectEnd({ target: pane, clientX: 200, clientY: 140 });
    });
    const popover = screen.getByTestId('join-popover-stub');
    expect(popover).toHaveAttribute('data-a', 'orders:user_id');
    expect(popover).toHaveAttribute('data-b', ':');
  });

  it('a connect ending on a non-pane target is a no-op', () => {
    twoModels();
    render(<RelationErdCanvas />);
    act(() => {
      rfProps.current.onConnectStart({}, { nodeId: 'erd-model-orders', handleId: 'user_id' });
    });
    act(() => {
      rfProps.current.onConnectEnd({ target: document.createElement('div') });
    });
    expect(screen.queryByTestId('join-popover-stub')).not.toBeInTheDocument();
  });

  it('a pane drop never replaces a popover that is already open', () => {
    twoModels();
    render(<RelationErdCanvas />);
    act(() => {
      rfProps.current.onConnect({
        source: 'erd-model-orders',
        target: 'erd-model-users',
        sourceHandle: 'user_id',
        targetHandle: 'id',
      });
    });
    const pane = document.createElement('div');
    pane.classList.add('react-flow__pane');
    act(() => {
      rfProps.current.onConnectStart({}, { nodeId: 'erd-model-users', handleId: 'id' });
    });
    act(() => {
      rfProps.current.onConnectEnd({ target: pane });
    });
    // The fully-specified popover survives — side B is not reset to empty.
    const popover = screen.getByTestId('join-popover-stub');
    expect(popover).toHaveAttribute('data-a', 'orders:user_id');
    expect(popover).toHaveAttribute('data-b', 'users:id');
  });

  it('saving from the popover refreshes the relations; closing dismisses it', () => {
    twoModels();
    render(<RelationErdCanvas />);
    act(() => {
      rfProps.current.onConnect({
        source: 'erd-model-orders',
        target: 'erd-model-users',
        sourceHandle: 'user_id',
        targetHandle: 'id',
      });
    });
    const fetchCountBefore = mockFetchRelations.mock.calls.length;
    act(() => {
      screen.getByTestId('join-popover-stub-saved').click();
    });
    // The saved relation re-hydrates the relations feed (so the new node/edges render).
    expect(mockFetchRelations.mock.calls.length).toBe(fetchCountBefore + 1);

    act(() => {
      screen.getByTestId('join-popover-stub-close').click();
    });
    expect(screen.queryByTestId('join-popover-stub')).not.toBeInTheDocument();
  });
});
