/**
 * ONE emphasized outline, across the whole overlay STACK (M26 / VIS-1260).
 *
 * The canvas mounts <CanvasSelectionOverlay> and <CanvasResizeLayer> as
 * SIBLINGS (ProjectCanvas.jsx). Each renders into its own absolutely-positioned
 * layer, so neither can see — or dim — the other's rings, and the resize layer's
 * card-fade (an imperative opacity on the measured <Dashboard> node) cannot
 * reach a ring that is not inside that node.
 *
 * The bug that made this file necessary: during a resize gesture the selection
 * overlay kept a full-strength 2px `ring-primary` at the PRE-DRAG geometry while
 * the resize layer painted an identical 2px ring at the target. Two identical
 * mulberry boxes, one of them superseded — strictly more ambiguous than no
 * preview at all, since the bright ring at the old geometry reads as "the
 * selected thing".
 *
 * Counting it inside CanvasResizeLayer's own test file could not catch that: the
 * marker was private to the ghost, so `toHaveLength(1)` was true by
 * construction. Here BOTH overlays are mounted and BOTH stamp
 * `EMPHASIZED_OUTLINE_PROPS` (canvasEmphasis.js), so the count is a real
 * property of the rendered canvas — delete the suppression in
 * CanvasSelectionOverlay and these tests go red with 2.
 */
import React, { useRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import CanvasSelectionOverlay from './CanvasSelectionOverlay';
import CanvasResizeLayer from './CanvasResizeLayer';
import { EMPHASIZED_OUTLINE_SELECTOR } from './canvasEmphasis';
import useStore from '../../../../stores/store';

const mockCommit = jest.fn();
jest.mock('../../workspace/WorkspaceDndContext', () => ({
  useCommitCanvasConfig: () => mockCommit,
}));

jest.mock('../../workspace/telemetry', () => ({
  emitWorkspaceEvent: jest.fn(),
}));

const makeEvt = (type, { clientX, clientY, shiftKey = false }) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, shiftKey });

const firePointer = (type, coords) => {
  act(() => {
    window.dispatchEvent(makeEvt(type, coords));
  });
};

const firePointerDown = (el, coords) => {
  act(() => {
    el.dispatchEvent(makeEvt('pointerdown', coords));
  });
};

const DASHBOARD = {
  name: 'dash',
  config: {
    rows: [
      { height: 'medium', items: [{ width: 6, chart: 'ref(a)' }, { width: 6, table: 'ref(b)' }] },
    ],
  },
};

const BOXES = {
  r0: { top: 0, left: 0, width: 800, height: 200, bottom: 200, right: 800 },
  r0i0: { top: 0, left: 0, width: 400, height: 200, bottom: 200, right: 400 },
  r0i1: { top: 0, left: 400, width: 400, height: 200, bottom: 200, right: 800 },
  root: { top: 0, left: 0, width: 800, height: 200, bottom: 200, right: 800 },
};

// The two overlays, mounted exactly as ProjectCanvas mounts them: siblings over
// the render, sharing one positioned root ref.
const CanvasHost = () => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} data-testid="project-canvas" style={{ position: 'relative' }}>
      <div data-canvas-path="row.0" data-testid="r0">
        <div data-canvas-path="row.0.item.0" data-testid="r0i0" />
        <div data-canvas-path="row.0.item.1" data-testid="r0i1" />
      </div>
      <CanvasSelectionOverlay rootRef={rootRef} />
      <CanvasResizeLayer rootRef={rootRef} dashboardName="dash" />
    </div>
  );
};

let container;
const emphasized = () =>
  // eslint-disable-next-line testing-library/no-node-access
  Array.from(container.querySelectorAll(EMPHASIZED_OUTLINE_SELECTOR));

beforeEach(() => {
  mockCommit.mockClear();
  useStore.setState({
    dashboards: [DASHBOARD],
    // Selection is applied AFTER mount (below): the overlay measures the canvas
    // through the root ref, which React attaches during the parent's commit —
    // i.e. after a child's layout effect. That is the same order a real click
    // produces, and the idiom CanvasSelectionOverlay.test.jsx already uses.
    workspaceOutlineSelectedKey: 'dashboard',
    workspaceCanvasResizeKey: null,
    workspaceCanvasHoverKey: null,
  });
  Element.prototype.getBoundingClientRect = function () {
    const tid = this.getAttribute && this.getAttribute('data-testid');
    if (tid && BOXES[tid]) return BOXES[tid];
    return BOXES.root;
  };
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
});

const mountCanvas = (selectedKey = 'row.0.item.0') => {
  // Always mount on chrome so the select below is a real transition (a no-op
  // set would not re-render, and the first layout effect runs before the
  // parent's root ref is attached).
  useStore.setState({ workspaceOutlineSelectedKey: 'dashboard' });
  const view = render(<CanvasHost />);
  container = view.container;
  act(() => {
    useStore.getState().setWorkspaceOutlineSelectedKey(selectedKey);
  });
  return view;
};

describe('the canvas paints exactly ONE emphasized outline (M26)', () => {
  test('at rest it is the selection ring', () => {
    mountCanvas();
    const outlines = emphasized();
    expect(outlines).toHaveLength(1);
    expect(outlines[0]).toBe(screen.getByTestId('canvas-overlay-selected-item'));
  });

  test('DURING a resize it is the GHOST — the selection ring stands down', () => {
    mountCanvas();
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 397 + 57, clientY: 100 });

    // Without the suppression this is 2: a full-strength 2px mulberry ring at
    // the pre-drag box AND an identical one at the drag target.
    const outlines = emphasized();
    expect(outlines).toHaveLength(1);
    expect(outlines[0]).toBe(screen.getByTestId('canvas-resize-ghost'));
    expect(screen.queryByTestId('canvas-overlay-selected-item')).not.toBeInTheDocument();

    firePointer('pointerup', { clientX: 397 + 57, clientY: 100 });
  });

  test('the ring comes straight back on release', () => {
    mountCanvas();
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 397 + 57, clientY: 100 });
    firePointer('pointerup', { clientX: 397 + 57, clientY: 100 });

    const outlines = emphasized();
    expect(outlines).toHaveLength(1);
    expect(outlines[0]).toBe(screen.getByTestId('canvas-overlay-selected-item'));
    expect(useStore.getState().workspaceCanvasResizeKey).toBeNull();
  });

  test('an ABORTED gesture hands the ring back too (Esc / pointercancel)', () => {
    mountCanvas();
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');

    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 397 + 57, clientY: 100 });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(emphasized()).toHaveLength(1);
    expect(screen.getByTestId('canvas-overlay-selected-item')).toBeInTheDocument();

    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 2 });
    firePointer('pointermove', { clientX: 397 + 57, clientY: 100 });
    firePointer('pointercancel', { clientX: 397 + 57, clientY: 100 });
    expect(emphasized()).toHaveLength(1);
    expect(screen.getByTestId('canvas-overlay-selected-item')).toBeInTheDocument();
  });

  test('a height gesture also owns the emphasis (the ghost spans the row)', () => {
    mountCanvas();
    const handle = screen.getByTestId('canvas-resize-height-row.0.item.0');
    firePointerDown(handle, { clientX: 400, clientY: 195, pointerId: 1 });
    firePointer('pointermove', { clientX: 400, clientY: 315 });

    const outlines = emphasized();
    expect(outlines).toHaveLength(1);
    expect(outlines[0]).toBe(screen.getByTestId('canvas-resize-ghost'));

    firePointer('pointerup', { clientX: 400, clientY: 315 });
    expect(emphasized()).toHaveLength(1);
  });

  test('the HOVER hint also stands down — no stale ring chasing a dragging pointer', () => {
    mountCanvas();
    // Hover the OTHER item, so the hover ring is not suppressed as a duplicate
    // of the selection ring.
    act(() => {
      screen
        .getByTestId('r0i1')
        .dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    });
    expect(screen.getByTestId('canvas-overlay-hover-item')).toBeInTheDocument();

    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 397 + 57, clientY: 100 });
    expect(screen.queryByTestId('canvas-overlay-hover-item')).not.toBeInTheDocument();

    firePointer('pointerup', { clientX: 397 + 57, clientY: 100 });
    expect(emphasized()).toHaveLength(1);
  });

  test('unmounting mid-gesture releases the suppression rather than stranding it', () => {
    // A route change mid-drag must not leave the canvas permanently ring-less.
    const { unmount } = mountCanvas();
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');
    firePointerDown(handle, { clientX: 397, clientY: 100, pointerId: 1 });
    firePointer('pointermove', { clientX: 397 + 57, clientY: 100 });
    expect(useStore.getState().workspaceCanvasResizeKey).toBe('row.0.item.0');

    unmount();
    expect(useStore.getState().workspaceCanvasResizeKey).toBeNull();

    mountCanvas();
    expect(emphasized()).toHaveLength(1);
    expect(screen.getByTestId('canvas-overlay-selected-item')).toBeInTheDocument();
  });
});
