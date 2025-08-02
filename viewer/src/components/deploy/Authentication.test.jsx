import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Authentication from './Authentication';

// Mock window.open
window.open = jest.fn();

jest.useFakeTimers();

let setStatusMock;

beforeEach(() => {
  setStatusMock = jest.fn();
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

it('renders correctly', () => {
  render(<Authentication setStatus={setStatusMock} />);
  expect(screen.getByText(/Authentication Required/i)).toBeInTheDocument();
  expect(screen.getByText(/Deploy instantly with zero-config setup/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
});

it('calls authentication endpoint and opens auth URL', async () => {
  const mockAuthResponse = {
    full_url: 'https://auth.url',
    auth_id: '123',
  };

  fetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => mockAuthResponse,
    })
    .mockResolvedValueOnce({
      json: async () => ({ status: 200, message: 'Authenticated' }),
    });

  render(<Authentication setStatus={setStatusMock} />);
  fireEvent.click(screen.getByRole('button', { name: /login/i }));

  // Wait for the first fetch
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith('/api/auth/authorize-device-token', expect.anything())
  );
  expect(window.open).toHaveBeenCalledWith('https://auth.url', '_blank');

  // Fast-forward timers to trigger polling
  jest.advanceTimersByTime(2000);

  await waitFor(() => {
    expect(setStatusMock).toHaveBeenCalledWith('stage');
  });
});

it('handles failed authentication', async () => {
  fetch.mockResolvedValueOnce({
    ok: false,
  });

  render(<Authentication setStatus={setStatusMock} />);
  fireEvent.click(screen.getByRole('button', { name: /login/i }));

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith('/api/auth/authorize-device-token', expect.anything());
  });

  expect(setStatusMock).not.toHaveBeenCalled();
  expect(window.open).not.toHaveBeenCalled();
});

it('handles error during polling gracefully', async () => {
  fetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ full_url: 'https://auth.url', auth_id: 'abc123' }),
    })
    .mockRejectedValueOnce(new Error('Network error'));

  render(<Authentication setStatus={setStatusMock} />);
  fireEvent.click(screen.getByRole('button', { name: /login/i }));

  jest.advanceTimersByTime(2000);

  await waitFor(() => {
    expect(setStatusMock).not.toHaveBeenCalled();
  });
});
