import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './Home';
import { futureFlags } from '../router-config';
import useStore from '../stores/store';

jest.mock('../stores/store', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./onboarding/OnboardingChecklist', () => () => <div data-testid="checklist" />);
jest.mock('./onboarding/OnboardingCoach', () => () => <div data-testid="coach" />);

const renderAt = async path => {
  useStore.mockImplementation(cb =>
    cb({
      isNewProject: false,
      isOnboardingRequested: false,
      hasUncommittedChanges: false,
      checkCommitStatus: jest.fn(),
      openCommitModal: jest.fn(),
    })
  );
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Home />,
        loader: () => null,
        children: [
          { path: 'agent', element: <div data-testid="agent-page" /> },
          { path: 'workspace', element: <div data-testid="workspace-page" /> },
        ],
      },
    ],
    { initialEntries: [path], future: futureFlags }
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} future={futureFlags} />
    </QueryClientProvider>
  );
  await act(
    () =>
      new Promise(resolve => {
        if (router.state.initialized) return resolve();
        const stop = router.subscribe(state => state.initialized && (stop(), resolve()));
      })
  );
};

test('the Agent tab hides the onboarding checklist and coach', async () => {
  await renderAt('/agent');
  expect(await screen.findByTestId('agent-page')).toBeInTheDocument();
  expect(screen.queryByTestId('checklist')).not.toBeInTheDocument();
  expect(screen.queryByTestId('coach')).not.toBeInTheDocument();
});

test('other pages keep the onboarding checklist and coach', async () => {
  await renderAt('/workspace');
  expect(await screen.findByTestId('workspace-page')).toBeInTheDocument();
  expect(screen.getByTestId('checklist')).toBeInTheDocument();
  expect(screen.getByTestId('coach')).toBeInTheDocument();
});
