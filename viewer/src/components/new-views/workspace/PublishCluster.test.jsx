/**
 * PublishCluster tests (VIS-806 / Track H H-1).
 *
 * The TopBar save/publish cluster: status pill precedence, Publish button
 * states, Discard + confirm dialog, publish-failed Retry, and the transient
 * "Published ✓" flash.
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useStore from '../../../stores/store';
import PublishCluster from './PublishCluster';

const setPublishState = overrides =>
  useStore.setState({
    pendingCount: 0,
    saveActivityCount: 0,
    lastSaveFailed: false,
    publishLoading: false,
    publishError: null,
    publishModalOpen: false,
    lastPublishedAt: null,
    discardLoading: false,
    openPublishModal: jest.fn(),
    publishChanges: jest.fn().mockResolvedValue({ success: true }),
    discardChanges: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  });

describe('PublishCluster (VIS-806)', () => {
  beforeEach(() => {
    setPublishState();
  });

  test('clean state: "Saved" pill, Publish disabled, no Discard', () => {
    render(<PublishCluster />);

    expect(screen.getByTestId('workspace-save-pill-clean')).toHaveTextContent('Saved');
    expect(screen.getByTestId('workspace-top-bar-publish')).toBeDisabled();
    expect(screen.queryByTestId('workspace-top-bar-discard')).not.toBeInTheDocument();
  });

  test('dirty state: count pill (plural), Publish enabled with badge, Discard visible', () => {
    setPublishState({ pendingCount: 3 });
    render(<PublishCluster />);

    expect(screen.getByTestId('workspace-save-pill-dirty')).toHaveTextContent('3 changes');
    const publish = screen.getByTestId('workspace-top-bar-publish');
    expect(publish).toBeEnabled();
    expect(publish).toHaveTextContent('3');
    expect(screen.getByTestId('workspace-top-bar-discard')).toBeInTheDocument();
  });

  test('singular count reads "1 change"', () => {
    setPublishState({ pendingCount: 1 });
    render(<PublishCluster />);

    expect(screen.getByTestId('workspace-save-pill-dirty')).toHaveTextContent('1 change');
  });

  test('a save in flight wins the pill: "Saving…"', () => {
    setPublishState({ pendingCount: 2, saveActivityCount: 1 });
    render(<PublishCluster />);

    expect(screen.getByTestId('workspace-save-pill-saving')).toHaveTextContent('Saving…');
    expect(screen.queryByTestId('workspace-save-pill-dirty')).not.toBeInTheDocument();
  });

  test('a failed save shows "Save failed"', () => {
    setPublishState({ pendingCount: 2, lastSaveFailed: true });
    render(<PublishCluster />);

    expect(screen.getByTestId('workspace-save-pill-error')).toHaveTextContent('Save failed');
  });

  test('publishing: button shows "Publishing…" and is disabled; Discard hides', () => {
    setPublishState({ pendingCount: 2, publishLoading: true });
    render(<PublishCluster />);

    const publish = screen.getByTestId('workspace-top-bar-publish');
    expect(publish).toHaveTextContent('Publishing…');
    expect(publish).toBeDisabled();
    expect(screen.queryByTestId('workspace-top-bar-discard')).not.toBeInTheDocument();
  });

  test('clicking Publish opens the publish modal', async () => {
    const openPublishModal = jest.fn();
    setPublishState({ pendingCount: 2, openPublishModal });
    render(<PublishCluster />);

    await userEvent.click(screen.getByTestId('workspace-top-bar-publish'));

    expect(openPublishModal).toHaveBeenCalledTimes(1);
  });

  test('a publish error (modal closed) surfaces Retry, which re-publishes directly', async () => {
    const publishChanges = jest.fn().mockResolvedValue({ success: true });
    setPublishState({ pendingCount: 2, publishError: 'disk full', publishChanges });
    render(<PublishCluster />);

    const retry = screen.getByTestId('workspace-top-bar-publish-retry');
    expect(retry).toHaveTextContent('Publish failed — Retry');
    await userEvent.click(retry);
    expect(publishChanges).toHaveBeenCalledTimes(1);
  });

  test('a publish error stays inside the modal while it is open', () => {
    setPublishState({ pendingCount: 2, publishError: 'disk full', publishModalOpen: true });
    render(<PublishCluster />);

    expect(screen.queryByTestId('workspace-top-bar-publish-retry')).not.toBeInTheDocument();
  });

  test('Discard opens the confirm dialog; Cancel closes it without discarding', async () => {
    const discardChanges = jest.fn();
    setPublishState({ pendingCount: 3, discardChanges });
    render(<PublishCluster />);

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
    render(<PublishCluster />);

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
    render(<PublishCluster />);

    await userEvent.click(screen.getByTestId('workspace-top-bar-discard'));
    await userEvent.click(screen.getByTestId('workspace-discard-confirm-button'));

    expect(discardChanges).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('workspace-discard-confirm')).toBeInTheDocument();
  });

  test('a publish success after mount flashes "Published ✓" then settles back', () => {
    jest.useFakeTimers();
    try {
      render(<PublishCluster />);
      expect(screen.getByTestId('workspace-save-pill-clean')).toBeInTheDocument();

      act(() => {
        useStore.setState({ lastPublishedAt: Date.now() });
      });
      expect(screen.getByTestId('workspace-save-pill-published')).toHaveTextContent(
        'Published ✓'
      );

      act(() => {
        jest.advanceTimersByTime(2100);
      });
      expect(screen.queryByTestId('workspace-save-pill-published')).not.toBeInTheDocument();
      expect(screen.getByTestId('workspace-save-pill-clean')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a lastPublishedAt that predates the mount does not flash', () => {
    setPublishState({ lastPublishedAt: Date.now() - 60_000 });
    render(<PublishCluster />);

    expect(screen.queryByTestId('workspace-save-pill-published')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-save-pill-clean')).toBeInTheDocument();
  });
});
