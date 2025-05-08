import { render, screen } from '@testing-library/react';
import Project from './Project';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QueryContext from '../../contexts/QueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
  fetchDashboardQuery: jest.fn(),
};

// Create a new QueryClient instance for each test
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

test('renders dashboard names without dashboard name param', async () => {
  const project = getProject([{ width: 1, markdown: 'First Markdown' }]);
  render(
    <QueryClientProvider client={queryClient}>
      <QueryContext.Provider value={mockQueryContext}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/:dashboardName?"
              element={
                <Project
                  project={project}
                  fetchTraces={fetchTraces}
                  dashboardName={null}
                  dashboards={[{ name: 'dashboard', path: '/dashboard' }]}
                />
              }
            />
            )
          </Routes>
        </MemoryRouter>
      </QueryContext.Provider>
    </QueryClientProvider>
  );

  const text = await screen.findByRole('heading', {
    name: /dashboard/i,
    level: 3,
  });
  expect(text).toBeInTheDocument();
});

test('renders dashboard with dashboard name param', async () => {
  const project = getProject([{ width: 1, markdown: 'First Markdown' }]);

  render(
    <QueryClientProvider client={queryClient}>
      <QueryContext.Provider value={mockQueryContext}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/:dashboardName?"
              element={
                <Project
                  project={project}
                  fetchTraces={fetchTraces}
                  dashboardName={'dashboard'}
                  dashboards={[{ name: 'dashboard', path: '/dashboard' }]}
                />
              }
            />
            )
          </Routes>
        </MemoryRouter>
      </QueryContext.Provider>
    </QueryClientProvider>
  );

  const text = await screen.findByText(/First Markdown/);
  expect(text).toBeInTheDocument();
});
