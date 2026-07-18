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
  test('renders the persistent strip shell (just the + affordance) when there are no tabs', () => {
    // Explore 2.0 Phase 0: project left the tab model, so an empty tab list is
    // now the DEFAULT state on a fresh `/workspace` visit (not a transient
    // impossible case) — the strip must stay mounted with its `[+]` control
    // (01-ux-spec.md §1), not disappear.
    seedStore({ workspaceTabs: [], project: null });
    render(<TabStrip />);
    expect(screen.getByTestId('workspace-tab-strip')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-tab-new')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
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

  // Explore 2.0 Phase 2: an exploration tab's STABLE identity (`tab.name`)
  // is its backend id, not its (renamable) display name — the strip must
  // resolve the real name from `workspaceExplorations`, not print the id.
  test('an exploration tab displays the record name, not its raw id', () => {
    seedStore({
      workspaceTabs: [
        ...sampleTabs,
        { id: 'exploration:exp_a1b2c3d4', type: 'exploration', name: 'exp_a1b2c3d4' },
      ],
      workspaceExplorations: {
        byId: { exp_a1b2c3d4: { id: 'exp_a1b2c3d4', name: 'Churn dig' } },
        order: ['exp_a1b2c3d4'],
      },
    });
    render(<TabStrip />);
    const tab = screen.getByTestId('workspace-tab-exploration:exp_a1b2c3d4');
    expect(tab).toHaveTextContent('Churn dig');
    expect(tab).not.toHaveTextContent('exp_a1b2c3d4');
  });

  test('an exploration tab falls back to the raw id if the record is not (yet) loaded', () => {
    seedStore({
      workspaceTabs: [
        { id: 'exploration:exp_missing', type: 'exploration', name: 'exp_missing' },
      ],
      workspaceExplorations: { byId: {}, order: [] },
    });
    render(<TabStrip />);
    expect(screen.getByTestId('workspace-tab-exploration:exp_missing')).toHaveTextContent(
      'exp_missing'
    );
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

  test('keeps the active tab scrolled into view when it changes', () => {
    const scrollIntoView = jest.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      seedStore({ workspaceActiveTabId: 'chart:revenue_chart' });
      render(<TabStrip />);
      expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest' });
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

// ── Pointer drag-to-reorder (VIS-812 / O-3) ─────────────────────────────────
// dnd-kit's PointerSensor activates in jsdom when the native event carries
// `isPrimary` + button 0; droppable rects are stubbed per tab so closestCenter
// resolves a real target.
const pointerEvent = (type, coords = {}) => {
  const evt = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: coords.clientX ?? 0,
    clientY: coords.clientY ?? 0,
    button: 0,
  });
  Object.defineProperty(evt, 'isPrimary', { value: true });
  Object.defineProperty(evt, 'pointerId', { value: 1 });
  return evt;
};

const stubTabRects = () => {
  sampleTabs.forEach((tab, i) => {
    const wrapper = screen.getByTestId(`workspace-tab-wrapper-${tab.id}`);
    wrapper.getBoundingClientRect = () => ({
      x: i * 100,
      y: 0,
      left: i * 100,
      right: i * 100 + 100,
      top: 0,
      bottom: 36,
      width: 100,
      height: 36,
      toJSON: () => ({}),
    });
  });
};

const dragTab = async (tabId, from, to) => {
  const wrapper = screen.getByTestId(`workspace-tab-wrapper-${tabId}`);
  await act(async () => {
    wrapper.dispatchEvent(pointerEvent('pointerdown', { clientX: from, clientY: 18 }));
  });
  // First move activates the sensor (distance constraint); the second drives
  // the collision pass that resolves the hovered drop target.
  await act(async () => {
    document.dispatchEvent(pointerEvent('pointermove', { clientX: from - 20, clientY: 18 }));
  });
  await act(async () => {
    document.dispatchEvent(pointerEvent('pointermove', { clientX: to, clientY: 18 }));
  });
};

describe('TabStrip pointer drag-to-reorder', () => {
  test('a pulled tab ghosts, paints the drop slot on its target, and reorders on drop', async () => {
    const reorderWorkspaceTabs = jest.fn();
    seedStore({ reorderWorkspaceTabs });
    render(<TabStrip />);
    stubTabRects();

    // Pull the chart tab (at x≈250) over the project tab (x 0-100).
    await dragTab('chart:revenue_chart', 250, 40);

    // The dragged tab ghosts in place…
    expect(screen.getByTestId('workspace-tab-chart:revenue_chart')).toHaveAttribute(
      'data-dragging',
      'true'
    );
    // …and the hovered target paints the slot indicator.
    expect(
      screen.getByTestId('workspace-tab-drop-slot-project:analytics-platform')
    ).toBeInTheDocument();

    await act(async () => {
      document.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 18 }));
    });

    // The drop resolves to a store reorder and the drag state clears.
    expect(reorderWorkspaceTabs).toHaveBeenCalledWith(
      'chart:revenue_chart',
      'project:analytics-platform'
    );
    expect(screen.getByTestId('workspace-tab-chart:revenue_chart')).toHaveAttribute(
      'data-dragging',
      'false'
    );
    expect(
      screen.queryByTestId('workspace-tab-drop-slot-project:analytics-platform')
    ).not.toBeInTheDocument();
  });

  test('Escape cancels the drag: no reorder, ghost + slot cleared', async () => {
    const reorderWorkspaceTabs = jest.fn();
    seedStore({ reorderWorkspaceTabs });
    render(<TabStrip />);
    stubTabRects();

    await dragTab('chart:revenue_chart', 250, 40);
    expect(screen.getByTestId('workspace-tab-chart:revenue_chart')).toHaveAttribute(
      'data-dragging',
      'true'
    );

    // The sensor listens on the document — dispatch the cancel key there.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(reorderWorkspaceTabs).not.toHaveBeenCalled();
    expect(screen.getByTestId('workspace-tab-chart:revenue_chart')).toHaveAttribute(
      'data-dragging',
      'false'
    );
    expect(
      screen.queryByTestId('workspace-tab-drop-slot-project:analytics-platform')
    ).not.toBeInTheDocument();
  });
});
