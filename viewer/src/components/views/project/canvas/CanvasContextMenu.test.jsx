/**
 * CanvasContextMenu tests (VIS-781 / Track D D-5).
 *
 * The menu listens for `contextmenu` on the canvas root, resolves the target
 * via `data-canvas-path`, and offers wrap / unwrap / add-row-inside / add-item.
 * The shared `commitCanvasConfig` is provided by a stub WorkspaceCommitContext
 * so we assert the committed config without simulating the whole shell. The pure
 * reshape logic is covered in canvasReorder.test.js; here we test the menu's
 * item gating + commit wiring.
 */
import React, { useRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasContextMenu from './CanvasContextMenu';
import useStore from '../../../../stores/store';
import { WorkspaceCommitProvider } from '../../workspace/WorkspaceDndContext';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import { futureFlags } from '../../../../router-config';

// Stub the telemetry emitter (no shell mounted). jest hoists this above the
// imports, so the mocked module is what the import above resolves to.
jest.mock('../../workspace/telemetry', () => ({
  emitWorkspaceEvent: jest.fn(),
}));

const LEAF_DASH = {
  name: 'dash',
  config: {
    rows: [
      { height: 'medium', items: [{ width: 6, chart: 'ref(a)' }, { width: 6, table: 'ref(b)' }] },
    ],
  },
};

const CONTAINER_DASH = {
  name: 'dash',
  config: {
    rows: [
      {
        height: 'medium',
        items: [{ width: 12, rows: [{ height: 'small', items: [{ chart: 'ref(c)' }] }] }],
      },
    ],
  },
};

// Host renders fake Dashboard nodes (carrying data-canvas-path) + the menu under
// a stub commit provider that captures the committed config.
const Host = ({ commit, structure = 'leaf' }) => {
  const rootRef = useRef(null);
  return (
    <WorkspaceCommitProvider value={commit}>
      <div ref={rootRef} style={{ position: 'relative' }} data-testid="host">
        <div data-canvas-path="row.0" data-testid="r0">
          {structure === 'leaf' ? (
            <>
              <div data-canvas-path="row.0.item.0" data-testid="r0i0" />
              <div data-canvas-path="row.0.item.1" data-testid="r0i1" />
            </>
          ) : (
            <div data-canvas-path="row.0.item.0" data-testid="r0i0">
              <div data-canvas-path="row.0.item.0.row.0" data-testid="n0">
                <div data-canvas-path="row.0.item.0.row.0.item.0" data-testid="n0i0" />
              </div>
            </div>
          )}
        </div>
        <CanvasContextMenu rootRef={rootRef} dashboardName="dash" />
      </div>
    </WorkspaceCommitProvider>
  );
};

// Render the Host inside a Router so `useNavigate` resolves.
const renderHost = props =>
  render(
    <MemoryRouter future={futureFlags}>
      <Host {...props} />
    </MemoryRouter>
  );

const rightClick = testid =>
  fireEvent.contextMenu(screen.getByTestId(testid), { clientX: 100, clientY: 100 });

describe('CanvasContextMenu (VIS-781)', () => {
  beforeEach(() => {
    emitWorkspaceEvent.mockClear();
    useStore.setState({ dashboards: [LEAF_DASH], workspaceOutlineSelectedKey: 'dashboard' });
    // jsdom getBoundingClientRect is zeroed; the menu only needs a root rect.
  });

  test('no menu until a right-click on a row/item', () => {
    renderHost({ commit: jest.fn() });
    expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();
  });

  test('right-clicking a LEAF item shows Wrap + Add item to row, not Unwrap/Add row inside', () => {
    renderHost({ commit: jest.fn() });
    rightClick('r0i0');
    expect(screen.getByTestId('canvas-context-menu')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-ctx-wrap')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-ctx-add-item')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-ctx-add-row-inside')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-ctx-unwrap')).not.toBeInTheDocument();
  });

  test('right-clicking a ROW shows only Add item to row', () => {
    renderHost({ commit: jest.fn() });
    rightClick('r0');
    expect(screen.getByTestId('canvas-ctx-add-item')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-ctx-wrap')).not.toBeInTheDocument();
  });

  test('Wrap in container commits the wrapped config + fires telemetry', () => {
    const commit = jest.fn();
    renderHost({ commit });
    rightClick('r0i0');
    fireEvent.click(screen.getByTestId('canvas-ctx-wrap'));
    expect(commit).toHaveBeenCalledTimes(1);
    const [name, nextConfig] = commit.mock.calls[0];
    expect(name).toBe('dash');
    expect(Array.isArray(nextConfig.rows[0].items[0].rows)).toBe(true);
    expect(emitWorkspaceEvent).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'wrap_in_container', path: 'row.0.item.0' })
    );
    // Menu dismisses after the action.
    expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();
  });

  test('right-clicking a CONTAINER item shows Add row inside + Unwrap (trivial 1×1)', () => {
    useStore.setState({ dashboards: [CONTAINER_DASH] });
    renderHost({ commit: jest.fn(), structure: "container" });
    rightClick('r0i0');
    expect(screen.getByTestId('canvas-ctx-add-row-inside')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-ctx-unwrap')).toBeInTheDocument();
    // A container is not a leaf — no Wrap action.
    expect(screen.queryByTestId('canvas-ctx-wrap')).not.toBeInTheDocument();
  });

  test('Unwrap commits the collapsed config', () => {
    useStore.setState({ dashboards: [CONTAINER_DASH] });
    const commit = jest.fn();
    renderHost({ commit, structure: "container" });
    rightClick('r0i0');
    fireEvent.click(screen.getByTestId('canvas-ctx-unwrap'));
    const [, nextConfig] = commit.mock.calls[0];
    expect(nextConfig.rows[0].items[0].chart).toBe('ref(c)');
    expect(nextConfig.rows[0].items[0].rows).toBeUndefined();
    expect(emitWorkspaceEvent).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'unwrap_container' })
    );
  });

  test('Escape dismisses the menu', () => {
    renderHost({ commit: jest.fn() });
    rightClick('r0i0');
    expect(screen.getByTestId('canvas-context-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();
  });

  test('scroll dismisses the menu', () => {
    renderHost({ commit: jest.fn() });
    rightClick('r0i0');
    expect(screen.getByTestId('canvas-context-menu')).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();
  });

  test('every window scroll listener added on open is removed on dismiss (no leak)', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    try {
      renderHost({ commit: jest.fn() });
      rightClick('r0i0');
      fireEvent.keyDown(document, { key: 'Escape' });

      const added = addSpy.mock.calls.filter(([type]) => type === 'scroll').map(([, fn]) => fn);
      const removed = removeSpy.mock.calls
        .filter(([type]) => type === 'scroll')
        .map(([, fn]) => fn);
      expect(added.length).toBeGreaterThan(0);
      // A menu open must never register a scroll listener it can't remove.
      added.forEach(fn => expect(removed).toContain(fn));
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  // ------------------------------------------------------------------
  // O-2 / VIS-811 — "Open" / "Open in new tab" (workspace tabs)
  // ------------------------------------------------------------------
  describe('Open / Open in new tab (O-2)', () => {
    beforeEach(() => {
      useStore.setState({
        workspaceTabs: [],
        workspaceActiveTabId: null,
        workspaceActiveObject: null,
      });
    });

    test('chart leaf shows both open actions', () => {
      renderHost({ commit: jest.fn() });
      rightClick('r0i0');
      expect(screen.getByTestId('canvas-ctx-open')).toBeInTheDocument();
      expect(screen.getByTestId('canvas-ctx-open-new-tab')).toBeInTheDocument();
    });

    test('"Open" focuses a tab for the chart (replaces current context) and dismisses', () => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'dash' });
      renderHost({ commit: jest.fn() });
      rightClick('r0i0');
      fireEvent.click(screen.getByTestId('canvas-ctx-open'));

      const s = useStore.getState();
      expect(s.workspaceActiveTabId).toBe('chart:a');
      expect(s.workspaceActiveObject).toEqual({ type: 'chart', name: 'a' });
      expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();
    });

    test('"Open in new tab" background-opens without stealing focus from the dashboard', () => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'dash' });
      renderHost({ commit: jest.fn() });
      rightClick('r0i1'); // the table leaf → subject { type: 'table', name: 'b' }
      fireEvent.click(screen.getByTestId('canvas-ctx-open-new-tab'));

      const s = useStore.getState();
      expect(s.workspaceTabs.map(t => t.id)).toEqual(['dashboard:dash', 'table:b']);
      expect(s.workspaceActiveTabId).toBe('dashboard:dash');
      expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();
    });

    test('a container item offers neither open action', () => {
      useStore.setState({ dashboards: [CONTAINER_DASH] });
      renderHost({ commit: jest.fn(), structure: 'container' });
      rightClick('r0i0');
      expect(screen.queryByTestId('canvas-ctx-open')).not.toBeInTheDocument();
      expect(screen.queryByTestId('canvas-ctx-open-new-tab')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Phase 6c-T5 (ux-audit.md "No 'Explore this' from a dashboard chart's
  // context menu", ⚠ conflicts-with-e2e) — the highest-intent moment for
  // exploration (looking at a rendered chart) had no explore affordance.
  // ------------------------------------------------------------------
  describe('"Explore this" (Phase 6c-T5)', () => {
    let createExploration;
    let buildExplorationSeedState;
    let openWorkspaceTab;

    beforeEach(() => {
      createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_1' });
      buildExplorationSeedState = jest.fn(() => null);
      openWorkspaceTab = jest.fn();
      useStore.setState({ createExploration, buildExplorationSeedState, openWorkspaceTab });
    });

    test('a chart leaf offers "Explore this"', () => {
      renderHost({ commit: jest.fn() });
      rightClick('r0i0'); // the chart leaf → subject { type: 'chart', name: 'a' }
      expect(screen.getByTestId('canvas-ctx-explore-this')).toBeInTheDocument();
    });

    test('a table leaf does NOT offer "Explore this" (not an explorable type yet)', () => {
      renderHost({ commit: jest.fn() });
      rightClick('r0i1'); // the table leaf → subject { type: 'table', name: 'b' }
      expect(screen.queryByTestId('canvas-ctx-explore-this')).not.toBeInTheDocument();
    });

    test('clicking "Explore this" mints an exploration seeded from the chart and opens it, dismissing the menu', async () => {
      renderHost({ commit: jest.fn() });
      rightClick('r0i0');
      fireEvent.click(screen.getByTestId('canvas-ctx-explore-this'));

      // The menu dismisses immediately (doesn't wait on the async create).
      expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();

      await waitFor(() => expect(openWorkspaceTab).toHaveBeenCalled());
      expect(createExploration).toHaveBeenCalledWith({ type: 'chart', name: 'a' }, null, null);
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'exploration:exp_1',
        type: 'exploration',
        name: 'exp_1',
      });
    });

    test('a container item never offers "Explore this"', () => {
      useStore.setState({ dashboards: [CONTAINER_DASH] });
      renderHost({ commit: jest.fn(), structure: 'container' });
      rightClick('r0i0');
      expect(screen.queryByTestId('canvas-ctx-explore-this')).not.toBeInTheDocument();
    });
  });
});
