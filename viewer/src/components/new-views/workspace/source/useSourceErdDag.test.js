/**
 * useSourceErdDag — flattening the nested sources_metadata feed into one ERD node
 * per table (VIS-1005). These are pure-builder tests (no React-Flow).
 */
import { renderHook } from '@testing-library/react';
import { flattenSourceTables, erdNodeId, useSourceErdDag } from './useSourceErdDag';

const NESTED = {
  name: 'analytics_db',
  type: 'postgresql',
  status: 'connected',
  databases: [
    {
      name: 'main',
      schemas: [
        {
          name: 'public',
          tables: [
            { name: 'orders', columns: ['id', 'amount'] },
            { name: 'users', columns: [{ name: 'id', type: 'int' }, { name: 'email', type: 'text' }] },
          ],
        },
        {
          name: 'staging',
          tables: [{ name: 'raw_events', columns: ['ts'] }],
        },
      ],
    },
  ],
};

// A database whose tables hang directly off it (no schema layer, e.g. DuckDB).
const FLAT_DB = {
  name: 'duck',
  type: 'duckdb',
  status: 'connected',
  databases: [
    {
      name: 'memory',
      tables: [
        { name: 't1', columns: ['a', 'b'] },
        { name: 't2', columns: [] },
      ],
    },
  ],
};

describe('flattenSourceTables', () => {
  test('flattens every table across schemas into one descriptor each', () => {
    const tables = flattenSourceTables(NESTED);
    expect(tables).toHaveLength(3);
    expect(tables.map(t => t.table).sort()).toEqual(['orders', 'raw_events', 'users']);
  });

  test('preserves database + schema qualification per table', () => {
    const tables = flattenSourceTables(NESTED);
    const orders = tables.find(t => t.table === 'orders');
    expect(orders.database).toBe('main');
    expect(orders.schema).toBe('public');
    expect(orders.id).toBe(erdNodeId('main', 'public', 'orders'));
  });

  test('normalises bare-string and {name,type} columns alike', () => {
    const tables = flattenSourceTables(NESTED);
    const orders = tables.find(t => t.table === 'orders');
    expect(orders.columns).toEqual([
      { name: 'id', type: null },
      { name: 'amount', type: null },
    ]);
    const users = tables.find(t => t.table === 'users');
    expect(users.columns).toEqual([
      { name: 'id', type: 'int' },
      { name: 'email', type: 'text' },
    ]);
  });

  test('handles schemaless databases (tables hang off the database)', () => {
    const tables = flattenSourceTables(FLAT_DB);
    expect(tables).toHaveLength(2);
    const t1 = tables.find(t => t.table === 't1');
    expect(t1.schema).toBeNull();
    expect(t1.database).toBe('memory');
    expect(t1.id).toBe(erdNodeId('memory', null, 't1'));
  });

  test('returns [] for a null / empty / databaseless entry', () => {
    expect(flattenSourceTables(null)).toEqual([]);
    expect(flattenSourceTables({})).toEqual([]);
    expect(flattenSourceTables({ databases: [] })).toEqual([]);
  });
});

describe('useSourceErdDag', () => {
  test('builds tableErdNode nodes (and empty edges) carrying the source name', () => {
    const { result } = renderHook(() => useSourceErdDag('analytics_db', NESTED));
    const { nodes, edges } = result.current;
    expect(edges).toEqual([]);
    expect(nodes).toHaveLength(3);
    nodes.forEach(n => {
      expect(n.type).toBe('tableErdNode');
      expect(n.data.sourceName).toBe('analytics_db');
      expect(n.data.objectType).toBe('source');
      expect(n.position).toEqual({ x: 0, y: 0 });
    });
    const orders = nodes.find(n => n.data.table === 'orders');
    expect(orders.data.name).toBe('orders');
    expect(orders.data.columns).toHaveLength(2);
  });

  test('yields no nodes for a source with no databases', () => {
    const { result } = renderHook(() => useSourceErdDag('empty', { databases: [] }));
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
  });
});
