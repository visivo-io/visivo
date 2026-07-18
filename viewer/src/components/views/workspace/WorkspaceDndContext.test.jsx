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
/* eslint-disable no-template-curly-in-string -- fixtures use literal Visivo ref-string syntax, not JS template interpolation */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { useDraggable } from '@dnd-kit/core';
import WorkspaceDndContext, {
  useWorkspaceDrag,
  routeWorkspaceDragEnd,
  routeExplorationDragEnd,
  mapDragStartData,
  workspaceCollisionDetection,
  useCommitCanvasConfig,
  useWorkspaceCommit,
  WorkspaceCommitProvider,
} from './WorkspaceDndContext';
import useStore from '../../../stores/store';
import { preloadValidationSchema, clearValidationCache } from './validateAgainstSchema';

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

describe('workspaceCollisionDetection — canvas item drag (VIS-974)', () => {
  // A dnd-kit ClientRect (corners derived) keyed into the droppableRects Map.
  const rect = (left, top, width, height) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  const container = (id, target) => ({ id, data: { current: { target } } });

  test('a nested item drag resolves to its OWN gap, not the enclosing container body', () => {
    // The container's in-container zone + the slot's on-item zone both ENCLOSE
    // the small nested between-items gap; the pointer sits inside all three. The
    // exclusion must drop the two slot-body zones so the gap is the only
    // candidate (otherwise the big container wins and the router no-ops — the
    // "dead gesture" in nested layouts this fixes).
    const gap = container('gap', {
      kind: 'between-items',
      rowPath: 'row.0.item.1.row.0',
      index: 1,
    });
    const inContainer = container('inContainer', {
      kind: 'in-container',
      itemPath: 'row.0.item.1',
    });
    const onItem = container('onItem', {
      kind: 'on-item',
      rowPath: 'row.0.item.1.row.0',
      index: 0,
    });
    const droppableRects = new Map([
      ['inContainer', rect(400, 0, 400, 400)],
      ['onItem', rect(400, 0, 190, 130)],
      ['gap', rect(595, 0, 12, 130)],
    ]);
    const result = workspaceCollisionDetection({
      active: {
        data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.0.item.1.row.0' } },
      },
      droppableContainers: [inContainer, onItem, gap],
      droppableRects,
      pointerCoordinates: { x: 601, y: 60 },
      collisionRect: rect(595, 0, 12, 130),
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('gap');
  });

  test('a canvas item drag still excludes between-rows bands', () => {
    const gap = container('gap', { kind: 'end-of-row', rowPath: 'row.0' });
    const band = container('band', { kind: 'between-rows', index: 1 });
    const droppableRects = new Map([
      ['gap', rect(700, 0, 18, 200)],
      ['band', rect(0, 90, 800, 22)],
    ]);
    const result = workspaceCollisionDetection({
      active: { data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.0' } } },
      droppableContainers: [band, gap],
      droppableRects,
      // Pointer is over BOTH the band and the trailing gap; the band must be
      // filtered out for an item drag so the gap wins.
      pointerCoordinates: { x: 709, y: 100 },
      collisionRect: rect(700, 95, 18, 10),
    });
    expect(result.map(r => r.id)).not.toContain('band');
    expect(result[0].id).toBe('gap');
  });

  test('keeps an EMPTY slot on-item zone but drops a FILLED one (VIS-989)', () => {
    const emptyOnItem = container('empty', { kind: 'on-item', rowPath: 'row.0', index: 1, empty: true });
    const filledOnItem = container('filled', { kind: 'on-item', rowPath: 'row.0', index: 0 });
    const droppableRects = new Map([
      ['empty', rect(400, 0, 190, 130)],
      ['filled', rect(0, 0, 390, 130)],
    ]);
    // Pointer over the empty slot only.
    const result = workspaceCollisionDetection({
      active: { data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.1' } } },
      droppableContainers: [emptyOnItem, filledOnItem],
      droppableRects,
      pointerCoordinates: { x: 495, y: 65 },
      collisionRect: rect(490, 60, 10, 10),
    });
    expect(result.map(r => r.id)).toContain('empty');
    expect(result.map(r => r.id)).not.toContain('filled');
  });

  test('a canvas ROW drag is scoped to between-rows bands only', () => {
    const band = container('band', { kind: 'between-rows', index: 1 });
    const itemGap = container('itemGap', { kind: 'between-items', rowPath: 'row.0', index: 1 });
    const droppableRects = new Map([
      ['band', rect(0, 90, 800, 22)],
      ['itemGap', rect(395, 0, 12, 200)],
    ]);
    const result = workspaceCollisionDetection({
      active: { data: { current: { source: 'canvas', kind: 'row', rowPath: 'row.0' } } },
      droppableContainers: [band, itemGap],
      droppableRects,
      pointerCoordinates: { x: 400, y: 100 },
      collisionRect: rect(0, 95, 800, 10),
    });
    // Row drags resolve only to between-rows bands (closestCenter over the band
    // group), never to an item gap.
    expect(result[0].id).toBe('band');
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

  test('pivot field drag maps to a pivot-field preview with the field label (VIS-1008)', () => {
    const out = mapDragStartData({
      source: 'pivot-field',
      field: { name: 'revenue', label: 'Revenue', source: 's' },
    });
    expect(out).toEqual({ kind: 'pivot-field', name: 'Revenue' });
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

describe('routeWorkspaceDragEnd — pivot field branch (VIS-1008)', () => {
  test('pivot field drop on a pivot shelf invokes the shelf onDropField', () => {
    const onDropField = jest.fn();
    const emit = jest.fn();
    const field = { name: 'revenue', source: 'sales-insight', label: 'Revenue' };
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'pivot-field', field } } },
        over: { data: { current: { kind: 'pivot-field', shelf: 'values', onDropField } } },
      },
      { emit }
    );
    expect(result).toBe('pivot_field_accepted');
    expect(onDropField).toHaveBeenCalledWith(field);
    expect(emit).toHaveBeenCalledWith(
      'pivot_field_drop',
      expect.objectContaining({ shelf: 'values', field: 'revenue' })
    );
  });

  test('pivot field drop with no field is a noop (no onDropField call)', () => {
    const onDropField = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'pivot-field', field: null } } },
        over: { data: { current: { kind: 'pivot-field', shelf: 'rows', onDropField } } },
      },
      {}
    );
    expect(result).toBe('noop');
    expect(onDropField).not.toHaveBeenCalled();
  });

  test('a pivot field dropped on a non-pivot target is a noop', () => {
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'pivot-field', field: { name: 'x' } } } },
        over: { data: { current: { kind: 'ref-slot', allowedTypes: [] } } },
      },
      {}
    );
    expect(result).toBe('noop');
  });
});

describe('routeWorkspaceDragEnd — property-zone branch (Explore 2.0 Phase 3b, S5 §1/D10)', () => {
  test('a Library drag dropped on a property-zone invokes the ROW-OWNED onDropField with the full drag payload', () => {
    const onDropField = jest.fn();
    const emit = jest.fn();
    const dragData = { source: 'library', type: 'sourceColumn', name: 'amount', columnType: 'DOUBLE' };
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: dragData } },
        over: { data: { current: { kind: 'property-zone', path: 'x', schema: {}, onDropField } } },
      },
      { emit }
    );
    expect(result).toBe('property_zone_accepted');
    expect(onDropField).toHaveBeenCalledWith(dragData);
    expect(emit).toHaveBeenCalledWith(
      'property_zone_drop',
      expect.objectContaining({ path: 'x', type: 'sourceColumn', name: 'amount' })
    );
  });

  test('two stacked property-zone droppables each resolve to THEIR OWN onDropField — no global "active insight" indirection', () => {
    const onDropFieldA = jest.fn();
    const onDropFieldB = jest.fn();
    const dragData = { source: 'library', type: 'model', name: 'orders_q', property: 'region' };

    routeWorkspaceDragEnd(
      {
        active: { data: { current: dragData } },
        over: { data: { current: { kind: 'property-zone', path: 'x', onDropField: onDropFieldA } } },
      },
      {}
    );
    routeWorkspaceDragEnd(
      {
        active: { data: { current: dragData } },
        over: { data: { current: { kind: 'property-zone', path: 'y', onDropField: onDropFieldB } } },
      },
      {}
    );

    expect(onDropFieldA).toHaveBeenCalledTimes(1);
    expect(onDropFieldB).toHaveBeenCalledTimes(1);
  });

  test('a non-library drag on a property-zone is a noop', () => {
    const onDropField = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'canvas', kind: 'item' } } },
        over: { data: { current: { kind: 'property-zone', path: 'x', onDropField } } },
      },
      {}
    );
    expect(result).toBe('noop');
    expect(onDropField).not.toHaveBeenCalled();
  });

  test('a property-zone with no onDropField callback is a noop (never throws)', () => {
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'model', name: 'orders_q' } } },
        over: { data: { current: { kind: 'property-zone', path: 'x' } } },
      },
      {}
    );
    expect(result).toBe('noop');
  });
});

describe('routeWorkspaceDragEnd — relation ERD model-drop branch (VIS-1006b)', () => {
  test('a Library model dropped on the ERD canvas adds the model', () => {
    const onAddModel = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'model', name: 'orders' } } },
        over: { data: { current: { kind: 'erd-canvas', onAddModel } } },
      },
      { emit }
    );
    expect(result).toBe('erd_add_model');
    expect(onAddModel).toHaveBeenCalledWith('orders');
    expect(emit).toHaveBeenCalledWith(
      'relation_erd_add_model',
      expect.objectContaining({ name: 'orders', accepted: true })
    );
  });

  test('csvScriptModel + localMergeModel are accepted as models too', () => {
    const onAddModel = jest.fn();
    ['csvScriptModel', 'localMergeModel'].forEach(type => {
      onAddModel.mockClear();
      const result = routeWorkspaceDragEnd(
        {
          active: { data: { current: { source: 'library', type, name: `m_${type}` } } },
          over: { data: { current: { kind: 'erd-canvas', onAddModel } } },
        },
        {}
      );
      expect(result).toBe('erd_add_model');
      expect(onAddModel).toHaveBeenCalledWith(`m_${type}`);
    });
  });

  test('a non-model Library row dropped on the ERD is rejected (no add)', () => {
    const onAddModel = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'chart', name: 'c1' } } },
        over: { data: { current: { kind: 'erd-canvas', onAddModel } } },
      },
      {}
    );
    expect(result).toBe('erd_add_model_rejected');
    expect(onAddModel).not.toHaveBeenCalled();
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
    expect(emit).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'move_item', rowPath: 'row.0', from: 0 })
    );
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

  test('canvas item drag onto a DIFFERENT row MOVES the item between rows (VIS-973)', () => {
    const commitCanvasConfig = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: {
          data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.0', itemIndex: 0 } },
        },
        // Drop at the end of row 1 → item 'a' leaves row 0 and lands in row 1.
        over: overCanvas({ kind: 'end-of-row', rowPath: 'row.1' }),
      },
      { commitCanvasConfig, emit }
    );
    expect(result).toBe('canvas_move_item');
    expect(commitCanvasConfig).toHaveBeenCalledTimes(1);
    const [, nextConfig] = commitCanvasConfig.mock.calls[0];
    expect(nextConfig.rows[0].items.map(it => it.chart || it.table)).toEqual(['ref(b)']);
    expect(nextConfig.rows[1].items.map(it => it.chart || it.table)).toEqual(['ref(c)', 'ref(a)']);
    // The moved item keeps its own width (6), not the destination row's width.
    expect(nextConfig.rows[1].items[1].width).toBe(6);
    expect(emit).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'move_item', rowPath: 'row.0', toRowPath: 'row.1' })
    );
  });

  test('canvas item drag onto an EMPTY slot FILLS it (VIS-989)', () => {
    const commitCanvasConfig = jest.fn();
    const emit = jest.fn();
    // row 0: [chart a, EMPTY slot]; row 1: [chart c].
    const slotConfig = {
      rows: [
        { height: 'medium', items: [{ width: 6, chart: 'ref(a)' }, { width: 6 }] },
        { height: 'small', items: [{ width: 12, chart: 'ref(c)' }] },
      ],
    };
    const result = routeWorkspaceDragEnd(
      {
        active: {
          data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.1', itemIndex: 0 } },
        },
        over: {
          data: {
            current: {
              kind: 'canvas-drop',
              dashboardName: 'dash',
              config: slotConfig,
              // The empty slot's on-item zone carries `empty: true`.
              target: { kind: 'on-item', rowPath: 'row.0', index: 1, empty: true },
            },
          },
        },
      },
      { commitCanvasConfig, emit }
    );
    expect(result).toBe('canvas_fill_slot');
    const [, nextConfig] = commitCanvasConfig.mock.calls[0];
    // The empty slot is now chart c; the source row is left empty (valid as-is).
    expect(nextConfig.rows[0].items.map(it => it.chart)).toEqual(['ref(a)', 'ref(c)']);
    expect(nextConfig.rows[1].items).toEqual([]);
    expect(emit).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'fill_slot', toRowPath: 'row.0', toIndex: 1 })
    );
  });

  test('canvas item drag onto a FILLED slot (on-item, not empty) is a noop', () => {
    const commitCanvasConfig = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: {
          data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.1', itemIndex: 0 } },
        },
        // A populated slot's on-item zone has no `empty` flag → no fill, no overwrite.
        over: overCanvas({ kind: 'on-item', rowPath: 'row.0', index: 0 }),
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
    expect(emit).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'move_row', from: 1, to: 0 })
    );
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
      'canvas_action',
      expect.objectContaining({ kind: 'add_item', type: 'chart', name: 'new-chart' })
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
      'canvas_action',
      expect.objectContaining({ kind: 'move_row', containerPath: 'row.0.item.1' })
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

describe('mapDragStartData — level + unknown payloads', () => {
  test('level-header drag → level preview with the level title', () => {
    expect(mapDragStartData({ source: 'level', title: 'Tier 2', levelIndex: 1 })).toEqual({
      kind: 'level',
      name: 'Tier 2',
    });
    // Untitled level falls back to the generic label.
    expect(mapDragStartData({ source: 'level' })).toEqual({ kind: 'level', name: 'Level' });
  });

  test('an unrecognised payload maps to null (no overlay)', () => {
    expect(mapDragStartData({ source: 'mystery', name: 'x' })).toBeNull();
  });
});

describe('routeWorkspaceDragEnd — level reorder branch (VIS-901 #5)', () => {
  test('dropping a level header on another level group reorders the levels', () => {
    const moveLevel = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'level', levelIndex: 0 } } },
        over: { data: { current: { levelKey: 'level:2', levelIndex: 2 } } },
      },
      { moveLevel, emit }
    );
    expect(result).toBe('level_reorder');
    expect(moveLevel).toHaveBeenCalledWith(0, 2);
    expect(emit).toHaveBeenCalledWith(
      'project_editor_action',
      expect.objectContaining({ kind: 'level_reorder_dnd', from: 0, to: 2 })
    );
  });

  test('dropping a level on its own group (or a malformed index) is a noop', () => {
    const moveLevel = jest.fn();
    expect(
      routeWorkspaceDragEnd(
        {
          active: { data: { current: { source: 'level', levelIndex: 1 } } },
          over: { data: { current: { levelKey: 'level:1', levelIndex: 1 } } },
        },
        { moveLevel }
      )
    ).toBe('noop');
    expect(
      routeWorkspaceDragEnd(
        {
          active: { data: { current: { source: 'level', levelIndex: 1 } } },
          over: { data: { current: { levelKey: 'level:x' } } },
        },
        { moveLevel }
      )
    ).toBe('noop');
    expect(moveLevel).not.toHaveBeenCalled();
  });
});

// ── Provider drag lifecycle: a REAL pointer drag through the shared context ──
// dnd-kit's PointerSensor activates in jsdom when the native event carries
// `isPrimary` + button 0 (distance constraint 5 → one activating move).
const pointerEvent = (type, coords = {}) => {
  const evt = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: coords.clientX ?? 0,
    clientY: coords.clientY ?? 0,
    button: 0,
  });
  Object.defineProperty(evt, 'isPrimary', { value: true });
  Object.defineProperty(evt, 'pointerId', { value: 1 });
  return evt;
};

const TestDraggable = ({ id, data }) => {
  const { setNodeRef, listeners, attributes } = useDraggable({ id, data });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} data-testid={`test-drag-${id}`}>
      {id}
    </div>
  );
};

const startDrag = async id => {
  const el = screen.getByTestId(`test-drag-${id}`);
  await act(async () => {
    el.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }));
  });
  await act(async () => {
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 10 }));
  });
};

const dropDrag = async () => {
  await act(async () => {
    document.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 10 }));
  });
};

describe('WorkspaceDndContext drag overlay previews (VIS-901 #5 / VIS-1008)', () => {
  // Each dnd-kit drag arms a document-capture click-suppression listener that
  // the sensor only detaches on a REAL 50ms timeout (see AbstractPointerSensor
  // .detach). Wait it out so a later test's fireEvent.click is not swallowed.
  afterEach(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 60));
    });
  });

  const renderWith = drag => {
    render(
      <WorkspaceDndContext>
        <TestDraggable id="probe" data={drag} />
        <DragProbe />
      </WorkspaceDndContext>
    );
  };

  test('a pivot-field drag shows the pivot pill overlay and clears on drop', async () => {
    renderWith({ source: 'pivot-field', field: { name: 'revenue', label: 'Revenue' } });
    await startDrag('probe');

    expect(screen.getByTestId('pivot-field-drag-preview')).toHaveTextContent('Revenue');
    expect(screen.getByTestId('drag-probe')).toHaveTextContent('pivot-field');

    await dropDrag();
    expect(screen.queryByTestId('pivot-field-drag-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('drag-probe')).toHaveTextContent('null');
  });

  test('a canvas ROW drag shows the dedicated Row pill (never the chart pill)', async () => {
    renderWith({ source: 'canvas', kind: 'row', rowPath: 'row.1', label: 'Row 2' });
    await startDrag('probe');

    const pill = screen.getByTestId('canvas-row-drag-preview');
    expect(pill).toHaveTextContent('Row 2');
    await dropDrag();
    expect(screen.queryByTestId('canvas-row-drag-preview')).not.toBeInTheDocument();
  });

  test('a level-header drag shows the Level pill overlay', async () => {
    renderWith({ source: 'level', title: 'Org', levelIndex: 0 });
    await startDrag('probe');
    expect(screen.getByTestId('level-drag-preview')).toHaveTextContent('Org');
    await dropDrag();
  });

  test('a dashboard tile drag shows the tile preview and cancels on Escape', async () => {
    renderWith({ type: 'dashboard', name: 'd0', level: 'Organization' });
    await startDrag('probe');

    expect(screen.getByTestId('drag-probe')).toHaveTextContent('dashboard');
    // The tile preview renders the dashboard name inside the overlay (the
    // source node renders its id, so this text can only come from the overlay).
    expect(screen.getByText('d0')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    // The cancel kicks off the DragOverlay's async unmount animation — flush it
    // inside act so the state update is accounted for.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId('drag-probe')).toHaveTextContent('null');
  });
});

describe('WorkspaceDndContext commit path (D-3 / D-4, gated per VIS-993)', () => {
  // Warm the bundled project schema so the gate takes its SYNC path (matching
  // the production workspace after preload); the async-fallback test below
  // clears the cache explicitly.
  beforeAll(async () => {
    await preloadValidationSchema();
  });

  const CommitProbe = ({ name, config }) => {
    const commit = useWorkspaceCommit();
    return (
      <button
        type="button"
        data-testid="commit-probe"
        onClick={() => commit && commit(name, config)}
      >
        commit
      </button>
    );
  };

  const VALID_CONFIG = {
    name: 'dash',
    rows: [
      {
        height: 'medium',
        items: [{ width: 6, chart: '${ref(rev_chart)}' }, { width: 6 }], // eslint-disable-line no-template-curly-in-string
      },
    ],
  };

  test('useWorkspaceCommit optimistically applies, validates, then saves the SAME config', () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    const updateDashboardConfigOptimistic = jest.fn();
    useStore.setState({ saveDashboard, updateDashboardConfigOptimistic });

    render(
      <WorkspaceDndContext>
        <CommitProbe name="dash" config={VALID_CONFIG} />
      </WorkspaceDndContext>
    );
    fireEvent.click(screen.getByTestId('commit-probe'));

    expect(updateDashboardConfigOptimistic).toHaveBeenCalledTimes(1);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const [name, persisted] = saveDashboard.mock.calls[0];
    expect(name).toBe('dash');
    // VIS-993: canvas mutations are BORN valid — nothing sanitizes/repairs the
    // payload; optimistic + save receive the config byte-identical.
    expect(persisted).toBe(VALID_CONFIG);
    expect(updateDashboardConfigOptimistic.mock.calls[0][1]).toBe(VALID_CONFIG);
  });

  test('an INVALID config is optimistically applied but NEVER persisted (gate blocks)', () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    const updateDashboardConfigOptimistic = jest.fn();
    useStore.setState({ saveDashboard, updateDashboardConfigOptimistic });

    render(
      <WorkspaceDndContext>
        <CommitProbe
          name="dash"
          config={{
            rows: [
              {
                height: 'medium',
                // The legacy empty-string scaffold (schema-invalid + selector
                // extra-forbidden). Sanitize is retired: nothing repairs this —
                // the gate must hold persistence entirely.
                items: [{ width: 1, chart: '', table: '', markdown: '', input: '', selector: '' }],
              },
            ],
          }}
        />
      </WorkspaceDndContext>
    );
    fireEvent.click(screen.getByTestId('commit-probe'));

    // Bound surfaces stay live (useRecordSave contract)…
    expect(updateDashboardConfigOptimistic).toHaveBeenCalledTimes(1);
    // …but nothing invalid may POST.
    expect(saveDashboard).not.toHaveBeenCalled();
  });

  test('a TWO-LEAF item is blocked too (mutual exclusion is not in the JSON schema)', () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    useStore.setState({ saveDashboard, updateDashboardConfigOptimistic: jest.fn() });

    render(
      <WorkspaceDndContext>
        <CommitProbe
          name="dash"
          config={{
            rows: [
              {
                items: [{ width: 1, chart: '${ref(a)}', table: '${ref(b)}' }], // eslint-disable-line no-template-curly-in-string
              },
            ],
          }}
        />
      </WorkspaceDndContext>
    );
    fireEvent.click(screen.getByTestId('commit-probe'));
    expect(saveDashboard).not.toHaveBeenCalled();
  });

  test('async fallback: with no schema loaded a valid commit still persists after validation', async () => {
    clearValidationCache();
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    useStore.setState({ saveDashboard, updateDashboardConfigOptimistic: jest.fn() });

    render(
      <WorkspaceDndContext>
        <CommitProbe name="dash" config={VALID_CONFIG} />
      </WorkspaceDndContext>
    );
    fireEvent.click(screen.getByTestId('commit-probe'));

    // Generous timeout: the fallback compiles the full Dashboard $defs graph.
    await waitFor(() => expect(saveDashboard).toHaveBeenCalledTimes(1), { timeout: 8000 });
    expect(saveDashboard.mock.calls[0][1]).toBe(VALID_CONFIG);
    // Restore the warm cache for any following test.
    await preloadValidationSchema();
  }, 15000);

  test('the commit is a safe no-op without a dashboard name', () => {
    const saveDashboard = jest.fn();
    useStore.setState({ saveDashboard, updateDashboardConfigOptimistic: jest.fn() });
    render(
      <WorkspaceDndContext>
        <CommitProbe name={null} config={{ rows: [] }} />
      </WorkspaceDndContext>
    );
    fireEvent.click(screen.getByTestId('commit-probe'));
    expect(saveDashboard).not.toHaveBeenCalled();
  });

  test('WorkspaceCommitProvider supplies a committer without the dnd shell', () => {
    const committer = jest.fn();
    render(
      <WorkspaceCommitProvider value={committer}>
        <CommitProbe name="dash" config={{ rows: [] }} />
      </WorkspaceCommitProvider>
    );
    fireEvent.click(screen.getByTestId('commit-probe'));
    expect(committer).toHaveBeenCalledWith('dash', { rows: [] });
  });

  test('useCommitCanvasConfig outside any provider degrades to a no-op', () => {
    const OrphanProbe = () => {
      const commit = useCommitCanvasConfig();
      return (
        <button type="button" data-testid="orphan-probe" onClick={() => commit('dash', {})}>
          go
        </button>
      );
    };
    render(<OrphanProbe />);
    // Invoking the fallback never throws and touches nothing.
    expect(() => fireEvent.click(screen.getByTestId('orphan-probe'))).not.toThrow();
  });
});

// ── Explore 2.0 Phase 3a: canvas-insert guard (02-architecture.md §4) ───────
describe('routeWorkspaceDragEnd — canvas-insert type guard (Explore 2.0 Phase 3a)', () => {
  const overCanvasDrop = target => ({
    data: { current: { kind: 'canvas-drop', dashboardName: 'dash', config: { rows: [] }, target } },
  });

  // Library's exploration drag sources (source/metric/dimension/insight) are
  // NOT canvas items — without this guard, making them draggable (so they
  // can reach the exploration surface's new drop targets) would let a
  // dashboard-canvas drop build a bogus item shape.
  test.each(['source', 'sourceTable', 'sourceColumn', 'metric', 'dimension', 'insight'])(
    'library drag of type %s onto the canvas is rejected (no commit)',
    type => {
      const commitCanvasConfig = jest.fn();
      const result = routeWorkspaceDragEnd(
        {
          active: { data: { current: { source: 'library', type, name: 'x' } } },
          over: overCanvasDrop({ kind: 'between-rows', index: 0 }),
        },
        { commitCanvasConfig }
      );
      expect(result).toBe('noop');
      expect(commitCanvasConfig).not.toHaveBeenCalled();
    }
  );

  // Unchanged behavior for the types that WERE always canvas-insertable.
  test.each(['chart', 'table', 'markdown', 'input'])(
    'library drag of type %s onto the canvas still inserts (unchanged)',
    type => {
      const commitCanvasConfig = jest.fn();
      const result = routeWorkspaceDragEnd(
        {
          active: { data: { current: { source: 'library', type, name: 'x' } } },
          over: overCanvasDrop({ kind: 'between-rows', index: 0 }),
        },
        { commitCanvasConfig }
      );
      expect(result).toBe('canvas_library_insert');
      expect(commitCanvasConfig).toHaveBeenCalled();
    }
  );
});

// ── Explore 2.0 Phase 3a: exploration surface DnD (D9 / 02-architecture.md
// §4). `ExplorerDndContext.jsx`'s onDragEnd is deleted from the
// ExplorationWorkbench nesting; these zone kinds now route through this
// shared context via `routeExplorationDragEnd`, ported verbatim from that
// file's resolution logic (see its own still-passing test suite,
// `components/explorer/ExplorerDndContext.test.jsx`, for the standalone
// route's copy of this same logic). ────────────────────────────────────────
describe('routeExplorationDragEnd (Explore 2.0 Phase 3a)', () => {
  const baseDeps = () => ({
    activeModelName: 'preview_model',
    activeInsightName: 'ins_1',
    setInsightProp: jest.fn(),
    addComputedColumn: jest.fn(),
    setActiveModelSource: jest.fn(),
    updateInsightInteraction: jest.fn(),
    addExistingInsightToChart: jest.fn(),
    seedModelTabFromTable: jest.fn(),
  });

  test('returns noop when there is no drop target', () => {
    expect(routeExplorationDragEnd({ active: { data: { current: {} } }, over: null }, baseDeps())).toBe(
      'noop'
    );
  });

  describe('axis-zone / property-zone', () => {
    test('a plain column drop resolves against the active model (preview_model fallback)', () => {
      const deps = baseDeps();
      routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'col_a', type: 'column' } } },
          over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
        },
        deps
      );
      expect(deps.setInsightProp).toHaveBeenCalledWith(
        'ins_1',
        'x',
        '?{${ref(preview_model).col_a}}'
      );
    });

    test('a sourceColumn (D9 schema drill-down) resolves the same way a plain column does', () => {
      const deps = { ...baseDeps(), activeModelName: 'orders_q' };
      routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'region', type: 'sourceColumn', sourceName: 'warehouse' } } },
          over: { data: { current: { path: 'marker.color', type: 'property-zone' } } },
        },
        deps
      );
      expect(deps.setInsightProp).toHaveBeenCalledWith(
        'ins_1',
        'marker.color',
        '?{${ref(orders_q).region}}'
      );
    });

    test('a sourceTable drop is rejected — a whole table is not a scalar ref', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'orders', type: 'sourceTable', sourceName: 'warehouse' } } },
          over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
        },
        deps
      );
      expect(result).toBe('noop');
      expect(deps.setInsightProp).not.toHaveBeenCalled();
    });

    test('a model-scoped metric drop qualifies the ref with parentModel', () => {
      const deps = baseDeps();
      routeExplorationDragEnd(
        {
          active: {
            data: { current: { name: 'total_revenue', type: 'metric', parentModel: 'orders_model' } },
          },
          over: { data: { current: { fieldName: 'y', type: 'axis-zone' } } },
        },
        deps
      );
      expect(deps.setInsightProp).toHaveBeenCalledWith(
        'ins_1',
        'y',
        '?{${ref(orders_model).total_revenue}}'
      );
    });

    test('an unscoped metric drop is a bare ref (no parentModel)', () => {
      const deps = baseDeps();
      routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'composite_metric', type: 'metric' } } },
          over: { data: { current: { fieldName: 'y', type: 'axis-zone' } } },
        },
        deps
      );
      expect(deps.setInsightProp).toHaveBeenCalledWith('ins_1', 'y', '?{${ref(composite_metric)}}');
    });

    test('a multi-select input drop yields the .values accessor', () => {
      const deps = baseDeps();
      routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'region_filter', type: 'input', inputType: 'multi-select' } } },
          over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
        },
        deps
      );
      expect(deps.setInsightProp).toHaveBeenCalledWith(
        'ins_1',
        'x',
        '?{${ref(region_filter).values}}'
      );
    });

    test('a single-select input drop yields the .value accessor', () => {
      const deps = baseDeps();
      routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'region_filter', type: 'input', inputType: 'single-select' } } },
          over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
        },
        deps
      );
      expect(deps.setInsightProp).toHaveBeenCalledWith('ins_1', 'x', '?{${ref(region_filter).value}}');
    });

    test('inserts at cursor instead of replacing the whole value when the drop target has an active cursor', () => {
      const listener = jest.fn();
      render(
        <div data-testid="droppable-property-x">
          <span
            data-has-cursor="true"
            ref={el => el && el.addEventListener('ref-insert-at-cursor', listener)}
          />
        </div>
      );

      const deps = baseDeps();
      routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'col_a', type: 'column' } } },
          over: { data: { current: { fieldName: 'x', type: 'axis-zone' } } },
        },
        deps
      );

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].detail.refExpr).toBe('${ref(preview_model).col_a}');
      expect(deps.setInsightProp).not.toHaveBeenCalled();
    });
  });

  describe('data-table-drop (computed column)', () => {
    test('a metric drop adds a computed column with its expression', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'churn_rate', type: 'metric', expression: 'sum(x)/count(x)' } } },
          over: { data: { current: { type: 'data-table-drop' } } },
        },
        deps
      );
      expect(result).toBe('exploration_computed_column_drop');
      expect(deps.addComputedColumn).toHaveBeenCalledWith({
        name: 'churn_rate',
        expression: 'sum(x)/count(x)',
        type: 'metric',
      });
    });

    test('a non metric/dimension drop is a noop', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'orders', type: 'sourceTable' } } },
          over: { data: { current: { type: 'data-table-drop' } } },
        },
        deps
      );
      expect(result).toBe('noop');
      expect(deps.addComputedColumn).not.toHaveBeenCalled();
    });
  });

  describe('interaction-zone', () => {
    test('sets the interaction value from a dropped field', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'region', type: 'dimension', parentModel: 'orders_q' } } },
          over: { data: { current: { type: 'interaction-zone', insightName: 'ins_1', index: 0 } } },
        },
        deps
      );
      expect(result).toBe('exploration_interaction_drop');
      expect(deps.updateInsightInteraction).toHaveBeenCalledWith('ins_1', 0, {
        value: '?{${ref(orders_q).region}}',
      });
    });

    test('a sourceTable drop is rejected', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'orders', type: 'sourceTable' } } },
          over: { data: { current: { type: 'interaction-zone', insightName: 'ins_1', index: 0 } } },
        },
        deps
      );
      expect(result).toBe('noop');
      expect(deps.updateInsightInteraction).not.toHaveBeenCalled();
    });

    test('missing insightName is a noop', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'region', type: 'dimension' } } },
          over: { data: { current: { type: 'interaction-zone', index: 0 } } },
        },
        deps
      );
      expect(result).toBe('noop');
    });
  });

  describe('source-zone', () => {
    test('a source drop sets the active model source', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'warehouse', type: 'source' } } },
          over: { data: { current: { type: 'source-zone' } } },
        },
        deps
      );
      expect(result).toBe('exploration_source_drop');
      expect(deps.setActiveModelSource).toHaveBeenCalledWith('warehouse');
    });

    test('a non-source drop is a noop', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'x', type: 'metric' } } },
          over: { data: { current: { type: 'source-zone' } } },
        },
        deps
      );
      expect(result).toBe('noop');
      expect(deps.setActiveModelSource).not.toHaveBeenCalled();
    });
  });

  describe('insight-zone', () => {
    test('an insight drop adds it to the chart', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'churn_by_cohort', type: 'insight' } } },
          over: { data: { current: { type: 'insight-zone' } } },
        },
        deps
      );
      expect(result).toBe('exploration_insight_drop');
      expect(deps.addExistingInsightToChart).toHaveBeenCalledWith('churn_by_cohort');
    });

    test('a non-insight drop is a noop', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'x', type: 'model' } } },
          over: { data: { current: { type: 'insight-zone' } } },
        },
        deps
      );
      expect(result).toBe('noop');
      expect(deps.addExistingInsightToChart).not.toHaveBeenCalled();
    });
  });

  // ── sql-editor-drop (D9, new) ──────────────────────────────────────────
  describe('sql-editor-drop', () => {
    test('a sourceTable drop seeds a new query chip bound to that table + source', () => {
      const deps = baseDeps();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'orders', type: 'sourceTable', sourceName: 'warehouse' } } },
          over: { data: { current: { type: 'sql-editor-drop' } } },
        },
        deps
      );
      expect(result).toBe('exploration_seed_query_from_table');
      expect(deps.seedModelTabFromTable).toHaveBeenCalledWith({
        tableName: 'orders',
        sourceName: 'warehouse',
      });
    });

    test('a sourceColumn drop inserts the bare column name via the droppable-supplied callback', () => {
      const deps = baseDeps();
      const onInsertText = jest.fn();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'region', type: 'sourceColumn' } } },
          over: { data: { current: { type: 'sql-editor-drop', onInsertText } } },
        },
        deps
      );
      expect(result).toBe('exploration_sql_cursor_insert');
      expect(onInsertText).toHaveBeenCalledWith('region');
    });

    test('a plain results-grid column drop also inserts (generalizes DraggableColumnHeader)', () => {
      const deps = baseDeps();
      const onInsertText = jest.fn();
      routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'amount', type: 'column' } } },
          over: { data: { current: { type: 'sql-editor-drop', onInsertText } } },
        },
        deps
      );
      expect(onInsertText).toHaveBeenCalledWith('amount');
    });

    test('an unrecognized type is a noop', () => {
      const deps = baseDeps();
      const onInsertText = jest.fn();
      const result = routeExplorationDragEnd(
        {
          active: { data: { current: { name: 'x', type: 'model' } } },
          over: { data: { current: { type: 'sql-editor-drop', onInsertText } } },
        },
        deps
      );
      expect(result).toBe('noop');
      expect(onInsertText).not.toHaveBeenCalled();
    });
  });

  test('routeWorkspaceDragEnd dispatches exploration zone kinds through routeExplorationDragEnd', () => {
    const setActiveModelSource = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { name: 'warehouse', type: 'source' } } },
        over: { data: { current: { type: 'source-zone' } } },
      },
      { exploration: { setActiveModelSource } }
    );
    expect(result).toBe('exploration_source_drop');
    expect(setActiveModelSource).toHaveBeenCalledWith('warehouse');
  });
});
