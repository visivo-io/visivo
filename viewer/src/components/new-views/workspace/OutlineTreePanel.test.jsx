/**
 * OutlineTreePanel tests (VIS-793 / Track F F-3).
 *
 * The panel renders the scoped dashboard as a `dashboard → row → item` tree,
 * dispatches selection to the workspace store on click, appends rows via the
 * draft cache, and surfaces empty / no-dashboard states. Scope is derived
 * from `useWorkspaceScope`, which reads the `:dashboardName` route param, so
 * tests mount inside a memory router at the scoped path.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import {
  createMemoryRouter,
  Route,
  createRoutesFromElements,
  RouterProvider,
} from 'react-router-dom';
import { futureFlags } from '../../../router-config';
import OutlineTreePanel from './OutlineTreePanel';
import useStore from '../../../stores/store';

const DASH = 'simple-dashboard';

// Build a context-string ref ("${ref(name)}") without a literal template
// expression, which the lint rule (no-template-curly-in-string) flags.
const ref = name => '${ref(' + name + ')}';

const makeDashboard = (rows) => ({
  name: DASH,
  config: { name: DASH, rows },
});

const resetStore = (rows) => {
  act(() => {
    useStore.setState({
      dashboards: rows === undefined ? [] : [makeDashboard(rows)],
      workspaceOutlineSelectedKey: 'dashboard',
      saveDashboard: jest.fn(() => Promise.resolve({ success: true })),
    });
  });
};

const renderPanel = (entry = `/workspace/dashboard/${DASH}`) => {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route path="/workspace" element={<OutlineTreePanel />} />
        <Route
          path="/workspace/dashboard/:dashboardName"
          element={<OutlineTreePanel />}
        />
      </>
    ),
    { initialEntries: [entry], future: futureFlags }
  );
  return render(<RouterProvider router={router} future={futureFlags} />);
};

describe('OutlineTreePanel', () => {
  test('renders dashboard → row → item tree from the store', () => {
    resetStore([
      { height: 'medium', items: [{ chart: ref('revenue_chart'), width: 2 }] },
      { height: 'small', items: [{ table: 'sales_table', width: 1 }, { markdown: 'note', width: 1 }] },
    ]);
    renderPanel();

    // Dashboard root with row count.
    const root = screen.getByTestId('outline-tree-node-dashboard');
    expect(root).toHaveTextContent(DASH);
    expect(root).toHaveTextContent('2 rows');

    // Rows.
    expect(screen.getByTestId('outline-tree-node-row.0')).toBeInTheDocument();
    expect(screen.getByTestId('outline-tree-node-row.1')).toBeInTheDocument();

    // Items — labels resolved from ref strings / bare names.
    expect(screen.getByTestId('outline-tree-node-row.0.item.0')).toHaveTextContent(
      'revenue_chart'
    );
    expect(screen.getByTestId('outline-tree-node-row.1.item.0')).toHaveTextContent(
      'sales_table'
    );
    expect(screen.getByTestId('outline-tree-node-row.1.item.1')).toHaveTextContent(
      'note'
    );
  });

  test('clicking a node updates workspace selection in the store', () => {
    resetStore([{ height: 'medium', items: [{ chart: 'c1', width: 1 }] }]);
    renderPanel();

    fireEvent.click(screen.getByTestId('outline-tree-node-row.0.item.0'));
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.0.item.0');

    fireEvent.click(screen.getByTestId('outline-tree-node-row.0'));
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.0');
  });

  test('selected node carries the mulberry selection flag', () => {
    resetStore([{ height: 'medium', items: [] }]);
    act(() => {
      useStore.setState({ workspaceOutlineSelectedKey: 'row.0' });
    });
    renderPanel();
    expect(screen.getByTestId('outline-tree-node-row.0')).toHaveAttribute(
      'data-selected',
      'true'
    );
    expect(screen.getByTestId('outline-tree-node-dashboard')).toHaveAttribute(
      'data-selected',
      'false'
    );
  });

  test('"Add row" appends a row to the dashboard draft and persists it', () => {
    resetStore([{ height: 'medium', items: [{ chart: 'c1', width: 1 }] }]);
    renderPanel();

    fireEvent.click(screen.getByTestId('outline-tree-add-row'));

    const dash = useStore.getState().dashboards.find((d) => d.name === DASH);
    expect(dash.config.rows).toHaveLength(2);
    expect(dash.config.rows[1]).toEqual({ height: 'medium', items: [] });
    // New row gets selected.
    expect(useStore.getState().workspaceOutlineSelectedKey).toBe('row.1');
    // Draft persisted via the dashboard cache.
    expect(useStore.getState().saveDashboard).toHaveBeenCalledWith(
      DASH,
      expect.objectContaining({ rows: expect.any(Array) })
    );
  });

  test('empty state renders when the dashboard has no rows', () => {
    resetStore([]);
    renderPanel();
    expect(screen.getByTestId('outline-tree-empty')).toBeInTheDocument();
    expect(screen.getByTestId('outline-tree-empty')).toHaveTextContent(
      'No rows yet.'
    );
    expect(screen.getByTestId('outline-tree-empty')).toHaveTextContent('Add row');
  });

  test('empty-state "Add row" button appends a row', () => {
    resetStore([]);
    renderPanel();
    fireEvent.click(screen.getByTestId('outline-tree-add-row-empty'));
    const dash = useStore.getState().dashboards.find((d) => d.name === DASH);
    expect(dash.config.rows).toHaveLength(1);
  });

  test('no-dashboard state renders when scope is unscoped', () => {
    resetStore([]);
    renderPanel('/workspace');
    expect(screen.getByTestId('outline-tree-no-dashboard')).toBeInTheDocument();
  });
});
