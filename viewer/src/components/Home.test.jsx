import { render, screen, waitFor } from '@testing-library/react';
import Home from './Home';
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

const loadError = () => {
  return { message: "Error Message" }
}

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
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('Error Message')).toBeInTheDocument();
  });
});