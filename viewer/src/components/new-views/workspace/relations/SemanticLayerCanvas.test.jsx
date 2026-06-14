/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen } from '@testing-library/react';
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

jest.mock('reactflow', () => {
  const MockReactFlow = ({ nodes, edges, nodeTypes, children }) => (
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
  MockReactFlow.displayName = 'MockReactFlow';
  return {
    __esModule: true,
    default: MockReactFlow,
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    MiniMap: () => <div data-testid="minimap" />,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
  };
});
jest.mock('reactflow/dist/style.css', () => ({}), { virtual: true });

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

  it('passes scopeAll to the dag so every model renders', () => {
    mockStore({ models: [{ name: 'orders' }] });
    useRelationErdDag.mockReturnValue({ nodes: [], edges: [] });
    render(<SemanticLayerCanvas />);
    expect(useRelationErdDag).toHaveBeenCalledWith(
      expect.objectContaining({ scopeAll: true })
    );
  });
});
