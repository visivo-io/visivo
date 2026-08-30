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
import Library, { libraryFooterHint } from './Library';
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
      dimensions: [{ name: 'period' }],
      metrics: [{ name: 'revenue' }],
      relations: [{ name: 'customers_orders' }],
      insights: [{ name: 'revenue_growth' }],
      // Stub the workspace tab action so the test can assert on calls.
      openWorkspaceTab: jest.fn(),
      // Stub the shared inline-create flow so handleCreate doesn't hit the API.
      createWorkspaceObject: jest.fn().mockResolvedValue({ success: true, name: 'stub' }),
      createExploration: jest.fn().mockResolvedValue({ success: true, id: 'exp_stub' }),
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

  test('clicking a row is a safe no-op when openWorkspaceTab is unavailable — telemetry still fires', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
    seedStore({ openWorkspaceTab: undefined });
    renderLibrary();
    expect(() =>
      fireEvent.click(screen.getByTestId('library-row-chart-waterfall'))
    ).not.toThrow();
    expect(events.find(e => e.eventName === 'library_row_selected')).toBeTruthy();
    unsubscribe();
  });

  test('clicking a Data-Layer row also delegates to openWorkspaceTab', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-row-model-monthly_revenue'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'model:monthly_revenue',
      type: 'model',
      name: 'monthly_revenue',
    });
  });

  // VIS-1134: a source row is no longer the one Data-Layer type whose body
  // click behaves differently. It opens like everything else, and expands on
  // the way so the drill-down is still one gesture away (LibrarySourceRow's
  // own test file covers the behaviour in depth; this pins the integration
  // point through the full Library tree).
  test('clicking a SOURCE row body opens its tab, like every other row type', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-row-source-local-duck'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'source:local-duck',
      type: 'source',
      name: 'local-duck',
    });
    // Selecting is all it does — expanding is its own control.
    expect(screen.getByTestId('library-row-source-local-duck-toggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  test('a source row reaches the same context actions as any other row', () => {
    // `onContextAction` was already being passed to the source row by
    // LibrarySubsection — the old component just never accepted it, so the
    // whole menu was dead for sources.
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();
    fireEvent.contextMenu(screen.getByTestId('library-row-source-local-duck'));
    fireEvent.click(screen.getByText('Show lineage'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'source:local-duck',
      type: 'source',
      name: 'local-duck',
    });
  });

  test('clicking a model row opens the tab keyed on its canonical type', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();
    const row = screen.getByTestId('library-row-model-monthly_revenue');
    fireEvent.click(row);
    // Routing uses the row's canonical type so the right rail resolves a real
    // record instead of finding null and dropping into a blank create form.
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'model:monthly_revenue',
      type: 'model',
      name: 'monthly_revenue',
    });
  });

  // Right-click context actions (VIS-811 / Track O O-2) ----------------------

  // "Open in right rail" / "Open in new tab" removed (VIS-1234 follow-up):
  // clicking a row already opens it (covered above), so those items only
  // duplicated the click. The remaining live menu action tested here is
  // "Show lineage".

  test('a mousedown INSIDE the row menu does not dismiss it (real-cursor click sequence)', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();

    fireEvent.contextMenu(screen.getByTestId('library-row-chart-waterfall'));
    const menu = screen.getByTestId('library-row-chart-waterfall-context-menu');
    const item = within(menu).getByText('Show lineage');

    // A REAL cursor fires mousedown → mouseup → click. If the mousedown
    // dismisses (unmounts) the menu, the click never lands and the action is
    // a silent no-op — exactly the VIS-811 e2e regression this pins.
    fireEvent.mouseDown(item);
    expect(
      screen.getByTestId('library-row-chart-waterfall-context-menu')
    ).toBeInTheDocument();
    fireEvent.mouseUp(item);
    fireEvent.click(item);
    expect(openWorkspaceTab).toHaveBeenCalledWith({
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
    fireEvent.click(within(menu).getByText('Show lineage'));

    const ctx = events.find(e => e.eventName === 'library_row_context_action');
    expect(ctx).toBeTruthy();
    expect(ctx.payload).toEqual({ type: 'chart', name: 'waterfall', action: 'showLineage' });
    unsubscribe();
  });

  // VIS-1067 — "Explore this" / "Add to exploration" context-menu entries.
  describe('Explore this / Add to exploration', () => {
    test('"Explore this" mints an exploration seeded + pre-wired via buildExplorationSeedState, then opens its tab', async () => {
      const openWorkspaceTab = jest.fn();
      const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_new' });
      const buildExplorationSeedState = jest.fn().mockReturnValue({ modelTabs: ['query_1'] });
      seedStore({ openWorkspaceTab, createExploration, buildExplorationSeedState });
      renderLibrary();

      fireEvent.contextMenu(screen.getByTestId('library-row-insight-revenue_growth'));
      const menu = screen.getByTestId('library-row-insight-revenue_growth-context-menu');
      fireEvent.click(within(menu).getByText('Explore this'));

      expect(buildExplorationSeedState).toHaveBeenCalledWith({ type: 'insight', name: 'revenue_growth' });
      await waitFor(() =>
        expect(createExploration).toHaveBeenCalledWith(
          { type: 'insight', name: 'revenue_growth' },
          null,
          { modelTabs: ['query_1'] }
        )
      );
      await waitFor(() =>
        expect(openWorkspaceTab).toHaveBeenCalledWith({
          id: 'exploration:exp_new',
          type: 'exploration',
          name: 'exp_new',
        })
      );
    });

    test('"Explore this" seeds with a null legacy override when buildExplorationSeedState is unavailable', async () => {
      const openWorkspaceTab = jest.fn();
      const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_new2' });
      seedStore({ openWorkspaceTab, createExploration, buildExplorationSeedState: undefined });
      renderLibrary();

      fireEvent.contextMenu(screen.getByTestId('library-row-insight-revenue_growth'));
      const menu = screen.getByTestId('library-row-insight-revenue_growth-context-menu');
      fireEvent.click(within(menu).getByText('Explore this'));

      await waitFor(() =>
        expect(createExploration).toHaveBeenCalledWith(
          { type: 'insight', name: 'revenue_growth' },
          null,
          null
        )
      );
    });

    test('"Explore this" never opens a tab when the mint fails', async () => {
      const openWorkspaceTab = jest.fn();
      const createExploration = jest.fn().mockResolvedValue({ success: false });
      seedStore({ openWorkspaceTab, createExploration });
      renderLibrary();

      fireEvent.contextMenu(screen.getByTestId('library-row-insight-revenue_growth'));
      const menu = screen.getByTestId('library-row-insight-revenue_growth-context-menu');
      fireEvent.click(within(menu).getByText('Explore this'));

      await waitFor(() => expect(createExploration).toHaveBeenCalled());
      expect(openWorkspaceTab).not.toHaveBeenCalled();
    });

    test('"Show lineage" opens the object AND lands on its Lineage lens', () => {
      const openWorkspaceTab = jest.fn();
      const setWorkspaceLensIntent = jest.fn();
      const setWorkspaceLens = jest.fn();
      seedStore({ openWorkspaceTab, setWorkspaceLensIntent, setWorkspaceLens });
      renderLibrary();

      fireEvent.contextMenu(screen.getByTestId('library-row-insight-revenue_growth'));
      const menu = screen.getByTestId('library-row-insight-revenue_growth-context-menu');
      fireEvent.click(within(menu).getByText('Show lineage'));

      // One-shot object-scoped intent so the per-object pane opens on Lineage,
      // the tab is opened, and the store lens is set for the dashboard pane.
      expect(setWorkspaceLensIntent).toHaveBeenCalledWith({
        objectKey: 'insight:revenue_growth',
        lens: 'lineage',
      });
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'insight:revenue_growth',
        type: 'insight',
        name: 'revenue_growth',
      });
      expect(setWorkspaceLens).toHaveBeenCalledWith('lineage');
    });

    test('"Add to exploration" is offered only when the active tab is an exploration, and calls addObjectToActiveExploration', () => {
      const addObjectToActiveExploration = jest.fn();
      seedStore({
        workspaceActiveObject: { type: 'exploration', name: 'exp_1' },
        addObjectToActiveExploration,
      });
      renderLibrary();

      fireEvent.contextMenu(screen.getByTestId('library-row-insight-revenue_growth'));
      const menu = screen.getByTestId('library-row-insight-revenue_growth-context-menu');
      fireEvent.click(within(menu).getByText('Add to exploration'));

      expect(addObjectToActiveExploration).toHaveBeenCalledWith({
        type: 'insight',
        name: 'revenue_growth',
        parentModel: undefined,
      });
    });

    test('"Add to exploration" does not render when no exploration tab is active', () => {
      seedStore({ workspaceActiveObject: { type: 'model', name: 'monthly_revenue' } });
      renderLibrary();
      fireEvent.contextMenu(screen.getByTestId('library-row-insight-revenue_growth'));
      const menu = screen.getByTestId('library-row-insight-revenue_growth-context-menu');
      expect(within(menu).queryByText('Add to exploration')).not.toBeInTheDocument();
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

  test('"+ New" → Chart mints a return_to-carrying exploration when scoped to a dashboard (J-2, delta-review fix)', async () => {
    // Delta-review fix: this used to `navigate()` to the dead pre-cutover
    // `/workspace/dashboard/:name/explorer?return_to=…` QUERY STRING that
    // `DashboardExplorerRedirect` (LocalRouter.jsx) never reads (it only
    // consumes the path segment) — silently dropping `slot=new`. It now mints
    // the return_to-carrying exploration directly, the same call
    // `CanvasAddRow.jsx`'s "+ New Chart" and the dashboard-scoped redirect
    // route both use, and opens its tab (no navigation to `/explorer` at all).
    const createWorkspaceObject = jest.fn();
    const createExploration = jest
      .fn()
      .mockResolvedValue({ success: true, id: 'exp_new1' });
    const openWorkspaceTab = jest.fn();
    seedStore({ createWorkspaceObject, createExploration, openWorkspaceTab });
    renderLibrary('/workspace/dashboard/overview');
    openNewMenu();
    fireEvent.click(screen.getByTestId('library-new-object-chart'));
    expect(createWorkspaceObject).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(createExploration).toHaveBeenCalledWith(null, { dashboard: 'overview' })
    );
    await waitFor(() =>
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'exploration:exp_new1',
        type: 'exploration',
        name: 'exp_new1',
      })
    );
    // No navigation to the dead `/explorer` route.
    expect(screen.getByTestId('location-probe')).toHaveTextContent(
      '/workspace/dashboard/overview'
    );
  });

  test('"+ New" → Chart scoped to a dashboard is a no-op if createExploration/openWorkspaceTab are unavailable', () => {
    seedStore({ createExploration: undefined, openWorkspaceTab: undefined });
    renderLibrary('/workspace/dashboard/overview');
    openNewMenu();
    expect(() =>
      fireEvent.click(screen.getByTestId('library-new-object-chart'))
    ).not.toThrow();
  });

  test('"+ New" → Chart scoped to a dashboard: a failed mint never opens a tab', async () => {
    const createExploration = jest.fn().mockResolvedValue({ success: false });
    const openWorkspaceTab = jest.fn();
    seedStore({ createExploration, openWorkspaceTab });
    renderLibrary('/workspace/dashboard/overview');
    openNewMenu();
    fireEvent.click(screen.getByTestId('library-new-object-chart'));
    await waitFor(() => expect(createExploration).toHaveBeenCalled());
    expect(openWorkspaceTab).not.toHaveBeenCalled();
  });

  test('"+ New" → any other type is a no-op if createWorkspaceObject is unavailable', () => {
    seedStore({ createWorkspaceObject: undefined });
    renderLibrary();
    openNewMenu();
    expect(() =>
      fireEvent.click(screen.getByTestId('library-new-object-model'))
    ).not.toThrow();
  });

  test('"+ New" → a create that fails (or returns no name) never opens a tab', async () => {
    const createWorkspaceObject = jest.fn().mockResolvedValue({ success: false });
    const openWorkspaceTab = jest.fn();
    seedStore({ createWorkspaceObject, openWorkspaceTab });
    renderLibrary();
    openNewMenu();
    fireEvent.click(screen.getByTestId('library-new-object-model'));
    await waitFor(() => expect(createWorkspaceObject).toHaveBeenCalledWith('model'));
    expect(openWorkspaceTab).not.toHaveBeenCalled();
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

  test('"+ New" → Relation drafts a relation and opens it (VIS-1237)', async () => {
    const createWorkspaceObject = jest.fn(async () => ({
      success: true,
      name: 'new_relation',
      type: 'relation',
    }));
    const openWorkspaceTab = jest.fn();
    seedStore({ createWorkspaceObject, openWorkspaceTab });
    renderLibrary();
    openNewMenu();
    fireEvent.click(screen.getByTestId('library-new-object-relation'));

    expect(createWorkspaceObject).toHaveBeenCalledWith('relation');
    await waitFor(() =>
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'relation:new_relation',
        type: 'relation',
        name: 'new_relation',
      })
    );
  });

  test('a create blocked by its precondition surfaces the reason instead of doing nothing', async () => {
    const createWorkspaceObject = jest.fn(async () => ({
      success: false,
      error: 'A relation joins two models. Create at least two models first.',
    }));
    const openWorkspaceTab = jest.fn();
    const showWorkspaceToast = jest.fn();
    seedStore({ createWorkspaceObject, openWorkspaceTab, showWorkspaceToast });
    renderLibrary();
    openNewMenu();
    fireEvent.click(screen.getByTestId('library-new-object-relation'));

    await waitFor(() =>
      expect(showWorkspaceToast).toHaveBeenCalledWith(
        expect.stringMatching(/two models/i)
      )
    );
    expect(openWorkspaceTab).not.toHaveBeenCalled();
  });

  test('the header "+ New" menu dismisses on Escape', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-new-object-button'));
    expect(screen.getByTestId('library-new-object-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('library-new-object-menu')).not.toBeInTheDocument();
  });

  test('the header "+ New" menu stays open on a non-Escape key', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-new-object-button'));
    expect(screen.getByTestId('library-new-object-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByTestId('library-new-object-menu')).toBeInTheDocument();
  });

  test('the header "+ New" menu dismisses on a pointerdown outside it', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-new-object-button'));
    expect(screen.getByTestId('library-new-object-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('library-new-object-menu')).not.toBeInTheDocument();
  });

  test('a pointerdown INSIDE the "+ New" menu does not dismiss it', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-new-object-button'));
    const menu = screen.getByTestId('library-new-object-menu');
    fireEvent.mouseDown(menu);
    expect(screen.getByTestId('library-new-object-menu')).toBeInTheDocument();
  });

  test('shows the empty placeholder when a subsection has no rows', () => {
    seedStore({ charts: [], models: [] });
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

  // NOTE: #533 (main merge) removed the csvScriptModel/localMergeModel types
  // (they became seeds). The former "a csvScriptModel/localMergeModel active
  // object reveals the shared 'model' subsection" case tested a mapping that no
  // longer exists — the subsection reveal keys off `active.type` directly, and
  // the surviving `type: 'model'` reveal path is covered by the test above.

  test('expanding the rail actually calls scrollIntoView on the now-visible active row', async () => {
    const scrollIntoView = jest.fn();
    // jsdom doesn't implement scrollIntoView at all by default — the
    // production guard (`typeof el.scrollIntoView === 'function'`) exists
    // for exactly that gap; polyfill it here to exercise the real call.
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      seedStore({
        workspaceActiveObject: { type: 'model', name: 'monthly_revenue' },
        workspaceActiveTabId: 'model:monthly_revenue',
        libraryCollapsedSubsections: { ...ALL_EXPANDED, model: true },
      });
      renderLibrary();
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
    } finally {
      delete window.HTMLElement.prototype.scrollIntoView;
    }
  });

  // VIS-1135. The reveal effect read `workspaceActiveObject` off `getState()`
  // with only `setLibrarySubsectionCollapsed` in its dep array, so it fired
  // ONCE on mount. Selecting a row while the rail was already open — the
  // common case — never scrolled to it, and never opened a collapsed
  // subsection. These pin the post-mount behaviour.
  test('changing the selection AFTER mount scrolls the newly active row into view', async () => {
    const scrollIntoView = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      seedStore({
        workspaceActiveObject: { type: 'model', name: 'monthly_revenue' },
        workspaceActiveTabId: 'model:monthly_revenue',
        libraryCollapsedSubsections: { ...ALL_EXPANDED },
      });
      renderLibrary();
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      scrollIntoView.mockClear();

      // The gesture the old effect ignored: pick a different object while the
      // Library stays mounted.
      act(() => {
        useStore.setState({
          workspaceActiveObject: { type: 'chart', name: 'waterfall' },
          workspaceActiveTabId: 'chart:waterfall',
        });
      });

      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
    } finally {
      delete window.HTMLElement.prototype.scrollIntoView;
    }
  });

  test('a post-mount selection also expands its collapsed subsection', async () => {
    seedStore({
      workspaceActiveObject: { type: 'model', name: 'monthly_revenue' },
      workspaceActiveTabId: 'model:monthly_revenue',
      libraryCollapsedSubsections: { ...ALL_EXPANDED, chart: true },
    });
    renderLibrary();
    expect(useStore.getState().libraryCollapsedSubsections.chart).toBe(true);

    act(() => {
      useStore.setState({
        workspaceActiveObject: { type: 'chart', name: 'waterfall' },
        workspaceActiveTabId: 'chart:waterfall',
      });
    });

    await waitFor(() =>
      expect(useStore.getState().libraryCollapsedSubsections.chart).toBe(false)
    );
    expect(screen.getByTestId('library-row-chart-waterfall')).toBeInTheDocument();
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

  test('the "layout" group filter narrows to Layout-Item subsections (the mirror of the "data" group test)', () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-filter-toggle'));
    fireEvent.click(screen.getByTestId('library-filter-option-group-layout'));
    ['chart', 'table', 'markdown', 'input', 'dashboard'].forEach(t =>
      expect(screen.getByTestId(`library-subsection-${t}`)).toBeInTheDocument()
    );
    ['source', 'model', 'dimension', 'metric', 'relation', 'insight'].forEach(t =>
      expect(screen.queryByTestId(`library-subsection-${t}`)).not.toBeInTheDocument()
    );
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

  test('a search matching NOTHING at all shows the whole-list empty state', async () => {
    renderLibrary();
    fireEvent.change(screen.getByTestId('library-search'), {
      target: { value: 'zzz_no_such_object_zzz' },
    });
    expect(await screen.findByTestId('library-empty')).toHaveTextContent(
      'No objects match “zzz_no_such_object_zzz”.'
    );
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

  // ux-audit.md "Left-rail footer help text is context-blind" + "Sidebar
  // footer shows dashboard-canvas help text ('Drag a layout item onto the
  // canvas...') on the Explorer surface" — the footer must not advertise a
  // canvas that doesn't exist on the current surface.
  describe('libraryFooterHint (pure function — every scope branch)', () => {
    test('exploration selectedItem wins regardless of scope', () => {
      expect(
        libraryFooterHint({ scope: 'item', selectedItem: { type: 'exploration', name: 'exp_1' } })
      ).toMatch(/exploration/);
    });

    test('explorer scope (Explorer home, no tab)', () => {
      expect(libraryFooterHint({ scope: 'explorer', selectedItem: null })).toMatch(
        /start exploring/
      );
    });

    test('dashboard scope keeps the canvas-drag hint', () => {
      expect(libraryFooterHint({ scope: 'dashboard', selectedItem: null })).toMatch(
        /Drag a layout item onto the canvas/
      );
    });

    test('semantic-layer scope', () => {
      expect(libraryFooterHint({ scope: 'semantic-layer', selectedItem: null })).toMatch(
        /diagram/
      );
    });

    test('root/item/anything-else falls back to the plain default', () => {
      expect(libraryFooterHint({ scope: 'root', selectedItem: null })).toBe(
        'Click a data object to edit it.'
      );
      expect(libraryFooterHint({ scope: 'item', selectedItem: { type: 'model', name: 'x' } })).toBe(
        'Click a data object to edit it.'
      );
    });

    test('fails safe on a missing/undefined scope object', () => {
      expect(libraryFooterHint(undefined)).toBe('Click a data object to edit it.');
      expect(libraryFooterHint({})).toBe('Click a data object to edit it.');
    });
  });

  describe('footer hint (context-aware, not canvas-blind)', () => {
    test('on a dashboard, keeps the canvas hint (there really is one)', () => {
      seedStore();
      renderLibrary('/workspace/dashboard/overview');
      expect(screen.getByTestId('library-footer-hint')).toHaveTextContent(
        'Drag a layout item onto the canvas'
      );
    });

    test('on the Project root (no dashboard, no tab open), drops the canvas hint', () => {
      seedStore();
      renderLibrary('/workspace');
      expect(screen.getByTestId('library-footer-hint')).not.toHaveTextContent(
        'Drag a layout item onto the canvas'
      );
      expect(screen.getByTestId('library-footer-hint')).toHaveTextContent(
        'Click a data object to edit it.'
      );
    });

    test('on an open exploration tab, shows exploration-specific guidance, never the canvas line', () => {
      seedStore({
        workspaceTabs: [{ id: 'exploration:exp_1', type: 'exploration', name: 'exp_1', dirty: false }],
        workspaceActiveTabId: 'exploration:exp_1',
      });
      renderLibrary();
      const hint = screen.getByTestId('library-footer-hint');
      expect(hint).not.toHaveTextContent('Drag a layout item onto the canvas');
      expect(hint).toHaveTextContent('exploration');
    });
  });
});


describe('row Delete actually deletes (VIS-1234)', () => {
  const openRowMenu = async rowTestId => {
    const row = screen.getByTestId(rowTestId);
    fireEvent.contextMenu(row);
    return screen.getByText('Delete…');
  };

  test('confirming deletes through the per-type store action', async () => {
    const deleteModel = jest.fn().mockResolvedValue({ success: true });
    seedStore({ deleteModel, closeWorkspaceTab: jest.fn() });
    renderLibrary();

    fireEvent.click(await openRowMenu('library-row-model-monthly_revenue'));
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(deleteModel).toHaveBeenCalledWith('monthly_revenue'));
  });

  test('cancelling deletes nothing', async () => {
    const deleteModel = jest.fn().mockResolvedValue({ success: true });
    seedStore({ deleteModel, closeWorkspaceTab: jest.fn() });
    renderLibrary();

    fireEvent.click(await openRowMenu('library-row-model-monthly_revenue'));
    fireEvent.click(await screen.findByTestId('confirm-dialog-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('confirm-dialog-confirm')).not.toBeInTheDocument()
    );
    expect(deleteModel).not.toHaveBeenCalled();
  });

  test('a deleted object leaves no tab resolving it', async () => {
    const closeWorkspaceTab = jest.fn();
    seedStore({
      deleteModel: jest.fn().mockResolvedValue({ success: true }),
      closeWorkspaceTab,
    });
    renderLibrary();

    fireEvent.click(await openRowMenu('library-row-model-monthly_revenue'));
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'));

    await waitFor(() =>
      expect(closeWorkspaceTab).toHaveBeenCalledWith('model:monthly_revenue')
    );
  });

  test('a failed delete leaves the tab open', async () => {
    const closeWorkspaceTab = jest.fn();
    seedStore({
      deleteModel: jest.fn().mockResolvedValue({ success: false, error: 'nope' }),
      closeWorkspaceTab,
    });
    renderLibrary();

    fireEvent.click(await openRowMenu('library-row-model-monthly_revenue'));
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'));

    await waitFor(() =>
      expect(screen.queryByTestId('confirm-dialog-confirm')).not.toBeInTheDocument()
    );
    expect(closeWorkspaceTab).not.toHaveBeenCalled();
  });
});


describe('restore and the two kinds of delete (VIS-1234)', () => {
  const openRowMenu = async rowTestId => {
    fireEvent.contextMenu(screen.getByTestId(rowTestId));
  };

  test('a deleted row offers Restore, and it reverts that object', async () => {
    const restoreDeleted = jest.fn().mockResolvedValue({ success: true });
    seedStore({
      models: [{ name: 'tombstoned', status: 'deleted' }],
      restoreDeleted,
    });
    renderLibrary();

    await openRowMenu('library-row-model-tombstoned');
    fireEvent.click(screen.getByText('Restore'));

    await waitFor(() => expect(restoreDeleted).toHaveBeenCalledWith('model', 'tombstoned'));
  });

  test('a modified row offers the same action, worded as discarding edits', async () => {
    // Restore is "revert to the published version" — one action for a pending
    // deletion and a pending edit alike.
    const restoreDeleted = jest.fn().mockResolvedValue({ success: true });
    seedStore({ models: [{ name: 'edited', status: 'modified' }], restoreDeleted });
    renderLibrary();

    await openRowMenu('library-row-model-edited');
    fireEvent.click(screen.getByText('Discard changes…'));

    await waitFor(() => expect(restoreDeleted).toHaveBeenCalledWith('model', 'edited'));
  });

  test('a new row offers no restore — there is no published version to fall back to', async () => {
    seedStore({ models: [{ name: 'fresh', status: 'new' }] });
    renderLibrary();

    await openRowMenu('library-row-model-fresh');

    expect(screen.queryByText('Restore')).toBeNull();
    expect(screen.queryByText('Discard changes…')).toBeNull();
  });

  test('a published row offers no restore either', async () => {
    seedStore({ models: [{ name: 'clean', status: 'published' }] });
    renderLibrary();

    await openRowMenu('library-row-model-clean');

    expect(screen.queryByText('Restore')).toBeNull();
    expect(screen.queryByText('Discard changes…')).toBeNull();
  });

  test('deleting a never-committed object warns that it is immediate', async () => {
    // It has no published version to tombstone, so it goes outright and there
    // is nothing to restore. Saying so afterwards would be too late.
    seedStore({
      models: [{ name: 'fresh', status: 'new' }],
      deleteModel: jest.fn().mockResolvedValue({ success: true }),
      closeWorkspaceTab: jest.fn(),
    });
    renderLibrary();

    await openRowMenu('library-row-model-fresh');
    fireEvent.click(screen.getByText('Delete…'));

    expect(await screen.findByTestId('confirm-dialog')).toHaveTextContent(
      /never been committed/i
    );
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent(/can't be undone/i);
  });

  test('deleting a published object says it survives until commit and can be restored', async () => {
    seedStore({
      models: [{ name: 'live', status: 'published' }],
      deleteModel: jest.fn().mockResolvedValue({ success: true }),
      closeWorkspaceTab: jest.fn(),
    });
    renderLibrary();

    await openRowMenu('library-row-model-live');
    fireEvent.click(screen.getByText('Delete…'));

    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toHaveTextContent(/until you commit/i);
    expect(dialog).toHaveTextContent(/restore/i);
  });
});
