/**
 * WorkspaceDndContext tests (VIS-802 / Track G G-1).
 *
 * Two responsibilities:
 *   1. The shared <DndContext> wraps children + provides the live drag via
 *      useWorkspaceDrag() (initially null).
 *   2. routeWorkspaceDragEnd — the pure router that decides what a finished
 *      drag means. This SUBSUMES ProjectEditor's old onDragEnd (dashboard tile
 *      → level reassignment) AND adds Library-row → RefDropZone writes. dnd-kit
 *      pointer drags can't run in jsdom, so we unit-test the router directly;
 *      the real drag is exercised by the Playwright stories.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import WorkspaceDndContext, {
  useWorkspaceDrag,
  routeWorkspaceDragEnd,
  mapDragStartData,
} from './WorkspaceDndContext';
import useStore from '../../../stores/store';

const DASHBOARDS = [
  { name: 'd0', config: { level: 'Organization' } },
  { name: 'd1', config: { level: 'Department' } },
];

const DragProbe = () => {
  const drag = useWorkspaceDrag();
  return <div data-testid="drag-probe">{drag ? drag.kind : 'null'}</div>;
};

beforeEach(() => {
  useStore.setState({
    dashboards: DASHBOARDS,
    defaults: { levels: [{ title: 'Organization' }, { title: 'Department' }] },
    project: {},
    reassignDashboardLevel: jest.fn(() => Promise.resolve({ success: true })),
  });
});

describe('WorkspaceDndContext provider (VIS-802)', () => {
  test('renders children and provides a null drag initially', () => {
    render(
      <WorkspaceDndContext>
        <DragProbe />
      </WorkspaceDndContext>
    );
    expect(screen.getByTestId('drag-probe')).toHaveTextContent('null');
  });
});

describe('mapDragStartData — drag preview mapping (VIS-901 #5)', () => {
  test('returns null for no payload', () => {
    expect(mapDragStartData(null)).toBeNull();
    expect(mapDragStartData(undefined)).toBeNull();
  });

  test('dashboard tile → dashboard kind', () => {
    const out = mapDragStartData({ type: 'dashboard', name: 'd0', level: 'L1' });
    expect(out).toMatchObject({ kind: 'dashboard', name: 'd0', level: 'L1', type: 'dashboard' });
  });

  test('library row → library kind carrying the source payload', () => {
    const data = { source: 'library', type: 'chart', name: 'sales' };
    const out = mapDragStartData(data);
    expect(out).toMatchObject({ kind: 'library', name: 'sales', type: 'chart' });
    expect(out.data).toBe(data);
  });

  test('canvas ROW drag → row preview (NOT a chart pill)', () => {
    const out = mapDragStartData({ source: 'canvas', kind: 'row', rowIndex: 2, rowPath: 'row.2' });
    expect(out).toMatchObject({ kind: 'canvas', canvasKind: 'row' });
    // A row has no referenced object type — it must not borrow the chart pill.
    expect(out.type).toBeUndefined();
    expect(out.data).toBeUndefined();
  });

  test('canvas ROW drag falls back to a "Row" label when unnamed', () => {
    const out = mapDragStartData({ source: 'canvas', kind: 'row', rowPath: 'row.0' });
    expect(out.name).toBe('Row');
  });

  test('canvas ITEM drag → item pill keyed on the referenced type + name', () => {
    const out = mapDragStartData({
      source: 'canvas',
      kind: 'item',
      rowPath: 'row.0',
      itemIndex: 1,
      refType: 'table',
      label: 'orders',
    });
    expect(out).toMatchObject({ kind: 'canvas', canvasKind: 'item', name: 'orders', type: 'table' });
    expect(out.data).toMatchObject({ source: 'library', type: 'table', name: 'orders' });
  });

  test('canvas ITEM drag defaults to chart type when refType is absent', () => {
    const out = mapDragStartData({ source: 'canvas', kind: 'item', rowPath: 'row.0', itemIndex: 0 });
    expect(out.type).toBe('chart');
  });
});

describe('routeWorkspaceDragEnd (VIS-802)', () => {
  const defaults = { levels: [{ title: 'Organization' }, { title: 'Department' }] };

  test('returns noop when there is no drop target', () => {
    const result = routeWorkspaceDragEnd(
      { active: { data: { current: { type: 'dashboard', name: 'd0' } } }, over: null },
      { dashboards: DASHBOARDS, projectDefaults: defaults }
    );
    expect(result).toBe('noop');
  });

  test('dashboard tile drop → reassigns the level (M-1, now routed here)', () => {
    const reassignDashboardLevel = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { type: 'dashboard', name: 'd0', level: 'Organization' } } },
        over: { data: { current: { levelKey: 'level:1', levelValue: 'Department' } } },
      },
      { dashboards: DASHBOARDS, projectDefaults: defaults, reassignDashboardLevel, emit }
    );
    expect(result).toBe('reassign_level');
    expect(reassignDashboardLevel).toHaveBeenCalledWith('d0', 'Department');
    expect(emit).toHaveBeenCalledWith(
      'project_editor_action',
      expect.objectContaining({ kind: 'reassign_level', name: 'd0', level: 'Department' })
    );
  });

  test('library row drop on a matching ref-slot → writes the ref', () => {
    const onChange = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'chart', name: 'c1' } } },
        over: {
          data: {
            current: {
              kind: 'ref-slot',
              refId: 'row-0-item-0',
              allowedTypes: ['chart', 'table', 'markdown', 'input'],
              onChange,
            },
          },
        },
      },
      { emit }
    );
    expect(result).toBe('ref_accepted');
    expect(onChange).toHaveBeenCalledWith({ type: 'chart', name: 'c1' });
    expect(emit).toHaveBeenCalledWith(
      'ref_dropzone_drop',
      expect.objectContaining({ type: 'chart', name: 'c1', accepted: true })
    );
  });

  test('library row drop with a type-mismatch is rejected (no write)', () => {
    const onChange = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'source', name: 's1' } } },
        over: {
          data: {
            current: {
              kind: 'ref-slot',
              refId: 'row-0-item-0',
              allowedTypes: ['chart', 'table', 'markdown', 'input'],
              onChange,
            },
          },
        },
      },
      { emit }
    );
    expect(result).toBe('ref_rejected');
    expect(onChange).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'ref_dropzone_drop',
      expect.objectContaining({ type: 'source', accepted: false })
    );
  });

  test('library row drop on a non-ref-slot target is a noop', () => {
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'chart', name: 'c1' } } },
        over: { data: { current: { kind: 'something-else' } } },
      },
      {}
    );
    expect(result).toBe('noop');
  });
});

describe('routeWorkspaceDragEnd — canvas D-3 branches (VIS-771)', () => {
  const canvasConfig = () => ({
    rows: [
      { height: 'medium', items: [{ width: 6, chart: 'ref(a)' }, { width: 6, table: 'ref(b)' }] },
      { height: 'small', items: [{ width: 12, chart: 'ref(c)' }] },
    ],
  });

  const overCanvas = target => ({
    data: {
      current: { kind: 'canvas-drop', dashboardName: 'dash', config: canvasConfig(), target },
    },
  });

  test('canvas item drag → between-items on the same row reorders the items', () => {
    const commitCanvasConfig = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: {
          data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.0', itemIndex: 0 } },
        },
        // Drop before index 2 (after item 1) → item 0 moves to the end of the row.
        over: overCanvas({ kind: 'between-items', rowPath: 'row.0', index: 2 }),
      },
      { commitCanvasConfig, emit }
    );
    expect(result).toBe('canvas_reorder_items');
    expect(commitCanvasConfig).toHaveBeenCalledTimes(1);
    const [name, nextConfig] = commitCanvasConfig.mock.calls[0];
    expect(name).toBe('dash');
    const order = nextConfig.rows[0].items.map(it => it.chart || it.table);
    expect(order).toEqual(['ref(b)', 'ref(a)']);
    expect(emit).toHaveBeenCalledWith('canvas_dnd', expect.objectContaining({ kind: 'reorder_items' }));
  });

  test('canvas item drag → end-of-row appends the item to the end', () => {
    const commitCanvasConfig = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: {
          data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.0', itemIndex: 0 } },
        },
        over: overCanvas({ kind: 'end-of-row', rowPath: 'row.0' }),
      },
      { commitCanvasConfig }
    );
    expect(result).toBe('canvas_reorder_items');
    const order = commitCanvasConfig.mock.calls[0][1].rows[0].items.map(it => it.chart || it.table);
    expect(order).toEqual(['ref(b)', 'ref(a)']);
  });

  test('canvas item drag onto a DIFFERENT row is a noop (cross-row move not supported)', () => {
    const commitCanvasConfig = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: {
          data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.0', itemIndex: 0 } },
        },
        over: overCanvas({ kind: 'between-items', rowPath: 'row.1', index: 0 }),
      },
      { commitCanvasConfig }
    );
    expect(result).toBe('noop');
    expect(commitCanvasConfig).not.toHaveBeenCalled();
  });

  test('canvas row drag → between-rows reorders the top-level rows', () => {
    const commitCanvasConfig = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'canvas', kind: 'row', rowIndex: 1, rowPath: 'row.1' } } },
        // Drop before index 0 → row 1 moves to the top.
        over: overCanvas({ kind: 'between-rows', index: 0 }),
      },
      { commitCanvasConfig, emit }
    );
    expect(result).toBe('canvas_reorder_rows');
    const heights = commitCanvasConfig.mock.calls[0][1].rows.map(r => r.height);
    expect(heights).toEqual(['small', 'medium']);
    expect(emit).toHaveBeenCalledWith('canvas_dnd', expect.objectContaining({ kind: 'reorder_rows' }));
  });

  test('library drag → canvas between-items inserts a new item referencing the object', () => {
    const commitCanvasConfig = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'chart', name: 'new-chart' } } },
        over: overCanvas({ kind: 'between-items', rowPath: 'row.0', index: 1 }),
      },
      { commitCanvasConfig, emit }
    );
    expect(result).toBe('canvas_library_insert');
    const items = commitCanvasConfig.mock.calls[0][1].rows[0].items;
    expect(items).toHaveLength(3);
    expect(items[1].chart).toBe('ref(new-chart)');
    expect(emit).toHaveBeenCalledWith(
      'canvas_dnd',
      expect.objectContaining({ kind: 'library_insert', type: 'chart', name: 'new-chart' })
    );
  });

  test('library drag → canvas between-rows inserts a new top-level row', () => {
    const commitCanvasConfig = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'table', name: 't1' } } },
        over: overCanvas({ kind: 'between-rows', index: 1 }),
      },
      { commitCanvasConfig }
    );
    expect(result).toBe('canvas_library_insert');
    const rows = commitCanvasConfig.mock.calls[0][1].rows;
    expect(rows).toHaveLength(3);
    expect(rows[1].items[0].table).toBe('ref(t1)');
  });

  test('canvas-drop without a commit callback is a safe noop', () => {
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'canvas', kind: 'row', rowIndex: 0, rowPath: 'row.0' } } },
        over: overCanvas({ kind: 'between-rows', index: 1 }),
      },
      {}
    );
    expect(result).toBe('noop');
  });

  // ── Nested rows/items (VIS-903) ──────────────────────────────────────────
  const nestedCanvasConfig = () => ({
    rows: [
      {
        height: 'large',
        items: [
          { width: 2, chart: 'ref(top0)' },
          {
            width: 1,
            rows: [
              { height: 'small', items: [{ width: 6, chart: 'ref(n0)' }, { width: 6, table: 'ref(n1)' }] },
              { height: 'small', items: [{ width: 12, markdown: 'ref(n2)' }] },
            ],
          },
        ],
      },
    ],
  });
  const overNested = target => ({
    data: {
      current: { kind: 'canvas-drop', dashboardName: 'dash', config: nestedCanvasConfig(), target },
    },
  });

  test('nested item drag → between-items in its nested row reorders within that row', () => {
    const commitCanvasConfig = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: {
          data: {
            current: {
              source: 'canvas',
              kind: 'item',
              rowPath: 'row.0.item.1.row.0',
              itemIndex: 0,
            },
          },
        },
        over: overNested({ kind: 'between-items', rowPath: 'row.0.item.1.row.0', index: 2 }),
      },
      { commitCanvasConfig }
    );
    expect(result).toBe('canvas_reorder_items');
    const nestedItems = commitCanvasConfig.mock.calls[0][1].rows[0].items[1].rows[0].items;
    expect(nestedItems.map(it => it.chart || it.table)).toEqual(['ref(n1)', 'ref(n0)']);
  });

  test('nested row drag → between-rows in the SAME container reorders sub-rows', () => {
    const commitCanvasConfig = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: {
          data: { current: { source: 'canvas', kind: 'row', rowPath: 'row.0.item.1.row.0' } },
        },
        // Drop after the last sub-row → sub-row 0 moves to the end.
        over: overNested({ kind: 'between-rows', index: 2, containerPath: 'row.0.item.1' }),
      },
      { commitCanvasConfig, emit }
    );
    expect(result).toBe('canvas_reorder_rows');
    const subRows = commitCanvasConfig.mock.calls[0][1].rows[0].items[1].rows;
    expect(subRows[1].items[0].markdown).toBe(undefined); // moved
    expect(subRows[0].items[0].markdown).toBe('ref(n2)');
    expect(emit).toHaveBeenCalledWith(
      'canvas_dnd',
      expect.objectContaining({ kind: 'reorder_rows', containerPath: 'row.0.item.1' })
    );
  });

  test('nested row drag onto a DIFFERENT container band is a noop (no cross-boundary move)', () => {
    const commitCanvasConfig = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: {
          data: { current: { source: 'canvas', kind: 'row', rowPath: 'row.0.item.1.row.0' } },
        },
        // Target band scoped to a different / top-level container.
        over: overNested({ kind: 'between-rows', index: 0 }),
      },
      { commitCanvasConfig }
    );
    expect(result).toBe('noop');
    expect(commitCanvasConfig).not.toHaveBeenCalled();
  });

  test('library drag → nested between-rows inserts a new sub-row in the container', () => {
    const commitCanvasConfig = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'chart', name: 'fresh' } } },
        over: overNested({ kind: 'between-rows', index: 1, containerPath: 'row.0.item.1' }),
      },
      { commitCanvasConfig }
    );
    expect(result).toBe('canvas_library_insert');
    const subRows = commitCanvasConfig.mock.calls[0][1].rows[0].items[1].rows;
    expect(subRows).toHaveLength(3);
    expect(subRows[1].items[0].chart).toBe('ref(fresh)');
  });
});
