/* eslint-disable no-template-curly-in-string */
import { renderHook } from '@testing-library/react';
import useStore from '../../../../stores/store';
import {
  useRelationErdDag,
  parseRelationCondition,
  relationModelNames,
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

  it('resolves the edge handles case-insensitively against the cards’ columns', () => {
    // The condition uses lowercase `.x`, but the hydrated columns are uppercase
    // `X` (DuckDB upper-cases unquoted identifiers). The edge must still wire to
    // the real `X` handle — otherwise React-Flow drops the edge.
    mockStoreState({
      models: [
        { name: 'orders', columns: ['X', 'Y'] },
        { name: 'users', columns: ['X'] },
      ],
      relations: [{ name: 'o_to_u', condition: '${ref(orders).x} = ${ref(users).x}' }],
    });

    const { result } = renderHook(() => useRelationErdDag());
    const edge = result.current.edges[0];
    expect(edge.sourceHandle).toBe('X');
    expect(edge.targetHandle).toBe('X');
  });

  it('omits the handle (node-level connection) when the column is absent', () => {
    mockStoreState({
      models: [
        { name: 'orders', columns: ['id'] },
        { name: 'users', columns: ['id'] },
      ],
      relations: [{ name: 'o_to_u', condition: '${ref(orders).missing} = ${ref(users).id}' }],
    });

    const { result } = renderHook(() => useRelationErdDag());
    const edge = result.current.edges[0];
    // `missing` has no handle → omitted; `id` resolves exactly.
    expect(edge.sourceHandle).toBeUndefined();
    expect(edge.targetHandle).toBe('id');
  });

  it('uses hydrated columns to resolve handles when the record has none', () => {
    mockStoreState({
      models: [{ name: 'orders' }, { name: 'users' }],
      relations: [{ name: 'o_to_u', condition: '${ref(orders).x} = ${ref(users).x}' }],
    });

    const { result } = renderHook(() =>
      useRelationErdDag({ columnsByModel: { orders: ['X'], users: ['X'] } })
    );
    const edge = result.current.edges[0];
    expect(edge.sourceHandle).toBe('X');
    expect(edge.targetHandle).toBe('X');
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

  it('scopes the rendered models to scopeModelNames (+ extras)', () => {
    mockStoreState({
      models: [
        { name: 'orders', columns: ['id'] },
        { name: 'users', columns: ['id'] },
        { name: 'unrelated', columns: ['id'] },
      ],
    });

    const { result } = renderHook(() =>
      useRelationErdDag({ scopeModelNames: ['orders', 'users'] })
    );
    const ids = result.current.nodes.map(n => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([ERD_NODE_ID('orders'), ERD_NODE_ID('users')])
    );
    expect(ids).not.toContain(ERD_NODE_ID('unrelated'));
  });

  it('includes extraModelNames added on top of the scope', () => {
    mockStoreState({
      models: [
        { name: 'orders', columns: ['id'] },
        { name: 'users', columns: ['id'] },
        { name: 'extra', columns: ['id'] },
      ],
    });

    const { result } = renderHook(() =>
      useRelationErdDag({ scopeModelNames: ['orders'], extraModelNames: ['extra'] })
    );
    const ids = result.current.nodes.map(n => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([ERD_NODE_ID('orders'), ERD_NODE_ID('extra')])
    );
    expect(ids).not.toContain(ERD_NODE_ID('users'));
  });

  it('hydrates columns from columnsByModel when the record has none', () => {
    mockStoreState({
      models: [{ name: 'orders' }], // no columns on the record
    });

    const { result } = renderHook(() =>
      useRelationErdDag({ columnsByModel: { orders: ['id', 'amount'] } })
    );
    const node = result.current.nodes.find(n => n.id === ERD_NODE_ID('orders'));
    expect(node.data.columns).toEqual(['id', 'amount']);
  });

  it('prefers the record columns over the hydrated set', () => {
    mockStoreState({
      models: [{ name: 'orders', columns: ['real_col'] }],
    });

    const { result } = renderHook(() =>
      useRelationErdDag({ columnsByModel: { orders: ['hydrated_col'] } })
    );
    const node = result.current.nodes.find(n => n.id === ERD_NODE_ID('orders'));
    expect(node.data.columns).toEqual(['real_col']);
  });
});

describe('relationModelNames', () => {
  it('returns the two joined model names from a relation condition', () => {
    expect(
      relationModelNames({ condition: '${ref(orders).id} = ${ref(users).id}' })
    ).toEqual(['orders', 'users']);
  });

  it('reads the condition from config.condition too', () => {
    expect(
      relationModelNames({ config: { condition: '${ref(a).x} = ${ref(b).y}' } })
    ).toEqual(['a', 'b']);
  });

  it('returns [] when the condition is not a clean two-model join', () => {
    expect(relationModelNames({ condition: '${ref(a).x} = 5' })).toEqual([]);
    expect(relationModelNames(null)).toEqual([]);
    expect(relationModelNames({})).toEqual([]);
  });
});
