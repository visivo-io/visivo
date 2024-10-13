import { render, screen, waitFor } from '@testing-library/react';
import Home from './Home';
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as projectHistoryApi from '../api/project_history';

const queryClient = new QueryClient()

const loadError = () => {
  return { message: "Error Message" }
}

beforeEach(() => {
  jest.spyOn(projectHistoryApi, "fetchProjectHistories").mockResolvedValue(
    [
      { id: "1", created_at: "2024-08-07T13:07:34Z" },
      { id: "2", created_at: "2024-08-07T13:08:34Z" },
    ]
  )
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
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('Error Message')).toBeInTheDocument();
  });
});