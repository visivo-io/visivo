/**
 * Workspace store slice — tab management (VIS-775 / Track B B2).
 *
 * The slice is consumed by the Workspace shell to drive tab state. These
 * tests pin the open/switch/close + dirty-flag behaviour so VIS-O1's
 * subsequent multi-tab work has a stable contract to build on.
 */
import { act } from '@testing-library/react';
import useStore from './store';

const reset = () => {
  act(() => {
    useStore.setState({
      workspaceTabs: [],
      workspaceActiveTabId: null,
      workspaceLeftCollapsed: false,
      workspaceRightCollapsed: false,
      workspaceRightTab: 'edit',
      workspaceLens: 'preview',
    });
  });
};

describe('workspace store slice', () => {
  beforeEach(reset);

  test('openWorkspaceTab adds a new tab and focuses it', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({
        type: 'dashboard',
        name: 'simple-dashboard',
      });
    });
    const s = useStore.getState();
    expect(s.workspaceTabs).toHaveLength(1);
    expect(s.workspaceTabs[0].id).toBe('dashboard:simple-dashboard');
    expect(s.workspaceActiveTabId).toBe('dashboard:simple-dashboard');
  });

  test('openWorkspaceTab re-focuses an existing tab without duplicating it', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({
        type: 'dashboard',
        name: 'simple-dashboard',
      });
      useStore.getState().openWorkspaceTab({
        type: 'chart',
        name: 'revenue_chart',
      });
      useStore.getState().openWorkspaceTab({
        type: 'dashboard',
        name: 'simple-dashboard',
      });
    });
    const s = useStore.getState();
    expect(s.workspaceTabs).toHaveLength(2);
    expect(s.workspaceActiveTabId).toBe('dashboard:simple-dashboard');
  });

  test('switchWorkspaceTab focuses an existing tab; no-op for unknown ids', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd2' });
      useStore.getState().switchWorkspaceTab('dashboard:d1');
    });
    expect(useStore.getState().workspaceActiveTabId).toBe('dashboard:d1');

    act(() => {
      useStore.getState().switchWorkspaceTab('dashboard:does-not-exist');
    });
    // unchanged
    expect(useStore.getState().workspaceActiveTabId).toBe('dashboard:d1');
  });

  test('closeWorkspaceTab removes the tab and reassigns focus when the active tab closes', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd2' });
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd3' });
      // d3 is now active.
      useStore.getState().closeWorkspaceTab('dashboard:d3');
    });
    const s = useStore.getState();
    expect(s.workspaceTabs.map((t) => t.id)).toEqual([
      'dashboard:d1',
      'dashboard:d2',
    ]);
    // Focus shifts left to d2.
    expect(s.workspaceActiveTabId).toBe('dashboard:d2');
  });

  test('closeWorkspaceTab leaves focus alone when closing a non-active tab', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd2' });
      useStore.getState().switchWorkspaceTab('dashboard:d1');
      useStore.getState().closeWorkspaceTab('dashboard:d2');
    });
    const s = useStore.getState();
    expect(s.workspaceTabs.map((t) => t.id)).toEqual(['dashboard:d1']);
    expect(s.workspaceActiveTabId).toBe('dashboard:d1');
  });

  test('closing the last tab clears the active id', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().closeWorkspaceTab('dashboard:d1');
    });
    const s = useStore.getState();
    expect(s.workspaceTabs).toHaveLength(0);
    expect(s.workspaceActiveTabId).toBeNull();
  });

  test('setWorkspaceTabDirty toggles the dirty flag without touching others', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd2' });
      useStore.getState().setWorkspaceTabDirty('dashboard:d2', true);
    });
    const tabs = useStore.getState().workspaceTabs;
    expect(tabs.find((t) => t.id === 'dashboard:d1').dirty).toBe(false);
    expect(tabs.find((t) => t.id === 'dashboard:d2').dirty).toBe(true);
  });

  test('rail collapse toggles flip independently', () => {
    act(() => {
      useStore.getState().toggleWorkspaceLeftCollapsed();
    });
    expect(useStore.getState().workspaceLeftCollapsed).toBe(true);
    expect(useStore.getState().workspaceRightCollapsed).toBe(false);
    act(() => {
      useStore.getState().toggleWorkspaceRightCollapsed();
    });
    expect(useStore.getState().workspaceRightCollapsed).toBe(true);
  });

  test('setWorkspaceLeftWidth clamps to [240, 480]', () => {
    act(() => useStore.getState().setWorkspaceLeftWidth(100));
    expect(useStore.getState().workspaceLeftWidth).toBe(240);
    act(() => useStore.getState().setWorkspaceLeftWidth(600));
    expect(useStore.getState().workspaceLeftWidth).toBe(480);
    act(() => useStore.getState().setWorkspaceLeftWidth(320));
    expect(useStore.getState().workspaceLeftWidth).toBe(320);
  });

  test('setWorkspaceRightWidth clamps to [280, 560]', () => {
    act(() => useStore.getState().setWorkspaceRightWidth(100));
    expect(useStore.getState().workspaceRightWidth).toBe(280);
    act(() => useStore.getState().setWorkspaceRightWidth(700));
    expect(useStore.getState().workspaceRightWidth).toBe(560);
    act(() => useStore.getState().setWorkspaceRightWidth(420));
    expect(useStore.getState().workspaceRightWidth).toBe(420);
  });

  test('setWorkspaceResizing only accepts left/right/null', () => {
    act(() => useStore.getState().setWorkspaceResizing('left'));
    expect(useStore.getState().workspaceResizing).toBe('left');
    act(() => useStore.getState().setWorkspaceResizing(null));
    expect(useStore.getState().workspaceResizing).toBeNull();
    act(() => useStore.getState().setWorkspaceResizing('right'));
    expect(useStore.getState().workspaceResizing).toBe('right');
    // Invalid values are rejected.
    act(() => useStore.getState().setWorkspaceResizing('top'));
    expect(useStore.getState().workspaceResizing).toBe('right');
  });

  test('setWorkspaceRightTab only accepts known tab keys', () => {
    act(() => {
      useStore.getState().setWorkspaceRightTab('outline');
    });
    expect(useStore.getState().workspaceRightTab).toBe('outline');
    act(() => {
      useStore.getState().setWorkspaceRightTab('not-a-tab');
    });
    // unchanged
    expect(useStore.getState().workspaceRightTab).toBe('outline');
  });

  test('setWorkspaceLens only accepts preview | lineage', () => {
    act(() => {
      useStore.getState().setWorkspaceLens('lineage');
    });
    expect(useStore.getState().workspaceLens).toBe('lineage');
    act(() => {
      useStore.getState().setWorkspaceLens('garbage');
    });
    expect(useStore.getState().workspaceLens).toBe('lineage');
  });
});
