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
  useStore.setState({ dashboards: [DASHBOARD] });
  // Mock getBoundingClientRect off the element's data-testid.
  Element.prototype.getBoundingClientRect = function () {
    const tid = this.getAttribute && this.getAttribute('data-testid');
    if (tid && BOXES[tid]) return BOXES[tid];
    // The positioned root has no testid here — give it the root box.
    return BOXES.root;
  };
});

describe('CanvasDndLayer (VIS-771)', () => {
  test('renders a drag handle over each row and item', () => {
    render(<Host />);
    expect(screen.getByTestId('canvas-dnd-layer')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-drag-handle-row.0')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-drag-handle-row.1')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-drag-handle-row.0.item.0')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-drag-handle-row.0.item.1')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-drag-handle-row.1.item.0')).toBeInTheDocument();
  });

  test('row handles are tagged row, item handles tagged item', () => {
    render(<Host />);
    expect(screen.getByTestId('canvas-drag-handle-row.0')).toHaveAttribute(
      'data-canvas-handle-kind',
      'row'
    );
    expect(screen.getByTestId('canvas-drag-handle-row.0.item.0')).toHaveAttribute(
      'data-canvas-handle-kind',
      'item'
    );
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
});
