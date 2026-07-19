/**
 * LineageCanvas behaviour (VIS-E1 / VIS-779 / Track E).
 *
 * LineageCanvas is the thin wrapper that mounts the existing <Lineage> DAG
 * in the Workspace middle pane's lineage lens. These tests pin:
 *   - selector derivation from the workspace scope (`*`, `+dashboard`, `+item`),
 *   - the "Show full project" reset widening scope back to `*`,
 *   - selection round-trip (node click → openWorkspaceTab),
 *   - the `middle_pane_toggled` telemetry event firing on lineage entry,
 *   - the manual selector input inside Lineage remaining functional.
 *
 * <Lineage> is mocked to a lightweight stub that surfaces the props the
 * wrapper passes (scopeSelector / onNodeSelect / headerSlot) so we can assert
 * the contract without standing up React Flow.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import LineageCanvas from './LineageCanvas';
import useStore from '../../../stores/store';
import { setWorkspaceTelemetryListener } from '../workspace/telemetry';
import { useWorkspaceScope } from '../workspace/useWorkspaceScope';

// Mock the scope hook — each test sets the return value it needs.
jest.mock('../workspace/useWorkspaceScope', () => ({
  useWorkspaceScope: jest.fn(),
}));

// Mock Lineage with a stub that echoes the props we care about and lets us
// drive the node-select round-trip + the manual selector input.
jest.mock('./Lineage', () => {
  const MockLineage = ({ scopeSelector, onNodeSelect, onNodeContextMenu, headerSlot }) => {
    const React = require('react');
    const [manual, setManual] = React.useState(scopeSelector || '');
    React.useEffect(() => {
      setManual(scopeSelector || '');
    }, [scopeSelector]);
    return (
      <div data-testid="lineage">
        {headerSlot}
        <div data-testid="scope-selector-prop">{scopeSelector}</div>
        <input
          data-testid="manual-selector"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button
          data-testid="simulate-node-click"
          onClick={() => onNodeSelect && onNodeSelect({ type: 'model', name: 'monthly_revenue' })}
        >
          click node
        </button>
        <button
          data-testid="simulate-node-contextmenu"
          onClick={(e) =>
            onNodeContextMenu && onNodeContextMenu(e, { type: 'model', name: 'monthly_revenue' })
          }
        >
          right-click node
        </button>
        <button
          data-testid="simulate-node-contextmenu-insight"
          onClick={(e) =>
            onNodeContextMenu && onNodeContextMenu(e, { type: 'insight', name: 'revenue_growth' })
          }
        >
          right-click insight node
        </button>
      </div>
    );
  };
  MockLineage.displayName = 'MockLineage';
  return { __esModule: true, default: MockLineage };
});

const ROOT = { scope: 'root', selector: '*', dashboardName: null, selectedItem: null };
const DASHBOARD = {
  scope: 'dashboard',
  selector: '+sales',
  dashboardName: 'sales',
  selectedItem: { type: 'dashboard', name: 'sales' },
};
const ITEM = {
  scope: 'item',
  selector: '+revenue_chart',
  dashboardName: null,
  selectedItem: { type: 'chart', name: 'revenue_chart' },
};

const setScope = (scope) => useWorkspaceScope.mockReturnValue(scope);

beforeEach(() => {
  setScope(ROOT);
  act(() => {
    useStore.setState({
      workspaceTabs: [],
      workspaceActiveTabId: null,
      workspaceActiveObject: null,
    });
  });
});

afterEach(() => {
  jest.clearAllMocks();
  setWorkspaceTelemetryListener(null);
});

describe('LineageCanvas', () => {
  test('passes `*` selector for unscoped (root) scope and hides reset', () => {
    setScope(ROOT);
    render(<LineageCanvas />);
    expect(screen.getByTestId('scope-selector-prop')).toHaveTextContent('*');
    expect(screen.queryByTestId('lineage-canvas-reset-scope')).not.toBeInTheDocument();
    expect(screen.getByTestId('lineage-canvas-scope-pill')).toHaveTextContent('Full project');
  });

  test('passes `+<dashboardName>` for dashboard scope', () => {
    setScope(DASHBOARD);
    render(<LineageCanvas />);
    expect(screen.getByTestId('scope-selector-prop')).toHaveTextContent('+sales');
    expect(screen.getByTestId('lineage-canvas-scope-pill')).toHaveTextContent('sales');
    expect(screen.getByTestId('lineage-canvas-reset-scope')).toBeInTheDocument();
  });

  test('passes `+<itemName>` for item scope', () => {
    setScope(ITEM);
    render(<LineageCanvas />);
    expect(screen.getByTestId('scope-selector-prop')).toHaveTextContent('+revenue_chart');
    expect(screen.getByTestId('lineage-canvas-scope-pill')).toHaveTextContent('revenue_chart');
  });

  test('"Show full project" widens the scope back to `*` without changing route', () => {
    setScope(DASHBOARD);
    render(<LineageCanvas />);
    expect(screen.getByTestId('scope-selector-prop')).toHaveTextContent('+sales');

    fireEvent.click(screen.getByTestId('lineage-canvas-reset-scope'));

    expect(screen.getByTestId('scope-selector-prop')).toHaveTextContent('*');
    // The reset button disappears once we're showing the full project.
    expect(screen.queryByTestId('lineage-canvas-reset-scope')).not.toBeInTheDocument();
  });

  test('clicking a node round-trips selection into the workspace store', () => {
    setScope(DASHBOARD);
    render(<LineageCanvas />);

    fireEvent.click(screen.getByTestId('simulate-node-click'));

    const state = useStore.getState();
    expect(state.workspaceActiveObject).toEqual({ type: 'model', name: 'monthly_revenue' });
    expect(state.workspaceActiveTabId).toBe('model:monthly_revenue');
  });

  test('clicking a node requests the Lineage lens for the selected object (VIS-779 Step 4)', () => {
    setScope(DASHBOARD);
    render(<LineageCanvas />);

    fireEvent.click(screen.getByTestId('simulate-node-click'));

    expect(useStore.getState().workspaceLensIntent).toEqual({
      objectKey: 'model:monthly_revenue',
      lens: 'lineage',
    });
  });

  test('fires middle_pane_toggled telemetry on lineage entry', () => {
    setScope(DASHBOARD);
    const events = [];
    setWorkspaceTelemetryListener((e) => events.push(e));

    render(<LineageCanvas />);

    const toggled = events.find((e) => e.eventName === 'middle_pane_toggled');
    expect(toggled).toBeTruthy();
    expect(toggled.payload).toMatchObject({
      pane: 'lineage',
      scope: 'dashboard',
      dashboardName: 'sales',
    });
  });

  // Right-click context menu (VIS-811 / Track O O-2) -------------------------

  test('right-clicking a node opens the Open / Open in new tab menu', () => {
    setScope(DASHBOARD);
    render(<LineageCanvas />);
    fireEvent.click(screen.getByTestId('simulate-node-contextmenu'));
    expect(screen.getByTestId('lineage-node-ctx-menu')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-node-ctx-open')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-node-ctx-open-new-tab')).toBeInTheDocument();
  });

  test('context-menu "Open" focuses the object tab (replaces context) and dismisses', () => {
    setScope(DASHBOARD);
    render(<LineageCanvas />);
    fireEvent.click(screen.getByTestId('simulate-node-contextmenu'));
    fireEvent.click(screen.getByTestId('lineage-node-ctx-open'));

    const state = useStore.getState();
    expect(state.workspaceActiveTabId).toBe('model:monthly_revenue');
    expect(state.workspaceActiveObject).toEqual({ type: 'model', name: 'monthly_revenue' });
    expect(screen.queryByTestId('lineage-node-ctx-menu')).not.toBeInTheDocument();
  });

  test('context-menu "Open in new tab" background-opens without stealing focus', () => {
    setScope(DASHBOARD);
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'dashboard', name: 'sales' });
    });
    render(<LineageCanvas />);
    fireEvent.click(screen.getByTestId('simulate-node-contextmenu'));
    fireEvent.click(screen.getByTestId('lineage-node-ctx-open-new-tab'));

    const state = useStore.getState();
    expect(state.workspaceTabs.map((t) => t.id)).toEqual([
      'dashboard:sales',
      'model:monthly_revenue',
    ]);
    // Focus is untouched — the dashboard tab stays active.
    expect(state.workspaceActiveTabId).toBe('dashboard:sales');
    expect(screen.queryByTestId('lineage-node-ctx-menu')).not.toBeInTheDocument();
  });

  test('the node context menu dismisses on Escape without opening anything', () => {
    setScope(DASHBOARD);
    render(<LineageCanvas />);
    fireEvent.click(screen.getByTestId('simulate-node-contextmenu'));
    expect(screen.getByTestId('lineage-node-ctx-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('lineage-node-ctx-menu')).not.toBeInTheDocument();
    expect(useStore.getState().workspaceTabs).toHaveLength(0);
  });

  // VIS-1067 — "Explore this" / "Add to exploration" from a DAG node.
  describe('Explore this / Add to exploration', () => {
    test('"Explore this" renders for a model node, mints a pre-wired exploration, and opens its tab', async () => {
      const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_new' });
      const buildExplorationSeedState = jest.fn().mockReturnValue({ modelTabs: ['query_1'] });
      setScope(DASHBOARD);
      act(() => {
        useStore.setState({ createExploration, buildExplorationSeedState });
      });
      render(<LineageCanvas />);
      fireEvent.click(screen.getByTestId('simulate-node-contextmenu'));
      const exploreThis = screen.getByTestId('lineage-node-ctx-explore-this');
      fireEvent.click(exploreThis);

      expect(buildExplorationSeedState).toHaveBeenCalledWith({
        type: 'model',
        name: 'monthly_revenue',
      });
      await waitFor(() =>
        expect(createExploration).toHaveBeenCalledWith(
          { type: 'model', name: 'monthly_revenue' },
          null,
          { modelTabs: ['query_1'] }
        )
      );
      await waitFor(() => {
        expect(useStore.getState().workspaceActiveTabId).toBe('exploration:exp_new');
      });
      expect(screen.queryByTestId('lineage-node-ctx-menu')).not.toBeInTheDocument();
    });

    test('"Add to exploration" never renders for a model node (model is not an EXPLORATION_DRAG_TYPE), even with an exploration active', () => {
      setScope(DASHBOARD);
      act(() => {
        useStore.setState({ workspaceActiveObject: { type: 'exploration', name: 'exp_1' } });
      });
      render(<LineageCanvas />);
      fireEvent.click(screen.getByTestId('simulate-node-contextmenu'));
      expect(screen.queryByTestId('lineage-node-ctx-add-to-exploration')).not.toBeInTheDocument();
    });

    test('"Add to exploration" renders for an insight node ONLY when an exploration tab is active, and calls addObjectToActiveExploration', () => {
      const addObjectToActiveExploration = jest.fn();
      setScope(DASHBOARD);
      act(() => {
        useStore.setState({ addObjectToActiveExploration, workspaceActiveObject: null });
      });
      render(<LineageCanvas />);
      fireEvent.click(screen.getByTestId('simulate-node-contextmenu-insight'));
      expect(screen.queryByTestId('lineage-node-ctx-add-to-exploration')).not.toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });

      act(() => {
        useStore.setState({ workspaceActiveObject: { type: 'exploration', name: 'exp_1' } });
      });
      fireEvent.click(screen.getByTestId('simulate-node-contextmenu-insight'));
      const addToExploration = screen.getByTestId('lineage-node-ctx-add-to-exploration');
      fireEvent.click(addToExploration);
      expect(addObjectToActiveExploration).toHaveBeenCalledWith({
        type: 'insight',
        name: 'revenue_growth',
      });
    });
  });

  test('manual selector input inside Lineage still works as an override', () => {
    setScope(DASHBOARD);
    render(<LineageCanvas />);

    const input = screen.getByTestId('manual-selector');
    expect(input).toHaveValue('+sales');

    fireEvent.change(input, { target: { value: '+custom_model+' } });
    expect(input).toHaveValue('+custom_model+');
  });
});
