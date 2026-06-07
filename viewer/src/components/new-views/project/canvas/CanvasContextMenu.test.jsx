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
import { render, screen, fireEvent } from '@testing-library/react';
import CanvasContextMenu from './CanvasContextMenu';
import useStore from '../../../../stores/store';
import { WorkspaceCommitProvider } from '../../workspace/WorkspaceDndContext';
import { emitWorkspaceEvent } from '../../workspace/telemetry';

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

const rightClick = testid =>
  fireEvent.contextMenu(screen.getByTestId(testid), { clientX: 100, clientY: 100 });

describe('CanvasContextMenu (VIS-781)', () => {
  beforeEach(() => {
    emitWorkspaceEvent.mockClear();
    useStore.setState({ dashboards: [LEAF_DASH], workspaceOutlineSelectedKey: 'dashboard' });
    // jsdom getBoundingClientRect is zeroed; the menu only needs a root rect.
  });

  test('no menu until a right-click on a row/item', () => {
    render(<Host commit={jest.fn()} />);
    expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();
  });

  test('right-clicking a LEAF item shows Wrap + Add item to row, not Unwrap/Add row inside', () => {
    render(<Host commit={jest.fn()} />);
    rightClick('r0i0');
    expect(screen.getByTestId('canvas-context-menu')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-ctx-wrap')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-ctx-add-item')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-ctx-add-row-inside')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-ctx-unwrap')).not.toBeInTheDocument();
  });

  test('right-clicking a ROW shows only Add item to row', () => {
    render(<Host commit={jest.fn()} />);
    rightClick('r0');
    expect(screen.getByTestId('canvas-ctx-add-item')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-ctx-wrap')).not.toBeInTheDocument();
  });

  test('Wrap in container commits the wrapped config + fires telemetry', () => {
    const commit = jest.fn();
    render(<Host commit={commit} />);
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
    render(<Host commit={jest.fn()} structure="container" />);
    rightClick('r0i0');
    expect(screen.getByTestId('canvas-ctx-add-row-inside')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-ctx-unwrap')).toBeInTheDocument();
    // A container is not a leaf — no Wrap action.
    expect(screen.queryByTestId('canvas-ctx-wrap')).not.toBeInTheDocument();
  });

  test('Unwrap commits the collapsed config', () => {
    useStore.setState({ dashboards: [CONTAINER_DASH] });
    const commit = jest.fn();
    render(<Host commit={commit} structure="container" />);
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
    render(<Host commit={jest.fn()} />);
    rightClick('r0i0');
    expect(screen.getByTestId('canvas-context-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();
  });
});
