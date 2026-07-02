import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import selectEvent from 'react-select-event';
import StageSelection from './StageSelection';
import { readOnboardingState, clearOnboardingState } from '../onboarding/onboardingState';

jest.mock('../common/Loading', () => () => <div data-testid="loading-spinner" />);
jest.mock('./DeployLoader', () => ({ message }) => (
  <div data-testid="deploy-loader">{message}</div>
));
jest.mock('./AddStageForm', () => ({ onClose }) => (
  <div data-testid="add-stage-form">
    <button onClick={onClose}>close-add-stage</button>
  </div>
));

// Mock fetch
global.fetch = jest.fn();

const mockStages = {
  stages: [
    { id: 1, name: 'staging' },
    { id: 2, name: 'production' },
  ],
};

let consoleSpy;

beforeEach(() => {
  consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  fetch.mockReset();
  clearOnboardingState();
});

afterEach(() => {
  consoleSpy.mockRestore();
  jest.useRealTimers();
});

it('renders loader while fetching stages', async () => {
  fetch.mockImplementation(
    () => new Promise(() => {}) // keep loading
  );

  render(<StageSelection status="stage" />);
  expect(await screen.findByTestId('deploy-loader')).toHaveTextContent('Loading Stages...');
});

it('displays fetched stages in select dropdown', async () => {
  fetch.mockResolvedValueOnce({
    json: async () => mockStages,
  });

  render(<StageSelection status="stage" />);

  const select = await screen.findByTestId('stage-select');
  // Options render as real DOM when the brand <Select> menu opens.
  fireEvent.mouseDown(within(select).getByRole('combobox'));
  const optionText = screen.getAllByRole('option').map(o => o.textContent);
  mockStages.stages.forEach(stage => {
    expect(optionText).toContain(stage.name);
  });
});

it('handles stage selection and enables deploy button', async () => {
  fetch.mockResolvedValueOnce({
    json: async () => mockStages,
  });

  render(<StageSelection status="stage" />);

  await screen.findByTestId('stage-select');
  await selectEvent.select(
    within(screen.getByTestId('stage-select')).getByRole('combobox'),
    'staging',
    { container: document.body }
  );

  const button = screen.getByRole('button', { name: /deploy to staging/i });
  expect(button).not.toBeDisabled();
});

it('disables deploy button if no stage selected', async () => {
  fetch.mockResolvedValueOnce({
    json: async () => mockStages,
  });

  render(<StageSelection status="stage" />);
  const button = await screen.findByRole('button', { name: /deploy to stage/i });
  expect(button).toBeDisabled();
});

it('shows "no stages" message if stages are empty', async () => {
  fetch.mockResolvedValueOnce({
    json: async () => ({ stages: [] }),
  });

  render(<StageSelection status="stage" />);
  expect(await screen.findByText(/no stages available/i)).toBeInTheDocument();
});

it('triggers deployment when clicking Deploy', async () => {
  fetch
    .mockResolvedValueOnce({ json: async () => mockStages }) // for /stages
    .mockResolvedValueOnce({
      // for /deploy
      ok: true,
      json: async () => ({ deploy_id: 'abc123' }),
    });

  render(<StageSelection status="stage" />);
  await screen.findByTestId('stage-select');
  // Pick the stage via the brand <Select> (open the portaled menu + click) before
  // switching to fake timers — react-select-event's async helpers need real timers.
  const combo = within(screen.getByTestId('stage-select')).getByRole('combobox');
  fireEvent.mouseDown(combo);
  fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'staging'));

  jest.useFakeTimers();

  const deployButton = screen.getByRole('button', { name: /deploy to staging/i });
  fireEvent.click(deployButton);

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith('/api/cloud/deploy/', expect.any(Object));
  });

  jest.useRealTimers();
});

it('shows error state on fetch failure', async () => {
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  fetch.mockRejectedValueOnce(new Error('API failure'));

  render(<StageSelection status="stage" />);
  expect(await screen.findByText(/no stages available/i)).toBeInTheDocument();

  consoleSpy.mockRestore();
});

it('does not fetch stages unless the flow is on the stage step', () => {
  render(<StageSelection status="auth" />);
  expect(fetch).not.toHaveBeenCalled();
});

it('toggles the Add New Stage form open and closed', async () => {
  fetch.mockResolvedValueOnce({ json: async () => mockStages });

  render(<StageSelection status="stage" />);
  await screen.findByTestId('stage-select');

  fireEvent.click(screen.getByRole('button', { name: /add new stage/i }));
  expect(screen.getByTestId('add-stage-form')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /add new stage/i })).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('close-add-stage'));
  expect(screen.queryByTestId('add-stage-form')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add new stage/i })).toBeInTheDocument();
});

it('shows the readiness info box once a stage is selected', async () => {
  fetch.mockResolvedValueOnce({ json: async () => mockStages });

  render(<StageSelection status="stage" />);
  await screen.findByTestId('stage-select');
  await selectEvent.select(
    within(screen.getByTestId('stage-select')).getByRole('combobox'),
    'production',
    { container: document.body }
  );

  expect(screen.getByText(/ready to deploy to production/i)).toBeInTheDocument();
});

// ---------------------------------------------------------------- deployment

// Routes fetch by URL: stage list + deploy POST succeed; the job-status poll is
// delegated to the given responder so each test drives a different outcome.
const routeFetch = statusResponder => {
  fetch.mockImplementation(url => {
    if (url === '/api/cloud/stages/') {
      return Promise.resolve({ json: async () => mockStages });
    }
    if (url === '/api/cloud/deploy/') {
      return Promise.resolve({ ok: true, json: async () => ({ deploy_id: 'deploy-1' }) });
    }
    if (String(url).startsWith('/api/cloud/job/status/')) {
      return statusResponder(url);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
};

const statusCallCount = () =>
  fetch.mock.calls.filter(([url]) => String(url).startsWith('/api/cloud/job/status/')).length;

// Renders, waits for stages, and picks "staging" (real timers required for the
// menu interaction; individual tests switch to fake timers before deploying).
const renderAndPickStaging = async () => {
  render(<StageSelection status="stage" />);
  await screen.findByTestId('stage-select');
  const combo = within(screen.getByTestId('stage-select')).getByRole('combobox');
  fireEvent.mouseDown(combo);
  fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'staging'));
};

describe('deployment polling', () => {
  it('reaches the success state with a live preview link on status 201', async () => {
    routeFetch(() =>
      Promise.resolve({
        json: async () => ({ status: 201, message: 'Deployed!', project_url: '/projects/42' }),
      })
    );
    await renderAndPickStaging();

    jest.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /deploy to staging/i }));

    // Wait for the deploy POST to resolve and register the 2s poll interval.
    await waitFor(() => expect(jest.getTimerCount()).toBeGreaterThan(0));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(await screen.findByText('Deployment Successful!')).toBeInTheDocument();
    expect(
      screen.getByText(/successfully deployed to staging/i)
    ).toBeInTheDocument();
    const preview = screen.getByRole('link', { name: /view live preview/i });
    expect(preview).toHaveAttribute('href', 'https://app.visivo.io/projects/42');
    // Success also taps the onboarding "Deploy to share" checklist.
    expect(readOnboardingState()?.deployed_at).toBeTruthy();
    // Poll stops after success.
    const polls = statusCallCount();
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(statusCallCount()).toBe(polls);
  });

  it('offers Deploy Again from the success state and returns to the form', async () => {
    routeFetch(() =>
      Promise.resolve({ json: async () => ({ status: 201, message: 'Deployed!' }) })
    );
    await renderAndPickStaging();

    jest.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /deploy to staging/i }));
    // Wait for the deploy POST to resolve and register the 2s poll interval.
    await waitFor(() => expect(jest.getTimerCount()).toBeGreaterThan(0));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    await screen.findByText('Deployment Successful!');
    // No project_url in the response → no preview link.
    expect(screen.queryByRole('link', { name: /view live preview/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /deploy again/i }));
    expect(screen.getByText('Select Deployment Stage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deploy to staging/i })).not.toBeDisabled();
  });

  it('stops polling and restores the form when the job reports a failure status', async () => {
    routeFetch(() =>
      Promise.resolve({ json: async () => ({ status: 400, message: 'Build failed' }) })
    );
    await renderAndPickStaging();

    jest.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /deploy to staging/i }));
    // Wait for the deploy POST to resolve and register the 2s poll interval.
    await waitFor(() => expect(jest.getTimerCount()).toBeGreaterThan(0));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /deploy to staging/i })).not.toBeDisabled()
    );
    expect(screen.queryByText('Deployment Successful!')).not.toBeInTheDocument();
    // The interval is cleared — no further polls.
    const polls = statusCallCount();
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(statusCallCount()).toBe(polls);
  });

  it('stops polling and restores the form when the status endpoint throws', async () => {
    routeFetch(() => Promise.reject(new Error('network down')));
    await renderAndPickStaging();

    jest.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /deploy to staging/i }));
    // Wait for the deploy POST to resolve and register the 2s poll interval.
    await waitFor(() => expect(jest.getTimerCount()).toBeGreaterThan(0));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /deploy to staging/i })).not.toBeDisabled()
    );
    const polls = statusCallCount();
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(statusCallCount()).toBe(polls);
  });

  it('recovers without polling when the deploy POST itself fails', async () => {
    fetch.mockImplementation(url => {
      if (url === '/api/cloud/stages/') {
        return Promise.resolve({ json: async () => mockStages });
      }
      if (url === '/api/cloud/deploy/') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    await renderAndPickStaging();

    fireEvent.click(screen.getByRole('button', { name: /deploy to staging/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /deploy to staging/i })).not.toBeDisabled()
    );
    expect(statusCallCount()).toBe(0);
    expect(screen.queryByText('Deployment Successful!')).not.toBeInTheDocument();
  });
});
