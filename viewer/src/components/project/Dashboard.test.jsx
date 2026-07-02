import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { futureFlags } from '../../router-config';
import Dashboard from './Dashboard';
import useStore from '../../stores/store';
import { useModelsData } from '../../hooks/useModelsData';
import { useInsightsData } from '../../hooks/useInsightsData';

// Mock the stores
jest.mock('../../stores/store');

// Mock react-router-dom hooks
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

// Mock the dimension hook. `mockDimensionWidth` lets individual tests drive the
// CONTAINER width that Dashboard measures via the ResizeObserver-backed
// `useDimensions` hook, so we can exercise the stacking breakpoint at different
// container widths (VIS-829).
let mockDimensionWidth = 1200;
jest.mock('react-cool-dimensions', () => ({
  __esModule: true,
  default: (options = {}) => {
    // Invoke the onResize callback the way the real ResizeObserver hook would,
    // so Dashboard's re-observe wiring is exercised.
    if (options.onResize) options.onResize({ observe: jest.fn() });
    return {
      observe: jest.fn(),
      // eslint-disable-next-line no-undef
      get width() {
        return mockDimensionWidth;
      },
    };
  },
}));

// Mock the hooks
jest.mock('../../hooks/useInsightsData', () => ({
  useInsightsData: jest.fn(),
}));

jest.mock('../../hooks/useModelsData', () => ({
  useModelsData: jest.fn(),
}));

jest.mock('../../hooks/useInputsData', () => ({
  useInputsData: jest.fn(),
}));

jest.mock('../../hooks/useVisibleRows', () => ({
  useVisibleRows: jest.fn(() => ({
    visibleRows: new Set([0]),
    setRowRef: jest.fn(),
  })),
}));

// Mock the item components.
// `data-insights` exposes the resolved insights array Dashboard hands the
// Chart so VIS-827 normalization (string refs -> {name} objects) is assertable.
jest.mock('../items/Chart', () => ({
  __esModule: true,
  default: ({ chart, shouldLoad }) => (
    <div
      data-testid="chart"
      data-insights={JSON.stringify(chart.insights || [])}
      data-should-load={String(shouldLoad)}
    >
      {chart.name || 'Chart'}
    </div>
  ),
}));

jest.mock('../items/Table', () => ({
  __esModule: true,
  default: ({ table }) => <div data-testid="table">{table.name || 'Table'}</div>,
}));

jest.mock('../items/Markdown', () => ({
  __esModule: true,
  default: ({ markdown }) => <div data-testid="markdown">{markdown.name || 'Markdown'}</div>,
}));

jest.mock('../items/Input', () => ({
  __esModule: true,
  default: ({ input }) => <div data-testid="input">{input.name || 'Input'}</div>,
}));

describe('Dashboard', () => {
  const mockProject = { id: 'project-1', name: 'Test Project' };
  const dashboardName = 'test-dashboard';

  const mockDashboard = {
    name: 'test-dashboard',
    rows: [
      {
        height: 'medium',
        items: [
          { chart: 'test-chart', width: 1 },
        ],
      },
    ],
  };

  const mockChart = {
    name: 'test-chart',
    config: {
      name: 'test-chart',
      insights: ['test-insight'],
    },
  };

  beforeEach(() => {
    // Default to a wide container; stacking tests override per-test.
    mockDimensionWidth = 1200;
    // Mock store selectors
    useStore.mockImplementation((selector) => {
      const state = {
        project: mockProject,
        dashboards: [mockDashboard],
        fetchDashboards: jest.fn(),
        fetchCharts: jest.fn(),
        fetchTables: jest.fn(),
        fetchMarkdowns: jest.fn(),
        fetchInputs: jest.fn(),
        fetchModels: jest.fn(),
        models: [],
        getChartByName: jest.fn((name) => name === 'test-chart' ? mockChart : null),
        getTableByName: jest.fn(() => null),
        getMarkdownByName: jest.fn(() => null),
        getInputByName: jest.fn(() => null),
      };
      return selector(state);
    });
  });

  it('renders loading state when dashboard not found', () => {
    useStore.mockImplementation((selector) => {
      const state = {
        project: mockProject,
        dashboards: [],
        fetchDashboards: jest.fn(),
        fetchCharts: jest.fn(),
        fetchTables: jest.fn(),
        fetchMarkdowns: jest.fn(),
        fetchInputs: jest.fn(),
        fetchModels: jest.fn(),
        models: [],
        getChartByName: jest.fn(),
        getTableByName: jest.fn(),
        getMarkdownByName: jest.fn(),
        getInputByName: jest.fn(),
      };
      return selector(state);
    });

    render(
      <BrowserRouter future={futureFlags}>
        <Dashboard project={mockProject} dashboardName={dashboardName} />
      </BrowserRouter>
    );

    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });

  // ---------- VIS-827: eager-load all rows on the new renderer ----------
  //
  // The Workspace canvas mounts <Dashboard> inside an inner overflow-auto
  // scroll container, where the useVisibleRows IntersectionObserver never fires
  // for rows below the initial fold. With lazy gating that left those rows'
  // charts on a permanent "Loading…" spinner even though the data was already
  // in the store. eagerLoad (default true) makes every row loadable.
  describe('eager-load all rows (VIS-827)', () => {
    const twoRowDashboard = {
      name: 'two-row',
      rows: [
        { height: 'medium', items: [{ chart: 'chart-top', width: 1 }] },
        { height: 'medium', items: [{ chart: 'chart-low', width: 1 }] },
      ],
    };
    const chartConfigs = {
      'chart-top': { name: 'chart-top', config: { name: 'chart-top', insights: [] } },
      'chart-low': { name: 'chart-low', config: { name: 'chart-low', insights: [] } },
    };
    const renderTwoRow = (props = {}) => {
      useStore.mockImplementation(selector => {
        const state = {
          project: mockProject,
          dashboards: [twoRowDashboard],
          fetchDashboards: jest.fn(),
          fetchCharts: jest.fn(),
          fetchTables: jest.fn(),
          fetchMarkdowns: jest.fn(),
          fetchInputs: jest.fn(),
          fetchModels: jest.fn(),
          models: [],
          getChartByName: jest.fn(name => chartConfigs[name] ?? null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <Dashboard project={mockProject} dashboardName="two-row" {...props} />
        </BrowserRouter>
      );
    };

    it('passes shouldLoad=true to charts in rows beyond the visible set (eager default)', () => {
      // useVisibleRows is mocked to report only row 0 visible; eagerLoad should
      // override that so the row-1 chart still loads instead of spinning forever.
      renderTwoRow();
      const chartEls = screen.getAllByTestId('chart');
      expect(chartEls).toHaveLength(2);
      chartEls.forEach(c => expect(c.getAttribute('data-should-load')).toBe('true'));
    });

    it('falls back to row-visibility gating when eagerLoad is false', () => {
      renderTwoRow({ eagerLoad: false });
      const chartEls = screen.getAllByTestId('chart');
      // row 0 is in the mocked visible set ({0}), row 1 is not
      expect(chartEls[0].getAttribute('data-should-load')).toBe('true');
      expect(chartEls[1].getAttribute('data-should-load')).toBe('false');
    });
  });

  it('renders empty state when dashboard has no rows', () => {
    useStore.mockImplementation((selector) => {
      const state = {
        project: mockProject,
        dashboards: [{ name: 'test-dashboard', rows: [] }],
        fetchDashboards: jest.fn(),
        fetchCharts: jest.fn(),
        fetchTables: jest.fn(),
        fetchMarkdowns: jest.fn(),
        fetchInputs: jest.fn(),
        fetchModels: jest.fn(),
        models: [],
        getChartByName: jest.fn(),
        getTableByName: jest.fn(),
        getMarkdownByName: jest.fn(),
        getInputByName: jest.fn(),
      };
      return selector(state);
    });

    render(
      <BrowserRouter future={futureFlags}>
        <Dashboard project={mockProject} dashboardName={dashboardName} />
      </BrowserRouter>
    );

    expect(screen.getByText('This dashboard is empty')).toBeInTheDocument();
  });

  // ---------- VIS-901 #3: empty-slot placeholder (canvas build surface) ----------
  describe('empty-slot placeholder (VIS-901 #3)', () => {
    const emptySlotDashboard = {
      name: 'with-empty-slot',
      rows: [{ height: 'medium', items: [{ width: 1 }] }],
    };
    const renderEmptySlot = (props = {}) => {
      useStore.mockImplementation(selector => {
        const state = {
          project: mockProject,
          dashboards: [emptySlotDashboard],
          fetchDashboards: jest.fn(),
          fetchCharts: jest.fn(),
          fetchTables: jest.fn(),
          fetchMarkdowns: jest.fn(),
          fetchInputs: jest.fn(),
          fetchModels: jest.fn(),
          models: [],
          getChartByName: jest.fn(() => null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <Dashboard project={mockProject} dashboardName="with-empty-slot" {...props} />
        </BrowserRouter>
      );
    };

    it('renders a visible placeholder for an empty slot in canvasMode', () => {
      renderEmptySlot({ canvasMode: true });
      expect(screen.getByTestId('canvas-empty-slot')).toBeInTheDocument();
    });

    it('renders nothing for an empty slot in View mode (parity preserved)', () => {
      renderEmptySlot();
      expect(screen.queryByTestId('canvas-empty-slot')).not.toBeInTheDocument();
    });
  });

  it('renders chart when found in store', () => {
    render(
      <BrowserRouter future={futureFlags}>
        <Dashboard project={mockProject} dashboardName={dashboardName} />
      </BrowserRouter>
    );

    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });

  it('shows error message when chart not found', () => {
    useStore.mockImplementation((selector) => {
      const state = {
        project: mockProject,
        dashboards: [mockDashboard],
        fetchDashboards: jest.fn(),
        fetchCharts: jest.fn(),
        fetchTables: jest.fn(),
        fetchMarkdowns: jest.fn(),
        fetchInputs: jest.fn(),
        fetchModels: jest.fn(),
        models: [],
        getChartByName: jest.fn(() => null), // Chart not found
        getTableByName: jest.fn(() => null),
        getMarkdownByName: jest.fn(() => null),
        getInputByName: jest.fn(() => null),
      };
      return selector(state);
    });

    render(
      <BrowserRouter future={futureFlags}>
        <Dashboard project={mockProject} dashboardName={dashboardName} />
      </BrowserRouter>
    );

    expect(screen.getByText(/Chart not found/)).toBeInTheDocument();
  });

  it('fetches item data on mount', () => {
    const fetchCharts = jest.fn();
    const fetchTables = jest.fn();
    const fetchMarkdowns = jest.fn();
    const fetchInputs = jest.fn();
    const fetchModels = jest.fn();

    useStore.mockImplementation((selector) => {
      const state = {
        project: mockProject,
        dashboards: [mockDashboard],
        fetchCharts,
        fetchTables,
        fetchMarkdowns,
        fetchInputs,
        fetchModels,
        models: [],
        getChartByName: jest.fn((name) => name === 'test-chart' ? mockChart : null),
        getTableByName: jest.fn(() => null),
        getMarkdownByName: jest.fn(() => null),
        getInputByName: jest.fn(() => null),
      };
      return selector(state);
    });

    render(
      <BrowserRouter future={futureFlags}>
        <Dashboard project={mockProject} dashboardName={dashboardName} />
      </BrowserRouter>
    );

    expect(fetchCharts).toHaveBeenCalled();
    expect(fetchTables).toHaveBeenCalled();
    expect(fetchMarkdowns).toHaveBeenCalled();
    expect(fetchInputs).toHaveBeenCalled();
    // VIS-827: the model registry must be fetched so model-data tables can be
    // classified into the model-fetch bucket (useModelsData).
    expect(fetchModels).toHaveBeenCalled();
  });

  // ---------- VIS-748: nested item.rows rendering ----------

  describe('nested item.rows', () => {
    const makeChart = name => ({ name, config: { name, insights: [] } });

    const renderWithDashboard = dashboard => {
      useStore.mockImplementation((selector) => {
        const charts = {
          'big-chart': makeChart('big-chart'),
          'small-a': makeChart('small-a'),
          'small-b': makeChart('small-b'),
          'small-c': makeChart('small-c'),
          'deep-chart': makeChart('deep-chart'),
        };
        const state = {
          project: mockProject,
          dashboards: [dashboard],
          fetchDashboards: jest.fn(),
          fetchCharts: jest.fn(),
          fetchTables: jest.fn(),
          fetchMarkdowns: jest.fn(),
          fetchInputs: jest.fn(),
          fetchModels: jest.fn(),
          models: [],
          getChartByName: jest.fn(name => charts[name] ?? null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <Dashboard project={mockProject} dashboardName={dashboard.name} stackBreakpoint={768} />
        </BrowserRouter>
      );
    };

    it('renders all leaf charts when an Item has nested rows alongside leaf siblings', () => {
      const dashboard = {
        name: 'nested-test',
        rows: [
          {
            height: 'large',
            items: [
              { width: 2, chart: 'big-chart' },
              {
                width: 1,
                rows: [
                  { height: 'small', items: [{ chart: 'small-a' }] },
                  { height: 'small', items: [{ chart: 'small-b' }] },
                  { height: 'small', items: [{ chart: 'small-c' }] },
                ],
              },
            ],
          },
        ],
      };
      renderWithDashboard(dashboard);

      // Leaf sibling and all three nested charts should render.
      const charts = screen.getAllByTestId('chart');
      const renderedNames = charts.map(c => c.textContent).sort();
      expect(renderedNames).toEqual(['big-chart', 'small-a', 'small-b', 'small-c']);
    });

    it('renders a row-container item with the dashboard-nested-rows wrapper', () => {
      const dashboard = {
        name: 'wrapper-test',
        rows: [
          {
            height: 'medium',
            items: [
              {
                width: 1,
                rows: [
                  { height: 'small', items: [{ chart: 'small-a' }] },
                  { height: 'small', items: [{ chart: 'small-b' }] },
                ],
              },
            ],
          },
        ],
      };
      renderWithDashboard(dashboard);

      expect(screen.getByTestId('dashboard-nested-rows')).toBeInTheDocument();
      // Two sub-rows inside this wrapper.
      const subRows = screen.getAllByTestId('dashboard-nested-subrow');
      expect(subRows).toHaveLength(2);
    });

    it('floors the nested-rows container at a definite minHeight in STACKED mode (no 0-height collapse)', () => {
      // Narrow container → column/stacked mode (< the 768 breakpoint). The row
      // has no definite CSS height when stacked, so the nested-rows wrapper's
      // `h-full` would collapse to 0 (and every nested sub-row/leaf with it).
      // The minHeight floor must give it a definite, non-zero height instead.
      mockDimensionWidth = 600;
      const dashboard = {
        name: 'stacked-nested',
        rows: [
          {
            height: 'medium',
            items: [
              { width: 1, chart: 'big-chart' },
              {
                width: 1,
                rows: [
                  { height: 'small', items: [{ chart: 'small-a' }] },
                  { height: 'small', items: [{ chart: 'small-b' }] },
                ],
              },
            ],
          },
        ],
      };
      renderWithDashboard(dashboard);

      const wrapper = screen.getByTestId('dashboard-nested-rows');
      const minHeight = wrapper.style.minHeight;
      expect(minHeight).toBeTruthy();
      expect(parseInt(minHeight, 10)).toBeGreaterThan(0);
    });

    it('assigns equal flex weights to two equal-height sub-rows', () => {
      const dashboard = {
        name: 'equal-weights',
        rows: [
          {
            height: 'medium',
            items: [
              {
                width: 1,
                rows: [
                  { height: 'small', items: [{ chart: 'small-a' }] },
                  { height: 'small', items: [{ chart: 'small-b' }] },
                ],
              },
            ],
          },
        ],
      };
      renderWithDashboard(dashboard);

      const subRows = screen.getAllByTestId('dashboard-nested-subrow');
      expect(subRows).toHaveLength(2);
      // Both should have the same flex value (weight 2 = 'small'), e.g. "2 1 0".
      const flex0 = subRows[0].style.flex;
      const flex1 = subRows[1].style.flex;
      expect(flex0).toBeTruthy();
      expect(flex1).toBe(flex0);
    });

    it('assigns proportional flex weights for [small, large] sub-rows', () => {
      const dashboard = {
        name: 'uneven-weights',
        rows: [
          {
            height: 'medium',
            items: [
              {
                width: 1,
                rows: [
                  { height: 'small', items: [{ chart: 'small-a' }] },
                  { height: 'large', items: [{ chart: 'small-b' }] },
                ],
              },
            ],
          },
        ],
      };
      renderWithDashboard(dashboard);

      const subRows = screen.getAllByTestId('dashboard-nested-subrow');
      expect(subRows).toHaveLength(2);
      // small=2 weight, large=4 weight per heightToWeight in Dashboard.jsx.
      // Flex format: "<grow> 1 0".
      const grow0 = parseFloat(subRows[0].style.flex.split(' ')[0]);
      const grow1 = parseFloat(subRows[1].style.flex.split(' ')[0]);
      // small / large ratio = 2/4 = 0.5
      expect(grow1 / grow0).toBeCloseTo(2, 5);
    });

    it('handles two-level deep nesting (rows-in-item-in-rows-in-item)', () => {
      const dashboard = {
        name: 'deep-nest',
        rows: [
          {
            height: 'large',
            items: [
              {
                width: 1,
                rows: [
                  {
                    height: 'medium',
                    items: [
                      {
                        width: 1,
                        rows: [
                          { height: 'small', items: [{ chart: 'deep-chart' }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      renderWithDashboard(dashboard);

      const charts = screen.getAllByTestId('chart');
      expect(charts.length).toBe(1);
      expect(charts[0].textContent).toBe('deep-chart');
    });

    it('falls back to leaf rendering when item.rows is an empty list', () => {
      const dashboard = {
        name: 'empty-rows',
        rows: [
          {
            height: 'medium',
            items: [
              { chart: 'big-chart', rows: [] },
            ],
          },
        ],
      };
      // Note: an Item with both `chart` and `rows: []` would normally fail the
      // Pydantic validator (mutual exclusion). On the frontend, if the API
      // returns this shape (e.g. legacy data), we fall back to the leaf path.
      renderWithDashboard(dashboard);

      const charts = screen.getAllByTestId('chart');
      expect(charts.length).toBe(1);
    });

    it('does not break when getChartByName cannot resolve a nested chart', () => {
      const dashboard = {
        name: 'missing-chart',
        rows: [
          {
            height: 'large',
            items: [
              {
                width: 1,
                rows: [
                  { height: 'small', items: [{ chart: 'unknown-chart' }] },
                ],
              },
            ],
          },
        ],
      };
      renderWithDashboard(dashboard);

      // The "Chart not found" placeholder should appear inside the nested slot.
      expect(screen.getByText(/Chart not found/)).toBeInTheDocument();
    });
  });

  // ---------- VIS-A1: Row.height accepts Union[HeightEnum, int] ----------

  describe('Row.height numeric (VIS-A1)', () => {
    const mountDashboardWithRowHeight = (height) => {
      const dashboard = {
        name: 'height-test',
        rows: [
          { height, items: [{ chart: 'test-chart', width: 1 }] },
        ],
      };
      useStore.mockImplementation((selector) => {
        const state = {
          project: mockProject,
          dashboards: [dashboard],
          fetchDashboards: jest.fn(),
          fetchCharts: jest.fn(),
          fetchTables: jest.fn(),
          fetchMarkdowns: jest.fn(),
          fetchInputs: jest.fn(),
          fetchModels: jest.fn(),
          models: [],
          getChartByName: jest.fn((name) => (name === 'test-chart' ? mockChart : null)),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      render(
        <BrowserRouter future={futureFlags}>
          <Dashboard project={mockProject} dashboardName="height-test" />
        </BrowserRouter>
      );
    };

    it('honors integer row.height as a literal pixel value', () => {
      mountDashboardWithRowHeight(320);
      const row = screen.getByTestId('dashboard-row-0');
      expect(row.style.height).toBe('320px');
    });

    it('maps enum row.height through the existing pixel table', () => {
      mountDashboardWithRowHeight('medium');
      const row = screen.getByTestId('dashboard-row-0');
      expect(row.style.height).toBe('396px');
    });
  });

  // ---------- VIS-827: normalize chart insight string refs ----------
  //
  // When the dashboard comes from the /api/dashboards/ store endpoint (the path
  // <Dashboard> uses on both /project-new and the Workspace canvas lens),
  // embedded chart objects carry their `insights` as un-resolved context-string
  // refs ("${ref(name)}"). Chart.jsx derives the names it loads via
  // `chart.insights.map(i => i.name)`, so without normalization the names are
  // undefined and the chart spins forever. resolveItem must convert string refs
  // into { name } objects for BOTH the string-ref chart branch and the embedded
  // chart-object branch.
  //
  // The literal "${ref(name)}" fixtures below are deliberate context-string
  // refs (the exact un-resolved shape the API returns), not template literals.
  /* eslint-disable no-template-curly-in-string */
  describe('chart insight ref normalization (VIS-827)', () => {
    const renderWithDashboard = (dashboard, charts = {}) => {
      useStore.mockImplementation(selector => {
        const state = {
          project: mockProject,
          dashboards: [dashboard],
          fetchDashboards: jest.fn(),
          fetchCharts: jest.fn(),
          fetchTables: jest.fn(),
          fetchMarkdowns: jest.fn(),
          fetchInputs: jest.fn(),
          fetchModels: jest.fn(),
          models: [],
          getChartByName: jest.fn(name => charts[name] ?? null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <Dashboard project={mockProject} dashboardName={dashboard.name} stackBreakpoint={768} />
        </BrowserRouter>
      );
    };

    const insightsOf = () =>
      JSON.parse(screen.getByTestId('chart').getAttribute('data-insights'));

    it('normalizes string-ref insights on an embedded chart object', () => {
      const dashboard = {
        name: 'embedded-chart',
        rows: [
          {
            height: 'medium',
            items: [
              {
                width: 1,
                chart: {
                  name: 'embedded',
                  insights: ['${ref(fibonacci-waterfall)}', '${ref(example-indicator)}'],
                },
              },
            ],
          },
        ],
      };
      renderWithDashboard(dashboard);
      expect(insightsOf()).toEqual([
        { name: 'fibonacci-waterfall' },
        { name: 'example-indicator' },
      ]);
    });

    it('normalizes string-ref insights when the chart is resolved by name', () => {
      const dashboard = {
        name: 'ref-chart',
        rows: [{ height: 'medium', items: [{ width: 1, chart: 'by-name' }] }],
      };
      const charts = {
        'by-name': { name: 'by-name', config: { name: 'by-name', insights: ['${ref(simple-line)}'] } },
      };
      renderWithDashboard(dashboard, charts);
      expect(insightsOf()).toEqual([{ name: 'simple-line' }]);
    });

    it('preserves embedded insight objects (name/props/interactions) untouched', () => {
      const embeddedInsight = {
        name: 'double-simple-line',
        props: { type: 'scatter', x: '?{${ref(m).x}}' },
        interactions: [{ sort: '?{${ref(m).x} ASC}' }],
      };
      const dashboard = {
        name: 'mixed-insights',
        rows: [
          {
            height: 'medium',
            items: [
              {
                width: 1,
                chart: {
                  name: 'mixed',
                  insights: [embeddedInsight, '${ref(simple-line)}'],
                },
              },
            ],
          },
        ],
      };
      renderWithDashboard(dashboard);
      expect(insightsOf()).toEqual([embeddedInsight, { name: 'simple-line' }]);
    });
  });
  /* eslint-enable no-template-curly-in-string */

  // ---------- VIS-829: container-relative stacking breakpoint ----------

  describe('stacking breakpoint (VIS-829)', () => {
    const twoChart = () => ({
      name: 'two-item-dash',
      rows: [
        {
          height: 'medium',
          items: [
            { width: 1, chart: 'chart-a' },
            { width: 1, chart: 'chart-b' },
          ],
        },
      ],
    });

    const charts = {
      'chart-a': { name: 'chart-a', config: { name: 'chart-a', insights: [] } },
      'chart-b': { name: 'chart-b', config: { name: 'chart-b', insights: [] } },
    };

    const mountAtWidth = (containerWidth, dashboard) => {
      mockDimensionWidth = containerWidth;
      useStore.mockImplementation(selector => {
        const state = {
          project: mockProject,
          dashboards: [dashboard],
          fetchDashboards: jest.fn(),
          fetchCharts: jest.fn(),
          fetchTables: jest.fn(),
          fetchMarkdowns: jest.fn(),
          fetchInputs: jest.fn(),
          fetchModels: jest.fn(),
          models: [],
          getChartByName: jest.fn(name => charts[name] ?? null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <Dashboard project={mockProject} dashboardName={dashboard.name} stackBreakpoint={768} />
        </BrowserRouter>
      );
    };

    it('lays out a multi-item row side-by-side (grid) at a wide container width', () => {
      mountAtWidth(1200, twoChart());
      const row = screen.getByTestId('dashboard-row-0');
      expect(row.style.display).toBe('grid');
      expect(row.style.flexDirection).toBe('');
      expect(row.style.gridTemplateColumns).toContain('repeat(2');
    });

    it('keeps a multi-item row side-by-side just above the new 768px breakpoint', () => {
      // 900px would have STACKED under the old 1024 threshold; with 768 it stays
      // side-by-side. This is the core regression the lowered breakpoint fixes.
      mountAtWidth(900, twoChart());
      const row = screen.getByTestId('dashboard-row-0');
      expect(row.style.display).toBe('grid');
    });

    it('stacks a multi-item row into a column on a genuinely narrow container', () => {
      mountAtWidth(600, twoChart());
      const row = screen.getByTestId('dashboard-row-0');
      expect(row.style.display).toBe('flex');
      expect(row.style.flexDirection).toBe('column');
    });

    it('stacks exactly at the breakpoint boundary (width < 768 stacks)', () => {
      mountAtWidth(767, twoChart());
      const rowStacked = screen.getByTestId('dashboard-row-0');
      expect(rowStacked.style.display).toBe('flex');
    });

    it('does NOT stack at exactly 768px (boundary is exclusive)', () => {
      mountAtWidth(768, twoChart());
      const row = screen.getByTestId('dashboard-row-0');
      expect(row.style.display).toBe('grid');
    });

    it('uses the default 1024 breakpoint when no stackBreakpoint prop is passed (static viewing)', () => {
      // Static surfaces (/project-new, and /project once VIS-833 routes it
      // through Dashboard) mount with no stackBreakpoint, so the 1024 default
      // applies: a 900px container STACKS here, whereas the canvas
      // (stackBreakpoint=768) keeps the same row side-by-side at 900px.
      const dash = twoChart();
      mockDimensionWidth = 900;
      useStore.mockImplementation(selector =>
        selector({
          project: mockProject,
          dashboards: [dash],
          fetchDashboards: jest.fn(),
          fetchCharts: jest.fn(),
          fetchTables: jest.fn(),
          fetchMarkdowns: jest.fn(),
          fetchInputs: jest.fn(),
          fetchModels: jest.fn(),
          models: [],
          getChartByName: jest.fn(name => charts[name] ?? null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        })
      );
      render(
        <BrowserRouter future={futureFlags}>
          <Dashboard project={mockProject} dashboardName={dash.name} />
        </BrowserRouter>
      );
      expect(screen.getByTestId('dashboard-row-0').style.display).toBe('flex');
    });
  });

  // ---------- VIS-829: slot-relative nested-container stacking ----------

  describe('nested-container slot-relative stacking (VIS-829)', () => {
    const charts = {
      'kpi-a': { name: 'kpi-a', config: { name: 'kpi-a', insights: [] } },
      'kpi-b': { name: 'kpi-b', config: { name: 'kpi-b', insights: [] } },
    };

    // A wide dashboard with a multi-item NESTED row inside a narrow 1/4 slot.
    // The nested row must stack (its slot is ~1/4 of the dashboard) even though
    // the dashboard itself is wide.
    const narrowSlotDashboard = {
      name: 'narrow-slot',
      rows: [
        {
          height: 'medium',
          items: [
            { width: 3, chart: 'kpi-a' },
            {
              width: 1,
              rows: [
                {
                  height: 'small',
                  items: [
                    { width: 1, chart: 'kpi-a' },
                    { width: 1, chart: 'kpi-b' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // A wide dashboard with the nested multi-item row inside a wide slot.
    const wideSlotDashboard = {
      name: 'wide-slot',
      rows: [
        {
          height: 'medium',
          items: [
            {
              width: 1,
              rows: [
                {
                  height: 'small',
                  items: [
                    { width: 1, chart: 'kpi-a' },
                    { width: 1, chart: 'kpi-b' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const mountAtWidth = (containerWidth, dashboard) => {
      mockDimensionWidth = containerWidth;
      useStore.mockImplementation(selector => {
        const state = {
          project: mockProject,
          dashboards: [dashboard],
          fetchDashboards: jest.fn(),
          fetchCharts: jest.fn(),
          fetchTables: jest.fn(),
          fetchMarkdowns: jest.fn(),
          fetchInputs: jest.fn(),
          fetchModels: jest.fn(),
          models: [],
          getChartByName: jest.fn(name => charts[name] ?? null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <Dashboard project={mockProject} dashboardName={dashboard.name} stackBreakpoint={768} />
        </BrowserRouter>
      );
    };

    it('stacks a nested multi-item row when its slot is narrow even on a wide dashboard', () => {
      // Dashboard 1200px; nested slot is 1/4 → ~300px < 768 → stack.
      mountAtWidth(1200, narrowSlotDashboard);
      const nestedRow = screen.getAllByTestId('dashboard-nested-row')[0];
      expect(nestedRow).toBeTruthy();
      expect(nestedRow.style.display).toBe('flex');
      expect(nestedRow.style.flexDirection).toBe('column');
    });

    it('lays a nested multi-item row side-by-side when its slot is wide', () => {
      // Dashboard 1200px; nested slot is the full width (single item, width 1)
      // → ~1200px ≥ 768 → grid side-by-side.
      mountAtWidth(1200, wideSlotDashboard);
      const nestedRow = screen.getAllByTestId('dashboard-nested-row')[0];
      expect(nestedRow).toBeTruthy();
      expect(nestedRow.style.display).toBe('grid');
      expect(nestedRow.style.gridTemplateColumns).toContain('repeat(2');
    });

    it('stacks the nested row when the whole dashboard is narrow', () => {
      mountAtWidth(600, wideSlotDashboard);
      const nestedRow = screen.getAllByTestId('dashboard-nested-row')[0];
      expect(nestedRow).toBeTruthy();
      expect(nestedRow.style.display).toBe('flex');
    });
  });

  // ---------- VIS-827: model-data table data collection ----------
  //
  // A "model-data table" sources its `data` from a model via a context-string ref
  // (`"${ref(model-name)}"`). The /api/tables/ store endpoint delivers `data` as a
  // bare string with no model/insight signal. The regression: every string-ref
  // `data` was bucketed into the insight-fetch set, so useModelsData never fetched
  // the backing model and the Table spun on a permanent loading spinner at /project
  // (and on the Workspace canvas, same renderer). Dashboard must classify a
  // string-ref `data` against the fetched model registry and route a known model
  // name into useModelsData (and OUT of useInsightsData).
  /* eslint-disable no-template-curly-in-string */
  describe('model-data table data collection (VIS-827)', () => {
    const tableDashboard = {
      name: 'model-table-dash',
      rows: [
        {
          height: 'large',
          items: [
            { width: 12, table: 'wide-columns-overflow-test-table' },
          ],
        },
      ],
    };

    // Mirrors the /api/tables/ envelope: data is a bare context-string ref.
    const modelDataTable = {
      name: 'wide-columns-overflow-test-table',
      config: {
        name: 'wide-columns-overflow-test-table',
        data: '${ref(wide-columns-table)}',
        rows_per_page: 25,
      },
    };

    const renderWithModels = (models = []) => {
      useStore.mockImplementation(selector => {
        const state = {
          project: mockProject,
          dashboards: [tableDashboard],
          fetchDashboards: jest.fn(),
          fetchCharts: jest.fn(),
          fetchTables: jest.fn(),
          fetchMarkdowns: jest.fn(),
          fetchInputs: jest.fn(),
          fetchModels: jest.fn(),
          models,
          getChartByName: jest.fn(() => null),
          getTableByName: jest.fn(name =>
            name === 'wide-columns-overflow-test-table' ? modelDataTable : null
          ),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <Dashboard project={mockProject} dashboardName={tableDashboard.name} />
        </BrowserRouter>
      );
    };

    const lastModelNames = () => {
      const calls = useModelsData.mock.calls;
      return calls.length ? calls[calls.length - 1][1] : [];
    };
    const lastInsightNames = () => {
      const calls = useInsightsData.mock.calls;
      return calls.length ? calls[calls.length - 1][1] : [];
    };

    it('collects a known model into useModelsData (not useInsightsData)', () => {
      renderWithModels([{ name: 'wide-columns-table' }]);
      // The model backing the table must be fetched as a MODEL.
      expect(lastModelNames()).toContain('wide-columns-table');
      // ...and must NOT leak into the insight-fetch set (would 404 / never resolve).
      expect(lastInsightNames()).not.toContain('wide-columns-table');
    });

    it('renders the table item once classified as model-data', () => {
      renderWithModels([{ name: 'wide-columns-table' }]);
      expect(screen.getByTestId('table')).toHaveTextContent(
        'wide-columns-overflow-test-table'
      );
    });

    it('falls back to the insight bucket when the ref is not a known model', () => {
      // A string-ref data whose name is NOT in the model registry preserves the
      // prior behavior: it's treated as an insight-backed simple table.
      renderWithModels([]); // empty model registry
      expect(lastInsightNames()).toContain('wide-columns-table');
      expect(lastModelNames()).not.toContain('wide-columns-table');
    });
  });
  /* eslint-enable no-template-curly-in-string */

  // ---------- shared mount helper for item-type / data-collection tests ----------

  const mountDashboard = (
    dashboard,
    {
      charts = {},
      tables = {},
      markdowns = {},
      inputs = {},
      models = [],
      insightJobs = {},
      props = {},
    } = {}
  ) => {
    useStore.mockImplementation(selector => {
      const state = {
        project: mockProject,
        dashboards: [dashboard],
        fetchDashboards: jest.fn(),
        fetchCharts: jest.fn(),
        fetchTables: jest.fn(),
        fetchMarkdowns: jest.fn(),
        fetchInputs: jest.fn(),
        fetchModels: jest.fn(),
        models,
        insightJobs,
        getChartByName: jest.fn(name => charts[name] ?? null),
        getTableByName: jest.fn(name => tables[name] ?? null),
        getMarkdownByName: jest.fn(name => markdowns[name] ?? null),
        getInputByName: jest.fn(name => inputs[name] ?? null),
      };
      return selector(state);
    });
    return render(
      <BrowserRouter future={futureFlags}>
        <Dashboard project={mockProject} dashboardName={dashboard.name} {...props} />
      </BrowserRouter>
    );
  };

  // ---------- non-chart leaf items + broken-ref fallbacks ----------

  describe('leaf item rendering fallbacks', () => {
    it('renders a markdown item resolved from the store', () => {
      mountDashboard(
        {
          name: 'md-dash',
          rows: [{ height: 'medium', items: [{ markdown: 'notes', width: 1 }] }],
        },
        { markdowns: { notes: { config: { name: 'notes' } } } }
      );
      expect(screen.getByTestId('markdown')).toHaveTextContent('notes');
    });

    it('shows the legacy placeholder for an unresolvable markdown ref', () => {
      mountDashboard({
        name: 'md-missing',
        rows: [{ height: 'medium', items: [{ markdown: 'ghost-md', width: 1 }] }],
      });
      expect(screen.getByText(/Markdown not found: ghost-md/)).toBeInTheDocument();
    });

    it('renders an input item resolved from the store', () => {
      mountDashboard(
        {
          name: 'input-dash',
          rows: [{ height: 'compact', items: [{ input: 'region-picker', width: 1 }] }],
        },
        { inputs: { 'region-picker': { config: { name: 'region-picker' } } } }
      );
      expect(screen.getByTestId('input')).toHaveTextContent('region-picker');
    });

    it('shows the legacy placeholder for an unresolvable input ref', () => {
      mountDashboard({
        name: 'input-missing',
        rows: [{ height: 'compact', items: [{ input: 'ghost-input', width: 1 }] }],
      });
      expect(screen.getByText(/Input not found: ghost-input/)).toBeInTheDocument();
    });

    it('shows the legacy placeholder for an unresolvable table ref', () => {
      mountDashboard({
        name: 'table-missing',
        rows: [{ height: 'medium', items: [{ table: 'ghost-table', width: 1 }] }],
      });
      expect(screen.getByText(/Table not found: ghost-table/)).toBeInTheDocument();
    });

    it('delegates broken refs to renderBrokenRef with type, name, and item path (VIS-792)', () => {
      const renderBrokenRef = jest.fn(({ type, name, itemPath }) => (
        <div data-testid="broken-ref-card">{`${type}:${name}:${itemPath}`}</div>
      ));
      mountDashboard(
        {
          name: 'broken-canvas',
          rows: [{ height: 'medium', items: [{ chart: 'ghost-chart', width: 1 }] }],
        },
        { props: { renderBrokenRef } }
      );
      expect(screen.getByTestId('broken-ref-card')).toHaveTextContent(
        'chart:ghost-chart:row.0.item.0'
      );
      // The legacy inline text must NOT render when the canvas owns the card.
      expect(screen.queryByText(/Chart not found/)).not.toBeInTheDocument();
    });
  });

  // ---------- empty dashboard, canvas overlay variant ----------

  it('mounts a bare measurable root for an empty dashboard when hideEmptyPlaceholder is set', () => {
    const { container } = mountDashboard(
      { name: 'empty-dash', rows: [] },
      { props: { hideEmptyPlaceholder: true } }
    );
    expect(screen.queryByText('This dashboard is empty')).not.toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const root = container.querySelector('[data-dashboard-empty="true"]');
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('data-testid', 'dashboard_empty-dash');
  });

  // ---------- height mapping (enum → px) and nested weights ----------

  describe('height mapping', () => {
    it.each([
      ['large', '512px'],
      ['xlarge', '768px'],
      ['xxlarge', '1024px'],
    ])('maps row height %s to %s', (height, px) => {
      mountDashboard(
        {
          name: 'height-map',
          rows: [{ height, items: [{ chart: 'c', width: 1 }] }],
        },
        { charts: { c: { config: { name: 'c', insights: [] } } } }
      );
      expect(screen.getByTestId('dashboard-row-0').style.height).toBe(px);
    });

    it('maps every nested sub-row height token to its relative weight', () => {
      mountDashboard(
        {
          name: 'weights',
          rows: [
            {
              height: 'xxlarge',
              items: [
                {
                  width: 1,
                  rows: [
                    { height: 'compact', items: [{ chart: 'c' }] },
                    { height: 'xsmall', items: [{ chart: 'c' }] },
                    { height: 'medium', items: [{ chart: 'c' }] },
                    { height: 'xlarge', items: [{ chart: 'c' }] },
                    { height: 'xxlarge', items: [{ chart: 'c' }] },
                  ],
                },
              ],
            },
          ],
        },
        { charts: { c: { config: { name: 'c', insights: [] } } } }
      );
      const grows = screen
        .getAllByTestId('dashboard-nested-subrow')
        .map(el => parseFloat(el.style.flex.split(' ')[0]));
      expect(grows).toEqual([1, 1, 3, 6, 8]);
    });
  });

  // ---------- data collection: inputs, embedded table data, pivot refs ----------

  /* eslint-disable no-template-curly-in-string */
  describe('data-name collection', () => {
    const { useInputsData } = jest.requireMock('../../hooks/useInputsData');
    const lastModelNames = () => {
      const calls = useModelsData.mock.calls;
      return calls.length ? calls[calls.length - 1][1] : [];
    };
    const lastInsightNames = () => {
      const calls = useInsightsData.mock.calls;
      return calls.length ? calls[calls.length - 1][1] : [];
    };
    const lastInputNames = () => {
      const calls = useInputsData.mock.calls;
      return calls.length ? calls[calls.length - 1][1] : [];
    };

    it('prefetches input widgets found anywhere in the rows', () => {
      mountDashboard(
        {
          name: 'inputs-collect',
          rows: [
            {
              height: 'compact',
              items: [{ input: '${ref(region-picker)}' }, { input: { name: 'embedded-input' } }],
            },
          ],
        },
        { inputs: { 'region-picker': { config: { name: 'region-picker' } } } }
      );
      expect(lastInputNames()).toEqual(
        expect.arrayContaining(['region-picker', 'embedded-input'])
      );
    });

    it('unions insight input dependencies (and pending inputs) into the input prefetch', () => {
      mountDashboard(
        {
          name: 'insight-deps',
          rows: [{ height: 'medium', items: [{ chart: 'test-chart', width: 1 }] }],
        },
        {
          charts: { 'test-chart': mockChart },
          insightJobs: {
            'test-insight': {
              inputDependencies: ['dep-input'],
              pendingInputs: ['pending-input'],
            },
          },
        }
      );
      expect(lastInputNames()).toEqual(
        expect.arrayContaining(['dep-input', 'pending-input'])
      );
    });

    it('classifies an embedded table-data object by its model signature', () => {
      mountDashboard(
        {
          name: 'embedded-data',
          rows: [
            { height: 'medium', items: [{ table: 'model-table' }, { table: 'insight-table' }] },
          ],
        },
        {
          tables: {
            'model-table': {
              config: { name: 'model-table', data: { name: 'embedded-model', sql: 'select 1' } },
            },
            'insight-table': {
              config: { name: 'insight-table', data: { name: 'embedded-insight-data' } },
            },
          },
        }
      );
      expect(lastModelNames()).toContain('embedded-model');
      expect(lastModelNames()).not.toContain('embedded-insight-data');
      expect(lastInsightNames()).toContain('embedded-insight-data');
    });

    it('routes pivot refs to insights when known, models otherwise', () => {
      mountDashboard(
        {
          name: 'pivot-refs',
          rows: [
            {
              height: 'medium',
              items: [
                // The chart makes `test-insight` a KNOWN insight name.
                { chart: 'test-chart', width: 1 },
                { table: 'pivot-table', width: 1 },
              ],
            },
          ],
        },
        {
          charts: { 'test-chart': mockChart },
          tables: {
            'pivot-table': {
              config: {
                name: 'pivot-table',
                columns: ['${ref(colref-model)}'],
                rows: ['${ref(rowref-model)}'],
                values: ['${ref(test-insight)}'],
              },
            },
          },
        }
      );
      expect(lastModelNames()).toEqual(
        expect.arrayContaining(['colref-model', 'rowref-model'])
      );
      expect(lastModelNames()).not.toContain('test-insight');
      expect(lastInsightNames()).toContain('test-insight');
    });
  });
  /* eslint-enable no-template-curly-in-string */
});
