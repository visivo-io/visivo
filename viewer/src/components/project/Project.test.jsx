import { render, screen } from '@testing-library/react';
import Project from './Project';
import QueryContext from '../../contexts/QueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router-dom';
import { RouterProvider } from 'react-router-dom';
import { futureFlags } from '../../router-config';
// Mock window.scrollTo
beforeAll(() => {
  window.scrollTo = jest.fn();
});

afterAll(() => {
  window.scrollTo.mockRestore();
});

const getProject = items => {
  return {
    project_json: {
      selectors: [],
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
    },
  };
};

const fetchTraces = () => {
  return [];
};

const mockQueryContext = {
  fetchDashboardQuery: () => ({
    queryFn: jest.fn().mockResolvedValue(project),
    queryKey: ['dashboard'],
  }),
};

// Create a new QueryClient instance for each test
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});
const project = getProject([{ width: 1, markdown: 'First Markdown' }]);
const loadProject = () => {
  return { ...project, created_at: '2024-08-07T13:07:34Z', id: '1' };
};

test('renders dashboard overview without dashboard name param', async () => {
  let dashboardName = null;
  const routes = [
    {
      path: '/:dashboardName?',
      element: (
        <Project
          project={project}
          fetchTraces={fetchTraces}
          dashboardName={dashboardName}
          dashboards={[{ name: 'dashboard', path: '/dashboard' }]}
        />
      ),
      id: 'project',
      loader: loadProject,
    },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: ['/'],
    initialIndex: 0,
    future: futureFlags,
  });

  render(
    <QueryClientProvider client={queryClient}>
      <QueryContext.Provider value={mockQueryContext}>
        <RouterProvider router={router} future={futureFlags} />
      </QueryContext.Provider>
    </QueryClientProvider>
  );

  const unassignedSection = await screen.findByText('Unassigned', {}, { timeout: 3000 });
  expect(unassignedSection).toBeInTheDocument();
});

test('renders dashboard with dashboard name param', async () => {
  let dashboardName = 'dashboard';
  const routes = [
    {
      path: '/:dashboardName?',
      element: (
        <Project
          project={project}
          fetchTraces={fetchTraces}
          dashboardName={dashboardName}
          dashboards={[{ name: 'dashboard', path: '/dashboard' }]}
        />
      ),
      id: 'project',
      loader: loadProject,
    },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: ['/dashboard'],
    initialIndex: 0,
    future: futureFlags,
  });

  render(
    <QueryClientProvider client={queryClient}>
      <QueryContext.Provider value={mockQueryContext}>
        <RouterProvider router={router} future={futureFlags} />
      </QueryContext.Provider>
    </QueryClientProvider>
  );

  const unassignedSection = screen.queryByText('Unassigned');
  expect(unassignedSection).not.toBeInTheDocument();

  const dashboard = await screen.findByText(/First Markdown/);
  expect(dashboard).toBeInTheDocument();
});
