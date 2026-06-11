/**
 * TabStrip behaviour (VIS-775 / Track B B2).
 *
 * The strip is store-driven (no prop-drilling) — tests seed the workspace
 * store and spy on the store actions, matching the Library / Workspace test
 * conventions.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TabStrip, { tabDragEndToReorder } from './TabStrip';
import useStore from '../../../stores/store';

const sampleTabs = [
  { id: 'project:analytics-platform', type: 'project', name: 'analytics-platform' },
  {
    id: 'dashboard:simple-dashboard',
    type: 'dashboard',
    name: 'simple-dashboard',
    dirty: true,
  },
  { id: 'chart:revenue_chart', type: 'chart', name: 'revenue_chart' },
];

const seedStore = (extra = {}) => {
  act(() => {
    useStore.setState({
      workspaceTabs: sampleTabs,
      workspaceActiveTabId: null,
      workspacePendingCloseTabId: null,
      switchWorkspaceTab: jest.fn(),
      closeWorkspaceTab: jest.fn(),
      requestCloseWorkspaceTab: jest.fn(),
      openWorkspaceTab: jest.fn(),
      project: { id: 'p1', project_json: { name: 'analytics-platform' } },
      ...extra,
    });
  });
};

describe('TabStrip', () => {
  test('renders nothing when there are no tabs', () => {
    seedStore({ workspaceTabs: [], project: null });
    const { container } = render(<TabStrip />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders one tab per descriptor with the right active state', () => {
    seedStore({ workspaceActiveTabId: 'dashboard:simple-dashboard' });
    render(<TabStrip />);
    expect(
      screen.getByTestId('workspace-tab-project:analytics-platform')
    ).toHaveAttribute('data-active', 'false');
    expect(
      screen.getByTestId('workspace-tab-dashboard:simple-dashboard')
    ).toHaveAttribute('data-active', 'true');
    expect(
      screen.getByTestId('workspace-tab-chart:revenue_chart')
    ).toHaveAttribute('data-active', 'false');
  });

  test('renders the dirty dot on tabs marked dirty', () => {
    seedStore();
    render(<TabStrip />);
    expect(
      screen.getByTestId('workspace-tab-dirty-dashboard:simple-dashboard')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('workspace-tab-dirty-project:analytics-platform')
    ).not.toBeInTheDocument();
  });

  test('clicking the tab body calls switchWorkspaceTab with the tab id', () => {
    const switchWorkspaceTab = jest.fn();
    seedStore({ switchWorkspaceTab });
    render(<TabStrip />);
    fireEvent.click(
      screen.getByTestId('workspace-tab-select-chart:revenue_chart')
    );
    expect(switchWorkspaceTab).toHaveBeenCalledWith('chart:revenue_chart');
  });

  test('clicking the close button routes through requestCloseWorkspaceTab (dirty guard) without firing select', () => {
    const switchWorkspaceTab = jest.fn();
    const closeWorkspaceTab = jest.fn();
    const requestCloseWorkspaceTab = jest.fn();
    seedStore({ switchWorkspaceTab, closeWorkspaceTab, requestCloseWorkspaceTab });
    render(<TabStrip />);
    fireEvent.click(
      screen.getByTestId('workspace-tab-close-dashboard:simple-dashboard')
    );
    // VIS-812: the × asks the guard (which raises the confirm dialog when
    // dirty) instead of force-closing.
    expect(requestCloseWorkspaceTab).toHaveBeenCalledWith('dashboard:simple-dashboard');
    expect(closeWorkspaceTab).not.toHaveBeenCalled();
    expect(switchWorkspaceTab).not.toHaveBeenCalled();
  });

  // Drag-reorder is dnd-kit pointer-driven (VIS-812) — the gesture itself is
  // covered by the Playwright story; here we pin the drag-end → reorder
  // resolution and that every tab mounts as a draggable wrapper.
  test('tabDragEndToReorder resolves a drop to the [active, over] pair', () => {
    expect(
      tabDragEndToReorder({ active: { id: 'chart:c' }, over: { id: 'project:p' } })
    ).toEqual(['chart:c', 'project:p']);
    // Dropped on itself / nowhere → no reorder.
    expect(
      tabDragEndToReorder({ active: { id: 'chart:c' }, over: { id: 'chart:c' } })
    ).toBeNull();
    expect(tabDragEndToReorder({ active: { id: 'chart:c' }, over: null })).toBeNull();
    expect(tabDragEndToReorder(null)).toBeNull();
  });

  test('every tab renders a draggable wrapper for the strip-local dnd context', () => {
    seedStore();
    render(<TabStrip />);
    sampleTabs.forEach(tab => {
      expect(screen.getByTestId(`workspace-tab-wrapper-${tab.id}`)).toBeInTheDocument();
    });
  });

  test('mounts the dirty-close confirmation dialog when a close is pending', () => {
    seedStore({
      workspacePendingCloseTabId: 'dashboard:simple-dashboard',
      confirmCloseWorkspaceTab: jest.fn(),
      cancelCloseWorkspaceTab: jest.fn(),
    });
    render(<TabStrip />);
    const dialog = screen.getByTestId('tab-close-confirm-dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('simple-dashboard');
  });

  test('clicking the + button opens the project tab via openWorkspaceTab', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    render(<TabStrip />);
    fireEvent.click(screen.getByTestId('workspace-tab-new'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'project:analytics-platform',
      type: 'project',
      name: 'analytics-platform',
    });
  });
});
