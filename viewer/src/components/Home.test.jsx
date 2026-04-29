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

const buildRouter = () =>
  createMemoryRouter(
    [
      {
        path: '/',
        element: <Home />,
        loader: loadError,
      },
      {
        path: '/onboarding',
        element: <div data-testid="onboarding-route">Onboarding here</div>,
      },
    ],
    {
      initialEntries: ['/'],
      initialIndex: 0,
      future: futureFlags,
    }
  );

const renderWithStore = storeState => {
  useStore.mockImplementation(cb =>
    cb({
      isNewProject: false,
      isOnboardingRequested: false,
      hasUnpublishedChanges: false,
      checkPublishStatus: jest.fn(),
      openPublishModal: jest.fn(),
      ...storeState,
    })
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={buildRouter()} future={futureFlags} />
    </QueryClientProvider>
  );
};

test('renders error message', async () => {
  renderWithStore({ isNewProject: false, isOnboardingRequested: false });

  await waitFor(() => {
    expect(screen.getByText('Error Message')).toBeInTheDocument();
  });
});

test('redirects to /onboarding when isOnboardingRequested is true', async () => {
  renderWithStore({ isNewProject: false, isOnboardingRequested: true });

  await waitFor(() => {
    expect(screen.getByTestId('onboarding-route')).toBeInTheDocument();
  });
});

test('does not redirect when isOnboardingRequested is false', async () => {
  renderWithStore({ isNewProject: false, isOnboardingRequested: false });

  // Should NOT navigate to onboarding; the home page renders instead.
  await waitFor(() => {
    expect(screen.queryByTestId('onboarding-route')).not.toBeInTheDocument();
  });
});
