/**
 * LineageCanvas behaviour (VIS-E1 / VIS-779 / Track E).
 *
 * LineageCanvas is the thin wrapper that mounts the existing <LineageNew> DAG
 * in the Workspace middle pane's lineage lens. These tests pin:
 *   - selector derivation from the workspace scope (`*`, `+dashboard`, `+item`),
 *   - the "Show full project" reset widening scope back to `*`,
 *   - selection round-trip (node click → openWorkspaceTab),
 *   - the `middle_pane_toggled` telemetry event firing on lineage entry,
 *   - the manual selector input inside LineageNew remaining functional.
 *
 * <LineageNew> is mocked to a lightweight stub that surfaces the props the
 * wrapper passes (scopeSelector / onNodeSelect / headerSlot) so we can assert
 * the contract without standing up React Flow.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LineageCanvas from './LineageCanvas';
import useStore from '../../../stores/store';
import { setWorkspaceTelemetryListener } from '../workspace/telemetry';
import { useWorkspaceScope } from '../workspace/useWorkspaceScope';

// Mock the scope hook — each test sets the return value it needs.
jest.mock('../workspace/useWorkspaceScope', () => ({
  useWorkspaceScope: jest.fn(),
}));

// Mock LineageNew with a stub that echoes the props we care about and lets us
// drive the node-select round-trip + the manual selector input.
jest.mock('./LineageNew', () => {
  const MockLineageNew = ({ scopeSelector, onNodeSelect, headerSlot }) => {
    const React = require('react');
    const [manual, setManual] = React.useState(scopeSelector || '');
    React.useEffect(() => {
      setManual(scopeSelector || '');
    }, [scopeSelector]);
    return (
      <div data-testid="lineage-new">
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
      </div>
    );
  };
  MockLineageNew.displayName = 'MockLineageNew';
  return { __esModule: true, default: MockLineageNew };
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

  test('manual selector input inside LineageNew still works as an override', () => {
    setScope(DASHBOARD);
    render(<LineageCanvas />);

    const input = screen.getByTestId('manual-selector');
    expect(input).toHaveValue('+sales');

    fireEvent.change(input, { target: { value: '+custom_model+' } });
    expect(input).toHaveValue('+custom_model+');
  });
});
