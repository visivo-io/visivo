/**
 * CanvasKeyboardLayer tests (VIS-790 / Track D D-7).
 *
 * Drives the canvas keyboard-nav focus region: arrow keys move the store
 * selection, ⌘↑/↓ reorder + commit through the stub commit provider, Enter
 * focuses the right-rail form, and the aria-live region announces the position.
 * The pure nav logic lives in breadcrumbNav + useCanvasKeyboardNav; here we test
 * the wiring + a11y surface.
 */
import React, { useRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CanvasKeyboardLayer from './CanvasKeyboardLayer';
import useStore from '../../../../stores/store';
import { WorkspaceCommitProvider } from '../../workspace/WorkspaceDndContext';

jest.mock('../../workspace/telemetry', () => ({
  emitWorkspaceEvent: jest.fn(),
}));

const DASH = {
  name: 'dash',
  config: {
    rows: [
      { height: 'medium', items: [{ width: 6, chart: 'ref(a)' }, { width: 6, table: 'ref(b)' }] },
      { height: 'small', items: [{ width: 12, chart: 'ref(c)' }] },
    ],
  },
};

const Host = ({ commit = jest.fn() }) => {
  const rootRef = useRef(null);
  return (
    <WorkspaceCommitProvider value={commit}>
      <div ref={rootRef} style={{ position: 'relative' }}>
        <CanvasKeyboardLayer rootRef={rootRef} dashboardName="dash" />
      </div>
    </WorkspaceCommitProvider>
  );
};

const region = () => screen.getByTestId('canvas-keyboard-region');
const selectedKey = () => useStore.getState().workspaceOutlineSelectedKey;
const press = (key, opts = {}) => fireEvent.keyDown(region(), { key, ...opts });

beforeEach(() => {
  useStore.setState({ dashboards: [DASH], workspaceOutlineSelectedKey: 'dashboard' });
});

describe('CanvasKeyboardLayer (VIS-790)', () => {
  test('renders a focusable application region + a polite live region', () => {
    render(<Host />);
    expect(region()).toHaveAttribute('role', 'application');
    expect(region()).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('canvas-keyboard-announce')).toHaveAttribute('aria-live', 'polite');
  });

  test('ArrowDown from dashboard descends into row 0; ArrowDown again into item 0', () => {
    render(<Host />);
    press('ArrowDown');
    expect(selectedKey()).toBe('row.0');
    press('ArrowDown');
    expect(selectedKey()).toBe('row.0.item.0');
  });

  test('ArrowRight / ArrowLeft step among the row items (wraps)', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<Host />);
    press('ArrowRight');
    expect(selectedKey()).toBe('row.0.item.1');
    press('ArrowRight'); // wraps
    expect(selectedKey()).toBe('row.0.item.0');
    press('ArrowLeft');
    expect(selectedKey()).toBe('row.0.item.1');
  });

  test('ArrowUp steps UP the hierarchy (item → parent row)', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.1' });
    render(<Host />);
    press('ArrowUp');
    expect(selectedKey()).toBe('row.0');
  });

  test('Tab cycles the row items, Shift+Tab reverses', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<Host />);
    press('Tab');
    expect(selectedKey()).toBe('row.0.item.1');
    press('Tab', { shiftKey: true });
    expect(selectedKey()).toBe('row.0.item.0');
  });

  test('⌘ArrowDown reorders the selected row + commits the new config', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0' });
    const commit = jest.fn();
    render(<Host commit={commit} />);
    press('ArrowDown', { metaKey: true });
    expect(commit).toHaveBeenCalledTimes(1);
    const [name, nextConfig] = commit.mock.calls[0];
    expect(name).toBe('dash');
    // Row 0 (medium) moved below row 1 (small).
    expect(nextConfig.rows.map(r => r.height)).toEqual(['small', 'medium']);
    // The selection follows the moved row to its new index.
    expect(selectedKey()).toBe('row.1');
    // §3.4 canvas_action kind — keyboard row moves roll up as move_row.
    const { emitWorkspaceEvent } = require('../../workspace/telemetry');
    expect(emitWorkspaceEvent).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'move_row', via: 'keyboard', dashboardName: 'dash' })
    );
  });

  test('⌘ArrowDown on a selected ITEM reorders it and emits move_item (§3.4)', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    const commit = jest.fn();
    render(<Host commit={commit} />);
    press('ArrowDown', { metaKey: true });
    expect(commit).toHaveBeenCalledTimes(1);
    const { emitWorkspaceEvent } = require('../../workspace/telemetry');
    expect(emitWorkspaceEvent).toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ kind: 'move_item', via: 'keyboard', dashboardName: 'dash' })
    );
  });

  test('Escape deselects to the dashboard root', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.1' });
    render(<Host />);
    press('Escape');
    expect(selectedKey()).toBe('dashboard');
  });

  test('Enter focuses the right-rail form first field', () => {
    // Mount a stub right-rail panel (with a focusable field) inside the tree, so
    // the layer's document.querySelector('[data-testid="workspace-right-rail-edit"]')
    // resolves to it — no direct node creation in the test.
    const HostWithPanel = ({ commit = jest.fn() }) => {
      const rootRef = useRef(null);
      return (
        <WorkspaceCommitProvider value={commit}>
          <div ref={rootRef} style={{ position: 'relative' }}>
            <CanvasKeyboardLayer rootRef={rootRef} dashboardName="dash" />
            <div data-testid="workspace-right-rail-edit">
              <input data-testid="rail-first-field" />
            </div>
          </div>
        </WorkspaceCommitProvider>
      );
    };
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<HostWithPanel />);
    press('Enter');
    expect(screen.getByTestId('rail-first-field')).toHaveFocus();
  });

  test('selection moves announce the position in the live region', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0.item.0' });
    render(<Host />);
    press('ArrowRight');
    expect(screen.getByTestId('canvas-keyboard-announce')).toHaveTextContent(
      'Row 1, item 2 selected'
    );
  });

  test('focusing the region with nothing selected primes the dashboard root + announces', () => {
    useStore.setState({ workspaceOutlineSelectedKey: null });
    render(<Host />);
    fireEvent.focus(region());
    expect(selectedKey()).toBe('dashboard');
    expect(screen.getByTestId('canvas-keyboard-announce')).toHaveTextContent(
      'Dashboard selected'
    );
  });

  test('focusing the region with an existing selection announces it without resetting', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.1' });
    render(<Host />);
    fireEvent.focus(region());
    expect(selectedKey()).toBe('row.1');
    expect(screen.getByTestId('canvas-keyboard-announce')).toHaveTextContent('Row 2 selected');
  });

  test('a selection change from another surface refreshes the announcement WHILE focused', () => {
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0' });
    render(<Host />);
    // Real focus so document.activeElement === region for the effect's check.
    act(() => {
      region().focus();
    });
    // Outline / breadcrumb / pointer moves the selection while the canvas holds focus.
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.1.item.0' });
    });
    expect(screen.getByTestId('canvas-keyboard-announce')).toHaveTextContent(
      'Row 2, item 1 selected'
    );
  });

  test('renders nothing when the scoped dashboard is missing', () => {
    useStore.setState({ dashboards: [] });
    render(<Host />);
    expect(screen.queryByTestId('canvas-keyboard-region')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-keyboard-announce')).not.toBeInTheDocument();
  });

  test('renders nothing when the dashboards list has not loaded yet', () => {
    useStore.setState({ dashboards: null });
    render(<Host />);
    expect(screen.queryByTestId('canvas-keyboard-region')).not.toBeInTheDocument();
  });

  test('accepts a raw-config dashboard entry (no nested `config`)', () => {
    useStore.setState({
      dashboards: [{ name: 'dash', rows: DASH.config.rows }],
      workspaceOutlineSelectedKey: 'dashboard',
    });
    render(<Host />);
    press('ArrowDown');
    expect(selectedKey()).toBe('row.0');
  });

  test('a config without rows still mounts and navigation is inert', () => {
    useStore.setState({
      dashboards: [{ name: 'dash', config: {} }],
      workspaceOutlineSelectedKey: 'dashboard',
    });
    render(<Host />);
    press('ArrowDown');
    expect(selectedKey()).toBe('dashboard');
  });

  test('⌘ArrowDown without a commit provider reorders nothing (no crash)', () => {
    const { emitWorkspaceEvent } = require('../../workspace/telemetry');
    emitWorkspaceEvent.mockClear();
    useStore.setState({ workspaceOutlineSelectedKey: 'row.0' });
    const rowsBefore = useStore.getState().dashboards[0].config.rows;
    // No WorkspaceCommitProvider — the context value is not a function.
    const BareHost = () => {
      const rootRef = useRef(null);
      return (
        <div ref={rootRef} style={{ position: 'relative' }}>
          <CanvasKeyboardLayer rootRef={rootRef} dashboardName="dash" />
        </div>
      );
    };
    render(<BareHost />);
    press('ArrowDown', { metaKey: true });
    expect(useStore.getState().dashboards[0].config.rows).toBe(rowsBefore);
    expect(emitWorkspaceEvent).not.toHaveBeenCalledWith(
      'canvas_action',
      expect.objectContaining({ via: 'keyboard' })
    );
  });
});
