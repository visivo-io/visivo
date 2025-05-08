import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import ProjectHistory from './ProjectHistory';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();

const loadProject = () => {
  return { created_at: '2024-08-07T13:07:34Z', id: '1' };
};

const routes = [
  {
    path: '/:project',
    element: <ProjectHistory />,
    id: 'project',
    loader: loadProject,
  },
];

const router = createMemoryRouter(routes, {
  initialEntries: ['/project'],
  initialIndex: 0,
});

test('renders date', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  await waitFor(() => {
    expect(screen.getByTestId('project-history')).toBeInTheDocument();
  });
  expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
});
