/**
 * CanvasSelectionOverlay (VIS-D2 / VIS-768).
 *
 * The overlay reads the rendered DashboardNew DOM via event delegation
 * (`data-row-index` rows, `data-canvas-item-index` item slots), writes the
 * workspace selection to `workspaceOutlineSelectedKey` (the SAME key the
 * OutlineTreePanel uses), and paints hover/selection rings. These tests drive
 * the real workspace store and a fake dashboard DOM so the click→key mapping,
 * the chrome fallback, and the overlay surfaces are all exercised.
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
 * Harness: a positioned root that mimics ProjectCanvas — a fake DashboardNew
 * DOM (two rows, items with `data-canvas-item-index`) plus the overlay wired
 * to the same root ref.
 */
const Harness = () => {
  const rootRef = useRef(null);
  return (
    <div ref={rootRef} data-testid="root" style={{ position: 'relative' }}>
      <div data-testid="dash">
        <div data-testid="dashboard-row-0" data-row-index="0">
          <div data-testid="slot-0-0" data-canvas-item-index="0">
            chart a
          </div>
          <div data-testid="slot-0-1" data-canvas-item-index="1">
            chart b
          </div>
        </div>
        <div data-testid="dashboard-row-1" data-row-index="1">
          <div data-testid="slot-1-0" data-canvas-item-index="0">
            chart c
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

// The overlay binds NATIVE listeners (so DashboardNew's own interactivity is
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
    expect(ring.className).toContain('ring-[#713b57]');
  });

  test('dashboard-chrome selection paints a subtle inset outer border', () => {
    render(<Harness />);
    measureFakeDom();
    // Default selection is 'dashboard'.
    const chrome = screen.getByTestId('canvas-overlay-chrome-selected');
    expect(chrome).toBeInTheDocument();
    expect(chrome.className).toContain('ring-inset');
    expect(chrome.className).toContain('ring-[#713b57]');
  });

  test('hovering an item paints the outline + resize-handle placeholder', () => {
    render(<Harness />);
    measureFakeDom();
    // Move off the default-selected dashboard chrome first by selecting a row,
    // so the hovered item is not the active selection (which suppresses hover).
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.1' });
    });
    dispatch(fireEvent.mouseMove, screen.getByTestId('slot-0-0'));
    expect(screen.getByTestId('canvas-overlay-hover-item')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-overlay-resize-handle')).toBeInTheDocument();
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
});
