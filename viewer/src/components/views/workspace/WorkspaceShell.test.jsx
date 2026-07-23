/**
 * WorkspaceShell tests — 6c-T2 responsive shell (audit shell-ia #10,
 * cold-start #2: BLOCKER at 1100px — "the entire editor/results/preview
 * column collapses to a ~30px sliver").
 *
 * Two layers:
 *   - `computeAutoCollapse` is a pure function — thorough unit coverage with
 *     no rendering needed (`WorkspaceShell` is its only runtime caller).
 *   - A light integration pass mounts the real shell (heavy children mocked,
 *     matching this codebase's established convention — see
 *     `RightRail.test.jsx`/`ExplorationWorkbench.test.jsx`) with a
 *     `ResizeObserver` stub that reports a controlled width, and asserts the
 *     width divs + the canvas's real min-width respond correctly — this is
 *     the actual mechanism that keeps the canvas usable at 1100px.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import WorkspaceShell, { computeAutoCollapse, CENTER_MIN_WIDTH, RAIL_COLLAPSED_WIDTH } from './WorkspaceShell';
import useStore from '../../../stores/store';

jest.mock('./TabStrip', () => () => <div data-testid="tab-strip-mock" />);
jest.mock('./LeftRail', () => () => <div data-testid="left-rail-mock" />);
jest.mock('./RightRail', () => () => <div data-testid="right-rail-mock" />);
jest.mock('./MiddlePane', () => () => <div data-testid="middle-pane-mock" />);
jest.mock('./DragHandle', () => () => <div data-testid="drag-handle-mock" />);
jest.mock('./WorkspaceDndContext', () => ({ children }) => <div>{children}</div>);
jest.mock('./ExternalEditBanner', () => () => null);
jest.mock('./WorkspaceToast', () => () => null);

describe('computeAutoCollapse (pure)', () => {
  test('returns no collapse when both rails fit alongside the canvas min-width', () => {
    expect(
      computeAutoCollapse({ containerWidth: 1600, leftWidth: 320, rightWidth: 360 })
    ).toEqual({ left: false, right: false });
  });

  // The exact scenario the audit flagged as a BLOCKER: a normal laptop with
  // a sidebar open. Library collapses; the right rail (now the ONLY right
  // rail, post-D6) still fits.
  test('at 1100px with default rail widths, collapses library first — right rail still fits', () => {
    expect(
      computeAutoCollapse({ containerWidth: 1100, leftWidth: 320, rightWidth: 360 })
    ).toEqual({ left: true, right: false });
  });

  test('collapses both rails when even the library-collapsed width is not enough', () => {
    expect(
      computeAutoCollapse({ containerWidth: 700, leftWidth: 320, rightWidth: 360 })
    ).toEqual({ left: true, right: true });
  });

  test('a wider right rail (user-dragged) needs a wider container before it uncollapses', () => {
    // leftCollapsedOnly = 1100 - 48 - 500 = 552 >= 480 → left alone is enough.
    expect(
      computeAutoCollapse({ containerWidth: 1100, leftWidth: 320, rightWidth: 500 })
    ).toEqual({ left: true, right: false });
    // Narrower still: 900 - 48 - 500 = 352 < 480 → both must collapse.
    expect(
      computeAutoCollapse({ containerWidth: 900, leftWidth: 320, rightWidth: 500 })
    ).toEqual({ left: true, right: true });
  });

  test('an unmeasured (zero) width collapses nothing — avoids a false collapse before the first real measurement', () => {
    expect(computeAutoCollapse({ containerWidth: 0, leftWidth: 320, rightWidth: 360 })).toEqual({
      left: false,
      right: false,
    });
  });

  test('the boundary is inclusive: exactly CENTER_MIN_WIDTH of room needs no collapse', () => {
    const containerWidth = CENTER_MIN_WIDTH + 320 + 360;
    expect(computeAutoCollapse({ containerWidth, leftWidth: 320, rightWidth: 360 })).toEqual({
      left: false,
      right: false,
    });
    expect(
      computeAutoCollapse({ containerWidth: containerWidth - 1, leftWidth: 320, rightWidth: 360 })
    ).toEqual({ left: true, right: false });
  });
});

describe('WorkspaceShell (integration — mocked children)', () => {
  let observedWidth;
  let lastObserver;

  beforeEach(() => {
    observedWidth = 1600;
    lastObserver = null;
    global.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.disconnect = jest.fn();
        lastObserver = this;
      }
      observe() {
        this.callback([{ contentRect: { width: observedWidth } }]);
      }
    };
    act(() => {
      useStore.setState({
        workspaceLeftCollapsed: false,
        workspaceRightCollapsed: false,
        workspaceLeftWidth: 320,
        workspaceRightWidth: 360,
        workspaceLeftAutoCollapsedByShell: false,
        workspaceRightAutoCollapsedByShell: false,
      });
    });
  });

  test('the canvas holds a real min-width regardless of viewport', () => {
    render(<WorkspaceShell />);
    const middle = screen.getByTestId('workspace-middle-container');
    expect(middle.style.minWidth).toBe(`${CENTER_MIN_WIDTH}px`);
  });

  test('at a wide viewport, both rails render at their configured width — no collapse', () => {
    observedWidth = 1600;
    render(<WorkspaceShell />);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe('320px');
    expect(screen.getByTestId('workspace-right-rail-container').style.width).toBe('360px');
  });

  // The BLOCKER scenario itself: 1100px collapses the library rail to make
  // room, while the (now-single, post-D6) right rail stays put.
  test('at 1100px, the left rail auto-collapses to 48px and the right rail stays expanded', () => {
    observedWidth = 1100;
    render(<WorkspaceShell />);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe(
      `${RAIL_COLLAPSED_WIDTH}px`
    );
    expect(screen.getByTestId('workspace-right-rail-container').style.width).toBe('360px');
  });

  test('at a very narrow width, both rails auto-collapse', () => {
    observedWidth = 700;
    render(<WorkspaceShell />);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe(
      `${RAIL_COLLAPSED_WIDTH}px`
    );
    expect(screen.getByTestId('workspace-right-rail-container').style.width).toBe(
      `${RAIL_COLLAPSED_WIDTH}px`
    );
  });

  test('a rail the user manually collapsed at a wide viewport stays collapsed — auto-collapse never fights it', () => {
    act(() => {
      useStore.getState().toggleWorkspaceLeftCollapsed();
    });
    observedWidth = 1600; // plenty of room
    render(<WorkspaceShell />);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe(
      `${RAIL_COLLAPSED_WIDTH}px`
    );
  });

  // The real mechanism a live resize drives: the observer callback fires
  // again with a new width over the component's lifetime. A collapse flips
  // `leftCollapsed`, which is itself an effect dependency — the effect
  // re-subscribes and immediately re-measures (matching a real
  // ResizeObserver's re-`observe()` call), so the test keeps `observedWidth`
  // in sync with each simulated width rather than asserting its own stub
  // back at itself.
  const simulateResize = width => {
    observedWidth = width;
    act(() => {
      lastObserver.callback([{ contentRect: { width } }]);
    });
  };

  test('a live shrink-then-grow sequence collapses then re-expands the left rail', () => {
    render(<WorkspaceShell />);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe('320px');

    simulateResize(1100);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe(
      `${RAIL_COLLAPSED_WIDTH}px`
    );
    expect(screen.getByTestId('workspace-right-rail-container').style.width).toBe('360px');

    simulateResize(1600);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe('320px');
  });

  // The narrower still (both-collapse) case over the same live sequence.
  test('a live shrink to the both-collapse floor, then back to wide, restores both rails', () => {
    render(<WorkspaceShell />);
    simulateResize(700);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe(
      `${RAIL_COLLAPSED_WIDTH}px`
    );
    expect(screen.getByTestId('workspace-right-rail-container').style.width).toBe(
      `${RAIL_COLLAPSED_WIDTH}px`
    );
    simulateResize(1600);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe('320px');
    expect(screen.getByTestId('workspace-right-rail-container').style.width).toBe('360px');
  });

  // Docstring contract: "a manual toggle re-evaluates immediately... the
  // target then reports it should collapse again on the very next
  // measurement rather than waiting for an actual resize event" — a manual
  // re-expand at a width that still doesn't fit re-subscribes the effect
  // (leftCollapsed is a dependency), which immediately re-measures and
  // re-collapses the rail.
  test('manually re-expanding the left rail while still narrow gets auto-recollapsed on the very next measurement', () => {
    observedWidth = 1100; // narrow the whole time — never actually fits
    render(<WorkspaceShell />);
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe(
      `${RAIL_COLLAPSED_WIDTH}px`
    );
    act(() => {
      useStore.getState().toggleWorkspaceLeftCollapsed(); // user forces it open
    });
    // The effect re-subscribed (leftCollapsed changed) and re-measured at the
    // same (still narrow) width — auto-collapse reasserts itself immediately.
    expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe(
      `${RAIL_COLLAPSED_WIDTH}px`
    );
  });

  test('unmounting disconnects the ResizeObserver', () => {
    const { unmount } = render(<WorkspaceShell />);
    const observer = lastObserver;
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  // Defensive guard (line coverage: `!el || typeof ResizeObserver === 'undefined'`)
  // — jsdom has no ResizeObserver of its own; the whole suite polyfills one
  // globally (setupTests.js), so this branch only exercises in an environment
  // that genuinely lacks it. Deleting the global for one test exercises the
  // real fallback rather than asserting a stub back at itself.
  test('when ResizeObserver is unavailable, the shell renders at its configured widths without crashing', () => {
    const original = global.ResizeObserver;
    delete global.ResizeObserver;
    try {
      expect(() => render(<WorkspaceShell />)).not.toThrow();
      // No measurement ever ran — rails stay at whatever the store already says.
      expect(screen.getByTestId('workspace-left-rail-container').style.width).toBe('320px');
      expect(screen.getByTestId('workspace-right-rail-container').style.width).toBe('360px');
    } finally {
      global.ResizeObserver = original;
    }
  });
});
