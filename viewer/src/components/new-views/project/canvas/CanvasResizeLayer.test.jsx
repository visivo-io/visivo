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
    // No height handle on an item selection (that's a row affordance).
    expect(screen.queryByTestId('canvas-resize-height-row.0.item.0')).not.toBeInTheDocument();
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

    // Down on the handle, move +135px right (~2 columns at 66.7px/col), release.
    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 1 });
    // A ghost + readout appear during the drag.
    expect(screen.getByTestId('canvas-resize-ghost')).toBeInTheDocument();
    firePointer("pointermove", { clientX: 397 + 135, clientY: 100 });
    expect(screen.getByTestId('canvas-resize-readout').textContent).toContain('8 / 12');
    firePointer("pointerup", { clientX: 397 + 135, clientY: 100 });

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
