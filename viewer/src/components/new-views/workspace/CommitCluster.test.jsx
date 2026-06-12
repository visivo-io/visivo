/**
 * CommitCluster tests (VIS-806 / Track H H-1).
 *
 * The TopBar save/publish cluster: status pill precedence, Publish button
 * states, Discard + confirm dialog, publish-failed Retry, and the transient
 * "Committed ✓" flash.
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useStore from '../../../stores/store';
import CommitCluster from './CommitCluster';

const setPublishState = overrides =>
  useStore.setState({
    pendingCount: 0,
    saveActivityCount: 0,
    lastSaveFailed: false,
    commitLoading: false,
    commitError: null,
    commitModalOpen: false,
    lastCommittedAt: null,
    discardLoading: false,
    openCommitModal: jest.fn(),
    commitChanges: jest.fn().mockResolvedValue({ success: true }),
    discardChanges: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  });

describe('CommitCluster (VIS-806)', () => {
  beforeEach(() => {
    setPublishState();
  });

  test('clean state: "Saved" pill, Publish disabled, no Discard', () => {
    render(<CommitCluster />);

    expect(screen.getByTestId('workspace-save-pill-clean')).toHaveTextContent('Saved');
    expect(screen.getByTestId('workspace-top-bar-commit')).toBeDisabled();
    expect(screen.queryByTestId('workspace-top-bar-discard')).not.toBeInTheDocument();
  });

  test('dirty state: count pill (plural), Publish enabled with badge, Discard visible', () => {
    setPublishState({ pendingCount: 3 });
    render(<CommitCluster />);

    expect(screen.getByTestId('workspace-save-pill-dirty')).toHaveTextContent('3 changes');
    const publish = screen.getByTestId('workspace-top-bar-commit');
    expect(publish).toBeEnabled();
    expect(publish).toHaveTextContent('3');
    expect(screen.getByTestId('workspace-top-bar-discard')).toBeInTheDocument();
  });

  test('singular count reads "1 change"', () => {
    setPublishState({ pendingCount: 1 });
    render(<CommitCluster />);

    expect(screen.getByTestId('workspace-save-pill-dirty')).toHaveTextContent('1 change');
  });

  test('a save in flight wins the pill: "Saving…"', () => {
    setPublishState({ pendingCount: 2, saveActivityCount: 1 });
    render(<CommitCluster />);

    expect(screen.getByTestId('workspace-save-pill-saving')).toHaveTextContent('Saving…');
    expect(screen.queryByTestId('workspace-save-pill-dirty')).not.toBeInTheDocument();
  });

  test('a failed save shows "Save failed"', () => {
    setPublishState({ pendingCount: 2, lastSaveFailed: true });
    render(<CommitCluster />);

    expect(screen.getByTestId('workspace-save-pill-error')).toHaveTextContent('Save failed');
  });

  test('publishing: button shows "Committing…" and is disabled; Discard hides', () => {
    setPublishState({ pendingCount: 2, commitLoading: true });
    render(<CommitCluster />);

    const publish = screen.getByTestId('workspace-top-bar-commit');
    expect(publish).toHaveTextContent('Committing…');
    expect(publish).toBeDisabled();
    expect(screen.queryByTestId('workspace-top-bar-discard')).not.toBeInTheDocument();
  });

  test('clicking Publish opens the publish modal', async () => {
    const openCommitModal = jest.fn();
    setPublishState({ pendingCount: 2, openCommitModal });
    render(<CommitCluster />);

    await userEvent.click(screen.getByTestId('workspace-top-bar-commit'));

    expect(openCommitModal).toHaveBeenCalledTimes(1);
  });

  test('a publish error (modal closed) surfaces Retry, which re-publishes directly', async () => {
    const commitChanges = jest.fn().mockResolvedValue({ success: true });
    setPublishState({ pendingCount: 2, commitError: 'disk full', commitChanges });
    render(<CommitCluster />);

    const retry = screen.getByTestId('workspace-top-bar-commit-retry');
    expect(retry).toHaveTextContent('Commit failed — Retry');
    await userEvent.click(retry);
    expect(commitChanges).toHaveBeenCalledTimes(1);
  });

  test('a publish error stays inside the modal while it is open', () => {
    setPublishState({ pendingCount: 2, commitError: 'disk full', commitModalOpen: true });
    render(<CommitCluster />);

    expect(screen.queryByTestId('workspace-top-bar-commit-retry')).not.toBeInTheDocument();
  });

  test('Discard opens the confirm dialog; Cancel closes it without discarding', async () => {
    const discardChanges = jest.fn();
    setPublishState({ pendingCount: 3, discardChanges });
    render(<CommitCluster />);

    await userEvent.click(screen.getByTestId('workspace-top-bar-discard'));
    expect(screen.getByTestId('workspace-discard-confirm')).toHaveTextContent(
      'Discard 3 changes?'
    );

    await userEvent.click(screen.getByTestId('workspace-discard-cancel'));
    expect(screen.queryByTestId('workspace-discard-confirm')).not.toBeInTheDocument();
    expect(discardChanges).not.toHaveBeenCalled();
  });

  test('confirming Discard calls discardChanges and closes the dialog on success', async () => {
    const discardChanges = jest.fn().mockResolvedValue({ success: true });
    setPublishState({ pendingCount: 3, discardChanges });
    render(<CommitCluster />);

    await userEvent.click(screen.getByTestId('workspace-top-bar-discard'));
    await userEvent.click(screen.getByTestId('workspace-discard-confirm-button'));

    expect(discardChanges).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByTestId('workspace-discard-confirm')).not.toBeInTheDocument()
    );
  });

  test('a failed discard keeps the dialog open', async () => {
    const discardChanges = jest.fn().mockResolvedValue({ success: false, error: 'boom' });
    setPublishState({ pendingCount: 3, discardChanges });
    render(<CommitCluster />);

    await userEvent.click(screen.getByTestId('workspace-top-bar-discard'));
    await userEvent.click(screen.getByTestId('workspace-discard-confirm-button'));

    expect(discardChanges).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('workspace-discard-confirm')).toBeInTheDocument();
  });

  test('a publish success after mount flashes "Committed ✓" then settles back', () => {
    jest.useFakeTimers();
    try {
      render(<CommitCluster />);
      expect(screen.getByTestId('workspace-save-pill-clean')).toBeInTheDocument();

      act(() => {
        useStore.setState({ lastCommittedAt: Date.now() });
      });
      expect(screen.getByTestId('workspace-save-pill-committed')).toHaveTextContent(
        'Committed ✓'
      );

      act(() => {
        jest.advanceTimersByTime(2100);
      });
      expect(screen.queryByTestId('workspace-save-pill-committed')).not.toBeInTheDocument();
      expect(screen.getByTestId('workspace-save-pill-clean')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a lastCommittedAt that predates the mount does not flash', () => {
    setPublishState({ lastCommittedAt: Date.now() - 60_000 });
    render(<CommitCluster />);

    expect(screen.queryByTestId('workspace-save-pill-committed')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-save-pill-clean')).toBeInTheDocument();
  });
});
