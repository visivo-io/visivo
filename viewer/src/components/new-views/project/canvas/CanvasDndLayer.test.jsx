/**
 * CanvasDndLayer tests (VIS-771 / Track D D-3).
 *
 * The layer measures the live Dashboard DOM via `data-canvas-path` markers and
 * paints a drag handle over every row/item + drop zones in the gaps. dnd-kit's
 * `useDraggable`/`useDroppable` are mocked (no DndContext / real pointer drag in
 * jsdom) so this stays a focused geometry/wiring test — the live drag is
 * exercised by the Playwright story. We render a fake Dashboard carrying the
 * same composite paths the real renderer emits, give the nodes measurable boxes
 * via a mocked getBoundingClientRect, and assert the handles + zones land.
 */
import React, { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import CanvasDndLayer from './CanvasDndLayer';
import useStore from '../../../../stores/store';

jest.mock('@dnd-kit/core', () => ({
  useDraggable: ({ id }) => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    isDragging: false,
    node: { current: null },
    transform: null,
    __id: id,
  }),
  useDroppable: ({ id }) => ({
    setNodeRef: () => {},
    isOver: false,
    active: null,
    __id: id,
  }),
}));

const DASHBOARD = {
  name: 'dash',
  config: {
    rows: [
      { height: 'medium', items: [{ width: 6, chart: 'ref(a)' }, { width: 6, table: 'ref(b)' }] },
      { height: 'small', items: [{ width: 12, chart: 'ref(c)' }] },
    ],
  },
};

// A test host that renders fake Dashboard nodes (carrying data-canvas-path) +
// the layer, sharing one positioned root ref — exactly ProjectCanvas's shape.
const Host = () => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div data-canvas-path="row.0" data-testid="r0">
        <div data-canvas-path="row.0.item.0" data-testid="r0i0" />
        <div data-canvas-path="row.0.item.1" data-testid="r0i1" />
      </div>
      <div data-canvas-path="row.1" data-testid="r1">
        <div data-canvas-path="row.1.item.0" data-testid="r1i0" />
      </div>
      <CanvasDndLayer rootRef={rootRef} dashboardName="dash" />
    </div>
  );
};

// Assign deterministic boxes so measure() produces non-null geometry.
const BOXES = {
  r0: { top: 0, left: 0, width: 800, height: 200, bottom: 200, right: 800 },
  r0i0: { top: 0, left: 0, width: 400, height: 200, bottom: 200, right: 400 },
  r0i1: { top: 0, left: 410, width: 390, height: 200, bottom: 200, right: 800 },
  r1: { top: 210, left: 0, width: 800, height: 150, bottom: 360, right: 800 },
  r1i0: { top: 210, left: 0, width: 800, height: 150, bottom: 360, right: 800 },
  root: { top: 0, left: 0, width: 800, height: 360, bottom: 360, right: 800 },
};

beforeEach(() => {
  // Reset selection/hover to a neutral default (handles are gated on these).
  useStore.setState({
    dashboards: [DASHBOARD],
    workspaceOutlineSelectedKey: 'dashboard',
    workspaceCanvasHoverKey: null,
  });
  // Mock getBoundingClientRect off the element's data-testid.
  Element.prototype.getBoundingClientRect = function () {
    const tid = this.getAttribute && this.getAttribute('data-testid');
    if (tid && BOXES[tid]) return BOXES[tid];
    // The positioned root has no testid here — give it the root box.
    return BOXES.root;
  };
});

const reveal = ({ hover = null, selected = 'dashboard' } = {}) =>
  useStore.setState({ workspaceCanvasHoverKey: hover, workspaceOutlineSelectedKey: selected });

describe('CanvasDndLayer (VIS-771)', () => {
  test('drag handles are hidden at rest (no hover, dashboard selected)', () => {
    reveal();
    render(<Host />);
    expect(screen.getByTestId('canvas-dnd-layer')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-drag-handle-row.0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-drag-handle-row.0.item.0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-drag-handle-row.1.item.0')).not.toBeInTheDocument();
  });

  test('selecting a row reveals only that row handle (tagged row)', () => {
    reveal({ selected: 'row.1' });
    render(<Host />);
    expect(screen.getByTestId('canvas-drag-handle-row.1')).toHaveAttribute(
      'data-canvas-handle-kind',
      'row'
    );
    expect(screen.queryByTestId('canvas-drag-handle-row.0')).not.toBeInTheDocument();
  });

  test('selecting an item reveals the item handle AND its parent row handle', () => {
    reveal({ selected: 'row.0.item.1' });
    render(<Host />);
    expect(screen.getByTestId('canvas-drag-handle-row.0.item.1')).toHaveAttribute(
      'data-canvas-handle-kind',
      'item'
    );
    // The parent row's grip is revealed too, so row-drag stays reachable.
    expect(screen.getByTestId('canvas-drag-handle-row.0')).toHaveAttribute(
      'data-canvas-handle-kind',
      'row'
    );
    // A sibling item's grip stays hidden.
    expect(screen.queryByTestId('canvas-drag-handle-row.0.item.0')).not.toBeInTheDocument();
  });

  test('hovering an item reveals the item + its parent row handle', () => {
    reveal({ hover: 'row.0.item.0' });
    render(<Host />);
    expect(screen.getByTestId('canvas-drag-handle-row.0.item.0')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-drag-handle-row.0')).toBeInTheDocument();
  });

  test('renders between-items, end-of-row and between-rows drop zones', () => {
    render(<Host />);
    // between-items: a zone before each item.
    expect(screen.getByTestId('canvas-dropzone-row.0-before-0')).toHaveAttribute(
      'data-intent',
      'between-items'
    );
    expect(screen.getByTestId('canvas-dropzone-row.0-before-1')).toBeInTheDocument();
    // end-of-row: one per row.
    expect(screen.getByTestId('canvas-dropzone-row.0-end')).toHaveAttribute(
      'data-intent',
      'end-of-row'
    );
    expect(screen.getByTestId('canvas-dropzone-row.1-end')).toBeInTheDocument();
    // between-rows: one before each row + one after the last (append).
    expect(screen.getByTestId('canvas-dropzone-row-before-0')).toHaveAttribute(
      'data-intent',
      'between-rows'
    );
    expect(screen.getByTestId('canvas-dropzone-row-before-1')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-dropzone-row-before-2')).toBeInTheDocument();
  });

  test('renders nothing when the dashboard is not found', () => {
    useStore.setState({ dashboards: [] });
    render(<Host />);
    expect(screen.queryByTestId('canvas-dnd-layer')).not.toBeInTheDocument();
  });

  test('mounts an in-container zone over a container item', () => {
    useStore.setState({
      dashboards: [
        {
          name: 'dash',
          config: {
            rows: [{ items: [{ width: 12, rows: [{ items: [{ chart: 'ref(x)' }] }] }] }],
          },
        },
      ],
    });
    // The container item needs a measurable box.
    const ContainerHost = () => {
      const rootRef = useRef(null);
      return (
        <div ref={rootRef} style={{ position: 'relative' }}>
          <div data-canvas-path="row.0" data-testid="r0">
            <div data-canvas-path="row.0.item.0" data-testid="r0i0" />
          </div>
          <CanvasDndLayer rootRef={rootRef} dashboardName="dash" />
        </div>
      );
    };
    render(<ContainerHost />);
    expect(screen.getByTestId('canvas-dropzone-row.0.item.0-container')).toHaveAttribute(
      'data-intent',
      'in-container'
    );
  });

  // ── Nested recursion (VIS-903) ─────────────────────────────────────────────
  describe('nested rows/items (VIS-903)', () => {
    const NESTED_BOXES = {
      r0: { top: 0, left: 0, width: 800, height: 400, bottom: 400, right: 800 },
      r0i0: { top: 0, left: 0, width: 400, height: 400, bottom: 400, right: 400 },
      r0i1: { top: 0, left: 410, width: 390, height: 400, bottom: 400, right: 800 },
      // Sub-rows inside the container item r0i1.
      n0: { top: 0, left: 410, width: 390, height: 130, bottom: 130, right: 800 },
      n0i0: { top: 0, left: 410, width: 190, height: 130, bottom: 130, right: 600 },
      n0i1: { top: 0, left: 610, width: 190, height: 130, bottom: 130, right: 800 },
      n1: { top: 140, left: 410, width: 390, height: 130, bottom: 270, right: 800 },
      n1i0: { top: 140, left: 410, width: 390, height: 130, bottom: 270, right: 800 },
      root: { top: 0, left: 0, width: 800, height: 400, bottom: 400, right: 800 },
    };

    const NestedHost = () => {
      const rootRef = useRef(null);
      return (
        <div ref={rootRef} style={{ position: 'relative' }}>
          <div data-canvas-path="row.0" data-testid="r0">
            <div data-canvas-path="row.0.item.0" data-testid="r0i0" />
            <div data-canvas-path="row.0.item.1" data-testid="r0i1">
              <div data-canvas-path="row.0.item.1.row.0" data-testid="n0">
                <div data-canvas-path="row.0.item.1.row.0.item.0" data-testid="n0i0" />
                <div data-canvas-path="row.0.item.1.row.0.item.1" data-testid="n0i1" />
              </div>
              <div data-canvas-path="row.0.item.1.row.1" data-testid="n1">
                <div data-canvas-path="row.0.item.1.row.1.item.0" data-testid="n1i0" />
              </div>
            </div>
          </div>
          <CanvasDndLayer rootRef={rootRef} dashboardName="dash" />
        </div>
      );
    };

    beforeEach(() => {
      useStore.setState({
        dashboards: [
          {
            name: 'dash',
            config: {
              rows: [
                {
                  items: [
                    { width: 2, chart: 'ref(top0)' },
                    {
                      width: 1,
                      rows: [
                        { items: [{ width: 6, chart: 'ref(n0a)' }, { width: 6, table: 'ref(n0b)' }] },
                        { items: [{ width: 12, markdown: 'ref(n1a)' }] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      });
      Element.prototype.getBoundingClientRect = function () {
        const tid = this.getAttribute && this.getAttribute('data-testid');
        if (tid && NESTED_BOXES[tid]) return NESTED_BOXES[tid];
        return NESTED_BOXES.root;
      };
    });

    test('emits drag grips for NESTED rows and items', () => {
      reveal({ hover: 'row.0.item.1.row.0.item.0' });
      render(<NestedHost />);
      // The nested item's grip is revealed on hover.
      expect(
        screen.getByTestId('canvas-drag-handle-row.0.item.1.row.0.item.0')
      ).toHaveAttribute('data-canvas-handle-kind', 'item');
      // Its nested parent row's grip is revealed too (keyWithinRow).
      expect(screen.getByTestId('canvas-drag-handle-row.0.item.1.row.0')).toHaveAttribute(
        'data-canvas-handle-kind',
        'row'
      );
    });

    test('nested item drag grip carries its nested rowPath + item index', () => {
      reveal({ selected: 'row.0.item.1.row.0.item.1' });
      render(<NestedHost />);
      // Selecting the nested item reveals its grip.
      expect(
        screen.getByTestId('canvas-drag-handle-row.0.item.1.row.0.item.1')
      ).toBeInTheDocument();
    });

    test('emits between-items + end-of-row drop zones for nested rows', () => {
      render(<NestedHost />);
      expect(
        screen.getByTestId('canvas-dropzone-row.0.item.1.row.0-before-1')
      ).toHaveAttribute('data-intent', 'between-items');
      expect(
        screen.getByTestId('canvas-dropzone-row.0.item.1.row.0-end')
      ).toHaveAttribute('data-intent', 'end-of-row');
    });

    test('emits container-scoped between-rows bands for the nested sibling group', () => {
      render(<NestedHost />);
      // A nested between-rows band is prefixed with the container item path so it
      // doesn't collide with the top-level bands.
      expect(
        screen.getByTestId('canvas-dropzone-row.0.item.1.row-before-0')
      ).toHaveAttribute('data-intent', 'between-rows');
      // …and the trailing append band for the nested sibling group.
      expect(
        screen.getByTestId('canvas-dropzone-row.0.item.1.row-before-2')
      ).toBeInTheDocument();
    });

    test('still emits the in-container zone on the container item itself', () => {
      render(<NestedHost />);
      expect(
        screen.getByTestId('canvas-dropzone-row.0.item.1-container')
      ).toHaveAttribute('data-intent', 'in-container');
    });
  });
});
