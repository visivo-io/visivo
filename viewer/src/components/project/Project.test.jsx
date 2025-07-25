import { render, screen } from '@testing-library/react';
import Project from './Project';
import { URLProvider } from '../../contexts/URLContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { futureFlags } from '../../router-config';

// Mock window.scrollTo
beforeAll(() => {
  window.scrollTo = jest.fn();
});

// Mock Dashboard component
jest.mock('./Dashboard', () => ({ project, dashboardName }) => (
  <div data-testid="dashboard-component">Dashboard: {dashboardName}</div>
));

jest.mock('../../stores/store', () => {
  const { create } = require('zustand');

  const useStore = create(() => ({
    setScrollPosition: jest.fn(),
    scrollPositions: {},
    filteredDashboards: [],
    dashboardsByLevel: {
      Unassigned: [
        {
          name: 'dashboard',
          rows: [
            {
              height: 'medium',
              items: [
                {
                  width: 1,
                  markdown: 'First Markdown',
                },
              ],
            },
          ],
        },
      ],
    },
    setDashboards: jest.fn(),
    setCurrentDashboardName: jest.fn(),
    filterDashboards: jest.fn(),
    searchTerm: '',
    setSearchTerm: jest.fn(),
    selectedTags: [],
    setSelectedTags: jest.fn(),
    availableTags: [],
  }));

  return {
    __esModule: true,
    default: useStore,
  };
});

// Create a new QueryClient instance for each test
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const getProject = items => {
  return {
    id: 1,
    project_json: {
      dashboards: [
        {
          name: 'dashboard',
          rows: [
            {
              height: 'medium',
              items: items,
            },
          ],
        },
      ],
      defaults: {},
    },
  };
};

const project = getProject([{ width: 1, markdown: 'First Markdown' }]);
const mockProject = project;
const fetchTraces = jest.fn();

describe('Project Component', () => {
  test('renders dashboard overview without dashboard name param', async () => {
    const routes = [
      {
        path: '/:dashboardName?',
        element: <Project project={mockProject} dashboardName={null} fetchTraces={fetchTraces} />,
      },
    ];

    const router = createMemoryRouter(routes, {
      initialEntries: ['/'],
      future: futureFlags,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <URLProvider environment="server">
          <RouterProvider router={router} future={futureFlags} />
        </URLProvider>
      </QueryClientProvider>
    );

    const unassignedSection = await screen.findByText('Unassigned', {}, { timeout: 3000 });
    expect(unassignedSection).toBeInTheDocument();
  });

  test('renders dashboard with dashboard name param', async () => {
    const routes = [
      {
        path: '/:dashboardName?',
        element: (
          <Project project={mockProject} dashboardName="dashboard" fetchTraces={fetchTraces} />
        ),
      },
    ];

    const router = createMemoryRouter(routes, {
      initialEntries: ['/dashboard'],
      future: futureFlags,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <URLProvider environment="server">
          <RouterProvider router={router} future={futureFlags} />
        </URLProvider>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('dashboard-component')).toBeInTheDocument();
    expect(screen.getByText('Dashboard: dashboard')).toBeInTheDocument();
  });
});
