/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import SemanticLayerCanvas from './SemanticLayerCanvas';
import useStore from '../../../../stores/store';
import { useRelationErdDag } from './useRelationErdDag';
import { useModelColumns } from './useModelColumns';
import { setWorkspaceTelemetryListener } from '../telemetry';

jest.mock('../../../../stores/store');
jest.mock('./useRelationErdDag', () => ({
  ...jest.requireActual('./useRelationErdDag'),
  useRelationErdDag: jest.fn(),
}));
jest.mock('./useModelColumns');

// The authoring popover has its own suite; stub it so the connect-gesture tests
// assert the wiring (endpoints + saved/closed round-trip) only.
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

const rfProps = { current: null };
const mockFitView = jest.fn();
const mockSetCenter = jest.fn();

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
    useReactFlow: () => ({ fitView: mockFitView, setCenter: mockSetCenter, screenToFlowPosition: p => p }),
    useNodesInitialized: () => true,
    // RelationLinkEdge module-level imports (it's required transitively).
    BaseEdge: () => null,
    getBezierPath: () => ['M0,0 L1,1', 0, 0],
    useStore: () => new Map(),
    useStoreApi: () => ({ getState: () => ({ nodeInternals: new Map() }) }),
  };
});
jest.mock('reactflow/dist/style.css', () => ({}), { virtual: true });

const mockSetErdNodePositions = jest.fn();
const mockClearErdLayout = jest.fn();
const mockOpenEditRelationModal = jest.fn();

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
    getRelationByName: name => (full.relations || []).find(r => r.name === name),
    openEditRelationModal: mockOpenEditRelationModal,
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

  // VIS-1069 — Semantic Layer field pills gain "Explore this" back-links.
  describe('"Explore this" field pills', () => {
    const modelWithFields = () => ({
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

    const nodesWithFields = () => ({
      nodes: [
        {
          id: 'erd-model-orders',
          type: 'erdModelNode',
          position: { x: 0, y: 0 },
          data: { name: 'orders', columns: ['id'], metrics: ['total'], dimensions: ['status'] },
        },
      ],
      edges: [],
    });

    it('clicking a metric pill mints a pre-wired exploration and opens its tab', async () => {
      const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_new' });
      const buildExplorationSeedState = jest.fn().mockReturnValue({ modelTabs: ['query_1'] });
      const openWorkspaceTab = jest.fn();
      mockStore({ ...modelWithFields(), createExploration, buildExplorationSeedState, openWorkspaceTab });
      useRelationErdDag.mockReturnValue(nodesWithFields());

      render(<SemanticLayerCanvas />);
      fireEvent.click(screen.getByTestId('erd-metric-pill-total'));

      expect(buildExplorationSeedState).toHaveBeenCalledWith({ type: 'metric', name: 'total' });
      await waitFor(() =>
        expect(createExploration).toHaveBeenCalledWith(
          { type: 'metric', name: 'total' },
          null,
          { modelTabs: ['query_1'] }
        )
      );
      await waitFor(() =>
        expect(openWorkspaceTab).toHaveBeenCalledWith({
          id: 'exploration:exp_new',
          type: 'exploration',
          name: 'exp_new',
        })
      );
    });

    // VIS-1072 — flywheel telemetry.
    it('fires explore_this_used{source_type} on a successful mint', async () => {
      const events = [];
      const unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
      const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_new' });
      const openWorkspaceTab = jest.fn();
      mockStore({ ...modelWithFields(), createExploration, openWorkspaceTab });
      useRelationErdDag.mockReturnValue(nodesWithFields());

      render(<SemanticLayerCanvas />);
      fireEvent.click(screen.getByTestId('erd-dimension-pill-status'));

      await waitFor(() =>
        expect(events.find(e => e.eventName === 'explore_this_used')?.payload).toEqual({
          source_type: 'dimension',
        })
      );
      unsubscribe();
    });

    it('does not open a tab when creation fails', async () => {
      const createExploration = jest.fn().mockResolvedValue({ success: false, error: 'boom' });
      const openWorkspaceTab = jest.fn();
      mockStore({ ...modelWithFields(), createExploration, openWorkspaceTab });
      useRelationErdDag.mockReturnValue(nodesWithFields());

      render(<SemanticLayerCanvas />);
      fireEvent.click(screen.getByTestId('erd-dimension-pill-status'));

      await waitFor(() => expect(createExploration).toHaveBeenCalled());
      expect(openWorkspaceTab).not.toHaveBeenCalled();
    });
  });

  // VIS-1069 — one-shot ERD node-focus intent (mirrors workspaceLensIntent).
  describe('workspaceSemanticLayerFocusIntent', () => {
    const modelWithFields = () => ({
      models: [
        {
          name: 'orders',
          config: { metrics: [{ name: 'total' }], dimensions: [{ name: 'status' }] },
        },
      ],
    });

    const nodesWithFields = () => ({
      nodes: [
        {
          id: 'erd-model-orders',
          type: 'erdModelNode',
          position: { x: 40, y: 20 },
          data: { name: 'orders', columns: ['id'], metrics: ['total'], dimensions: ['status'] },
        },
      ],
      edges: [],
    });

    it('a model-targeted intent centers on that node and self-clears', async () => {
      const clearWorkspaceSemanticLayerFocusIntent = jest.fn();
      mockStore({
        ...modelWithFields(),
        workspaceSemanticLayerFocusIntent: { objectKey: 'model:orders' },
        clearWorkspaceSemanticLayerFocusIntent,
      });
      useRelationErdDag.mockReturnValue(nodesWithFields());

      render(<SemanticLayerCanvas />);

      await waitFor(() =>
        expect(mockSetCenter).toHaveBeenCalledWith(40 + 130, 20 + 60, { zoom: 1, duration: 400 })
      );
      expect(clearWorkspaceSemanticLayerFocusIntent).toHaveBeenCalled();
    });

    it('a metric-targeted intent resolves to its PARENT MODEL node (fields have no node of their own)', async () => {
      const clearWorkspaceSemanticLayerFocusIntent = jest.fn();
      mockStore({
        ...modelWithFields(),
        workspaceSemanticLayerFocusIntent: { objectKey: 'metric:total' },
        clearWorkspaceSemanticLayerFocusIntent,
      });
      useRelationErdDag.mockReturnValue(nodesWithFields());

      render(<SemanticLayerCanvas />);

      await waitFor(() => expect(mockSetCenter).toHaveBeenCalledWith(170, 80, { zoom: 1, duration: 400 }));
      expect(clearWorkspaceSemanticLayerFocusIntent).toHaveBeenCalled();
    });

    it('an unresolvable intent still self-clears (never lingers)', async () => {
      const clearWorkspaceSemanticLayerFocusIntent = jest.fn();
      mockStore({
        ...modelWithFields(),
        workspaceSemanticLayerFocusIntent: { objectKey: 'metric:does_not_exist' },
        clearWorkspaceSemanticLayerFocusIntent,
      });
      useRelationErdDag.mockReturnValue(nodesWithFields());

      render(<SemanticLayerCanvas />);

      await waitFor(() => expect(clearWorkspaceSemanticLayerFocusIntent).toHaveBeenCalled());
      expect(mockSetCenter).not.toHaveBeenCalled();
    });

    it('no intent set never calls setCenter', () => {
      mockStore(modelWithFields());
      useRelationErdDag.mockReturnValue(nodesWithFields());
      render(<SemanticLayerCanvas />);
      expect(mockSetCenter).not.toHaveBeenCalled();
    });
  });

  it('renders a relation as its own node + two link edges', () => {
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
        },
        {
          id: 'erd-reledge-orders_to_users-b',
          type: 'relationLinkEdge',
          source: 'erd-relnode-orders_to_users',
          target: 'erd-model-users',
        },
      ],
    });

    render(<SemanticLayerCanvas />);
    // The relation renders as a node (its model-card type is remapped, but the
    // relationNode type is preserved so the pill renders).
    expect(screen.getByTestId('rf-node-erd-relnode-orders_to_users')).toBeInTheDocument();
    expect(screen.getByTestId('erd-relation-node-orders_to_users')).toBeInTheDocument();
    expect(screen.getByTestId('rf-edge-erd-reledge-orders_to_users-a')).toBeInTheDocument();
    expect(screen.getByTestId('rf-edge-erd-reledge-orders_to_users-b')).toBeInTheDocument();
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

  it('wraps in a provider, registers relationLinkEdge + relationNode, and drives controlled drag', () => {
    oneModel();
    render(<SemanticLayerCanvas />);
    expect(screen.getByTestId('rf-provider')).toBeInTheDocument();
    expect(rfProps.current.edgeTypes).toHaveProperty('relationLinkEdge');
    expect(rfProps.current.nodeTypes).toHaveProperty('semanticLayerModelNode');
    expect(rfProps.current.nodeTypes).toHaveProperty('relationNode');
    expect(rfProps.current.nodesDraggable).toBe(true);
    expect(typeof rfProps.current.onNodeClick).toBe('function');
  });

  it('passes the saved layout overlays + layoutVersion into the dag hook', () => {
    oneModel();
    render(<SemanticLayerCanvas />);
    expect(useRelationErdDag).toHaveBeenCalledWith(
      expect.objectContaining({
        savedPositions: expect.any(Object),
        layoutVersion: 0,
      })
    );
  });

  it('onNodeClick on a relationNode opens the relation editor', () => {
    mockStore({
      models: [{ name: 'orders' }, { name: 'users' }],
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
    render(<SemanticLayerCanvas />);
    act(() => {
      rfProps.current.onNodeClick(
        {},
        { type: 'relationNode', data: { relationName: 'orders_to_users' } }
      );
    });
    expect(mockOpenEditRelationModal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'orders_to_users' })
    );
  });

  // Phase 6c-T5 (ux-audit.md "No 'Explore this' entry point from Semantic
  // Layer ERD — nodes are completely inert", ⚠ conflicts-with-e2e): left- and
  // right-click on a MODEL card, not just a relation node.
  describe('model node click/context-menu (Phase 6c-T5)', () => {
    const mockSetWorkspaceSelection = jest.fn();
    const mockCreateExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_1' });
    const mockOpenWorkspaceTab = jest.fn();

    beforeEach(() => {
      mockSetWorkspaceSelection.mockClear();
      mockCreateExploration.mockClear();
      mockOpenWorkspaceTab.mockClear();
      oneModel();
      useStore.mockImplementation(selector =>
        selector({
          models: [{ name: 'orders' }],
          relations: [],
          metrics: [],
          dimensions: [],
          fetchModels: jest.fn(),
          fetchRelations: jest.fn(),
          fetchMetrics: jest.fn(),
          fetchDimensions: jest.fn(),
          getRelationByName: () => null,
          openEditRelationModal: mockOpenEditRelationModal,
          getErdLayout: () => ({ nodes: {}, waypoints: {} }),
          workspaceErdLayoutVersion: {},
          setErdNodePositions: mockSetErdNodePositions,
          clearErdLayout: mockClearErdLayout,
          setWorkspaceSelection: mockSetWorkspaceSelection,
          createExploration: mockCreateExploration,
          buildExplorationSeedState: jest.fn(() => null),
          openWorkspaceTab: mockOpenWorkspaceTab,
        })
      );
    });

    it('left-clicking a model node selects it (right rail should now show it, not "Select an object...")', () => {
      render(<SemanticLayerCanvas />);
      act(() => {
        rfProps.current.onNodeClick({}, { type: 'semanticLayerModelNode', data: { name: 'orders' } });
      });
      expect(mockSetWorkspaceSelection).toHaveBeenCalledWith({ type: 'model', name: 'orders' });
    });

    it('right-clicking a model node opens a context menu with Open / Open in new tab / Explore this', () => {
      render(<SemanticLayerCanvas />);
      act(() => {
        rfProps.current.onNodeContextMenu(
          { clientX: 40, clientY: 60, preventDefault: jest.fn() },
          { type: 'semanticLayerModelNode', data: { name: 'orders' } }
        );
      });
      expect(screen.getByTestId('semantic-erd-node-ctx-explore-this')).toBeInTheDocument();
      expect(screen.getByTestId('semantic-erd-node-ctx-open')).toBeInTheDocument();
      expect(screen.getByTestId('semantic-erd-node-ctx-open-new-tab')).toBeInTheDocument();
    });

    it('"Explore this" from the context menu mints an exploration seeded from the model and opens it', async () => {
      render(<SemanticLayerCanvas />);
      act(() => {
        rfProps.current.onNodeContextMenu(
          { clientX: 40, clientY: 60, preventDefault: jest.fn() },
          { type: 'semanticLayerModelNode', data: { name: 'orders' } }
        );
      });
      fireEvent.click(screen.getByTestId('semantic-erd-node-ctx-explore-this'));
      await waitFor(() => expect(mockOpenWorkspaceTab).toHaveBeenCalled());
      expect(mockCreateExploration).toHaveBeenCalledWith({ type: 'model', name: 'orders' }, null, null);
      expect(mockOpenWorkspaceTab).toHaveBeenCalledWith({
        id: 'exploration:exp_1',
        type: 'exploration',
        name: 'exp_1',
      });
    });

    it('right-clicking a relation node does not open the model context menu', () => {
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
      render(<SemanticLayerCanvas />);
      act(() => {
        rfProps.current.onNodeContextMenu(
          { clientX: 40, clientY: 60, preventDefault: jest.fn() },
          { type: 'relationNode', data: { relationName: 'orders_to_users' } }
        );
      });
      expect(screen.queryByTestId('semantic-erd-node-ctx-menu')).not.toBeInTheDocument();
    });
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

  // ---- Controlled drag round-trip + the author-a-relation connect gesture ----

  const twoModels = (extra = {}) => {
    mockStore({ models: [{ name: 'orders' }, { name: 'users' }], ...extra });
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
    render(<SemanticLayerCanvas />);
    act(() => {
      rfProps.current.onNodesChange([
        { id: 'erd-model-orders', type: 'position', position: { x: 31, y: 62 } },
      ]);
    });
    const moved = rfProps.current.nodes.find(n => n.id === 'erd-model-orders');
    expect(moved.position).toEqual({ x: 31, y: 62 });
  });

  it('a column→column connect opens the authoring popover pre-filled with both endpoints', () => {
    twoModels();
    render(<SemanticLayerCanvas />);
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
    render(<SemanticLayerCanvas />);
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
    expect(rfProps.current.isValidConnection({ source: 'a', target: 'a' })).toBe(false);
    expect(rfProps.current.isValidConnection({ source: 'a', target: 'b' })).toBe(true);
  });

  it('dropping a connect on the empty pane opens the popover with only side A filled', () => {
    twoModels();
    render(<SemanticLayerCanvas />);
    const pane = document.createElement('div');
    pane.classList.add('react-flow__pane');
    act(() => {
      rfProps.current.onConnectStart({}, { nodeId: 'erd-model-orders', handleId: 'user_id' });
    });
    act(() => {
      rfProps.current.onConnectEnd({ target: pane, clientX: 180, clientY: 90 });
    });
    const popover = screen.getByTestId('join-popover-stub');
    expect(popover).toHaveAttribute('data-a', 'orders:user_id');
    expect(popover).toHaveAttribute('data-b', ':');
  });

  it('a connect ending on a non-pane target is a no-op', () => {
    twoModels();
    render(<SemanticLayerCanvas />);
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
    render(<SemanticLayerCanvas />);
    // A full column→column connect opens the popover with both sides…
    act(() => {
      rfProps.current.onConnect({
        source: 'erd-model-orders',
        target: 'erd-model-users',
        sourceHandle: 'user_id',
        targetHandle: 'id',
      });
    });
    // …then the trailing pane drop (no clientX/Y) must keep it, not reset side B.
    const pane = document.createElement('div');
    pane.classList.add('react-flow__pane');
    act(() => {
      rfProps.current.onConnectStart({}, { nodeId: 'erd-model-users', handleId: 'id' });
    });
    act(() => {
      rfProps.current.onConnectEnd({ target: pane });
    });
    const popover = screen.getByTestId('join-popover-stub');
    expect(popover).toHaveAttribute('data-a', 'orders:user_id');
    expect(popover).toHaveAttribute('data-b', 'users:id');
  });

  it('saving from the popover refreshes the relations; closing dismisses it', () => {
    const fetchRelations = jest.fn();
    twoModels({ fetchRelations });
    render(<SemanticLayerCanvas />);
    act(() => {
      rfProps.current.onConnect({
        source: 'erd-model-orders',
        target: 'erd-model-users',
        sourceHandle: 'user_id',
        targetHandle: 'id',
      });
    });
    const callsBefore = fetchRelations.mock.calls.length;
    act(() => {
      screen.getByTestId('join-popover-stub-saved').click();
    });
    expect(fetchRelations.mock.calls.length).toBe(callsBefore + 1);

    act(() => {
      screen.getByTestId('join-popover-stub-close').click();
    });
    expect(screen.queryByTestId('join-popover-stub')).not.toBeInTheDocument();
  });
});
