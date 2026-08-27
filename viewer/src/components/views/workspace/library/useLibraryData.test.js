/**
 * useLibraryData behaviour (VIS-769 / Track C C1).
 *
 * Verifies the hook partitions the project's collections into the C-1
 * design's two sections — Layout Items (chart · table · markdown · input ·
 * dashboard) and Data Layer (source · model · dimension · metric · relation ·
 * insight)
 * — with stable ids and model rows carrying a subtype + canonicalType.
 */
/* eslint-disable no-template-curly-in-string -- fixtures use literal Visivo ref-string syntax, not JS template interpolation */
import { renderHook, act } from '@testing-library/react';
import useStore from '../../../../stores/store';
import useLibraryData from './useLibraryData';

const resetStore = () => {
  act(() => {
    useStore.setState({
      charts: [],
      tables: [],
      markdowns: [],
      inputs: [],
      dashboards: [],
      sources: [],
      models: [],
      dimensions: [],
      metrics: [],
      relations: [],
      insights: [],
    });
  });
};

describe('useLibraryData', () => {
  beforeEach(() => {
    resetStore();
  });

  test('partitions the store into layoutItems and dataLayer groups', () => {
    const { result } = renderHook(() => useLibraryData());
    expect(Object.keys(result.current.layoutItems).sort()).toEqual([
      'chart',
      'dashboard',
      'input',
      'markdown',
      'table',
    ]);
    expect(Object.keys(result.current.dataLayer).sort()).toEqual([
      'dimension',
      'insight',
      'metric',
      'model',
      'relation',
      'source',
    ]);
  });

  test('maps the four Layout-Item collections into typed rows with stable ids', () => {
    act(() => {
      useStore.setState({
        charts: [{ name: 'waterfall', status: 'published' }],
        tables: [{ name: 'revenue_rows', status: 'new' }],
        markdowns: [{ name: 'notes', status: 'modified' }],
        inputs: [{ name: 'date_range', status: 'published' }],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.layoutItems.chart).toEqual([
      { id: 'chart:waterfall', type: 'chart', name: 'waterfall', status: 'published' },
    ]);
    expect(result.current.layoutItems.table).toEqual([
      { id: 'table:revenue_rows', type: 'table', name: 'revenue_rows', status: 'new' },
    ]);
    expect(result.current.layoutItems.markdown[0].type).toBe('markdown');
    expect(result.current.layoutItems.input[0].type).toBe('input');
  });

  test('maps dashboards into Layout-Item rows with stable ids (VIS-824)', () => {
    act(() => {
      useStore.setState({
        dashboards: [
          { name: 'overview', status: 'published' },
          { name: 'sales', status: 'new' },
        ],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    // Ordered, not insertion order: 'sales' is unpublished so it leads.
    expect(result.current.layoutItems.dashboard).toEqual([
      { id: 'dashboard:sales', type: 'dashboard', name: 'sales', status: 'new' },
      { id: 'dashboard:overview', type: 'dashboard', name: 'overview', status: 'published' },
    ]);
  });

  test('maps the data-layer collections into typed rows', () => {
    act(() => {
      useStore.setState({
        dimensions: [{ name: 'period' }],
        metrics: [{ name: 'revenue' }],
        relations: [{ name: 'customers_orders' }],
        insights: [{ name: 'revenue_growth', status: 'new' }],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.dataLayer.dimension).toEqual([
      {
        id: 'dimension:period',
        type: 'dimension',
        name: 'period',
        status: null,
        parentModel: null,
        expression: null,
      },
    ]);
    expect(result.current.dataLayer.metric[0].type).toBe('metric');
    expect(result.current.dataLayer.relation[0].type).toBe('relation');
    expect(result.current.dataLayer.insight).toEqual([
      { id: 'insight:revenue_growth', type: 'insight', name: 'revenue_growth', status: 'new' },
    ]);
  });

  // Explore 2.0 Phase 3a — 02-architecture.md §4's DnD "payload gap": a
  // dropped field's ref-scoping and an input's `.value`/`.values` accessor
  // both depend on data the Library row previously didn't carry.
  test('model-scoped fields group under their owner; unscoped stay top-level', () => {
    act(() => {
      useStore.setState({
        dimensions: [
          { name: 'scoped_dim', parentModel: 'orders', config: { expression: 'UPPER(region)' } },
          { name: 'unscoped_dim', config: { expression: 'count(*)' } },
        ],
        metrics: [
          { name: 'scoped_metric', parentModel: 'orders', config: { expression: 'sum(amount)' } },
        ],
      });
    });
    const { result } = renderHook(() => useLibraryData());

    // A nested field is plain SQL where `${ref()}` is a save-time error, while
    // a standalone one is authored WITH refs. Listing them side by side made
    // two different things look identical, so scoped ones now live under their
    // model (LibraryModelRow) and only unscoped ones remain top-level.
    expect(result.current.dataLayer.dimension.map(d => d.name)).toEqual(['unscoped_dim']);
    expect(result.current.dataLayer.metric).toEqual([]);

    const owned = result.current.nestedFieldsByModel.orders;
    expect(owned.dimension.map(d => d.name)).toEqual(['scoped_dim']);
    expect(owned.metric.map(m => m.name)).toEqual(['scoped_metric']);

    // The DnD payload the drop side needs is still carried (Phase 3a): scoping
    // decides `${ref(model).name}` vs a bare `${ref(name)}`.
    expect(owned.dimension[0].parentModel).toBe('orders');
    expect(owned.dimension[0].expression).toBe('UPPER(region)');
    expect(result.current.dataLayer.dimension[0].parentModel).toBeNull();
  });

  test('a model with no fields of its own gets no entry', () => {
    act(() => {
      useStore.setState({
        dimensions: [{ name: 'unscoped_dim', config: { expression: 'count(*)' } }],
        metrics: [],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    // LibraryModelRow keys its chevron off this — an expander that opens onto
    // an empty list is a dead affordance.
    expect(result.current.nestedFieldsByModel).toEqual({});
  });

  test('inputs carry inputType (single-select | multi-select)', () => {
    act(() => {
      useStore.setState({
        inputs: [
          { name: 'region', config: { type: 'single-select' } },
          { name: 'products', config: { type: 'multi-select' } },
          { name: 'no_config' },
        ],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    const byName = Object.fromEntries(result.current.layoutItems.input.map(i => [i.name, i]));
    const { region: single, products: multi, no_config: noConfig } = byName;
    expect(single.inputType).toBe('single-select');
    expect(multi.inputType).toBe('multi-select');
    expect(noConfig.inputType).toBeNull();
  });

  // Renamed in the main merge: #533 removed csv-script/local-merge models
  // (they became seeds), so the model list is no longer their union — the
  // test now asserts the surviving sql_model's subtype + canonical routing
  // type (main's body below).
  test('model rows carry a subtype and the canonical type used for routing', () => {
    act(() => {
      useStore.setState({
        models: [{ name: 'monthly_revenue', status: 'published' }],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.dataLayer.model).toHaveLength(1);
    expect(result.current.dataLayer.model.map(m => m.subtype)).toEqual(['sql_model']);
    expect(result.current.dataLayer.model.map(m => m.name)).toEqual(['monthly_revenue']);
    expect(result.current.dataLayer.model.every(m => m.type === 'model')).toBe(true);
    // Rows carry the REAL type for tab opens / edit routing — routing by
    // anything else resolves a null record and drops the rail into create mode.
    expect(result.current.dataLayer.model.map(m => m.canonicalType)).toEqual(['model']);
  });

  test('sources expose the underlying source subtype + status passthrough', () => {
    act(() => {
      useStore.setState({
        sources: [
          { name: 'local-duck', type: 'duckdb', status: 'published' },
          { name: 'pg', type: 'postgresql', status: null },
        ],
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.dataLayer.source).toEqual([
      {
        id: 'source:local-duck',
        type: 'source',
        name: 'local-duck',
        subtype: 'duckdb',
        status: 'published',
      },
      { id: 'source:pg', type: 'source', name: 'pg', subtype: 'postgresql', status: null },
    ]);
  });

  test('returns empty arrays for missing collections (no crash)', () => {
    act(() => {
      useStore.setState({
        charts: undefined,
        tables: undefined,
        markdowns: undefined,
        inputs: undefined,
        dashboards: undefined,
        sources: undefined,
        models: undefined,
        dimensions: undefined,
        metrics: undefined,
        relations: undefined,
        insights: undefined,
      });
    });
    const { result } = renderHook(() => useLibraryData());
    expect(result.current.layoutItems.chart).toEqual([]);
    expect(result.current.layoutItems.table).toEqual([]);
    expect(result.current.layoutItems.dashboard).toEqual([]);
    expect(result.current.dataLayer.model).toEqual([]);
    expect(result.current.dataLayer.insight).toEqual([]);
  });
});

describe('useLibraryData — objects marked for deletion', () => {
  // A delete is a SOFT delete: the server marks the row "deleted" and it stays
  // until a commit removes it from YAML.
  //
  // The Library KEEPS those rows, and is the only surface that does. This rail
  // is where pending changes are seen and managed — the row carries a red dot
  // and offers Restore — so hiding it here left a pending deletion the user
  // could neither see nor undo without discarding every other pending change.
  // Every other surface drops them (`common/softDelete`); the lineage in
  // particular draws the graph as it WILL be, so a tombstone there is wrong.
  const withStore = state => {
    useStore.setState(state);
    return renderHook(() => useLibraryData()).result;
  };

  it('keeps a deleted dimension in the tree', () => {
    const result = withStore({
      dimensions: [
        { name: 'keep_me', status: 'new' },
        { name: 'tombstoned', status: 'deleted' },
      ],
    });

    const names = result.current.dataLayer.dimension.map(d => d.name);
    expect(names).toContain('tombstoned');
    expect(names).toContain('keep_me');
  });

  it('keeps a deleted layout item too — the other mapper', () => {
    const result = withStore({
      charts: [
        { name: 'bar', status: 'modified' },
        { name: 'removed', status: 'deleted' },
      ],
    });

    expect(result.current.layoutItems.chart.map(c => c.name)).toContain('removed');
  });

  it('carries the deleted status through, so the row can render its red dot', () => {
    const result = withStore({
      metrics: [{ name: 'gone', status: 'deleted' }],
    });

    expect(result.current.dataLayer.metric[0].status).toBe('deleted');
  });

  it('keeps every other status, so the unpublished dot still renders', () => {
    const result = withStore({
      charts: [
        { name: 'a', status: 'new' },
        { name: 'b', status: 'modified' },
        { name: 'c', status: 'published' },
        { name: 'd', status: null },
      ],
    });

    expect(result.current.layoutItems.chart).toHaveLength(4);
  });
});
