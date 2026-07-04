/* eslint-disable no-template-curly-in-string */
/**
 * Behaviour tests for the full lineage DAG builder + dagre layout wrapper.
 *
 * The sibling useLineageDag.test.js covers the VIS-826 nested-dashboard
 * recursion with dagre mocked out; this file exercises the rest of the hook
 * against REAL dagre: node construction for every collection, edge building
 * from child_item_names (dedupe + unknown-child skipping), the implicit
 * default-source inference, and computeLayout's fixed-node / layoutSize /
 * rankdir options.
 */
import { renderHook } from '@testing-library/react';
import useStore from '../../../stores/store';
import { useLineageDag, computeLayout } from './useLineageDag';

jest.mock('../../../stores/store');

function mockStoreState(state) {
  const fullState = {
    sources: [],
    models: [],
    dimensions: [],
    metrics: [],
    relations: [],
    insights: [],
    markdowns: [],
    charts: [],
    tables: [],
    dashboards: [],
    defaults: {},
    inputs: [],
    csvScriptModels: [],
    localMergeModels: [],
    ...state,
  };
  useStore.mockImplementation(selector => selector(fullState));
}

afterEach(() => jest.clearAllMocks());

const findNode = (nodes, id) => nodes.find(n => n.id === id);
const findEdge = (edges, source, target) =>
  edges.find(e => e.source === source && e.target === target);

describe('computeLayout', () => {
  const makeNodes = () => [
    { id: 'source-db', data: { name: 'db' }, position: { x: 0, y: 0 } },
    { id: 'model-users', data: { name: 'users' }, position: { x: 0, y: 0 } },
  ];
  const edges = [{ id: 'e1', source: 'source-db', target: 'model-users' }];

  it('lays out connected nodes left-to-right with numeric positions', () => {
    const result = computeLayout(makeNodes(), edges);

    const db = findNode(result, 'source-db');
    const users = findNode(result, 'model-users');
    expect(Number.isFinite(db.position.x)).toBe(true);
    expect(Number.isFinite(db.position.y)).toBe(true);
    // LR rank direction: the downstream model sits to the right of its source.
    expect(users.position.x).toBeGreaterThan(db.position.x);
  });

  it('pins the fixed node at its original position and shifts the rest of the graph consistently', () => {
    const base = computeLayout(makeNodes(), edges);
    const pinned = computeLayout(makeNodes(), edges, {
      id: 'model-users',
      position: { x: 500, y: 250 },
    });

    // The clicked node does not jump: it stays exactly where it was.
    expect(findNode(pinned, 'model-users').position).toEqual({ x: 500, y: 250 });

    // The whole graph is offset rigidly — relative geometry is preserved.
    const baseDelta = {
      x: findNode(base, 'model-users').position.x - findNode(base, 'source-db').position.x,
      y: findNode(base, 'model-users').position.y - findNode(base, 'source-db').position.y,
    };
    const pinnedDelta = {
      x: findNode(pinned, 'model-users').position.x - findNode(pinned, 'source-db').position.x,
      y: findNode(pinned, 'model-users').position.y - findNode(pinned, 'source-db').position.y,
    };
    expect(pinnedDelta).toEqual(baseDelta);
  });

  it('ignores a fixed node that is not part of the graph (no offset applied)', () => {
    const base = computeLayout(makeNodes(), edges);
    const result = computeLayout(makeNodes(), edges, {
      id: 'ghost-node',
      position: { x: 999, y: 999 },
    });
    expect(result.map(n => n.position)).toEqual(base.map(n => n.position));
  });

  it('honours an explicit layoutSize over the name-length estimate', () => {
    const base = computeLayout(makeNodes(), edges);
    const withSize = computeLayout(
      [
        {
          id: 'source-db',
          data: { name: 'db' },
          position: { x: 0, y: 0 },
          layoutSize: { width: 400, height: 200 },
        },
        { id: 'model-users', data: { name: 'users' }, position: { x: 0, y: 0 } },
      ],
      edges
    );
    // A wider upstream card pushes the downstream node further right.
    expect(findNode(withSize, 'model-users').position.x).toBeGreaterThan(
      findNode(base, 'model-users').position.x
    );
  });

  it('supports a top-to-bottom rank direction via opts', () => {
    const result = computeLayout(makeNodes(), edges, null, { rankdir: 'TB' });
    const db = findNode(result, 'source-db');
    const users = findNode(result, 'model-users');
    expect(users.position.y).toBeGreaterThan(db.position.y);
  });

  it('falls back to the minimum width estimate for nodes without a name', () => {
    const result = computeLayout([{ id: 'anon', data: {}, position: { x: 0, y: 0 } }], []);
    expect(Number.isFinite(findNode(result, 'anon').position.x)).toBe(true);
    expect(Number.isFinite(findNode(result, 'anon').position.y)).toBe(true);
  });
});

describe('useLineageDag full project graph', () => {
  const fullProject = {
    sources: [{ name: 'db', config: { type: 'duckdb' }, status: 'published' }],
    models: [
      {
        name: 'users',
        config: { sql: 'SELECT 1', source: '${ref(db)}' },
        status: 'modified',
        // 'db' twice → the edge must be deduped; 'ghost' is unknown → skipped.
        child_item_names: ['db', 'db', 'ghost'],
      },
    ],
    csvScriptModels: [{ name: 'csvm', child_item_names: ['db'] }],
    localMergeModels: [{ name: 'lmm', config: { sql: 'SELECT 2' }, child_item_names: ['users'] }],
    dimensions: [
      { name: 'dim_region', config: { sql: 'region' }, child_item_names: ['users'] },
    ],
    metrics: [{ name: 'total_rev', config: { sql: 'SUM(x)' }, child_item_names: ['users'] }],
    relations: [
      {
        name: 'rel_a',
        config: { model: 'users', sql_on: 'a = b' },
        child_item_names: ['users'],
      },
    ],
    insights: [
      {
        name: 'rev_insight',
        config: { props: { type: 'bar' } },
        child_item_names: ['users', 'total_rev'],
      },
    ],
    markdowns: [{ name: 'notes' }],
    inputs: [{ name: 'date_picker' }],
    charts: [{ name: 'rev_chart', child_item_names: ['rev_insight'] }],
    tables: [{ name: 'rev_table', child_item_names: ['rev_insight'] }],
    dashboards: [
      {
        name: 'exec',
        config: {
          rows: [
            {
              items: [
                { chart: '${ref(rev_chart)}' },
                { table: '${ref(rev_table)}' },
                { markdown: '${ref(notes)}' },
                { input: '${ref(date_picker)}' },
                // Duplicate ref — dashboard edges must be deduped too.
                { chart: '${ref(rev_chart)}' },
              ],
            },
          ],
        },
      },
    ],
  };

  it('builds a node per object with the right React Flow type and data payload', () => {
    mockStoreState(fullProject);
    const { result } = renderHook(() => useLineageDag());
    const { nodes } = result.current;

    const expectations = [
      ['source-db', 'sourceNode'],
      ['model-users', 'modelNode'],
      ['csvScriptModel-csvm', 'csvScriptModelNode'],
      ['localMergeModel-lmm', 'localMergeModelNode'],
      ['dimension-dim_region', 'dimensionNode'],
      ['metric-total_rev', 'metricNode'],
      ['relation-rel_a', 'relationNode'],
      ['insight-rev_insight', 'insightNode'],
      ['markdown-notes', 'markdownNode'],
      ['input-date_picker', 'inputNode'],
      ['chart-rev_chart', 'chartNode'],
      ['table-rev_table', 'tableNode'],
      ['dashboard-exec', 'dashboardNode'],
    ];
    expectations.forEach(([id, type]) => {
      const node = findNode(nodes, id);
      expect(node).toBeDefined();
      expect(node.type).toBe(type);
      // Real dagre assigned every node a concrete position.
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    });
    expect(nodes).toHaveLength(expectations.length);

    // Type-specific data mapping.
    expect(findNode(nodes, 'source-db').data).toMatchObject({
      name: 'db',
      objectType: 'source',
      type: 'duckdb',
      status: 'published',
    });
    expect(findNode(nodes, 'model-users').data).toMatchObject({
      sql: 'SELECT 1',
      status: 'modified',
    });
    expect(findNode(nodes, 'insight-rev_insight').data.propsType).toBe('bar');
    expect(findNode(nodes, 'relation-rel_a').data).toMatchObject({
      model: 'users',
      sql_on: 'a = b',
    });
    expect(findNode(nodes, 'dimension-dim_region').data.sql).toBe('region');
    expect(findNode(nodes, 'metric-total_rev').data.sql).toBe('SUM(x)');
    expect(findNode(nodes, 'localMergeModel-lmm').data.sql).toBe('SELECT 2');
  });

  it('wires edges from child_item_names for every collection, deduping and skipping unknown children', () => {
    mockStoreState(fullProject);
    const { result } = renderHook(() => useLineageDag());
    const { edges } = result.current;

    // Model ← source (deduped to a single edge despite ['db', 'db']).
    expect(edges.filter(e => e.source === 'source-db' && e.target === 'model-users')).toHaveLength(1);
    // The unknown child 'ghost' produced no edge at all.
    expect(edges.some(e => e.source.includes('ghost') || e.target.includes('ghost'))).toBe(false);

    // Each downstream collection hangs off its parents.
    expect(findEdge(edges, 'source-db', 'csvScriptModel-csvm')).toBeDefined();
    expect(findEdge(edges, 'model-users', 'localMergeModel-lmm')).toBeDefined();
    expect(findEdge(edges, 'model-users', 'dimension-dim_region')).toBeDefined();
    expect(findEdge(edges, 'model-users', 'metric-total_rev')).toBeDefined();
    expect(findEdge(edges, 'model-users', 'relation-rel_a')).toBeDefined();
    expect(findEdge(edges, 'model-users', 'insight-rev_insight')).toBeDefined();
    expect(findEdge(edges, 'metric-total_rev', 'insight-rev_insight')).toBeDefined();
    expect(findEdge(edges, 'insight-rev_insight', 'chart-rev_chart')).toBeDefined();
    expect(findEdge(edges, 'insight-rev_insight', 'table-rev_table')).toBeDefined();

    // Dashboard fan-in: chart, table, markdown and input all feed the dashboard.
    expect(findEdge(edges, 'chart-rev_chart', 'dashboard-exec')).toBeDefined();
    expect(findEdge(edges, 'table-rev_table', 'dashboard-exec')).toBeDefined();
    expect(findEdge(edges, 'markdown-notes', 'dashboard-exec')).toBeDefined();
    expect(findEdge(edges, 'input-date_picker', 'dashboard-exec')).toBeDefined();
    // The duplicate chart ref collapsed to a single edge.
    expect(
      edges.filter(e => e.source === 'chart-rev_chart' && e.target === 'dashboard-exec')
    ).toHaveLength(1);

    // Deterministic edge ids based on endpoints.
    expect(findEdge(edges, 'source-db', 'model-users').id).toBe(
      'edge-source-db-to-model-users'
    );
  });

  it('returns an empty DAG when the store is empty', () => {
    mockStoreState({});
    const { result } = renderHook(() => useLineageDag());
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
  });

  it('tolerates entirely undefined store slices (pre-fetch state)', () => {
    useStore.mockImplementation(selector => selector({}));
    const { result } = renderHook(() => useLineageDag());
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
  });

  it('builds bare nodes (and no edges) for objects with no config or child_item_names', () => {
    mockStoreState({
      sources: [{ name: 's' }],
      models: [{ name: 'm' }],
      csvScriptModels: [{ name: 'c' }],
      localMergeModels: [{ name: 'l' }],
      dimensions: [{ name: 'd' }],
      metrics: [{ name: 'me' }],
      relations: [{ name: 'r' }],
      insights: [{ name: 'i' }],
      markdowns: [{ name: 'md' }],
      inputs: [{ name: 'in' }],
      charts: [{ name: 'ch' }],
      tables: [{ name: 't' }],
      dashboards: [{ name: 'da' }],
    });
    const { result } = renderHook(() => useLineageDag());
    const { nodes, edges } = result.current;

    expect(nodes).toHaveLength(13);
    expect(edges).toEqual([]);
    // Optional config fields resolve to undefined rather than crashing.
    expect(findNode(nodes, 'source-s').data.type).toBeUndefined();
    expect(findNode(nodes, 'model-m').data.sql).toBeUndefined();
    expect(findNode(nodes, 'insight-i').data.propsType).toBeUndefined();
    expect(findNode(nodes, 'relation-r').data.model).toBeUndefined();
  });

  it('skips dashboard items without resolvable refs (no rows, empty rows, unnamed inline objects)', () => {
    mockStoreState({
      charts: [{ name: 'c1' }],
      dashboards: [
        { name: 'no-config' },
        { name: 'no-items', config: { rows: [{}] } },
        {
          name: 'mixed',
          config: {
            rows: [
              {
                items: [
                  { chart: { config: {} } }, // inline object without a name → skipped
                  { chart: '${ref(c1)}' }, // resolvable ref → edge
                  {}, // empty item → skipped
                ],
              },
            ],
          },
        },
      ],
    });
    const { result } = renderHook(() => useLineageDag());
    const { edges } = result.current;

    expect(edges).toHaveLength(1);
    expect(findEdge(edges, 'chart-c1', 'dashboard-mixed')).toBeDefined();
  });
});

describe('useLineageDag default source inference', () => {
  const source = { name: 'db', config: { type: 'duckdb' } };

  it('adds a dashed implicit edge from the default source to models without children', () => {
    mockStoreState({
      sources: [source],
      models: [
        { name: 'orphan', child_item_names: [] },
        { name: 'users', child_item_names: ['db'] },
      ],
      defaults: { source_name: 'db' },
    });
    const { result } = renderHook(() => useLineageDag());
    const { edges } = result.current;

    const implicit = findEdge(edges, 'source-db', 'model-orphan');
    expect(implicit).toBeDefined();
    expect(implicit.style).toEqual({ strokeDasharray: '5 5' });
    expect(implicit.data).toEqual({ isImplicit: true });

    // The model with an explicit child keeps its solid edge and gains no implicit one.
    const explicit = findEdge(edges, 'source-db', 'model-users');
    expect(explicit).toBeDefined();
    expect(explicit.data).toBeUndefined();
    expect(edges.filter(e => e.target === 'model-users')).toHaveLength(1);
  });

  it('adds no implicit edges when the default name does not resolve to a source', () => {
    mockStoreState({
      sources: [source],
      models: [{ name: 'orphan', child_item_names: [] }],
      defaults: { source_name: 'not_a_source' },
    });
    const { result } = renderHook(() => useLineageDag());
    expect(result.current.edges).toEqual([]);
  });

  it('adds no implicit edges when defaults are absent', () => {
    mockStoreState({
      sources: [source],
      models: [{ name: 'orphan', child_item_names: [] }],
      defaults: null,
    });
    const { result } = renderHook(() => useLineageDag());
    expect(result.current.edges).toEqual([]);
  });
});
