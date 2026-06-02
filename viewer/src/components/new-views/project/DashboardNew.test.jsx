import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { futureFlags } from '../../../router-config';
import DashboardNew from './DashboardNew';
import useStore from '../../../stores/store';

// Mock the stores
jest.mock('../../../stores/store');

// Mock react-router-dom hooks
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

// Mock the dimension hook
jest.mock('react-cool-dimensions', () => ({
  __esModule: true,
  default: () => ({
    observe: jest.fn(),
    width: 1200,
  }),
}));

// Mock the hooks
jest.mock('../../../hooks/useInsightsData', () => ({
  useInsightsData: jest.fn(),
}));

jest.mock('../../../hooks/useInputsData', () => ({
  useInputsData: jest.fn(),
}));

jest.mock('../../../hooks/useVisibleRows', () => ({
  useVisibleRows: jest.fn(() => ({
    visibleRows: new Set([0]),
    setRowRef: jest.fn(),
  })),
}));

// Mock the item components.
// `data-insights` exposes the resolved insights array DashboardNew hands the
// Chart so VIS-827 normalization (string refs -> {name} objects) is assertable.
jest.mock('../../items/Chart', () => ({
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

jest.mock('../../items/Table', () => ({
  __esModule: true,
  default: ({ table }) => <div data-testid="table">{table.name || 'Table'}</div>,
}));

jest.mock('../../items/Markdown', () => ({
  __esModule: true,
  default: ({ markdown }) => <div data-testid="markdown">{markdown.name || 'Markdown'}</div>,
}));

jest.mock('../../items/Input', () => ({
  __esModule: true,
  default: ({ input }) => <div data-testid="input">{input.name || 'Input'}</div>,
}));

describe('DashboardNew', () => {
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
        getChartByName: jest.fn(),
        getTableByName: jest.fn(),
        getMarkdownByName: jest.fn(),
        getInputByName: jest.fn(),
      };
      return selector(state);
    });

    render(
      <BrowserRouter future={futureFlags}>
        <DashboardNew project={mockProject} dashboardName={dashboardName} />
      </BrowserRouter>
    );

    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });

  // ---------- VIS-827: eager-load all rows on the new renderer ----------
  //
  // The Workspace canvas mounts <DashboardNew> inside an inner overflow-auto
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
          getChartByName: jest.fn(name => chartConfigs[name] ?? null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <DashboardNew project={mockProject} dashboardName="two-row" {...props} />
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
        getChartByName: jest.fn(),
        getTableByName: jest.fn(),
        getMarkdownByName: jest.fn(),
        getInputByName: jest.fn(),
      };
      return selector(state);
    });

    render(
      <BrowserRouter future={futureFlags}>
        <DashboardNew project={mockProject} dashboardName={dashboardName} />
      </BrowserRouter>
    );

    expect(screen.getByText('This dashboard is empty')).toBeInTheDocument();
  });

  it('renders chart when found in store', () => {
    render(
      <BrowserRouter future={futureFlags}>
        <DashboardNew project={mockProject} dashboardName={dashboardName} />
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
        getChartByName: jest.fn(() => null), // Chart not found
        getTableByName: jest.fn(() => null),
        getMarkdownByName: jest.fn(() => null),
        getInputByName: jest.fn(() => null),
      };
      return selector(state);
    });

    render(
      <BrowserRouter future={futureFlags}>
        <DashboardNew project={mockProject} dashboardName={dashboardName} />
      </BrowserRouter>
    );

    expect(screen.getByText(/Chart not found/)).toBeInTheDocument();
  });

  it('fetches item data on mount', () => {
    const fetchCharts = jest.fn();
    const fetchTables = jest.fn();
    const fetchMarkdowns = jest.fn();
    const fetchInputs = jest.fn();

    useStore.mockImplementation((selector) => {
      const state = {
        project: mockProject,
        dashboards: [mockDashboard],
        fetchCharts,
        fetchTables,
        fetchMarkdowns,
        fetchInputs,
        getChartByName: jest.fn((name) => name === 'test-chart' ? mockChart : null),
        getTableByName: jest.fn(() => null),
        getMarkdownByName: jest.fn(() => null),
        getInputByName: jest.fn(() => null),
      };
      return selector(state);
    });

    render(
      <BrowserRouter future={futureFlags}>
        <DashboardNew project={mockProject} dashboardName={dashboardName} />
      </BrowserRouter>
    );

    expect(fetchCharts).toHaveBeenCalled();
    expect(fetchTables).toHaveBeenCalled();
    expect(fetchMarkdowns).toHaveBeenCalled();
    expect(fetchInputs).toHaveBeenCalled();
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
          getChartByName: jest.fn(name => charts[name] ?? null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <DashboardNew project={mockProject} dashboardName={dashboard.name} />
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
      // small=2 weight, large=4 weight per heightToWeight in DashboardNew.jsx.
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
          getChartByName: jest.fn((name) => (name === 'test-chart' ? mockChart : null)),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      render(
        <BrowserRouter future={futureFlags}>
          <DashboardNew project={mockProject} dashboardName="height-test" />
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
  // <DashboardNew> uses on both /project-new and the Workspace canvas lens),
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
          getChartByName: jest.fn(name => charts[name] ?? null),
          getTableByName: jest.fn(() => null),
          getMarkdownByName: jest.fn(() => null),
          getInputByName: jest.fn(() => null),
        };
        return selector(state);
      });
      return render(
        <BrowserRouter future={futureFlags}>
          <DashboardNew project={mockProject} dashboardName={dashboard.name} />
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
});
