import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Home from './Home';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { futureFlags } from '../router-config';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useStore from '../stores/store';

jest.mock('../stores/store', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// DeployModal drives its own auth/deploy fetch cycle when opened; stub it so
// Home's open/close wiring can be asserted without network side effects.
jest.mock('./deploy/DeployModal', () => ({ isOpen }) =>
  isOpen ? <div data-testid="deploy-modal-open" /> : null
);

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
      hasUncommittedChanges: false,
      checkCommitStatus: jest.fn(),
      openCommitModal: jest.fn(),
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

test('renders the three navigation cards at the root route', async () => {
  renderWithStore({});
  await waitFor(() => {
    expect(screen.getByText('Explore and analyze your data')).toBeInTheDocument();
  });
  expect(screen.getByText('Build dashboards, edit your project, and explore lineage')).toBeInTheDocument();
  expect(screen.getByText("View your project's dashboards and visualizations")).toBeInTheDocument();
});

test('shows a full-screen loading state while isNewProject is still unknown', async () => {
  renderWithStore({ isNewProject: undefined });
  expect(await screen.findByRole('status')).toBeInTheDocument();
  // None of the home chrome renders yet.
  expect(screen.queryByText('Explore and analyze your data')).not.toBeInTheDocument();
});

test('probes capabilities then refreshes commit status when a project is active', async () => {
  const fetchCapabilities = jest.fn().mockResolvedValue(undefined);
  const checkCommitStatus = jest.fn().mockResolvedValue(undefined);
  renderWithStore({
    project: { id: 'proj-1' },
    fetchCapabilities,
    checkCommitStatus,
  });

  await waitFor(() => expect(fetchCapabilities).toHaveBeenCalled());
  await waitFor(() => expect(checkCommitStatus).toHaveBeenCalled());
});

test('restricts the tools to Dashboards when capabilities say not-a-draft', async () => {
  renderWithStore({ capabilities: { is_draft: false } });
  expect(await screen.findByTitle('Dashboards')).toBeInTheDocument();
  expect(screen.queryByTitle('Explorer')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Workspace')).not.toBeInTheDocument();
});

test('keeps the full tool set while on an editable draft', async () => {
  renderWithStore({ capabilities: { is_draft: true } });
  expect(await screen.findByTitle('Explorer')).toBeInTheDocument();
  expect(screen.getByTitle('Workspace')).toBeInTheDocument();
  expect(screen.getByTitle('Dashboards')).toBeInTheDocument();
});

test('Deploy button toggles the deploy modal open', async () => {
  // Deploy surfaces on a clean project (nothing to commit, ready to ship).
  renderWithStore({ hasUncommittedChanges: false });
  expect(await screen.findByTitle('Deploy')).toBeInTheDocument();
  expect(screen.queryByTestId('deploy-modal-open')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Deploy'));
  expect(screen.getByTestId('deploy-modal-open')).toBeInTheDocument();
});

test('Commit button opens the commit modal and badges the pending count', async () => {
  const openCommitModal = jest.fn();
  renderWithStore({ hasUncommittedChanges: true, pendingCount: 4, openCommitModal });
  expect(await screen.findByTitle('Commit changes')).toBeInTheDocument();
  expect(screen.getByTitle('Commit changes')).toHaveTextContent(/Commit\s*4/);
  fireEvent.click(screen.getByTitle('Commit changes'));
  expect(openCommitModal).toHaveBeenCalledTimes(1);
});
