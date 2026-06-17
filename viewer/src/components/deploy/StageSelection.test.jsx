import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import selectEvent from 'react-select-event';
import StageSelection from './StageSelection';

jest.mock('../common/Loading', () => () => <div data-testid="loading-spinner" />);
jest.mock('./DeployLoader', () => ({ message }) => (
  <div data-testid="deploy-loader">{message}</div>
));
jest.mock('./AddStageForm', () => () => <div data-testid="add-stage-form" />);

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
});

afterEach(() => {
  consoleSpy.mockRestore();
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
