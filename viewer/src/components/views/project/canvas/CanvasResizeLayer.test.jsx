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
import {
  itemSlotWidthPx,
  precedingColsInRow,
  rowGridTotal,
  spanLeftOffsetPx,
} from './canvasGridGeometry';
import { EMPHASIZED_OUTLINE_SELECTOR } from './canvasEmphasis';

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

  // NOTE: this test only sees THIS layer. It proves the resize layer contributes
  // exactly one outline and drops its own stale handles — it can say nothing
  // about the sibling <CanvasSelectionOverlay>, which used to keep a
  // full-strength ring at the pre-drag geometry throughout the gesture. The
  // cross-overlay count (the property a user actually sees) is guarded in
  // canvasOutlineEmphasis.test.jsx, where BOTH overlays are mounted.
  test('DIRECT MANIPULATION: this layer contributes exactly one outline', () => {
    const { container } = render(<OddHost />);
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const outlinesNow = () => container.querySelectorAll(EMPHASIZED_OUTLINE_SELECTOR);
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

  test('a SOLO-item row gets NO width handle: the gesture provably cannot move a pixel', () => {
    // Σ widths is the item's own width, so every span renders full-bleed and the
    // drag can never change the geometry. A handle there would paint a ghost,
    // print a frozen readout and do nothing — a dead affordance. The row keeps
    // its HEIGHT handle, which does work.
    useStore.setState({
      dashboards: [
        { name: 'odd', config: { rows: [{ height: 'medium', items: [{ width: 12, chart: 'ref(a)' }] }] } },
      ],
      workspaceOutlineSelectedKey: 'row.0.item.0',
    });
    render(<OddHost />);
    expect(screen.queryByTestId('canvas-resize-width-row.0.item.0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-resize-width-left-row.0.item.0')).not.toBeInTheDocument();
    expect(screen.getByTestId('canvas-resize-height-row.0.item.0')).toBeInTheDocument();
  });

  test('a solo item that GAINS a sibling gets its width handle back', () => {
    // The handle is withheld because of the ROW's shape, not the item's — the
    // moment a sibling exists the gesture has real geometry to move again.
    useStore.setState({
      dashboards: [
        {
          name: 'odd',
          config: {
            rows: [
              {
                height: 'medium',
                items: [{ width: 12, chart: 'ref(a)' }, { width: 4, table: 'ref(b)' }],
              },
            ],
          },
        },
      ],
      workspaceOutlineSelectedKey: 'row.0.item.0',
    });
    render(<OddHost />);
    expect(screen.getByTestId('canvas-resize-width-row.0.item.0')).toBeInTheDocument();
  });
});

// ── M26 second half: the ghost's LEFT edge ───────────────────────────────────
//
// The width fix alone still dropped the card somewhere other than the ghost.
// Sum-normalization shrinks EVERY track when the row total grows, including the
// ones in front of the dragged item, so the slot slides LEFT as it widens. A
// ghost frozen at the item's measured `left` is therefore only correct for item
// 0 — the single index every pre-existing truthful-preview guard happened to
// use — and on the LAST item of a row it is painted hanging off the row's right
// edge entirely.
//
// jsdom reports no column-gap, so these are the clean gapless numbers; the
// gapped case is covered by canvasGridGeometry.test.js and by the browser
// harness (e2e/tools/measure-canvas-grid.mjs).

const ROW_PX = 800;

// Build the measured boxes a real gapless `repeat(Σ widths, 1fr)` row would
// produce, so the fixture and the layer's own formula start from the SAME
// layout rather than hand-typed numbers that quietly disagree.
const boxesForWidths = widths => {
  const total = widths.reduce((sum, w) => sum + (w || 1), 0);
  const track = ROW_PX / total;
  const row = { top: 0, left: 0, width: ROW_PX, height: 200, bottom: 200, right: ROW_PX };
  const boxes = { root: row, p0: row };
  let preceding = 0;
  widths.forEach((w, i) => {
    const left = preceding * track;
    const width = (w || 1) * track;
    boxes[`p0i${i}`] = { top: 0, left, width, height: 200, bottom: 200, right: left + width };
    preceding += w || 1;
  });
  return boxes;
};

const PAIR_BOXES = boxesForWidths([6, 6]);
const QUAD_BOXES = boxesForWidths([1, 1, 1, 1]);

const PairHost = () => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div data-canvas-path="row.0" data-testid="p0">
        <div data-canvas-path="row.0.item.0" data-testid="p0i0" />
        <div data-canvas-path="row.0.item.1" data-testid="p0i1" />
      </div>
      <CanvasResizeLayer rootRef={rootRef} dashboardName="pair" />
    </div>
  );
};

const QuadHost = () => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div data-canvas-path="row.0" data-testid="p0">
        {[0, 1, 2, 3].map(i => (
          <div key={i} data-canvas-path={`row.0.item.${i}`} data-testid={`p0i${i}`} />
        ))}
      </div>
      <CanvasResizeLayer rootRef={rootRef} dashboardName="pair" />
    </div>
  );
};

const useBoxes = boxes => {
  Element.prototype.getBoundingClientRect = function () {
    const tid = this.getAttribute && this.getAttribute('data-testid');
    if (tid && boxes[tid]) return boxes[tid];
    return boxes.root;
  };
};

const dashboardWithWidths = widths => ({
  name: 'pair',
  config: {
    rows: [{ height: 'medium', items: widths.map(width => ({ width, chart: 'ref(a)' })) }],
  },
});

// Lay the COMMITTED row out from scratch — the independent side of the round
// trip. Mirrors what <Dashboard> does with the config the drop produced.
const laidOutSlot = (items, index, rowWidth) => ({
  left: spanLeftOffsetPx({
    rowWidth,
    totalCols: rowGridTotal(items),
    precedingCols: precedingColsInRow(items, index),
    gapPx: 0,
  }),
  width: itemSlotWidthPx({
    rowWidth,
    totalCols: rowGridTotal(items),
    spanCols: items[index].width || 1,
    gapPx: 0,
  }),
});

describe('CanvasResizeLayer — the ghost LANDS where it is painted (M26)', () => {
  test('a NON-FIRST item: the ghost moves left as it grows, and the drop matches it', () => {
    useStore.setState({
      dashboards: [dashboardWithWidths([6, 6])],
      workspaceOutlineSelectedKey: 'row.0.item.1',
    });
    useBoxes(PAIR_BOXES);
    render(<PairHost />);

    // Item 1 occupies 400–800 of an 800px row. Drag its RIGHT edge +57px: the
    // row becomes 6 + 8 = 14 wide, so the slot renders 457.1px — starting at
    // 6/14 · 800 = 342.9px, i.e. 57px to the LEFT of where it is now.
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.1');
    firePointerDown(handle, { clientX: 797, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 797 + 57, clientY: 100 });

    const ghost = screen.getByTestId('canvas-resize-ghost');
    const ghostLeft = px(ghost.style.left);
    const ghostWidth = px(ghost.style.width);
    expect(ghostWidth).toBeCloseTo(457.14, 1);
    expect(ghostLeft).toBeCloseTo(342.86, 1);
    // The pre-fix ghost froze `left` at the measured box (400) — 57px of lie,
    // and its right edge landed at 857px on an 800px row.
    expect(ghostLeft).not.toBeCloseTo(400, 0);
    expect(ghostLeft + ghostWidth).toBeLessThanOrEqual(PAIR_BOXES.p0.width + 0.01);

    firePointer('pointerup', { clientX: 797 + 57, clientY: 100 });

    // GHOST == DROP, in BOTH axes, against the config the commit produced.
    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [, nextConfig] = mockCommit.mock.calls[0];
    const items = nextConfig.rows[0].items;
    expect(items.map(i => i.width)).toEqual([6, 8]);
    const laid = laidOutSlot(items, 1, PAIR_BOXES.p0.width);
    expect(Math.abs(laid.width - ghostWidth)).toBeLessThan(2);
    expect(Math.abs(laid.left - ghostLeft)).toBeLessThan(2);
  });

  test('the LAST item of a 4-up row: a 440px lie becomes a 0px one', () => {
    useStore.setState({
      dashboards: [dashboardWithWidths([1, 1, 1, 1])],
      workspaceOutlineSelectedKey: 'row.0.item.3',
    });
    useBoxes(QUAD_BOXES);
    render(<QuadHost />);

    // Item 3 sits at 600–800. Dragging its right edge +440px asks for a 640px
    // slot, which is width 12 on a row that becomes 3 + 12 = 15 wide — and that
    // slot starts at 3/15 · 800 = 160px, 440px LEFT of where the item is now.
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.3');
    firePointerDown(handle, { clientX: 797, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 797 + 440, clientY: 100 });

    const ghost = screen.getByTestId('canvas-resize-ghost');
    const ghostLeft = px(ghost.style.left);
    const ghostWidth = px(ghost.style.width);
    expect(ghostWidth).toBeCloseTo(640, 1);
    expect(ghostLeft).toBeCloseTo(160, 1);
    // Pre-fix: left frozen at 600, so the ghost spanned 600→1240 on an 800px
    // row — 440px of horizontal lie and 440px painted outside the canvas.
    expect(Math.abs(ghostLeft - QUAD_BOXES.p0i3.left)).toBeGreaterThan(400);

    firePointer('pointerup', { clientX: 797 + 440, clientY: 100 });

    const [, nextConfig] = mockCommit.mock.calls[0];
    const items = nextConfig.rows[0].items;
    expect(items.map(i => i.width)).toEqual([1, 1, 1, 12]);
    const laid = laidOutSlot(items, 3, QUAD_BOXES.p0.width);
    expect(Math.abs(laid.width - ghostWidth)).toBeLessThan(2);
    expect(Math.abs(laid.left - ghostLeft)).toBeLessThan(2);
  });

  test('SHRINKING a non-first item pushes the ghost RIGHT', () => {
    // The tracks in FRONT of the item grow when the row total falls, so a
    // shrink slides the slot the other way. Same formula, opposite sign — a
    // preview that only ever grew leftward would fail this.
    const boxes = boxesForWidths([1, 1, 4, 1]);
    useStore.setState({
      dashboards: [dashboardWithWidths([1, 1, 4, 1])],
      workspaceOutlineSelectedKey: 'row.0.item.2',
    });
    useBoxes(boxes);
    render(<QuadHost />);

    // Row total 7; item 2 renders 4/7 · 800 = 457.1px starting at 2/7 · 800 =
    // 228.6px. Shrinking it to 1 makes the row 4 wide: the slot becomes 200px
    // and starts at 2/4 · 800 = 400px — 171px to the RIGHT.
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.2');
    firePointerDown(handle, { clientX: 686, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 686 - 258, clientY: 100 });

    const ghost = screen.getByTestId('canvas-resize-ghost');
    const ghostLeft = px(ghost.style.left);
    const ghostWidth = px(ghost.style.width);
    firePointer('pointerup', { clientX: 686 - 258, clientY: 100 });

    const [, nextConfig] = mockCommit.mock.calls[0];
    const items = nextConfig.rows[0].items;
    expect(items.map(i => i.width)).toEqual([1, 1, 1, 1]);
    const laid = laidOutSlot(items, 2, ROW_PX);
    expect(laid.left).toBeCloseTo(400, 1);
    expect(Math.abs(laid.left - ghostLeft)).toBeLessThan(2);
    expect(Math.abs(laid.width - ghostWidth)).toBeLessThan(2);
    // …and it moved the OPPOSITE way from a grow: right, not left.
    expect(ghostLeft).toBeGreaterThan(boxes.p0i2.left);
  });

  test('the FIRST item still stays put — the fix is a shift, not an offset', () => {
    useStore.setState({
      dashboards: [dashboardWithWidths([6, 6])],
      workspaceOutlineSelectedKey: 'row.0.item.0',
    });
    useBoxes(PAIR_BOXES);
    render(<PairHost />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 397 + 57, clientY: 100 });
    expect(px(screen.getByTestId('canvas-resize-ghost').style.left)).toBeCloseTo(0, 6);
    firePointer('pointerup', { clientX: 397 + 57, clientY: 100 });
  });

  test('zero travel leaves the ghost welded to the card it covers', () => {
    useStore.setState({
      dashboards: [dashboardWithWidths([6, 6])],
      workspaceOutlineSelectedKey: 'row.0.item.1',
    });
    useBoxes(PAIR_BOXES);
    render(<PairHost />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.1');
    firePointerDown(handle, { clientX: 797, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 798, clientY: 100 }); // <1 column

    const ghost = screen.getByTestId('canvas-resize-ghost');
    expect(px(ghost.style.left)).toBeCloseTo(PAIR_BOXES.p0i1.left, 6);
    expect(px(ghost.style.width)).toBeCloseTo(PAIR_BOXES.p0i1.width, 6);
    firePointer('pointerup', { clientX: 798, clientY: 100 });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  test('a LEFT-edge transfer still anchors the RIGHT edge (the total holds still)', () => {
    useStore.setState({
      dashboards: [dashboardWithWidths([6, 6])],
      workspaceOutlineSelectedKey: 'row.0.item.1',
    });
    useBoxes(PAIR_BOXES);
    render(<PairHost />);
    const handle = screen.getByTestId('canvas-resize-width-left-row.0.item.1');
    // Columns only TRANSFER: the row stays 12 wide, so the track size — and the
    // slot's right edge — never move. Drag the left edge 133px out (2 columns).
    firePointerDown(handle, { clientX: 400, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 400 - 133, clientY: 100 });

    const ghost = screen.getByTestId('canvas-resize-ghost');
    const left = px(ghost.style.left);
    const width = px(ghost.style.width);
    expect(width).toBeCloseTo(533.33, 1); // 8/12 of 800
    expect(left + width).toBeCloseTo(PAIR_BOXES.p0i1.right, 6); // right edge pinned
    firePointer('pointerup', { clientX: 400 - 133, clientY: 100 });

    const [, nextConfig] = mockCommit.mock.calls[0];
    const items = nextConfig.rows[0].items;
    expect(items.map(i => i.width)).toEqual([4, 8]);
    const laid = laidOutSlot(items, 1, PAIR_BOXES.p0.width);
    expect(Math.abs(laid.left - left)).toBeLessThan(2);
    expect(Math.abs(laid.width - width)).toBeLessThan(2);
  });
});
