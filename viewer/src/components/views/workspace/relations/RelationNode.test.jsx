/* eslint-disable no-template-curly-in-string, testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
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

const finitePaths = container =>
  Array.from(container.querySelectorAll('path'))
    .map(p => p.getAttribute('d'))
    .filter(Boolean);

describe('RelationLinkEdge (built on React Flow handle positions)', () => {
  // React Flow computes sourceX/Y + targetX/Y from the ACTUAL rendered handle
  // positions (the edge sets sourceHandle/targetHandle = the column id) and hands
  // them to the edge — there is NO geometry estimation in the edge. The edge just
  // draws a bezier between the two points. BaseEdge is presentational, so no
  // provider is needed here.
  const mountEdge = props =>
    render(
      <svg>
        <RelationLinkEdge
          id="erd-reledge-orders_to_users-a"
          sourceX={100}
          sourceY={50}
          sourcePosition="right"
          targetX={400}
          targetY={120}
          targetPosition="left"
          {...props}
        />
      </svg>
    );

  it('draws a finite bezier path between the source and target handle positions', () => {
    const { container } = mountEdge();
    const dValues = finitePaths(container);
    expect(dValues.length).toBeGreaterThan(0);
    dValues.forEach(d => expect(d).not.toMatch(/NaN/));
  });

  it('renders no arrowhead marker and no pill label (undirected)', () => {
    const { container } = mountEdge();
    // The pill is the node now — no label on the edge.
    expect(container.querySelector('[data-testid^="erd-relation-pill-"]')).toBeNull();
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
});
