/**
 * CanvasSelectionOverlay (VIS-D2 / VIS-768).
 *
 * The overlay reads the rendered Dashboard DOM via event delegation — every
 * row container and item slot, at ANY nesting depth, carries a composite
 * `data-canvas-path` (the SAME key the OutlineTreePanel uses). It writes the
 * workspace selection to `workspaceOutlineSelectedKey` and paints
 * hover/selection rings. These tests drive the real workspace store and a fake
 * dashboard DOM so the click→key mapping (flat AND nested), the key→box
 * resolution, the chrome fallback, and the overlay surfaces are all exercised.
 */
import React, { useRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CanvasSelectionOverlay from './CanvasSelectionOverlay';
import useStore from '../../../../stores/store';
import { setWorkspaceTelemetryListener } from '../../workspace/telemetry';

// jsdom returns a zeroed rect for everything; give measured nodes a non-zero
// box so the overlay produces positioned boxes we can assert on.
const stubRect = (el, rect) => {
  el.getBoundingClientRect = () => ({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => {},
  });
};

/**
 * Harness: a positioned root that mimics ProjectCanvas — a fake Dashboard
 * DOM (two rows, items carrying the composite `data-canvas-path`) plus the
 * overlay wired to the same root ref.
 */
const Harness = () => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} data-testid="root" style={{ position: 'relative' }}>
      <div data-testid="dash">
        <div data-testid="dashboard-row-0" data-row-index="0" data-canvas-path="row.0">
          <div data-testid="slot-0-0" data-canvas-item-index="0" data-canvas-path="row.0.item.0">
            chart a
          </div>
          <div data-testid="slot-0-1" data-canvas-item-index="1" data-canvas-path="row.0.item.1">
            chart b
          </div>
        </div>
        <div data-testid="dashboard-row-1" data-row-index="1" data-canvas-path="row.1">
          <div data-testid="slot-1-0" data-canvas-item-index="0" data-canvas-path="row.1.item.0">
            chart c
          </div>
        </div>
      </div>
      <CanvasSelectionOverlay rootRef={rootRef} />
    </div>
  );
};

/**
 * NestedHarness: mirrors the DOM Dashboard emits for a nested-layout
 * dashboard — a container item (`row.2.item.0`) whose nested row
 * (`row.2.item.0.row.0`) holds two deep leaves. The deep leaf slot is nested
 * INSIDE the container slot, exactly as the real render nests them, so
 * `closest('[data-canvas-path]')` must resolve to the innermost (deep) path.
 */
const NestedHarness = () => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} data-testid="root" style={{ position: 'relative' }}>
      <div data-testid="dash">
        <div data-testid="dashboard-row-2" data-row-index="2" data-canvas-path="row.2">
          <div data-testid="container-2-0" data-canvas-item-index="0" data-canvas-path="row.2.item.0">
            <div data-testid="nested-row-2-0-0" data-canvas-path="row.2.item.0.row.0">
              <div data-testid="deep-leaf-0" data-canvas-path="row.2.item.0.row.0.item.0">
                nested chart a
              </div>
              <div data-testid="deep-leaf-1" data-canvas-path="row.2.item.0.row.0.item.1">
                nested chart b
              </div>
            </div>
          </div>
        </div>
      </div>
      <CanvasSelectionOverlay rootRef={rootRef} />
    </div>
  );
};

const resetStore = () => {
  act(() => {
    useStore.setState({ workspaceOutlineSelectedKey: 'dashboard' });
  });
};

const measureFakeDom = () => {
  // Root + every selectable node gets a deterministic box.
  stubRect(screen.getByTestId('root'), { top: 0, left: 0, width: 1000, height: 600 });
  stubRect(screen.getByTestId('dashboard-row-0'), { top: 10, left: 10, width: 980, height: 200 });
  stubRect(screen.getByTestId('dashboard-row-1'), { top: 220, left: 10, width: 980, height: 200 });
  stubRect(screen.getByTestId('slot-0-0'), { top: 12, left: 12, width: 480, height: 196 });
  stubRect(screen.getByTestId('slot-0-1'), { top: 12, left: 508, width: 480, height: 196 });
  stubRect(screen.getByTestId('slot-1-0'), { top: 222, left: 12, width: 976, height: 196 });
};

const measureNestedDom = () => {
  stubRect(screen.getByTestId('root'), { top: 0, left: 0, width: 1000, height: 600 });
  stubRect(screen.getByTestId('dashboard-row-2'), { top: 0, left: 0, width: 1000, height: 400 });
  // The container slot and its deep leaf get DELIBERATELY DISTINCT boxes so the
  // ring's geometry proves which element was resolved (container vs deep leaf).
  stubRect(screen.getByTestId('container-2-0'), { top: 0, left: 0, width: 1000, height: 400 });
  stubRect(screen.getByTestId('nested-row-2-0-0'), { top: 5, left: 5, width: 990, height: 390 });
  stubRect(screen.getByTestId('deep-leaf-0'), { top: 8, left: 8, width: 490, height: 384 });
  stubRect(screen.getByTestId('deep-leaf-1'), { top: 8, left: 502, width: 490, height: 384 });
};

// The overlay binds NATIVE listeners (so Dashboard's own interactivity is
// preserved), so the state updates they trigger fall outside React's synthetic
// batching — wrap every dispatch in act() to flush them.
const dispatch = (fn, ...args) =>
  act(() => {
    fn(...args);
  });

describe('CanvasSelectionOverlay (VIS-768)', () => {
  beforeEach(resetStore);
  afterEach(() => setWorkspaceTelemetryListener(null));

  test('renders a pointer-events-none overlay layer', () => {
    render(<Harness />);
    const layer = screen.getByTestId('canvas-overlay-layer');
    expect(layer).toBeInTheDocument();
    expect(layer.className).toContain('pointer-events-none');
  });

  test('clicking an item writes row.N.item.M to the workspace selection', () => {
    render(<Harness />);
    measureFakeDom();
    dispatch(fireEvent.click, screen.getByTestId('slot-0-1'));
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.0.item.1');
  });

  test('clicking an item REVEALS the right-rail Edit panel (VIS-994 / former VIS-977)', () => {
    render(<Harness />);
    measureFakeDom();
    // User is browsing the Outline tab with the rail collapsed — the exact
    // state where the old raw key-write left the editor invisible.
    act(() => {
      useStore.setState({ workspaceRightTab: 'outline', workspaceRightCollapsed: true });
    });
    dispatch(fireEvent.click, screen.getByTestId('slot-0-1'));
    const s = useStore.getState();
    expect(s.workspaceOutlineSelectedKey).toBe('row.0.item.1');
    expect(s.workspaceRightTab).toBe('edit');
    expect(s.workspaceRightCollapsed).toBe(false);
  });

  test('clicking a row (not an item) writes row.N', () => {
    render(<Harness />);
    measureFakeDom();
    // Click the row element itself (no item ancestor between target and row).
    dispatch(fireEvent.click, screen.getByTestId('dashboard-row-1'));
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.1');
  });

  test('clicking empty canvas chrome selects the dashboard', () => {
    render(<Harness />);
    measureFakeDom();
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.0' });
    });
    // The root itself is canvas chrome (no row/item ancestor).
    dispatch(fireEvent.click, screen.getByTestId('root'));
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('dashboard');
  });

  test('selecting an item paints a persistent mulberry selection ring', () => {
    render(<Harness />);
    measureFakeDom();
    dispatch(fireEvent.click, screen.getByTestId('slot-0-0'));
    const ring = screen.getByTestId('canvas-overlay-selected-item');
    expect(ring).toBeInTheDocument();
    expect(ring.className).toContain('ring-primary');
  });

  test('dashboard-chrome selection paints a subtle inset outer border', () => {
    render(<Harness />);
    measureFakeDom();
    // Default selection is 'dashboard'.
    const chrome = screen.getByTestId('canvas-overlay-chrome-selected');
    expect(chrome).toBeInTheDocument();
    expect(chrome.className).toContain('ring-inset');
    expect(chrome.className).toContain('ring-primary');
  });

  test('hovering an item paints the hover outline', () => {
    render(<Harness />);
    measureFakeDom();
    // Move off the default-selected dashboard chrome first by selecting a row,
    // so the hovered item is not the active selection (which suppresses hover).
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.1' });
    });
    dispatch(fireEvent.mouseMove, screen.getByTestId('slot-0-0'));
    expect(screen.getByTestId('canvas-overlay-hover-item')).toBeInTheDocument();
    // The resize affordance moved to <CanvasResizeLayer> (VIS-777 / D-4), painted
    // on the SELECTED node — the hover overlay no longer carries a placeholder.
    expect(screen.queryByTestId('canvas-overlay-resize-handle')).not.toBeInTheDocument();
  });

  test('mouse leave clears the hover overlay', () => {
    render(<Harness />);
    measureFakeDom();
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.1' });
    });
    dispatch(fireEvent.mouseMove, screen.getByTestId('slot-0-0'));
    expect(screen.getByTestId('canvas-overlay-hover-item')).toBeInTheDocument();
    dispatch(fireEvent.mouseLeave, screen.getByTestId('root'));
    expect(screen.queryByTestId('canvas-overlay-hover-item')).not.toBeInTheDocument();
  });

  test('emits canvas_selection_changed telemetry on click', () => {
    const events = [];
    setWorkspaceTelemetryListener(e => events.push(e));
    render(<Harness />);
    measureFakeDom();
    dispatch(fireEvent.click, screen.getByTestId('slot-1-0'));
    const evt = events.find(e => e.eventName === 'canvas_selection_changed');
    expect(evt).toBeTruthy();
    expect(evt.payload.key).toBe('row.1.item.0');
    expect(evt.payload.kind).toBe('item');
  });

  test('canvas selection and Outline tree share one key (round-trips through the store)', () => {
    render(<Harness />);
    measureFakeDom();
    // Outline tree writes the key; canvas reads the same field.
    act(() => {
      useStore.getState().setWorkspaceOutlineSelectedKey('row.0.item.1');
    });
    expect(screen.getByTestId('canvas-overlay-selected-item')).toBeInTheDocument();
    // Canvas writes; the same field updates for the tree.
    dispatch(fireEvent.click, screen.getByTestId('slot-1-0'));
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.1.item.0');
  });

  test('a selected key with no matching DOM node paints no ring (stale key)', () => {
    render(<Harness />);
    measureFakeDom();
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.9.item.9' });
    });
    expect(screen.queryByTestId('canvas-overlay-selected-item')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-overlay-selected-row')).not.toBeInTheDocument();
  });

  test('a window resize reflow drops the hover ring until the pointer re-arms it', () => {
    render(<Harness />);
    measureFakeDom();
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.1' });
    });
    dispatch(fireEvent.mouseMove, screen.getByTestId('slot-0-0'));
    expect(screen.getByTestId('canvas-overlay-hover-item')).toBeInTheDocument();

    // Reflow: the measured boxes may have moved, so the hover ring is dropped.
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.queryByTestId('canvas-overlay-hover-item')).not.toBeInTheDocument();

    // The selection ring survives the reflow (recomputed, not dropped).
    expect(screen.getByTestId('canvas-overlay-selected-row')).toBeInTheDocument();

    // The next pointer move re-arms the hover ring.
    dispatch(fireEvent.mouseMove, screen.getByTestId('slot-0-0'));
    expect(screen.getByTestId('canvas-overlay-hover-item')).toBeInTheDocument();
  });

  test('moving the pointer onto canvas chrome clears an active hover ring', () => {
    render(<Harness />);
    measureFakeDom();
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.1' });
    });
    dispatch(fireEvent.mouseMove, screen.getByTestId('slot-0-0'));
    expect(screen.getByTestId('canvas-overlay-hover-item')).toBeInTheDocument();

    // Chrome (the root, outside any row/item) is a click affordance only — the
    // hover hint must clear.
    dispatch(fireEvent.mouseMove, screen.getByTestId('root'));
    expect(screen.queryByTestId('canvas-overlay-hover-item')).not.toBeInTheDocument();

    // Further chrome moves are a no-op (no ring reappears, nothing crashes).
    dispatch(fireEvent.mouseMove, screen.getByTestId('root'));
    expect(screen.queryByTestId('canvas-overlay-hover-item')).not.toBeInTheDocument();
  });

  test('re-hovering the same node does not duplicate or move the ring', () => {
    render(<Harness />);
    measureFakeDom();
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.1' });
    });
    dispatch(fireEvent.mouseMove, screen.getByTestId('slot-0-0'));
    dispatch(fireEvent.mouseMove, screen.getByTestId('slot-0-0'));
    expect(screen.getAllByTestId('canvas-overlay-hover-item')).toHaveLength(1);
  });

  // --- Nested-layout selection (the VIS-768 hold) --------------------------
  describe('nested layouts (composite keys)', () => {
    test('clicking a nested leaf writes its FULL composite path, not the container', () => {
      render(<NestedHarness />);
      measureNestedDom();
      dispatch(fireEvent.click, screen.getByTestId('deep-leaf-1'));
      // Must be the deep leaf, NOT the top-level container `row.2.item.0`.
      expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.2.item.0.row.0.item.1');
    });

    test('emits the composite key + item kind on a nested click', () => {
      const events = [];
      setWorkspaceTelemetryListener(e => events.push(e));
      render(<NestedHarness />);
      measureNestedDom();
      dispatch(fireEvent.click, screen.getByTestId('deep-leaf-0'));
      const evt = events.find(e => e.eventName === 'canvas_selection_changed');
      expect(evt.payload.key).toBe('row.2.item.0.row.0.item.0');
      expect(evt.payload.kind).toBe('item');
    });

    test('Outline→canvas: a nested composite key rings the deep leaf, not the container', () => {
      render(<NestedHarness />);
      measureNestedDom();
      // The Outline tree sets the deep composite key.
      act(() => {
        useStore.getState().setWorkspaceOutlineSelectedKey('row.2.item.0.row.0.item.1');
      });
      const ring = screen.getByTestId('canvas-overlay-selected-item');
      // Smoking gun: the ring's geometry must match the DEEP LEAF box
      // (top 8 / left 502), NOT the container box (top 0 / left 0). The old
      // index-parsing resolver ringed the container — this asserts the fix.
      expect(ring.style.top).toBe('8px');
      expect(ring.style.left).toBe('502px');
      expect(ring.style.width).toBe('490px');
    });

    test('clicking a nested row (between leaves) writes the nested row path', () => {
      render(<NestedHarness />);
      measureNestedDom();
      dispatch(fireEvent.click, screen.getByTestId('nested-row-2-0-0'));
      expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.2.item.0.row.0');
    });
  });

  describe('resize-gesture clicks (VIS-993 canvas-editing regression)', () => {
    // CanvasResizeLayer paints its handles as SIBLING overlay nodes inside the
    // same root — they carry `data-resize-axis` but NO `data-canvas-path`. A
    // resize drag ends with the browser synthesizing a `click` on the handle
    // (pointer capture keeps down/up on the same element), which used to fall
    // through resolveTarget's chrome branch and DESELECT the node the user
    // just resized — the handles vanished after every single gesture.
    const ResizeHarness = () => {
      const rootRef = useRef(null);
      return (
        <div ref={rootRef} data-testid="root" style={{ position: 'relative' }}>
          <div data-testid="dashboard-row-0" data-row-index="0" data-canvas-path="row.0">
            <div data-testid="slot-0-0" data-canvas-path="row.0.item.0">
              chart a
            </div>
          </div>
          {/* Stand-in for a CanvasResizeLayer handle: overlay node, no canvas path. */}
          <div data-testid="fake-resize-handle" data-resize-axis="height" />
          <CanvasSelectionOverlay rootRef={rootRef} />
        </div>
      );
    };

    test("a click on a resize handle does NOT collapse the selection to chrome", () => {
      render(<ResizeHarness />);
      act(() => {
        useStore.getState().setWorkspaceOutlineSelectedKey('row.0');
      });
      fireEvent.click(screen.getByTestId('fake-resize-handle'));
      // The selection the user is resizing must SURVIVE the gesture's
      // terminal click — otherwise every resize hides the handles.
      expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.0');
    });

    test('a genuine chrome click still deselects to the dashboard', () => {
      render(<ResizeHarness />);
      act(() => {
        useStore.getState().setWorkspaceOutlineSelectedKey('row.0');
      });
      fireEvent.click(screen.getByTestId('root'));
      expect(useStore.getState().workspaceOutlineSelectedKey).toBe('dashboard');
    });
  });
});
