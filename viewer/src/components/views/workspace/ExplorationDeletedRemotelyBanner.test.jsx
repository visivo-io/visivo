/**
 * ExplorationDeletedRemotelyBanner (VIS-1083) — the recovery banner shown
 * when an exploration's backend record was deleted out from under an
 * actively-editing session (another tab's delete, or an out-of-band removal).
 * Pins: both actions are wired to the right store calls, and busy-guards
 * against a double-click while a recreate is in flight.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ExplorationDeletedRemotelyBanner from './ExplorationDeletedRemotelyBanner';
import useStore from '../../../stores/store';

const seed = (extra = {}) => {
  act(() => {
    useStore.setState({
      recreateExplorationFromDeleted: jest.fn().mockResolvedValue({ success: true, id: 'exp_2' }),
      discardDeletedExploration: jest.fn(),
      ...extra,
    });
  });
};

describe('ExplorationDeletedRemotelyBanner', () => {
  test('renders the warning message and both action buttons', () => {
    seed();
    render(<ExplorationDeletedRemotelyBanner id="exp_1" />);
    expect(screen.getByTestId('exploration-deleted-remotely-banner')).toBeInTheDocument();
    expect(screen.getByText(/this exploration was deleted/i)).toBeInTheDocument();
    expect(screen.getByTestId('exploration-deleted-remotely-recreate')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-deleted-remotely-close')).toBeInTheDocument();
  });

  test('"Recreate as new exploration" calls recreateExplorationFromDeleted with the id', async () => {
    const recreateExplorationFromDeleted = jest.fn().mockResolvedValue({ success: true, id: 'exp_2' });
    seed({ recreateExplorationFromDeleted });
    render(<ExplorationDeletedRemotelyBanner id="exp_1" />);

    fireEvent.click(screen.getByTestId('exploration-deleted-remotely-recreate'));

    await waitFor(() => expect(recreateExplorationFromDeleted).toHaveBeenCalledWith('exp_1'));
  });

  test('the recreate button disables itself while the recreate is in flight', async () => {
    let resolvePromise;
    const recreateExplorationFromDeleted = jest.fn(
      () =>
        new Promise(resolve => {
          resolvePromise = resolve;
        })
    );
    seed({ recreateExplorationFromDeleted });
    render(<ExplorationDeletedRemotelyBanner id="exp_1" />);

    fireEvent.click(screen.getByTestId('exploration-deleted-remotely-recreate'));
    expect(screen.getByTestId('exploration-deleted-remotely-recreate')).toBeDisabled();
    expect(screen.getByTestId('exploration-deleted-remotely-close')).toBeDisabled();

    await act(async () => {
      resolvePromise({ success: true, id: 'exp_2' });
    });
    expect(recreateExplorationFromDeleted).toHaveBeenCalledTimes(1);
  });

  test('a second click on "Recreate" while busy does not fire a second request', async () => {
    let resolvePromise;
    const recreateExplorationFromDeleted = jest.fn(
      () =>
        new Promise(resolve => {
          resolvePromise = resolve;
        })
    );
    seed({ recreateExplorationFromDeleted });
    render(<ExplorationDeletedRemotelyBanner id="exp_1" />);

    fireEvent.click(screen.getByTestId('exploration-deleted-remotely-recreate'));
    fireEvent.click(screen.getByTestId('exploration-deleted-remotely-recreate'));
    expect(recreateExplorationFromDeleted).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePromise({ success: true, id: 'exp_2' });
    });
  });

  test('"Close tab" calls discardDeletedExploration with the id', () => {
    const discardDeletedExploration = jest.fn();
    seed({ discardDeletedExploration });
    render(<ExplorationDeletedRemotelyBanner id="exp_1" />);

    fireEvent.click(screen.getByTestId('exploration-deleted-remotely-close'));

    expect(discardDeletedExploration).toHaveBeenCalledWith('exp_1');
  });
});
