import { render, screen, waitFor } from '@testing-library/react';
import Home from './Home';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { futureFlags } from '../router-config';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useStore from '../stores/store';

jest.mock('../stores/store', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const queryClient = new QueryClient();

const loadError = () => {
  return { message: 'Error Message' };
};

const routes = [
  {
    path: '/',
    element: <Home />,
    loader: loadError,
  },
];

const router = createMemoryRouter(routes, {
  initialEntries: ['/'],
  initialIndex: 0,
  future: futureFlags,
});

test('renders error message', async () => {
  useStore.mockImplementation(cb => cb({ isNewProject: false }));

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} future={futureFlags} />
    </QueryClientProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('Error Message')).toBeInTheDocument();
  });
});
