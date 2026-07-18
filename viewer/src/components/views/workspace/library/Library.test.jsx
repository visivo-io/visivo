/**
 * Library behaviour (VIS-769 + VIS-773 + VIS-776 / Track C C1 + C2 + C3).
 *
 * Mounts the full Library inside a router + dnd-kit context. Pins the flat
 * single-list design (workspace-tweaks):
 *   - ONE shared search input + a compact filter DROPDOWN (group + type
 *     options, additive multi-select, selected values shown as removable
 *     chips) at the top; no per-section search boxes or stacked section
 *     headers.
 *   - Per-type subsections (Charts/Tables/Markdowns/Inputs/Dashboards for the
 *     Layout group; Sources/Models/Dimensions/Metrics/Relations/Insights for
 *     the Data group) rendered flat, filtered by the pills + search.
 *   - Drag handles on Layout-Items rows; none on Data-Layer rows.
 *   - No inline "+ New X" CTAs — creation is via the header "+ New" menu,
 *     grouped like the sidebar (Layout Items · Data Layer) and including
 *     Relation (which opens the Semantic Layer).
 *   - Row click delegates to `openWorkspaceTab`.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
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

// Renders the current URL so navigation assertions (J-2 overlay) can read it.
const LocationProbe = () => {
  const { useLocation } = jest.requireActual('react-router-dom');
  const loc = useLocation();
  return <div data-testid="location-probe">{loc.pathname + loc.search}</div>;
};

const renderLibrary = (entry = '/workspace') => {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route
          path="/workspace"
          element={<DndContext><Library /><LocationProbe /></DndContext>}
        />
        <Route
          path="/workspace/dashboard/:dashboardName"
          element={<DndContext><Library /><LocationProbe /></DndContext>}
        />
        <Route path="/workspace/dashboard/:dashboardName/explorer" element={<LocationProbe />} />
        <Route path="/workspace/semantic-layer" element={<LocationProbe />} />
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
      // Stub the shared inline-create flow so handleCreate doesn't hit the API.
      createWorkspaceObject: jest.fn().mockResolvedValue({ success: true, name: 'stub' }),
      ...extra,
    });
  });
};

describe('Library', () => {
  beforeEach(() => {
    seedStore();
  });

  test('renders ONE shared search + a compact filter dropdown (no per-section headers)', () => {
    renderLibrary();
    // A single search input, not one per section.
    expect(screen.getAllByTestId('library-search')).toHaveLength(1);
    // The filter is a dropdown — only the Filter button shows until opened.
    expect(screen.getByTestId('library-filter-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('library-filter-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-filter-option-group-data')).not.toBeInTheDocument();
    // The old stacked section headers are gone.
    expect(screen.queryByTestId('library-section-layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-section-data')).not.toBeInTheDocument();
  });

  test('the filter menu options show per-group + per-type row counts', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-filter-toggle'));
    // Layout: 2 charts + 1 table + 1 markdown + 1 input + 1 dashboard = 6.
    expect(screen.getByTestId('library-filter-option-group-layout')).toHaveTextContent('6');
    // Data: 1 source + 1 model + 1 dimension + 1 metric + 1 relation + 1 insight = 6.
    expect(screen.getByTestId('library-filter-option-group-data')).toHaveTextContent('6');
    // 2 charts.
    expect(screen.getByTestId('library-filter-option-type-chart')).toHaveTextContent('2');
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

  test('per-type subsections default to collapsed (VIS-828)', () => {
    // Empty subsection prefs = no saved deviations = collapsed by default.
    seedStore({ libraryCollapsedSubsections: {} });
    renderLibrary();

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

  test('renders no inline "+ New X" CTAs — creation is via the header "+ New" menu', () => {
    renderLibrary();
    ['chart', 'table', 'markdown', 'input', 'dashboard', 'source', 'model', 'dimension', 'metric', 'insight', 'relation'].forEach(
      t => {
        expect(screen.queryByTestId(`library-subsection-${t}-create`)).not.toBeInTheDocument();
      }
    );
  });

  test('Layout-Items rows expose drag handles; model/relation Data-Layer rows do not', () => {
    renderLibrary();
    fireEvent.mouseEnter(screen.getByTestId('library-row-chart-waterfall'));
    expect(screen.getByTestId('library-row-chart-waterfall-drag-handle')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('library-row-table-revenue_rows'));
    expect(screen.getByTestId('library-row-table-revenue_rows-drag-handle')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('library-row-model-monthly_revenue'));
    expect(
      screen.queryByTestId('library-row-model-monthly_revenue-drag-handle')
    ).not.toBeInTheDocument();
  });

  // Explore 2.0 Phase 3a (D9 / 02-architecture.md §4): source rows are now an
  // exploration drag source (via LibrarySourceRow, the new drill-down row) —
  // this is a deliberate capability ADD, not a leftover Layout-Items check.
  test('source rows (the D9 drill-down) expose a drag handle', () => {
    renderLibrary();
    expect(screen.getByTestId('library-row-source-local-duck-drag-handle')).toBeInTheDocument();
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

  test('clicking a csv-script model row opens the tab with its REAL type (not the presentational "model")', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab, csvScriptModels: [{ name: 'fibonacci_seed' }] });
    renderLibrary();
    // Presentation keeps the shared model row (icon / subsection / testid)…
    const row = screen.getByTestId('library-row-model-fibonacci_seed');
    fireEvent.click(row);
    // …but routing uses the canonical type so the right rail resolves the
    // record in the csvScriptModels collection instead of finding null in
    // `models` and dropping into a blank create-SQL-model form.
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'csvScriptModel:fibonacci_seed',
      type: 'csvScriptModel',
      name: 'fibonacci_seed',
    });
  });

  test('local-merge model context "Open in new tab" background-opens with its REAL type', () => {
    const openWorkspaceTabBackground = jest.fn();
    seedStore({
      openWorkspaceTab: jest.fn(),
      openWorkspaceTabBackground,
      localMergeModels: [{ name: 'daily_join' }],
    });
    renderLibrary();
    fireEvent.contextMenu(screen.getByTestId('library-row-model-daily_join'));
    const menu = screen.getByTestId('library-row-model-daily_join-context-menu');
    fireEvent.click(within(menu).getByText('Open in new tab'));
    expect(openWorkspaceTabBackground).toHaveBeenCalledWith({
      id: 'localMergeModel:daily_join',
      type: 'localMergeModel',
      name: 'daily_join',
    });
  });

  // Right-click context actions (VIS-811 / Track O O-2) ----------------------

  test('row context "Open in new tab" background-opens (openWorkspaceTabBackground), not openWorkspaceTab', () => {
    const openWorkspaceTab = jest.fn();
    const openWorkspaceTabBackground = jest.fn();
    seedStore({ openWorkspaceTab, openWorkspaceTabBackground });
    renderLibrary();

    fireEvent.contextMenu(screen.getByTestId('library-row-chart-waterfall'));
    const menu = screen.getByTestId('library-row-chart-waterfall-context-menu');
    fireEvent.click(within(menu).getByText('Open in new tab'));

    expect(openWorkspaceTabBackground).toHaveBeenCalledWith({
      id: 'chart:waterfall',
      type: 'chart',
      name: 'waterfall',
    });
    expect(openWorkspaceTab).not.toHaveBeenCalled();
  });

  test('row context "Open in right rail" focuses the tab via openWorkspaceTab', () => {
    const openWorkspaceTab = jest.fn();
    const openWorkspaceTabBackground = jest.fn();
    seedStore({ openWorkspaceTab, openWorkspaceTabBackground });
    renderLibrary();

    fireEvent.contextMenu(screen.getByTestId('library-row-model-monthly_revenue'));
    const menu = screen.getByTestId('library-row-model-monthly_revenue-context-menu');
    fireEvent.click(within(menu).getByText('Open in right rail'));

    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'model:monthly_revenue',
      type: 'model',
      name: 'monthly_revenue',
    });
    expect(openWorkspaceTabBackground).not.toHaveBeenCalled();
  });

  test('a mousedown INSIDE the row menu does not dismiss it (real-cursor click sequence)', () => {
    const openWorkspaceTabBackground = jest.fn();
    seedStore({ openWorkspaceTab: jest.fn(), openWorkspaceTabBackground });
    renderLibrary();

    fireEvent.contextMenu(screen.getByTestId('library-row-chart-waterfall'));
    const menu = screen.getByTestId('library-row-chart-waterfall-context-menu');
    const item = within(menu).getByText('Open in new tab');

    // A REAL cursor fires mousedown → mouseup → click. If the mousedown
    // dismisses (unmounts) the menu, the click never lands and the action is
    // a silent no-op — exactly the VIS-811 e2e regression this pins.
    fireEvent.mouseDown(item);
    expect(
      screen.getByTestId('library-row-chart-waterfall-context-menu')
    ).toBeInTheDocument();
    fireEvent.mouseUp(item);
    fireEvent.click(item);
    expect(openWorkspaceTabBackground).toHaveBeenCalledWith({
      id: 'chart:waterfall',
      type: 'chart',
      name: 'waterfall',
    });
    // The action itself dismisses the menu.
    expect(
      screen.queryByTestId('library-row-chart-waterfall-context-menu')
    ).not.toBeInTheDocument();
  });

  test('a mousedown OUTSIDE the row menu still dismisses it', () => {
    seedStore({ openWorkspaceTab: jest.fn(), openWorkspaceTabBackground: jest.fn() });
    renderLibrary();
    fireEvent.contextMenu(screen.getByTestId('library-row-chart-waterfall'));
    expect(
      screen.getByTestId('library-row-chart-waterfall-context-menu')
    ).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByTestId('library-row-chart-waterfall-context-menu')
    ).not.toBeInTheDocument();
  });

  test('row context actions still emit library_row_context_action telemetry', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
    seedStore({ openWorkspaceTab: jest.fn(), openWorkspaceTabBackground: jest.fn() });
    renderLibrary();

    fireEvent.contextMenu(screen.getByTestId('library-row-chart-waterfall'));
    const menu = screen.getByTestId('library-row-chart-waterfall-context-menu');
    fireEvent.click(within(menu).getByText('Open in new tab'));

    const ctx = events.find(e => e.eventName === 'library_row_context_action');
    expect(ctx).toBeTruthy();
    expect(ctx.payload).toEqual({ type: 'chart', name: 'waterfall', action: 'openInNewTab' });
    unsubscribe();
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

  const openNewMenu = () => fireEvent.click(screen.getByTestId('library-new-object-button'));

  test('"+ New" → Chart drafts a chart and opens it as a workspace tab (unscoped)', async () => {
    const createWorkspaceObject = jest
      .fn()
      .mockResolvedValue({ success: true, name: 'new-chart' });
    const openWorkspaceTab = jest.fn();
    seedStore({ createWorkspaceObject, openWorkspaceTab });
    renderLibrary();
    openNewMenu();
    fireEvent.click(screen.getByTestId('library-new-object-chart'));
    await waitFor(() => expect(createWorkspaceObject).toHaveBeenCalledWith('chart'));
    await waitFor(() =>
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'chart:new-chart',
        type: 'chart',
        name: 'new-chart',
      })
    );
  });

  test('"+ New" → Chart opens the Explorer round-trip overlay when scoped to a dashboard (J-2)', () => {
    const createWorkspaceObject = jest.fn();
    seedStore({ createWorkspaceObject });
    renderLibrary('/workspace/dashboard/overview');
    openNewMenu();
    fireEvent.click(screen.getByTestId('library-new-object-chart'));
    expect(createWorkspaceObject).not.toHaveBeenCalled();
    expect(screen.getByTestId('location-probe')).toHaveTextContent(
      '/workspace/dashboard/overview/explorer'
    );
    expect(screen.getByTestId('location-probe')).toHaveTextContent('return_to=workspace');
    expect(screen.getByTestId('location-probe')).toHaveTextContent('slot=new');
  });

  test('"+ New" → Model drafts a model and opens its tab', async () => {
    const createWorkspaceObject = jest
      .fn()
      .mockResolvedValue({ success: true, name: 'new-model' });
    const openWorkspaceTab = jest.fn();
    seedStore({ createWorkspaceObject, openWorkspaceTab });
    renderLibrary();
    openNewMenu();
    fireEvent.click(screen.getByTestId('library-new-object-model'));
    await waitFor(() => expect(createWorkspaceObject).toHaveBeenCalledWith('model'));
    await waitFor(() =>
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'model:new-model',
        type: 'model',
        name: 'new-model',
      })
    );
  });

  test('the "+ New" menu is grouped like the sidebar, drops the "New " prefix, and creates on pick', async () => {
    const createWorkspaceObject = jest
      .fn()
      .mockResolvedValue({ success: true, name: 'new_metric' });
    const openWorkspaceTab = jest.fn();
    seedStore({ createWorkspaceObject, openWorkspaceTab });
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(evt => events.push(evt));
    try {
      renderLibrary();
      openNewMenu();
      expect(screen.getByTestId('library-new-object-menu')).toBeInTheDocument();
      // Grouped like the sidebar.
      expect(screen.getByTestId('library-new-group-Layout Items')).toBeInTheDocument();
      expect(screen.getByTestId('library-new-group-Data Layer')).toBeInTheDocument();
      // Relation now appears (in the Data Layer group).
      expect(screen.getByTestId('library-new-object-relation')).toBeInTheDocument();
      // Items drop the redundant "New " prefix.
      expect(screen.getByTestId('library-new-object-chart')).toHaveTextContent('Chart');
      expect(screen.getByTestId('library-new-object-chart')).not.toHaveTextContent('New Chart');

      fireEvent.click(screen.getByTestId('library-new-object-metric'));
      expect(screen.queryByTestId('library-new-object-menu')).not.toBeInTheDocument();
      await waitFor(() => expect(createWorkspaceObject).toHaveBeenCalledWith('metric'));
      await waitFor(() =>
        expect(openWorkspaceTab).toHaveBeenCalledWith({
          id: 'metric:new_metric',
          type: 'metric',
          name: 'new_metric',
        })
      );
      const created = events.filter(e => e.eventName === 'inline_create_used');
      expect(created[created.length - 1].payload).toEqual({
        source: 'library-menu',
        kind: 'metric',
      });
    } finally {
      unsubscribe();
    }
  });

  test('"+ New" → Relation opens the Semantic Layer (a relation can\'t be templated)', () => {
    const createWorkspaceObject = jest.fn();
    const openWorkspaceTab = jest.fn();
    seedStore({ createWorkspaceObject, openWorkspaceTab });
    renderLibrary();
    openNewMenu();
    fireEvent.click(screen.getByTestId('library-new-object-relation'));
    expect(createWorkspaceObject).not.toHaveBeenCalled();
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'semantic-layer:semantic-layer',
      type: 'semantic-layer',
      name: 'semantic-layer',
    });
  });

  test('the header "+ New" menu dismisses on Escape', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-new-object-button'));
    expect(screen.getByTestId('library-new-object-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('library-new-object-menu')).not.toBeInTheDocument();
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

  test('expanding the rail reveals the active object (expands its subsection)', () => {
    // Simulate: nav minimized, an item selected, then re-expanded — the Library
    // mounts with the active object's subsection collapsed and must reveal it.
    seedStore({
      workspaceActiveObject: { type: 'model', name: 'monthly_revenue' },
      workspaceActiveTabId: 'model:monthly_revenue',
      libraryCollapsedSubsections: { ...ALL_EXPANDED, model: true },
    });
    renderLibrary();
    expect(useStore.getState().libraryCollapsedSubsections.model).toBe(false);
    // The selected model row is now visible.
    expect(screen.getByTestId('library-row-model-monthly_revenue')).toBeInTheDocument();
  });

  // The old per-surface Project/Explorer/Semantic buttons (and their tests)
  // are retired — the destination switcher now lives in `<ViewSwitcher>`,
  // pinned atop the Library (Explore 2.0 Phase 0, `ViewSwitcher.test.jsx`).
  test('renders the destination switcher atop the Library', () => {
    renderLibrary();
    expect(screen.getByTestId('workspace-view-switcher')).toBeInTheDocument();
  });

  test('the filter dropdown selects a type ADDITIVELY and shows removable chips', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-filter-toggle'));
    fireEvent.click(screen.getByTestId('library-filter-option-type-table'));
    // Just table so far; a chip appears.
    expect(screen.getByTestId('library-subsection-table')).toBeInTheDocument();
    expect(screen.queryByTestId('library-subsection-chart')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-filter-chip-type-table')).toBeInTheDocument();
    // Add charts (menu stays open) → BOTH show (additive, not exclusive).
    fireEvent.click(screen.getByTestId('library-filter-option-type-chart'));
    expect(screen.getByTestId('library-subsection-table')).toBeInTheDocument();
    expect(screen.getByTestId('library-subsection-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('library-subsection-source')).not.toBeInTheDocument();
    // A chip's × removes just that filter.
    fireEvent.click(screen.getByTestId('library-filter-chip-remove-type-table'));
    expect(screen.queryByTestId('library-subsection-table')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-subsection-chart')).toBeInTheDocument();
  });

  test('a group filter narrows to that group and composes additively with a type', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-filter-toggle'));
    fireEvent.click(screen.getByTestId('library-filter-option-group-data'));
    // Data-Layer subsections remain; Layout-Item subsections hide.
    ['source', 'model', 'dimension', 'metric', 'relation', 'insight'].forEach(t =>
      expect(screen.getByTestId(`library-subsection-${t}`)).toBeInTheDocument()
    );
    ['chart', 'table', 'markdown', 'input', 'dashboard'].forEach(t =>
      expect(screen.queryByTestId(`library-subsection-${t}`)).not.toBeInTheDocument()
    );
    // Add a single layout TYPE → union of (all data types) + charts.
    fireEvent.click(screen.getByTestId('library-filter-option-type-chart'));
    expect(screen.getByTestId('library-subsection-source')).toBeInTheDocument();
    expect(screen.getByTestId('library-subsection-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('library-subsection-table')).not.toBeInTheDocument();
  });

  test('Clear drops every active filter and restores the full list', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-filter-toggle'));
    fireEvent.click(screen.getByTestId('library-filter-option-group-data'));
    expect(screen.queryByTestId('library-subsection-chart')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('library-filter-clear'));
    // All subsections back; no chips remain.
    expect(screen.getByTestId('library-subsection-chart')).toBeInTheDocument();
    expect(screen.getByTestId('library-subsection-source')).toBeInTheDocument();
    expect(screen.queryByTestId('library-filter-chip-group-data')).not.toBeInTheDocument();
  });

  test('renders Data-Layer subsections before Layout-Items subsections (data first)', () => {
    renderLibrary();
    const source = screen.getByTestId('library-subsection-source');
    const chart = screen.getByTestId('library-subsection-chart');
    // A data subsection appears earlier in the DOM than a layout one.
    // eslint-disable-next-line no-bitwise
    expect(source.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('the single search filters row names across the whole flat list', async () => {
    renderLibrary();
    fireEvent.change(screen.getByTestId('library-search'), {
      target: { value: 'waterfall' },
    });
    // Search is debounced (~250ms), so wait for the non-matching subsections to
    // drop out; the matching chart subsection (waterfall) stays.
    await waitFor(() =>
      expect(screen.queryByTestId('library-subsection-source')).not.toBeInTheDocument()
    );
    expect(screen.getByTestId('library-row-chart-waterfall')).toBeInTheDocument();
    expect(screen.queryByTestId('library-subsection-table')).not.toBeInTheDocument();
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
