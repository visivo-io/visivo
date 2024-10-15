import { render, screen, waitFor } from '@testing-library/react';
import Home from './Home';
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QueryProvider } from '../contexts/QueryContext'


const queryClient = new QueryClient()

const loadError = () => {
  return { message: "Error Message" }
}

const fetchProjectHistoryQuery = (projectId) => ({
  queryKey: ['project_history', projectId],
  queryFn: () => [{ id: 1, created_at: '2024-01-01' }],
})

const routes = [
  {
    path: "/",
    element: <Home />,
    loader: loadError
  },
];

const router = createMemoryRouter(routes, {
  initialEntries: ["/"],
  initialIndex: 0,
});

test('renders error message', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <QueryProvider value={{ fetchProjectHistoryQuery }}>
        <RouterProvider router={router} />
      </QueryProvider>
    </QueryClientProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('Error Message')).toBeInTheDocument();
  });
});