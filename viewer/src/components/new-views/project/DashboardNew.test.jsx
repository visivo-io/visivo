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

// Mock the item components
jest.mock('../../items/Chart', () => ({
  __esModule: true,
  default: ({ chart }) => <div data-testid="chart">{chart.name || 'Chart'}</div>,
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
});
