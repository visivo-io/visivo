import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DeployModal from './DeployModal';

// Mock child components
jest.mock('./Authentication', () => ({ setStatus }) => (
  <div data-testid="authentication">Authentication Component</div>
));
jest.mock('./StageSelection', () => ({ status }) => (
  <div data-testid="stage-selection">StageSelection Component</div>
));
jest.mock('./DeployLoader', () => () => <div data-testid="deploy-loader">Loading...</div>);

beforeEach(() => {
  jest.clearAllMocks();
  // Mock fetch globally to prevent network requests
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ token: null }),
    })
  );
});

afterEach(() => {
  // Clean up fetch mock
  global.fetch.mockRestore();
});

it('should not render when isOpen is false', () => {
  render(<DeployModal isOpen={false} setIsOpen={jest.fn()} />);
  expect(screen.queryByTestId('modal-container')).not.toBeInTheDocument();
  // Verify fetch was NOT called when modal is closed
  expect(global.fetch).not.toHaveBeenCalled();
});

it('renders Authentication when token is missing', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ token: null }),
    })
  );

  render(<DeployModal isOpen={true} setIsOpen={jest.fn()} />);

  expect(screen.getByTestId('deploy-loader')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByTestId('authentication')).toBeInTheDocument();
  });
});

it('renders StageSelection when token is present', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ token: 'valid-token' }),
    })
  );

  render(<DeployModal isOpen={true} setIsOpen={jest.fn()} />);

  expect(screen.getByTestId('deploy-loader')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByTestId('stage-selection')).toBeInTheDocument();
  });
});

it('renders Authentication when fetch fails', async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error('Fetch failed')));

  render(<DeployModal isOpen={true} setIsOpen={jest.fn()} />);

  expect(screen.getByTestId('deploy-loader')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByTestId('authentication')).toBeInTheDocument();
  });
});

it('closes modal when close button is clicked', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ token: null }),
    })
  );

  const mockSetIsOpen = jest.fn();
  render(<DeployModal isOpen={true} setIsOpen={mockSetIsOpen} />);

  await waitFor(() => {
    expect(screen.getByTestId('authentication')).toBeInTheDocument();
  });

  const closeButton = screen.getByRole('button');
  fireEvent.click(closeButton);
  expect(mockSetIsOpen).toHaveBeenCalledWith(false);
});
