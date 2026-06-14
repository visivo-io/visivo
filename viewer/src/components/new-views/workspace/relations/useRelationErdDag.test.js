/* eslint-disable no-template-curly-in-string */
import { renderHook } from '@testing-library/react';
import useStore from '../../../../stores/store';
import {
  useRelationErdDag,
  parseRelationCondition,
  modelColumns,
  ERD_NODE_ID,
} from './useRelationErdDag';

// Mock the store so we can drive `models` / `relations` with controlled state.
jest.mock('../../../../stores/store');

// Mock dagre's layout so the hook doesn't need a real graph engine — we only
// assert on the nodes/edges the hook produces, not their positions.
jest.mock('dagre', () => ({
  graphlib: {
    Graph: class {
      setGraph() {}
      setDefaultEdgeLabel() {}
      setNode() {}
      setEdge() {}
      node() {
        return { x: 0, y: 0, width: 180, height: 50 };
      }
    },
  },
  layout: jest.fn(),
}));

function mockStoreState(state) {
  const fullState = { models: [], relations: [], ...state };
  useStore.mockImplementation(selector => selector(fullState));
}

describe('parseRelationCondition', () => {
  it('extracts both (model, column) endpoints from a ref condition', () => {
    const parsed = parseRelationCondition('${ref(orders).user_id} = ${ref(users).id}');
    expect(parsed).toEqual({
      a: { model: 'orders', column: 'user_id' },
      b: { model: 'users', column: 'id' },
    });
  });

  it('tolerates non-equality operators', () => {
    const parsed = parseRelationCondition('${ref(a).x} >= ${ref(b).y}');
    expect(parsed.a).toEqual({ model: 'a', column: 'x' });
    expect(parsed.b).toEqual({ model: 'b', column: 'y' });
  });

  it('returns null when there are not exactly two ref operands', () => {
    expect(parseRelationCondition('${ref(a).x} = 5')).toBeNull();
    expect(parseRelationCondition('')).toBeNull();
    expect(parseRelationCondition(null)).toBeNull();
  });
});

describe('modelColumns', () => {
  it('reads top-level columns, config.columns, and normalises object columns', () => {
    expect(modelColumns({ columns: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(modelColumns({ config: { columns: ['c'] } })).toEqual(['c']);
    expect(modelColumns({ columns: [{ name: 'd' }, { name: 'e' }] })).toEqual(['d', 'e']);
    expect(modelColumns({})).toEqual([]);
    expect(modelColumns(null)).toEqual([]);
  });
});

describe('useRelationErdDag', () => {
  afterEach(() => jest.clearAllMocks());

  it('builds one node per model carrying its columns', () => {
    mockStoreState({
      models: [
        { name: 'orders', columns: ['id', 'user_id'] },
        { name: 'users', config: { columns: ['id', 'email'] } },
      ],
    });

    const { result } = renderHook(() => useRelationErdDag());
    const { nodes } = result.current;

    expect(nodes).toHaveLength(2);
    const orders = nodes.find(n => n.id === ERD_NODE_ID('orders'));
    expect(orders.type).toBe('erdModelNode');
    expect(orders.data.name).toBe('orders');
    expect(orders.data.columns).toEqual(['id', 'user_id']);
    const users = nodes.find(n => n.id === ERD_NODE_ID('users'));
    expect(users.data.columns).toEqual(['id', 'email']);
  });

  it('builds an edge per existing relation, wired to the column handles', () => {
    mockStoreState({
      models: [
        { name: 'orders', columns: ['user_id'] },
        { name: 'users', columns: ['id'] },
      ],
      relations: [
        {
          name: 'orders_to_users',
          condition: '${ref(orders).user_id} = ${ref(users).id}',
          join_type: 'left',
          is_default: true,
        },
      ],
    });

    const { result } = renderHook(() => useRelationErdDag());
    const { edges } = result.current;

    expect(edges).toHaveLength(1);
    const edge = edges[0];
    expect(edge.source).toBe(ERD_NODE_ID('orders'));
    expect(edge.target).toBe(ERD_NODE_ID('users'));
    expect(edge.sourceHandle).toBe('user_id');
    expect(edge.targetHandle).toBe('id');
    expect(edge.data.relationName).toBe('orders_to_users');
    expect(edge.data.joinType).toBe('left');
    expect(edge.data.isDefault).toBe(true);
  });

  it('drops relations whose endpoints are not both rendered models', () => {
    mockStoreState({
      models: [{ name: 'orders', columns: ['user_id'] }],
      relations: [
        { name: 'orphan', condition: '${ref(orders).user_id} = ${ref(users).id}' },
      ],
    });

    const { result } = renderHook(() => useRelationErdDag());
    expect(result.current.edges).toHaveLength(0);
  });
});
