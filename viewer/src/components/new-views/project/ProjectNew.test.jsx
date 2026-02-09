import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProjectNew from './ProjectNew';
import useStore from '../../../stores/store';

// Mock the stores
jest.mock('../../../stores/store');

// Mock react-router-dom hooks
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ dashboardName: 'test-dashboard' }),
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

describe('ProjectNew', () => {
  const mockProject = { id: 'project-1', name: 'Test Project' };

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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProjectNew />} />
        </Routes>
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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProjectNew />} />
        </Routes>
      </BrowserRouter>
    );

    expect(screen.getByText('This dashboard is empty')).toBeInTheDocument();
  });

  it('renders chart when found in store', () => {
    render(
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProjectNew />} />
        </Routes>
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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProjectNew />} />
        </Routes>
      </BrowserRouter>
    );

    expect(screen.getByText(/Chart not found/)).toBeInTheDocument();
  });

  it('fetches all data on mount', () => {
    const fetchDashboards = jest.fn();
    const fetchCharts = jest.fn();
    const fetchTables = jest.fn();
    const fetchMarkdowns = jest.fn();
    const fetchInputs = jest.fn();

    useStore.mockImplementation((selector) => {
      const state = {
        project: mockProject,
        dashboards: [mockDashboard],
        fetchDashboards,
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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProjectNew />} />
        </Routes>
      </BrowserRouter>
    );

    expect(fetchDashboards).toHaveBeenCalled();
    expect(fetchCharts).toHaveBeenCalled();
    expect(fetchTables).toHaveBeenCalled();
    expect(fetchMarkdowns).toHaveBeenCalled();
    expect(fetchInputs).toHaveBeenCalled();
  });
});
