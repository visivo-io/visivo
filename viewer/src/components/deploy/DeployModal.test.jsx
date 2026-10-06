import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DeployModal from './DeployModal';
import { fetchAuthorization } from '../../api/authorization';

// The shared client, not raw fetch: Deploy and the Agent tab ask the same
// question through the same code (VIS-1377).
jest.mock('../../api/authorization', () => ({ fetchAuthorization: jest.fn() }));

// Mock child components
jest.mock('./Authentication', () => ({ setStatus }) => (
  <div data-testid="authentication">Authentication Component</div>
));
jest.mock('./BranchSelection', () => ({ status }) => (
  <div data-testid="branch-selection">BranchSelection Component</div>
));
jest.mock('./DeployLoader', () => () => <div data-testid="deploy-loader">Loading...</div>);

beforeEach(() => {
  jest.clearAllMocks();
  fetchAuthorization.mockResolvedValue({ authorized: false, host: 'https://app.visivo.io' });
});

it('should not render when isOpen is false', () => {
  render(<DeployModal isOpen={false} setIsOpen={jest.fn()} />);
  expect(screen.queryByTestId('modal-container')).not.toBeInTheDocument();
  // Nothing is asked while the modal is closed.
  expect(fetchAuthorization).not.toHaveBeenCalled();
});

it('renders Authentication when this serve is not authorized', async () => {
  render(<DeployModal isOpen={true} setIsOpen={jest.fn()} />);

  expect(screen.getByTestId('deploy-loader')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByTestId('authentication')).toBeInTheDocument();
  });
});

it('renders BranchSelection when it is', async () => {
  // Reads `authorized`, not a token. The endpoint no longer hands the token
  // to the browser, and this never had a use for it.
  fetchAuthorization.mockResolvedValue({ authorized: true, host: 'https://app.visivo.io' });

  render(<DeployModal isOpen={true} setIsOpen={jest.fn()} />);

  expect(screen.getByTestId('deploy-loader')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByTestId('branch-selection')).toBeInTheDocument();
  });
});

it('renders Authentication when the status cannot be read', async () => {
  fetchAuthorization.mockRejectedValue(new Error('Fetch failed'));

  render(<DeployModal isOpen={true} setIsOpen={jest.fn()} />);

  expect(screen.getByTestId('deploy-loader')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByTestId('authentication')).toBeInTheDocument();
  });
});

it('closes modal when close button is clicked', async () => {
  const mockSetIsOpen = jest.fn();
  render(<DeployModal isOpen={true} setIsOpen={mockSetIsOpen} />);

  await waitFor(() => {
    expect(screen.getByTestId('authentication')).toBeInTheDocument();
  });

  const closeButton = screen.getByRole('button');
  fireEvent.click(closeButton);
  expect(mockSetIsOpen).toHaveBeenCalledWith(false);
});
