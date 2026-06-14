/* eslint-disable no-template-curly-in-string, testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ReactFlow, { ReactFlowProvider, useStoreApi } from 'reactflow';
import RelationNode from './RelationNode';
import RelationLinkEdge from './RelationLinkEdge';
import { getTypeColors } from '../../common/objectTypeConfigs';

// The relation node is a pure presentational component (the canvas wires the
// click via onNodeClick), so it renders standalone with no provider. The link
// edge, by contrast, reads live RF geometry, so its test mounts a REAL
// ReactFlowProvider + ReactFlow.

describe('RelationNode (relation-as-node pill)', () => {
  const data = {
    relationName: 'orders_to_users',
    joinType: 'left',
    isDefault: true,
    condition: '${ref(orders).user_id} = ${ref(users).id}',
    modelA: 'orders',
    columnA: 'user_id',
    modelB: 'users',
    columnB: 'id',
  };

  it('renders the pill with the relation name', () => {
    render(
      <ReactFlowProvider>
        <RelationNode data={data} selected={false} />
      </ReactFlowProvider>
    );
    const node = screen.getByTestId('erd-relation-node-orders_to_users');
    expect(node).toBeInTheDocument();
    expect(node).toHaveTextContent('orders_to_users');
  });

  it('keeps the inner erd-relation-pill testid the e2e selectors resolve', () => {
    render(
      <ReactFlowProvider>
        <RelationNode data={data} selected={false} />
      </ReactFlowProvider>
    );
    expect(screen.getByTestId('erd-relation-pill-orders_to_users')).toBeInTheDocument();
  });

  it('uses the objectTypeConfigs relation colour + icon (no hand-rolled tones)', () => {
    const { container } = render(
      <ReactFlowProvider>
        <RelationNode data={data} selected={false} />
      </ReactFlowProvider>
    );
    const node = screen.getByTestId('erd-relation-node-orders_to_users');
    const colors = getTypeColors('relation');
    // The relation pill carries the shared relation bg + text classes.
    expect(node.className).toContain(colors.bg);
    expect(node.className).toContain(colors.text);
    // The relation icon (an MUI svg) renders inside the pill.
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the default star when isDefault is true', () => {
    render(
      <ReactFlowProvider>
        <RelationNode data={data} selected={false} />
      </ReactFlowProvider>
    );
    expect(screen.getByTestId('erd-relation-default-orders_to_users')).toBeInTheDocument();
  });

  it('omits the default star when isDefault is false', () => {
    render(
      <ReactFlowProvider>
        <RelationNode data={{ ...data, isDefault: false }} selected={false} />
      </ReactFlowProvider>
    );
    expect(screen.queryByTestId('erd-relation-default-orders_to_users')).not.toBeInTheDocument();
  });

  it('exposes a left (target) and right (source) handle for RF connection validity', () => {
    const { container } = render(
      <ReactFlowProvider>
        <RelationNode data={data} selected={false} />
      </ReactFlowProvider>
    );
    const handles = container.querySelectorAll('.react-flow__handle');
    expect(handles.length).toBe(2);
    expect(container.querySelector('.react-flow__handle-left')).toBeInTheDocument();
    expect(container.querySelector('.react-flow__handle-right')).toBeInTheDocument();
  });
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

const finitePaths = container =>
  Array.from(container.querySelectorAll('path'))
    .map(p => p.getAttribute('d'))
    .filter(Boolean);

describe('RelationLinkEdge (real ReactFlowProvider)', () => {
  // nodeInternals carry NO width/height (jsdom never fires ResizeObserver) so the
  // null-geometry guard chain is exercised on the first paint.
  const baseInternals = () =>
    new Map([
      [
        'erd-model-orders',
        {
          id: 'erd-model-orders',
          position: { x: 0, y: 0 },
          data: { name: 'orders', columns: ['user_id'] },
        },
      ],
      [
        'erd-relnode-orders_to_users',
        {
          id: 'erd-relnode-orders_to_users',
          position: { x: 400, y: 0 },
          data: { relationName: 'orders_to_users' },
        },
      ],
    ]);

  const mountEdge = ({ internals, edgeProps } = {}) =>
    render(
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} />
        <Seeder internals={internals || baseInternals()}>
          <svg>
            <RelationLinkEdge
              id="erd-reledge-orders_to_users-a"
              source="erd-model-orders"
              target="erd-relnode-orders_to_users"
              sourceHandle="user_id"
              data={{
                relationName: 'orders_to_users',
                modelEnd: 'source',
                column: 'user_id',
                columns: ['user_id'],
              }}
              {...edgeProps}
            />
          </svg>
        </Seeder>
      </ReactFlowProvider>
    );

  it('renders a FINITE path even when nodeInternals lacks width/height', () => {
    const { container } = mountEdge();
    const dValues = finitePaths(container);
    expect(dValues.length).toBeGreaterThan(0);
    dValues.forEach(d => expect(d).not.toMatch(/NaN/));
  });

  it('renders no arrowhead marker and no pill label', () => {
    const { container } = mountEdge();
    // No EdgeLabelRenderer pill content (the pill is the node now).
    expect(container.querySelector('[data-testid^="erd-relation-pill-"]')).toBeNull();
    // The BaseEdge path has no marker-end reference (undirected link).
    const path = container.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path.getAttribute('marker-end')).toBeFalsy();
  });

  it('strokes the line in the relation colour', () => {
    const { container } = mountEdge();
    const path = container.querySelector('path');
    const stroke = path.getAttribute('stroke') || path.style.stroke;
    expect(stroke).toMatch(/#3b82f6|rgb\(59, 130, 246\)/);
  });

  it('handles the relationNode → model (target model end) direction with a finite path', () => {
    const internals = new Map([
      [
        'erd-relnode-orders_to_users',
        {
          id: 'erd-relnode-orders_to_users',
          position: { x: 0, y: 0 },
          data: { relationName: 'orders_to_users' },
        },
      ],
      [
        'erd-model-users',
        { id: 'erd-model-users', position: { x: 400, y: 0 }, data: { name: 'users', columns: ['id'] } },
      ],
    ]);
    const { container } = mountEdge({
      internals,
      edgeProps: {
        id: 'erd-reledge-orders_to_users-b',
        source: 'erd-relnode-orders_to_users',
        target: 'erd-model-users',
        sourceHandle: undefined,
        targetHandle: 'id',
        data: { relationName: 'orders_to_users', modelEnd: 'target', column: 'id', columns: ['id'] },
      },
    });
    finitePaths(container).forEach(d => expect(d).not.toMatch(/NaN/));
  });
});
