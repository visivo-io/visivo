/**
 * Library behaviour (VIS-769 + VIS-773 + VIS-776 / Track C C1 + C2 + C3).
 *
 * Mounts the full Library inside a router + dnd-kit context. Pins the C-1
 * two-section design:
 *   - Exactly two sections: Layout Items + Data Layer.
 *   - Per-type subsections (Charts/Tables/Markdowns/Inputs under Layout
 *     Items; Sources/Models/Dimensions/Metrics/Relations/Insights under
 *     Data Layer).
 *   - Drag handles on Layout-Items rows; none on Data-Layer rows.
 *   - "+ New X" buttons only on the four droppable Layout subsections.
 *   - Row click delegates to `openWorkspaceTab`.
 *   - "+ New X" delegates to the corresponding store opener + telemetry.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  createMemoryRouter,
  Route,
  createRoutesFromElements,
  RouterProvider,
} from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { futureFlags } from '../../../../router-config';
import Library from './Library';
import useStore from '../../../../stores/store';
import { setWorkspaceTelemetryListener } from '../telemetry';

const renderLibrary = (entry = '/workspace') => {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route path="/workspace" element={<DndContext><Library /></DndContext>} />
        <Route
          path="/workspace/dashboard/:dashboardName"
          element={<DndContext><Library /></DndContext>}
        />
      </>
    ),
    { initialEntries: [entry], future: futureFlags }
  );
  return render(<RouterProvider router={router} future={futureFlags} />);
};

// Subsections default to COLLAPSED (VIS-828). The behavioural tests below
// exercise rows / create buttons / drag handles that only render when a
// subsection is expanded, so seed every type with an explicit `false`
// (expanded). A dedicated test asserts the collapsed-by-default behaviour
// with an empty `libraryCollapsedSubsections` map.
const ALL_EXPANDED = [
  'chart',
  'table',
  'markdown',
  'input',
  'dashboard',
  'source',
  'model',
  'dimension',
  'metric',
  'relation',
  'insight',
].reduce((acc, t) => ({ ...acc, [t]: false }), {});

const seedStore = (extra = {}) => {
  act(() => {
    useStore.setState({
      // Default no row selected — tests that need a selection override this.
      workspaceActiveTabId: null,
      // Reset Library collapse prefs so tests don't bleed into one another.
      libraryCollapsedSections: {},
      libraryCollapsedSubsections: { ...ALL_EXPANDED },
      // Layout-item collections.
      charts: [{ name: 'waterfall' }, { name: 'fibonacci_chart' }],
      tables: [{ name: 'revenue_rows' }],
      markdowns: [{ name: 'project_notes' }],
      inputs: [{ name: 'date_range' }],
      dashboards: [{ name: 'overview' }],
      // Data-layer collections.
      sources: [{ name: 'local-duck', type: 'duckdb' }],
      models: [{ name: 'monthly_revenue' }],
      csvScriptModels: [],
      localMergeModels: [],
      dimensions: [{ name: 'period' }],
      metrics: [{ name: 'revenue' }],
      relations: [{ name: 'customers_orders' }],
      insights: [{ name: 'revenue_growth' }],
      // Stub the workspace tab action so the test can assert on calls.
      openWorkspaceTab: jest.fn(),
      // Stub create-modal openers so handleCreate doesn't throw.
      openCreateChartModal: jest.fn(),
      openCreateTableModal: jest.fn(),
      openCreateMarkdownModal: jest.fn(),
      openCreateInputModal: jest.fn(),
      ...extra,
    });
  });
};

describe('Library', () => {
  beforeEach(() => {
    seedStore();
  });

  test('renders exactly the two sections — Layout Items and Data Layer', () => {
    renderLibrary();
    expect(screen.getByTestId('library-section-layout')).toBeInTheDocument();
    expect(screen.getByTestId('library-section-data')).toBeInTheDocument();
    expect(screen.getByTestId('library-section-layout-header')).toHaveTextContent(
      'Layout Items'
    );
    expect(screen.getByTestId('library-section-data-header')).toHaveTextContent('Data Layer');
    // No legacy "Insert" section.
    expect(screen.queryByTestId('library-section-insert')).not.toBeInTheDocument();
  });

  test('section counts sum the per-type collections', () => {
    renderLibrary();
    // Layout: 2 charts + 1 table + 1 markdown + 1 input + 1 dashboard = 6.
    expect(screen.getByTestId('library-section-layout-count')).toHaveTextContent('(6)');
    // Data: 1 source + 1 model + 1 dimension + 1 metric + 1 relation + 1 insight = 6.
    expect(screen.getByTestId('library-section-data-count')).toHaveTextContent('(6)');
  });

  test('renders the five Layout-Item subsections and the six Data-Layer subsections', () => {
    renderLibrary();
    ['chart', 'table', 'markdown', 'input', 'dashboard'].forEach(t => {
      expect(screen.getByTestId(`library-subsection-${t}`)).toBeInTheDocument();
    });
    ['source', 'model', 'dimension', 'metric', 'relation', 'insight'].forEach(t => {
      expect(screen.getByTestId(`library-subsection-${t}`)).toBeInTheDocument();
    });
  });

  test('per-type subsections default to collapsed; sections stay expanded (VIS-828)', () => {
    // Empty subsection prefs = no saved deviations = collapsed by default.
    seedStore({ libraryCollapsedSubsections: {} });
    renderLibrary();

    // Both top sections stay expanded so their toolbars + subsection headers
    // are visible.
    expect(screen.getByTestId('library-section-layout')).toHaveAttribute(
      'data-collapsed',
      'false'
    );
    expect(screen.getByTestId('library-section-data')).toHaveAttribute('data-collapsed', 'false');

    // Every per-type subsection renders collapsed: header + count visible,
    // body (rows / empty placeholder / create button) hidden.
    ['chart', 'table', 'markdown', 'input', 'dashboard'].forEach(t => {
      expect(screen.getByTestId(`library-subsection-${t}`)).toHaveAttribute(
        'data-collapsed',
        'true'
      );
      expect(screen.getByTestId(`library-subsection-${t}-header`)).toBeInTheDocument();
      expect(screen.queryByTestId(`library-subsection-${t}-body`)).not.toBeInTheDocument();
    });
    ['source', 'model', 'dimension', 'metric', 'relation', 'insight'].forEach(t => {
      expect(screen.getByTestId(`library-subsection-${t}`)).toHaveAttribute(
        'data-collapsed',
        'true'
      );
    });

    // No item rows or inline create buttons are rendered while collapsed.
    expect(screen.queryByTestId('library-row-chart-waterfall')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-subsection-chart-create')).not.toBeInTheDocument();
  });

  test('an explicitly-expanded subsection stays expanded across the default-collapsed siblings (VIS-828)', () => {
    seedStore({ libraryCollapsedSubsections: { chart: false } });
    renderLibrary();
    // The user-expanded chart subsection shows its rows...
    expect(screen.getByTestId('library-subsection-chart')).toHaveAttribute(
      'data-collapsed',
      'false'
    );
    expect(screen.getByTestId('library-row-chart-waterfall')).toBeInTheDocument();
    // ...while a sibling with no saved pref stays collapsed.
    expect(screen.getByTestId('library-subsection-table')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
    expect(screen.queryByTestId('library-row-table-revenue_rows')).not.toBeInTheDocument();
  });

  test('"+ New X" buttons appear only on the four droppable Layout subsections', () => {
    renderLibrary();
    expect(screen.getByTestId('library-subsection-chart-create')).toHaveTextContent('New Chart');
    expect(screen.getByTestId('library-subsection-table-create')).toHaveTextContent('New Table');
    expect(screen.getByTestId('library-subsection-markdown-create')).toHaveTextContent(
      'New Markdown'
    );
    expect(screen.getByTestId('library-subsection-input-create')).toHaveTextContent('New Input');
    // Dashboards live in Layout Items but are not droppable — no inline create.
    expect(screen.queryByTestId('library-subsection-dashboard-create')).not.toBeInTheDocument();
    // Data-layer subsections have no inline create button.
    ['source', 'model', 'dimension', 'metric', 'relation', 'insight'].forEach(t => {
      expect(screen.queryByTestId(`library-subsection-${t}-create`)).not.toBeInTheDocument();
    });
  });

  test('Layout-Items rows expose drag handles; Data-Layer rows do not', () => {
    renderLibrary();
    fireEvent.mouseEnter(screen.getByTestId('library-row-chart-waterfall'));
    expect(screen.getByTestId('library-row-chart-waterfall-drag-handle')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('library-row-table-revenue_rows'));
    expect(screen.getByTestId('library-row-table-revenue_rows-drag-handle')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('library-row-model-monthly_revenue'));
    expect(
      screen.queryByTestId('library-row-model-monthly_revenue-drag-handle')
    ).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('library-row-source-local-duck'));
    expect(
      screen.queryByTestId('library-row-source-local-duck-drag-handle')
    ).not.toBeInTheDocument();
  });

  test('clicking a chart row delegates to openWorkspaceTab', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-row-chart-waterfall'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'chart:waterfall',
      type: 'chart',
      name: 'waterfall',
    });
  });

  test('clicking a Data-Layer row also delegates to openWorkspaceTab', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-row-source-local-duck'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'source:local-duck',
      type: 'source',
      name: 'local-duck',
    });
  });

  test('clicking a dashboard row scopes the workspace to that dashboard (VIS-824)', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-row-dashboard-overview'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'dashboard:overview',
      type: 'dashboard',
      name: 'overview',
    });
  });

  test('dashboard rows are not droppable drag sources (VIS-824)', () => {
    renderLibrary();
    fireEvent.mouseEnter(screen.getByTestId('library-row-dashboard-overview'));
    expect(
      screen.queryByTestId('library-row-dashboard-overview-drag-handle')
    ).not.toBeInTheDocument();
  });

  test('"+ New Chart" calls the chart create-modal opener', () => {
    const openCreateChartModal = jest.fn();
    seedStore({ openCreateChartModal });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-subsection-chart-create'));
    expect(openCreateChartModal).toHaveBeenCalledTimes(1);
  });

  test('"+ New Table" calls the table create-modal opener', () => {
    const openCreateTableModal = jest.fn();
    seedStore({ openCreateTableModal });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-subsection-table-create'));
    expect(openCreateTableModal).toHaveBeenCalledTimes(1);
  });

  test('shows the empty placeholder when a subsection has no rows', () => {
    seedStore({ charts: [], models: [], csvScriptModels: [], localMergeModels: [] });
    renderLibrary();
    expect(screen.getByTestId('library-subsection-chart-empty')).toHaveTextContent(
      'No charts yet'
    );
    expect(screen.getByTestId('library-subsection-model-empty')).toHaveTextContent(
      'No models yet'
    );
  });

  test('fires the inline_create_used telemetry event when "+ New X" is clicked', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(evt => events.push(evt));
    try {
      renderLibrary();
      fireEvent.click(screen.getByTestId('library-subsection-chart-create'));
      const created = events.filter(e => e.eventName === 'inline_create_used');
      expect(created).toHaveLength(1);
      expect(created[0].payload).toEqual({ source: 'library', kind: 'chart' });
    } finally {
      unsubscribe();
    }
  });

  test('the type-filter chip narrows a section to a single subsection', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-filter-chip-layout-table'));
    expect(screen.getByTestId('library-subsection-table')).toBeInTheDocument();
    expect(screen.queryByTestId('library-subsection-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-subsection-markdown')).not.toBeInTheDocument();
  });

  test('highlights the row corresponding to the active workspace tab', () => {
    // Regression: Library never threaded selectedRowId into its sections, so
    // the selected row had no visual highlight even though LibraryRow already
    // wired the mulberry-bar + tinted-bg styles. Library now reads
    // workspaceActiveTabId from the store and passes it down.
    seedStore({ workspaceActiveTabId: 'chart:waterfall' });
    renderLibrary();
    expect(screen.getByTestId('library-row-chart-waterfall')).toHaveAttribute(
      'data-selected',
      'true'
    );
    expect(screen.getByTestId('library-row-table-revenue_rows')).toHaveAttribute(
      'data-selected',
      'false'
    );
  });

});
