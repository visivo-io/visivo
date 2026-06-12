/**
 * Workspace store slice — tab management (VIS-775 / Track B B2).
 *
 * The slice is consumed by the Workspace shell to drive tab state. These
 * tests pin the open/switch/close + dirty-flag behaviour so VIS-O1's
 * subsequent multi-tab work has a stable contract to build on.
 */
import { act } from '@testing-library/react';
import useStore from './store';
import { setWorkspaceTelemetryListener } from '../components/new-views/workspace/telemetry';

const reset = () => {
  act(() => {
    useStore.setState({
      workspaceTabs: [],
      workspaceActiveTabId: null,
      workspacePendingCloseTabId: null,
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

  // Background open (VIS-811 / Track O O-2) ---------------------------------

  test('openWorkspaceTabBackground adds a tab WITHOUT focusing it', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().openWorkspaceTabBackground({ type: 'chart', name: 'c1' });
    });
    const s = useStore.getState();
    expect(s.workspaceTabs.map((t) => t.id)).toEqual(['dashboard:d1', 'chart:c1']);
    // Focus and the active-object mirror are untouched.
    expect(s.workspaceActiveTabId).toBe('dashboard:d1');
    expect(s.workspaceActiveObject).toEqual({ type: 'dashboard', name: 'd1' });
  });

  test('openWorkspaceTabBackground works with no tabs open (adds without activating)', () => {
    let returned;
    act(() => {
      returned = useStore.getState().openWorkspaceTabBackground({ type: 'chart', name: 'c1' });
    });
    const s = useStore.getState();
    expect(returned).toBe('chart:c1');
    expect(s.workspaceTabs).toHaveLength(1);
    expect(s.workspaceActiveTabId).toBeNull();
  });

  test('openWorkspaceTabBackground is a no-op when the tab already exists', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'chart', name: 'c1' });
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
    });
    let returned;
    act(() => {
      returned = useStore.getState().openWorkspaceTabBackground({ type: 'chart', name: 'c1' });
    });
    const s = useStore.getState();
    expect(returned).toBe('chart:c1');
    expect(s.workspaceTabs).toHaveLength(2);
    // Existing tab keeps its position; focus untouched.
    expect(s.workspaceTabs[0].id).toBe('chart:c1');
    expect(s.workspaceActiveTabId).toBe('dashboard:d1');
  });

  test('openWorkspaceTabBackground rejects bad input', () => {
    let returned;
    act(() => {
      returned = useStore.getState().openWorkspaceTabBackground({ type: 'chart' });
    });
    expect(returned).toBeNull();
    act(() => {
      returned = useStore.getState().openWorkspaceTabBackground(null);
    });
    expect(returned).toBeNull();
    expect(useStore.getState().workspaceTabs).toHaveLength(0);
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

  // Dirty-close guard (VIS-812 / Track O O-3) --------------------------------

  test('requestCloseWorkspaceTab closes a CLEAN tab immediately', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().requestCloseWorkspaceTab('dashboard:d1');
    });
    const s = useStore.getState();
    expect(s.workspaceTabs).toHaveLength(0);
    expect(s.workspacePendingCloseTabId).toBeNull();
  });

  test('requestCloseWorkspaceTab parks a DIRTY tab for confirmation instead of closing', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().setWorkspaceTabDirty('dashboard:d1', true);
      useStore.getState().requestCloseWorkspaceTab('dashboard:d1');
    });
    const s = useStore.getState();
    expect(s.workspaceTabs).toHaveLength(1);
    expect(s.workspacePendingCloseTabId).toBe('dashboard:d1');
  });

  test('requestCloseWorkspaceTab is a no-op for unknown ids', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().requestCloseWorkspaceTab('nope:nope');
    });
    const s = useStore.getState();
    expect(s.workspaceTabs).toHaveLength(1);
    expect(s.workspacePendingCloseTabId).toBeNull();
  });

  test('confirmCloseWorkspaceTab closes the parked tab and clears the pending id', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().openWorkspaceTab({ type: 'chart', name: 'c1' });
      useStore.getState().setWorkspaceTabDirty('chart:c1', true);
      useStore.getState().requestCloseWorkspaceTab('chart:c1');
      useStore.getState().confirmCloseWorkspaceTab();
    });
    const s = useStore.getState();
    expect(s.workspaceTabs.map((t) => t.id)).toEqual(['dashboard:d1']);
    expect(s.workspacePendingCloseTabId).toBeNull();
    // Focus fell back to the surviving tab.
    expect(s.workspaceActiveTabId).toBe('dashboard:d1');
  });

  test('confirmCloseWorkspaceTab with nothing pending is a no-op', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      useStore.getState().confirmCloseWorkspaceTab();
    });
    expect(useStore.getState().workspaceTabs).toHaveLength(1);
  });

  test('cancelCloseWorkspaceTab keeps the tab open (and still dirty)', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'chart', name: 'c1' });
      useStore.getState().setWorkspaceTabDirty('chart:c1', true);
      useStore.getState().requestCloseWorkspaceTab('chart:c1');
      useStore.getState().cancelCloseWorkspaceTab();
    });
    const s = useStore.getState();
    expect(s.workspacePendingCloseTabId).toBeNull();
    expect(s.workspaceTabs).toHaveLength(1);
    expect(s.workspaceTabs[0].dirty).toBe(true);
  });

  test('closing a parked tab by another path clears the pending id', () => {
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'chart', name: 'c1' });
      useStore.getState().setWorkspaceTabDirty('chart:c1', true);
      useStore.getState().requestCloseWorkspaceTab('chart:c1');
      // Force-close (e.g. some other surface) while the dialog is up.
      useStore.getState().closeWorkspaceTab('chart:c1');
    });
    expect(useStore.getState().workspacePendingCloseTabId).toBeNull();
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

  test('reorderWorkspaceTabs moves a tab to the over slot', () => {
    act(() => {
      useStore.setState({
        workspaceTabs: [
          { id: 'a', type: 'project', name: 'a' },
          { id: 'b', type: 'dashboard', name: 'b' },
          { id: 'c', type: 'chart', name: 'c' },
        ],
      });
    });
    // Drag c onto a → [c, a, b].
    act(() => useStore.getState().reorderWorkspaceTabs('c', 'a'));
    expect(useStore.getState().workspaceTabs.map(t => t.id)).toEqual(['c', 'a', 'b']);
    // Drag a onto b → [c, b, a]. (Splice semantics: a removed, then inserted
    // at b's index — which after removal is index 1; result is [c, b, a].)
    act(() => useStore.getState().reorderWorkspaceTabs('a', 'b'));
    expect(useStore.getState().workspaceTabs.map(t => t.id)).toEqual(['c', 'b', 'a']);
    // Same-id is a no-op.
    act(() => useStore.getState().reorderWorkspaceTabs('a', 'a'));
    expect(useStore.getState().workspaceTabs.map(t => t.id)).toEqual(['c', 'b', 'a']);
    // Unknown id is a no-op.
    act(() => useStore.getState().reorderWorkspaceTabs('a', 'zzz'));
    expect(useStore.getState().workspaceTabs.map(t => t.id)).toEqual(['c', 'b', 'a']);
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

  // middle_pane_toggled telemetry (§3.4, VIS-797) ----------------------------

  test('toggling back to the canvas lens fires middle_pane_toggled with scope', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      act(() => {
        useStore.setState({
          workspaceLens: 'lineage',
          workspaceActiveObject: { type: 'dashboard', name: 'sales' },
        });
        useStore.getState().setWorkspaceLens('preview');
      });
    } finally {
      unsubscribe();
    }
    const toggled = events.filter(e => e.eventName === 'middle_pane_toggled');
    expect(toggled).toHaveLength(1);
    expect(toggled[0].payload).toEqual({
      pane: 'canvas',
      scope: 'dashboard',
      dashboardName: 'sales',
    });
  });

  test('middle_pane_toggled scope is root for the project tab and item for objects', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      act(() => {
        useStore.setState({ workspaceLens: 'lineage', workspaceActiveObject: null });
        useStore.getState().setWorkspaceLens('preview');
        useStore.setState({
          workspaceLens: 'lineage',
          workspaceActiveObject: { type: 'chart', name: 'rev' },
        });
        useStore.getState().setWorkspaceLens('preview');
      });
    } finally {
      unsubscribe();
    }
    const scopes = events
      .filter(e => e.eventName === 'middle_pane_toggled')
      .map(e => e.payload.scope);
    expect(scopes).toEqual(['root', 'item']);
  });

  test('the lineage direction does NOT emit from the store (LineageCanvas owns it)', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      act(() => {
        useStore.getState().setWorkspaceLens('lineage');
        // Re-selecting the current lens is a no-op too.
        useStore.setState({ workspaceLens: 'preview' });
        useStore.getState().setWorkspaceLens('preview');
      });
    } finally {
      unsubscribe();
    }
    expect(events.filter(e => e.eventName === 'middle_pane_toggled')).toHaveLength(0);
  });

  // Tab telemetry (VIS-810 / Track O O-1) ------------------------------------

  describe('tab telemetry', () => {
    let events;
    let unsubscribe;

    beforeEach(() => {
      events = [];
      unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
    });

    afterEach(() => {
      unsubscribe();
    });

    test('openWorkspaceTab fires tab_opened for a new tab', () => {
      act(() => {
        useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      });
      expect(events.map(e => e.eventName)).toEqual(['tab_opened']);
      expect(events[0].payload).toEqual({
        id: 'dashboard:d1',
        type: 'dashboard',
        name: 'd1',
        background: false,
      });
    });

    test('openWorkspaceTab on an already-open, non-active tab fires tab_switched (not tab_opened)', () => {
      act(() => {
        useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
        useStore.getState().openWorkspaceTab({ type: 'chart', name: 'c1' });
      });
      events.length = 0;
      act(() => {
        useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      });
      expect(events.map(e => e.eventName)).toEqual(['tab_switched']);
      expect(events[0].payload).toEqual({
        id: 'dashboard:d1',
        type: 'dashboard',
        name: 'd1',
        via: 'open',
      });
    });

    test('openWorkspaceTab on the already-active tab fires nothing', () => {
      act(() => {
        useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      });
      events.length = 0;
      act(() => {
        useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
      });
      expect(events).toHaveLength(0);
    });

    test('switchWorkspaceTab fires tab_switched only when focus actually changes', () => {
      act(() => {
        useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
        useStore.getState().openWorkspaceTab({ type: 'chart', name: 'c1' });
      });
      events.length = 0;
      act(() => {
        useStore.getState().switchWorkspaceTab('dashboard:d1');
      });
      expect(events.map(e => e.eventName)).toEqual(['tab_switched']);
      events.length = 0;
      // Already active → no event.
      act(() => {
        useStore.getState().switchWorkspaceTab('dashboard:d1');
      });
      expect(events).toHaveLength(0);
      // Unknown id → no event.
      act(() => {
        useStore.getState().switchWorkspaceTab('nope:nope');
      });
      expect(events).toHaveLength(0);
    });

    test('closeWorkspaceTab fires tab_closed with the dirty flag', () => {
      act(() => {
        useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'd1' });
        useStore.getState().setWorkspaceTabDirty('dashboard:d1', true);
      });
      events.length = 0;
      act(() => {
        useStore.getState().closeWorkspaceTab('dashboard:d1');
      });
      expect(events.map(e => e.eventName)).toEqual(['tab_closed']);
      expect(events[0].payload).toEqual({
        id: 'dashboard:d1',
        type: 'dashboard',
        name: 'd1',
        dirty: true,
      });
    });

    test('closeWorkspaceTab on an unknown id fires nothing', () => {
      act(() => {
        useStore.getState().closeWorkspaceTab('nope:nope');
      });
      expect(events).toHaveLength(0);
    });

    test('openWorkspaceTabBackground fires tab_opened with background: true', () => {
      act(() => {
        useStore.getState().openWorkspaceTabBackground({ type: 'chart', name: 'c1' });
      });
      expect(events.map(e => e.eventName)).toEqual(['tab_opened']);
      expect(events[0].payload).toEqual({
        id: 'chart:c1',
        type: 'chart',
        name: 'c1',
        background: true,
      });
      events.length = 0;
      // Already open → no duplicate event.
      act(() => {
        useStore.getState().openWorkspaceTabBackground({ type: 'chart', name: 'c1' });
      });
      expect(events).toHaveLength(0);
    });
  });

  test('workspaceLensIntent: set, validate, and clear (VIS-779)', () => {
    act(() => {
      useStore.getState().setWorkspaceLensIntent({ objectKey: 'chart:rev', lens: 'lineage' });
    });
    expect(useStore.getState().workspaceLensIntent).toEqual({
      objectKey: 'chart:rev',
      lens: 'lineage',
    });
    // Invalid shapes are rejected without clobbering the current intent.
    act(() => {
      useStore.getState().setWorkspaceLensIntent({ lens: 'lineage' });
      useStore.getState().setWorkspaceLensIntent({ objectKey: 'chart:rev', lens: 'nope' });
    });
    expect(useStore.getState().workspaceLensIntent).toEqual({
      objectKey: 'chart:rev',
      lens: 'lineage',
    });
    act(() => {
      useStore.getState().clearWorkspaceLensIntent();
    });
    expect(useStore.getState().workspaceLensIntent).toBeNull();
  });

  // Outline tree (VIS-793 / Track F F-3) ------------------------------------

  test('setWorkspaceOutlineSelectedKey updates the selection key', () => {
    act(() => {
      useStore.getState().setWorkspaceOutlineSelectedKey('row.2.item.0');
    });
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.2.item.0');
    // Falsy / non-string inputs are ignored.
    act(() => {
      useStore.getState().setWorkspaceOutlineSelectedKey('');
    });
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.2.item.0');
  });

  test('addDashboardRow appends an empty row, selects it, and persists the draft', () => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    act(() => {
      useStore.setState({
        dashboards: [
          { name: 'd1', config: { name: 'd1', rows: [{ height: 'small', items: [] }] } },
        ],
        saveDashboard,
      });
    });

    let returned;
    act(() => {
      returned = useStore.getState().addDashboardRow('d1');
    });

    const dash = useStore.getState().dashboards.find((d) => d.name === 'd1');
    expect(dash.config.rows).toHaveLength(2);
    expect(dash.config.rows[1]).toEqual({ height: 'medium', items: [] });
    expect(returned).toBe(1);
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.1');
    expect(saveDashboard).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ rows: expect.any(Array) })
    );
  });

  test('addDashboardRow is a no-op for an unknown dashboard', () => {
    act(() => {
      useStore.setState({ dashboards: [], saveDashboard: jest.fn() });
    });
    let returned;
    act(() => {
      returned = useStore.getState().addDashboardRow('missing');
    });
    expect(returned).toBeNull();
    expect(useStore.getState().saveDashboard).not.toHaveBeenCalled();
  });

  test('updateDashboardConfigOptimistic replaces the draft config without saving (VIS-802)', () => {
    const saveDashboard = jest.fn();
    act(() => {
      useStore.setState({
        dashboards: [{ name: 'd1', config: { name: 'd1', rows: [] } }],
        saveDashboard,
      });
    });

    const nextConfig = { name: 'd1', rows: [{ height: 'large', items: [] }] };
    let returned;
    act(() => {
      returned = useStore.getState().updateDashboardConfigOptimistic('d1', nextConfig);
    });

    expect(returned).toBe(true);
    const dash = useStore.getState().dashboards.find((d) => d.name === 'd1');
    expect(dash.config.rows[0].height).toBe('large');
    // It only mutates the in-memory list — never persists.
    expect(saveDashboard).not.toHaveBeenCalled();
  });

  test('updateDashboardConfigOptimistic is a no-op for an unknown dashboard (VIS-802)', () => {
    act(() => {
      useStore.setState({ dashboards: [] });
    });
    let returned;
    act(() => {
      returned = useStore.getState().updateDashboardConfigOptimistic('missing', { rows: [] });
    });
    expect(returned).toBe(false);
  });
});
