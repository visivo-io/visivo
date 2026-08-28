/**
 * CanvasResizeLayer tests (VIS-777 / Track D D-4).
 *
 * The layer measures the live Dashboard DOM via `data-canvas-path` markers and
 * paints resize handles on the CURRENTLY SELECTED node, then turns a raw pointer
 * drag into a config mutation committed through the shared `commitCanvasConfig`.
 * We mock the commit hook (the WorkspaceDndContext provider isn't mounted here)
 * and the telemetry emitter, give the canvas-path nodes measurable boxes via a
 * mocked getBoundingClientRect, and drive synthetic pointer events. The full
 * live gesture is exercised by the Playwright story.
 *
 * Mock spies are `mock`-prefixed so jest's `jest.mock` hoist allows the factory
 * to reference them.
 */
import React, { useRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import CanvasResizeLayer from './CanvasResizeLayer';
import useStore from '../../../../stores/store';
import { itemSlotWidthPx, rowGridTotal } from './canvasGridGeometry';

// jsdom's PointerEvent drops clientX/clientY from its init dict, so the
// component's window-level pointermove/up handlers would see `undefined`
// coordinates. The gesture is coordinate-driven, so we dispatch a MouseEvent
// (which jsdom DOES populate clientX/clientY on) under the pointer* type name —
// the handler only reads clientX/clientY/shiftKey, all carried by MouseEvent.
const makeEvt = (type, { clientX, clientY, shiftKey = false }) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, shiftKey });

const firePointer = (type, coords) => {
  act(() => {
    window.dispatchEvent(makeEvt(type, coords));
  });
};

// Pointer-DOWN goes to a React onPointerDown handler; dispatch on the element so
// React's root delegation catches it with real clientX (the synthetic event
// mirrors the native MouseEvent's coords, which jsdom populates).
const firePointerDown = (el, coords) => {
  act(() => {
    el.dispatchEvent(makeEvt('pointerdown', coords));
  });
};

const mockCommit = jest.fn();
jest.mock('../../workspace/WorkspaceDndContext', () => ({
  useCommitCanvasConfig: () => mockCommit,
}));

const mockEmit = jest.fn();
jest.mock('../../workspace/telemetry', () => ({
  emitWorkspaceEvent: (...args) => mockEmit(...args),
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
      <CanvasResizeLayer rootRef={rootRef} dashboardName="dash" />
    </div>
  );
};

// row.0 is 800px wide with two 6/6 items → 400px each, per-column = 800/12 ≈ 66.7px.
const BOXES = {
  r0: { top: 0, left: 0, width: 800, height: 200, bottom: 200, right: 800 },
  r0i0: { top: 0, left: 0, width: 400, height: 200, bottom: 200, right: 400 },
  r0i1: { top: 0, left: 410, width: 390, height: 200, bottom: 200, right: 800 },
  r1: { top: 210, left: 0, width: 800, height: 150, bottom: 360, right: 800 },
  r1i0: { top: 210, left: 0, width: 800, height: 150, bottom: 360, right: 800 },
  n0: { top: 20, left: 10, width: 780, height: 160, bottom: 180, right: 790 },
  n0i0: { top: 20, left: 10, width: 780, height: 160, bottom: 180, right: 790 },
  root: { top: 0, left: 0, width: 800, height: 360, bottom: 360, right: 800 },
};

beforeEach(() => {
  mockCommit.mockClear();
  mockEmit.mockClear();
  useStore.setState({ dashboards: [DASHBOARD], workspaceOutlineSelectedKey: 'dashboard' });
  Element.prototype.getBoundingClientRect = function () {
    const tid = this.getAttribute && this.getAttribute('data-testid');
    if (tid && BOXES[tid]) return BOXES[tid];
    return BOXES.root;
  };
  // jsdom lacks pointer capture; stub so the gesture's best-effort call is safe.
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
});

describe('CanvasResizeLayer (VIS-777)', () => {
  test('renders nothing when the dashboard chrome is selected', () => {
    render(<Host />);
    expect(screen.queryByTestId('canvas-resize-layer')).not.toBeInTheDocument();
  });

  test('paints a width handle on a selected item', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    expect(handle).toHaveAttribute('data-resize-axis', 'width');
    expect(handle).toHaveAttribute('aria-label', 'Resize item width');
  });

  test('VIS-986: an item selection ALSO gets a row-height handle spanning its parent row', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<Host />);
    // The height handle is reachable from the item the user clicked (height is
    // otherwise a hard-to-reach row-only affordance).
    const height = screen.getByTestId('canvas-resize-height-row.0.item.0');
    expect(height).toHaveAttribute('data-resize-axis', 'height');
    expect(height).toHaveAttribute('aria-label', 'Resize row height');
    // Anchored on the PARENT ROW box (width 800) — full-row span, not the item's
    // 400px box: width = row 800 − 12px inset = 788px, at the row's bottom edge
    // (top = rowBottom 200 − 5px so the 10px-tall hit zone straddles the edge).
    expect(height.style.width).toBe('788px');
    expect(height.style.top).toBe('195px');
  });

  test('paints a LEFT-edge width handle on an item that has a left neighbour', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.1' });
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-width-left-row.0.item.1');
    expect(handle).toHaveAttribute('data-resize-axis', 'width-left');
    expect(handle).toHaveAttribute('aria-label', 'Resize item width from left edge');
  });

  test('omits the LEFT-edge width handle on the FIRST item in a row', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<Host />);
    // Right-edge handle present, left-edge handle absent (no shared boundary).
    expect(screen.getByTestId('canvas-resize-width-row.0.item.0')).toBeInTheDocument();
    expect(
      screen.queryByTestId('canvas-resize-width-left-row.0.item.0')
    ).not.toBeInTheDocument();
  });

  test('dragging the LEFT edge left grows the item and shrinks the left neighbour', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.1' });
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-width-left-row.0.item.1');

    // Down on the left handle, move -135px left (~2 cols at 66.7px/col), release.
    firePointerDown(handle, { clientX: 410, clientY: 100, pointerId: 1 });
    expect(screen.getByTestId('canvas-resize-ghost')).toBeInTheDocument();
    firePointer('pointermove', { clientX: 410 - 135, clientY: 100 });
    expect(screen.getByTestId('canvas-resize-readout').textContent).toContain('8 / 12');
    firePointer('pointerup', { clientX: 410 - 135, clientY: 100 });

    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [name, nextConfig] = mockCommit.mock.calls[0];
    expect(name).toBe('dash');
    // Item 1 gains 2 cols, neighbour (item 0) loses 2 — row total stays 12.
    expect(nextConfig.rows[0].items[1].width).toBe(8);
    expect(nextConfig.rows[0].items[0].width).toBe(4);
    expect(mockEmit).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'resize_item', axis: 'width-left' })
    );
  });

  test('paints a height handle on a selected row', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0' });
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-height-row.0');
    expect(handle).toHaveAttribute('data-resize-axis', 'height');
  });

  test('paints a corner handle on a selected container item', () => {
    useStore.setState({
      dashboards: [
        {
          name: 'dash',
          config: {
            rows: [{ items: [{ width: 12, rows: [{ items: [{ chart: 'ref(x)' }] }] }] }],
          },
        },
      ],
      workspaceOutlineSelectedKey: 'row.0.item.0',
    });
    const ContainerHost = () => {
      const rootRef = useRef(null);
      return (
        <div ref={rootRef} style={{ position: 'relative' }}>
          <div data-canvas-path="row.0" data-testid="r0">
            <div data-canvas-path="row.0.item.0" data-testid="r0i0" />
          </div>
          <CanvasResizeLayer rootRef={rootRef} dashboardName="dash" />
        </div>
      );
    };
    render(<ContainerHost />);
    expect(screen.getByTestId('canvas-resize-corner-row.0.item.0')).toHaveAttribute(
      'data-resize-axis',
      'corner'
    );
  });

  test('dragging the width handle right commits an increased col-span', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');

    // Item 0 is 6/12 of the 800px row → a 400px slot. Widening it to 8 makes the
    // row 8 + 6 = 14 wide, so the slot renders at 8/14 · 800 = 457.1px: a 57px
    // drag right. (The pre-M26 layer read the row as a fixed 12 columns and made
    // this a 2 × 66.7px = 135px drag, which actually lands on width 12.)
    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 1 });
    // A ghost + readout appear during the drag.
    expect(screen.getByTestId('canvas-resize-ghost')).toBeInTheDocument();
    firePointer('pointermove', { clientX: 397 + 57, clientY: 100 });
    // HONEST READOUT: the denominator is the row total this drag rebalances to
    // (14), never the hardcoded 12.
    expect(screen.getByTestId('canvas-resize-readout').textContent).toContain('8 / 14');
    firePointer('pointerup', { clientX: 397 + 57, clientY: 100 });

    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [name, nextConfig, meta] = mockCommit.mock.calls[0];
    expect(name).toBe('dash');
    expect(nextConfig.rows[0].items[0].width).toBe(8);
    expect(meta).toMatchObject({ kind: 'resize_item' });
    // canvas_action telemetry fired with kind + fluid.
    expect(mockEmit).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'resize_item', fluid: false })
    );
  });

  test('dragging the row height handle down commits a taller HeightEnum (tick mode)', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0' });
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-height-row.0');

    // medium = 396px start; +120px → ~516px → nearest stop "large" (512px).
    firePointerDown(handle, { clientX: 400, clientY: 195, pointerId: 1 });
    firePointer("pointermove", { clientX: 400, clientY: 195 + 120 });
    firePointer("pointerup", { clientX: 400, clientY: 195 + 120 });

    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [, nextConfig] = mockCommit.mock.calls[0];
    expect(nextConfig.rows[0].height).toBe('large');
  });

  test('VIS-986: dragging the item-anchored height handle commits the PARENT ROW height', () => {
    // The user has an ITEM selected (the common case — a canvas click selects a
    // slot, not the row), yet dragging the height handle resizes that item's
    // ROW, snapping through the HeightEnum stops.
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-height-row.0.item.0');

    // row.0 is "medium" (396px) start; +120px → ~516px → nearest stop "large".
    firePointerDown(handle, { clientX: 400, clientY: 197, pointerId: 1 });
    firePointer('pointermove', { clientX: 400, clientY: 197 + 120 });
    firePointer('pointerup', { clientX: 400, clientY: 197 + 120 });

    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [name, nextConfig] = mockCommit.mock.calls[0];
    expect(name).toBe('dash');
    // The PARENT row's height changed — not the item, not a sibling row.
    expect(nextConfig.rows[0].height).toBe('large');
    expect(nextConfig.rows[1].height).toBe('small');
  });

  test('Shift held during a height drag writes a numeric pixel int (fluid mode)', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0' });
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-height-row.0');

    firePointerDown(handle, { clientX: 400, clientY: 195, pointerId: 1, shiftKey: true });
    firePointer("pointermove", { clientX: 400, clientY: 195 - 39, shiftKey: true });
    firePointer("pointerup", { clientX: 400, clientY: 195 - 39, shiftKey: true });

    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [, nextConfig] = mockCommit.mock.calls[0];
    // 396 - 39 = 357 px, written as an int (Row.height accepts Union[enum, int]).
    expect(nextConfig.rows[0].height).toBe(357);
    expect(mockEmit).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'resize_item', fluid: true })
    );
  });

  test('Shift-fluid height drag on a NESTED sub-row snaps to an enum, never a px int', () => {
    useStore.setState({
      dashboards: [
        {
          name: 'dash',
          config: {
            rows: [
              {
                height: 'medium',
                items: [
                  {
                    width: 12,
                    rows: [{ height: 'small', items: [{ width: 1, chart: 'ref(x)' }] }],
                  },
                ],
              },
            ],
          },
        },
      ],
      workspaceOutlineSelectedKey: 'row.0.item.0.row.0.item.0',
    });
    const NestedHost = () => {
      const rootRef = useRef(null);
      return (
        <div ref={rootRef} style={{ position: 'relative' }}>
          <div data-canvas-path="row.0" data-testid="r0">
            <div data-canvas-path="row.0.item.0" data-testid="r0i0">
              <div data-canvas-path="row.0.item.0.row.0" data-testid="n0">
                <div data-canvas-path="row.0.item.0.row.0.item.0" data-testid="n0i0" />
              </div>
            </div>
          </div>
          <CanvasResizeLayer rootRef={rootRef} dashboardName="dash" />
        </div>
      );
    };
    render(<NestedHost />);
    const handle = screen.getByTestId('canvas-resize-height-row.0.item.0.row.0.item.0');

    // Sub-row is "small" (256px); Shift-drag +150px → 406px → nearest stop
    // "medium". A nested sub-row's height is a relative WEIGHT — the renderer
    // maps any px int to the max weight — so the fluid int must never commit here.
    firePointerDown(handle, { clientX: 400, clientY: 175, pointerId: 1, shiftKey: true });
    firePointer('pointermove', { clientX: 400, clientY: 175 + 150, shiftKey: true });
    firePointer('pointerup', { clientX: 400, clientY: 175 + 150, shiftKey: true });

    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [, nextConfig] = mockCommit.mock.calls[0];
    expect(nextConfig.rows[0].items[0].rows[0].height).toBe('medium');
    // The top-level row is untouched — only the nested sub-row changed.
    expect(nextConfig.rows[0].height).toBe('medium');
  });

  test('a drag with no net change does not commit (no-op)', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 1 });
    firePointer("pointermove", { clientX: 400, clientY: 100 }); // <1 col
    firePointer("pointerup", { clientX: 400, clientY: 100 });
    expect(mockCommit).not.toHaveBeenCalled();
  });
});

// ── M26 / W7: the ghost tells the truth ──────────────────────────────────────
//
// `Item.width` is a RELATIVE weight; <Dashboard> lays a row out as
// `repeat(Σ widths, minmax(0,1fr))`. The layer used to preview against a
// hardcoded 12-column grid, so on any row whose widths did not total 12 the
// ghost showed one width and the drop produced another.
//
// The row below is deliberately `[1, 2]` — a 3-column row, nothing like 12.
const ODD_ROW_DASHBOARD = {
  name: 'odd',
  config: {
    rows: [
      { height: 'medium', items: [{ width: 1, chart: 'ref(a)' }, { width: 2, table: 'ref(b)' }] },
    ],
  },
};

// Row is 900px. Rendered slots: 1/3 → 300px, 2/3 → 600px (jsdom reports no
// column-gap, so the geometry is the clean proportional case).
const ODD_BOXES = {
  o0: { top: 0, left: 0, width: 900, height: 200, bottom: 200, right: 900 },
  o0i0: { top: 0, left: 0, width: 300, height: 200, bottom: 200, right: 300 },
  o0i1: { top: 0, left: 300, width: 600, height: 200, bottom: 200, right: 900 },
  root: { top: 0, left: 0, width: 900, height: 200, bottom: 200, right: 900 },
};

const OddHost = () => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div data-canvas-path="row.0" data-testid="o0">
        <div data-canvas-path="row.0.item.0" data-testid="o0i0" />
        <div data-canvas-path="row.0.item.1" data-testid="o0i1" />
      </div>
      <CanvasResizeLayer rootRef={rootRef} dashboardName="odd" />
    </div>
  );
};

const px = value => parseFloat(value);

describe('CanvasResizeLayer — truthful resize preview (M26 / W7)', () => {
  beforeEach(() => {
    useStore.setState({
      dashboards: [ODD_ROW_DASHBOARD],
      workspaceOutlineSelectedKey: 'row.0.item.0',
    });
    Element.prototype.getBoundingClientRect = function () {
      const tid = this.getAttribute && this.getAttribute('data-testid');
      if (tid && ODD_BOXES[tid]) return ODD_BOXES[tid];
      return ODD_BOXES.root;
    };
  });

  test('TRUTHFUL PREVIEW: the ghost is the width the drop actually renders', () => {
    render(<OddHost />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');

    // Item 0 is 1/3 of a 900px row (300px). Dragging its right edge +150px asks
    // for a 450px slot — which is width 2, because the row becomes 2 + 2 = 4
    // wide and 2/4 · 900 = 450px.
    firePointerDown(handle, { clientX: 300, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 450, clientY: 100 });

    const ghostWidth = px(screen.getByTestId('canvas-resize-ghost').style.width);
    expect(ghostWidth).toBeCloseTo(450, 1);
    // The pre-M26 ghost scaled the start box by live/start against a fixed
    // 12-column grid: 300 · (2/1) = 600px. 150px of lie on a 900px row.
    expect(ghostWidth).not.toBeCloseTo(600, 0);

    firePointer('pointerup', { clientX: 450, clientY: 100 });

    // GHOST == DROP: lay the COMMITTED row out and compare to the ghost.
    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [, nextConfig] = mockCommit.mock.calls[0];
    const items = nextConfig.rows[0].items;
    expect(items.map(i => i.width)).toEqual([2, 2]);
    const rendered = itemSlotWidthPx({
      rowWidth: ODD_BOXES.o0.width,
      totalCols: rowGridTotal(items),
      spanCols: items[0].width,
      gapPx: 0,
    });
    expect(Math.abs(rendered - ghostWidth)).toBeLessThan(2);
  });

  test('HONEST READOUT: the denominator is the row total, never a hardcoded 12', () => {
    render(<OddHost />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 300, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 450, clientY: 100 });

    const readout = screen.getByTestId('canvas-resize-readout').textContent;
    expect(readout).toContain('2 / 4'); // the row this drag rebalances TO
    expect(readout).not.toContain('/ 12');
  });

  test('a LEFT-edge transfer previews against the UNCHANGED row total', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.1' });
    render(<OddHost />);
    const handle = screen.getByTestId('canvas-resize-width-left-row.0.item.1');

    // Item 1 is 2/3 (600px). Columns only TRANSFER across the shared boundary,
    // so the row stays 3 wide: dragging the left edge out to a 900px slot is
    // width 3 — except the neighbour cannot drop below 1, which caps it at 2.
    firePointerDown(handle, { clientX: 300, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 0, clientY: 100 });

    const readout = screen.getByTestId('canvas-resize-readout').textContent;
    expect(readout).toContain('2 / 3');
    expect(px(screen.getByTestId('canvas-resize-ghost').style.width)).toBeCloseTo(600, 1);
    firePointer('pointerup', { clientX: 0, clientY: 100 });
    expect(mockCommit).not.toHaveBeenCalled(); // clamped back to its own width
  });

  test('DIRECT MANIPULATION: exactly one emphasized outline during a gesture', () => {
    const { container } = render(<OddHost />);
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const outlinesNow = () => container.querySelectorAll('[data-canvas-outline="emphasized"]');
    expect(outlinesNow()).toHaveLength(0);

    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 300, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 450, clientY: 100 });

    // One ring, on the ghost — not a second frame at the pre-drag geometry.
    const outlines = outlinesNow();
    expect(outlines).toHaveLength(1);
    expect(outlines[0]).toBe(screen.getByTestId('canvas-resize-ghost'));

    // …and only the handle being dragged is painted; the stale ones are gone.
    expect(screen.queryByTestId('canvas-resize-height-row.0.item.0')).not.toBeInTheDocument();

    firePointer('pointerup', { clientX: 450, clientY: 100 });
    expect(outlinesNow()).toHaveLength(0);
  });

  test('DIRECT MANIPULATION: the card being resized fades, and un-fades on release', () => {
    render(<OddHost />);
    const card = screen.getByTestId('o0i0');
    expect(card.style.opacity).toBe('');

    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 300, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 450, clientY: 100 });
    expect(card.style.opacity).toBe('0.35');

    firePointer('pointerup', { clientX: 450, clientY: 100 });
    expect(card.style.opacity).toBe('');
  });

  test('a height drag fades the ROW it resizes, not just the clicked item', () => {
    render(<OddHost />);
    const handle = screen.getByTestId('canvas-resize-height-row.0.item.0');
    firePointerDown(handle, { clientX: 400, clientY: 195, pointerId: 1 });
    firePointer('pointermove', { clientX: 400, clientY: 315 });

    expect(screen.getByTestId('o0').style.opacity).toBe('0.35');
    expect(screen.getByTestId('o0i0').style.opacity).toBe('');

    firePointer('pointerup', { clientX: 400, clientY: 315 });
    expect(screen.getByTestId('o0').style.opacity).toBe('');
  });

  test('Escape ABORTS the gesture: no commit, and the card un-fades', () => {
    render(<OddHost />);
    const card = screen.getByTestId('o0i0');
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 300, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 450, clientY: 100 });
    expect(card.style.opacity).toBe('0.35');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(screen.queryByTestId('canvas-resize-ghost')).not.toBeInTheDocument();
    expect(card.style.opacity).toBe('');
    // A later pointerup must not resurrect the abandoned gesture.
    firePointer('pointerup', { clientX: 450, clientY: 100 });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  test('pointercancel ABORTS rather than committing an interrupted drag', () => {
    render(<OddHost />);
    const card = screen.getByTestId('o0i0');
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 300, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 450, clientY: 100 });
    firePointer('pointercancel', { clientX: 450, clientY: 100 });

    expect(mockCommit).not.toHaveBeenCalled();
    expect(card.style.opacity).toBe('');
  });

  test('unmounting mid-gesture restores the faded card', () => {
    const { unmount } = render(<OddHost />);
    const card = screen.getByTestId('o0i0');
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 300, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 450, clientY: 100 });
    expect(card.style.opacity).toBe('0.35');

    unmount();
    expect(card.style.opacity).toBe('');
  });

  test('a SOLO-item row never rewrites its width: the geometry cannot respond', () => {
    // Σ widths is the item's own width, so every span renders full-bleed. The
    // gesture must be an honest no-op, not a silent `width: 12` → `width: 1`.
    useStore.setState({
      dashboards: [
        { name: 'odd', config: { rows: [{ height: 'medium', items: [{ width: 12, chart: 'ref(a)' }] }] } },
      ],
      workspaceOutlineSelectedKey: 'row.0.item.0',
    });
    render(<OddHost />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 900, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 300, clientY: 100 });
    expect(screen.getByTestId('canvas-resize-readout').textContent).toContain('12 / 12');
    firePointer('pointerup', { clientX: 300, clientY: 100 });
    expect(mockCommit).not.toHaveBeenCalled();
  });
});
