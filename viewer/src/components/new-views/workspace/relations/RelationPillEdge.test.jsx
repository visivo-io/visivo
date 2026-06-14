/* eslint-disable no-template-curly-in-string, testing-library/no-node-access, testing-library/no-container, testing-library/no-unnecessary-act */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ReactFlow, { ReactFlowProvider, useStoreApi } from 'reactflow';
import useStore from '../../../../stores/store';
import RelationPillEdge, { RELATION_EDGE_MARKER } from './RelationPillEdge';

// Mock ONLY the app store (so we can assert openEditRelationModal /
// setErdEdgeWaypoint). React-Flow itself is REAL — a real ReactFlowProvider +
// ReactFlow mount, so useReactFlow / useStore(nodeInternals) / useStoreApi /
// screenToFlowPosition run for real and a MISSING provider would crash the test
// (the no-provider bug can't hide). The nodeInternals we seed have NO width/height
// (jsdom never fires ResizeObserver) so the edge's null-geometry guard chain is
// exercised on first paint.
jest.mock('../../../../stores/store');

const setErdEdgeWaypoint = jest.fn();
const openEditRelationModal = jest.fn();
const getRelationByName = jest.fn(name => ({ name, condition: 'x = y' }));

beforeEach(() => {
  jest.clearAllMocks();
  const state = { setErdEdgeWaypoint, openEditRelationModal, getRelationByName };
  useStore.mockImplementation(selector => selector(state));
});

// Seeds nodeInternals into the live RF store so the edge can read live geometry.
const Seeder = ({ internals, children }) => {
  const api = useStoreApi();
  const seeded = React.useRef(false);
  if (!seeded.current) {
    api.setState({ nodeInternals: internals });
    seeded.current = true;
  }
  return children;
};

const defaultEdgeData = {
  relationName: 'orders_to_users',
  joinType: 'left',
  isDefault: true,
  condition: '${ref(orders).user_id} = ${ref(users).id}',
  sourceColumns: ['user_id'],
  targetColumns: ['id'],
  parallelIndex: 0,
  parallelCount: 1,
  scopeKey: 'semantic-layer',
};

/**
 * Mount the edge inside a real ReactFlowProvider + ReactFlow (the latter creates
 * the EdgeLabelRenderer portal target + the RF store). nodeInternals carry NO
 * width/height → the guard chain must still produce a finite path.
 */
function mountEdge({ edgeData = {}, internals: customInternals } = {}) {
  const internals =
    customInternals ||
    new Map([
      ['erd-model-orders', { id: 'erd-model-orders', position: { x: 0, y: 0 }, data: { name: 'orders', columns: ['user_id'] } }],
      ['erd-model-users', { id: 'erd-model-users', position: { x: 500, y: 0 }, data: { name: 'users', columns: ['id'] } }],
    ]);
  const edgeProps = {
    id: 'erd-rel-orders_to_users',
    source: 'erd-model-orders',
    target: 'erd-model-users',
    sourceHandle: 'user_id',
    targetHandle: 'id',
    markerEnd: RELATION_EDGE_MARKER,
    data: { ...defaultEdgeData, ...edgeData },
  };
  return render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} />
        <Seeder internals={internals}>
          <svg>
            <RelationPillEdge {...edgeProps} />
          </svg>
        </Seeder>
      </ReactFlowProvider>
    </div>
  );
}

const finitePaths = container =>
  Array.from(container.querySelectorAll('path'))
    .map(p => p.getAttribute('d'))
    .filter(Boolean);

// jsdom has no PointerEvent constructor and doesn't preserve clientX/clientY on
// fireEvent.pointer*; dispatch a MouseEvent (which DOES carry clientX/Y) under
// the pointer* type so the handlers receive real coords (mirrors a real browser).
const firePointer = (el, type, clientX, clientY) => {
  const evt = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(evt, 'pointerId', { value: 1 });
  el.dispatchEvent(evt);
};

describe('RelationPillEdge (real ReactFlowProvider)', () => {
  it('renders the relation pill with the join glyph + relation name', () => {
    mountEdge();
    const pill = screen.getByTestId('erd-relation-pill-orders_to_users');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent('orders_to_users');
    expect(pill.textContent).toContain('⟕'); // left-join glyph
  });

  it('renders a FINITE path even when nodeInternals lacks width/height', () => {
    const { container } = mountEdge();
    const dValues = finitePaths(container);
    expect(dValues.length).toBeGreaterThan(0);
    dValues.forEach(d => expect(d).not.toMatch(/NaN/));
  });

  it('styles the pill relation-blue on white (legible, no dark-on-dark)', () => {
    mountEdge();
    const pill = screen.getByTestId('erd-relation-pill-orders_to_users');
    expect(pill.style.background).toBe('rgb(255, 255, 255)');
    expect(pill.style.color).toMatch(/rgb\(59, 130, 246\)|#3b82f6/);
  });

  it('a click (no move) opens the relation editor modal', () => {
    mountEdge();
    const pill = screen.getByTestId('erd-relation-pill-orders_to_users');
    act(() => {
      firePointer(pill, 'pointerdown', 100, 100);
      firePointer(pill, 'pointerup', 100, 100);
    });
    expect(openEditRelationModal).toHaveBeenCalledTimes(1);
    expect(getRelationByName).toHaveBeenCalledWith('orders_to_users');
    expect(setErdEdgeWaypoint).not.toHaveBeenCalled();
  });

  it('a drag (>4px) sets data.waypoint and does NOT open the editor', () => {
    mountEdge();
    const pill = screen.getByTestId('erd-relation-pill-orders_to_users');
    act(() => {
      firePointer(pill, 'pointerdown', 100, 100);
      firePointer(pill, 'pointermove', 140, 160); // 50px move → drag
      firePointer(pill, 'pointerup', 140, 160);
    });
    expect(setErdEdgeWaypoint).toHaveBeenCalled();
    const [scope, edgeId] = setErdEdgeWaypoint.mock.calls[0];
    expect(scope).toBe('semantic-layer');
    expect(edgeId).toBe('erd-rel-orders_to_users');
    // The waypoint uses screenToFlowPosition (real RF). In a browser it's finite;
    // jsdom's pane has no bounding rect so the transform may be degenerate — the
    // scope/edge routing is what this asserts. A click was NOT registered.
    expect(openEditRelationModal).not.toHaveBeenCalled();
  });

  it('a move under the 4px threshold is treated as a click (opens editor)', () => {
    mountEdge();
    const pill = screen.getByTestId('erd-relation-pill-orders_to_users');
    act(() => {
      firePointer(pill, 'pointerdown', 100, 100);
      firePointer(pill, 'pointermove', 102, 101); // ~2px → still a click
      firePointer(pill, 'pointerup', 102, 101);
    });
    expect(setErdEdgeWaypoint).not.toHaveBeenCalled();
    expect(openEditRelationModal).toHaveBeenCalledTimes(1);
  });

  it('double-click clears the waypoint (sets it to null)', () => {
    mountEdge({ edgeData: { waypoint: { x: 200, y: 200 } } });
    const pill = screen.getByTestId('erd-relation-pill-orders_to_users');
    act(() => fireEvent.doubleClick(pill));
    expect(setErdEdgeWaypoint).toHaveBeenCalledWith(
      'semantic-layer',
      'erd-rel-orders_to_users',
      null
    );
  });

  it('the static regime keeps a finite path (no dragging endpoints)', () => {
    const { container } = mountEdge();
    finitePaths(container).forEach(d => expect(d).not.toMatch(/NaN/));
  });

  it('the drag regime (endpoint dragging:true) still produces a finite path', () => {
    const internals = new Map([
      ['erd-model-orders', { id: 'erd-model-orders', position: { x: 0, y: 0 }, dragging: true, data: { name: 'orders', columns: ['user_id'] } }],
      ['erd-model-users', { id: 'erd-model-users', position: { x: 500, y: 0 }, data: { name: 'users', columns: ['id'] } }],
    ]);
    const { container } = mountEdge({ internals });
    const dVals = finitePaths(container);
    expect(dVals.length).toBeGreaterThan(0);
    dVals.forEach(d => expect(d).not.toMatch(/NaN/));
  });

  it('renders a self-loop path (finite) when source === target', () => {
    const internals = new Map([
      ['erd-model-orders', { id: 'erd-model-orders', position: { x: 0, y: 0 }, data: { name: 'orders', columns: ['id', 'parent_id'] } }],
    ]);
    const edgeProps = {
      id: 'erd-rel-self',
      source: 'erd-model-orders',
      target: 'erd-model-orders',
      markerEnd: RELATION_EDGE_MARKER,
      data: {
        relationName: 'self_join',
        joinType: 'inner',
        sourceColumns: ['id', 'parent_id'],
        targetColumns: ['id', 'parent_id'],
        parallelIndex: 0,
        parallelCount: 1,
        scopeKey: 'semantic-layer',
      },
    };
    const { container } = render(
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} />
        <Seeder internals={internals}>
          <svg>
            <RelationPillEdge {...edgeProps} />
          </svg>
        </Seeder>
      </ReactFlowProvider>
    );
    expect(screen.getByTestId('erd-relation-pill-self_join')).toBeInTheDocument();
    finitePaths(container).forEach(d => expect(d).not.toMatch(/NaN/));
  });
});
