import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Authentication from './Authentication';
import { authorizationProgress, startAuthorization } from '../../api/authorization';

jest.mock('../../api/authorization', () => ({
  startAuthorization: jest.fn(),
  authorizationProgress: jest.fn(),
}));

// Mock window.open
window.open = jest.fn();

jest.useFakeTimers();

let setStatusMock;

beforeEach(() => {
  setStatusMock = jest.fn();
  jest.clearAllMocks();
});

it('renders correctly', () => {
  render(<Authentication setStatus={setStatusMock} />);
  expect(screen.getByText(/Authentication Required/i)).toBeInTheDocument();
  expect(screen.getByText(/Deploy instantly with zero-config setup/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
});

it('starts the device flow and opens what it is given', async () => {
  startAuthorization.mockResolvedValue({ authId: '123', url: 'https://auth.url' });
  authorizationProgress.mockResolvedValue({ done: true, failed: false, message: 'Authenticated' });

  render(<Authentication setStatus={setStatusMock} />);
  fireEvent.click(screen.getByRole('button', { name: /login/i }));

  await waitFor(() => expect(startAuthorization).toHaveBeenCalled());
  expect(window.open).toHaveBeenCalledWith('https://auth.url', '_blank');

  jest.advanceTimersByTime(2000);

  await waitFor(() => expect(setStatusMock).toHaveBeenCalledWith('branch'));
});

it('does not open a window when the flow cannot be started', async () => {
  startAuthorization.mockRejectedValue(new Error('Could not start authorization'));

  render(<Authentication setStatus={setStatusMock} />);
  fireEvent.click(screen.getByRole('button', { name: /login/i }));

  await waitFor(() => expect(startAuthorization).toHaveBeenCalled());

  expect(setStatusMock).not.toHaveBeenCalled();
  expect(window.open).not.toHaveBeenCalled();
});

it('stops rather than looping when the poll fails', async () => {
  startAuthorization.mockResolvedValue({ authId: 'abc123', url: 'https://auth.url' });
  authorizationProgress.mockRejectedValue(new Error('Network error'));

  render(<Authentication setStatus={setStatusMock} />);
  fireEvent.click(screen.getByRole('button', { name: /login/i }));

  jest.advanceTimersByTime(2000);

  await waitFor(() => expect(setStatusMock).not.toHaveBeenCalled());
});

it('refuses authorization without pretending it worked', async () => {
  startAuthorization.mockResolvedValue({ authId: 'abc123', url: 'https://auth.url' });
  authorizationProgress.mockResolvedValue({ done: false, failed: true, message: 'UnAuthorized' });

  render(<Authentication setStatus={setStatusMock} />);
  fireEvent.click(screen.getByRole('button', { name: /login/i }));

  jest.advanceTimersByTime(2000);

  await waitFor(() => expect(authorizationProgress).toHaveBeenCalled());
  expect(setStatusMock).not.toHaveBeenCalled();
});
