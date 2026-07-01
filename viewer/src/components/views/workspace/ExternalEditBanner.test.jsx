/**
 * ExternalEditBanner tests (VIS-808 / Track H H-2).
 *
 * The Q15 last-write-wins warning: hidden by default, shown via the store
 * flag, dismissible, auto-dismisses after ~30s, and never blocks the canvas
 * (it renders as a static banner, not an overlay).
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useStore from '../../../stores/store';
import ExternalEditBanner from './ExternalEditBanner';

describe('ExternalEditBanner (VIS-808)', () => {
  beforeEach(() => {
    useStore.setState({ externalEditBannerVisible: false });
  });

  test('renders nothing while the flag is off', () => {
    render(<ExternalEditBanner />);
    expect(screen.queryByTestId('external-edit-banner')).not.toBeInTheDocument();
  });

  test('shows the warning copy when an external edit dropped drafts', () => {
    useStore.setState({ externalEditBannerVisible: true });
    render(<ExternalEditBanner />);

    const banner = screen.getByTestId('external-edit-banner');
    expect(banner).toHaveTextContent('File changed externally.');
    expect(banner).toHaveTextContent('unsaved canvas changes were dropped');
  });

  test('the X dismisses it', async () => {
    useStore.setState({ externalEditBannerVisible: true });
    render(<ExternalEditBanner />);

    await userEvent.click(screen.getByTestId('external-edit-banner-dismiss'));

    expect(screen.queryByTestId('external-edit-banner')).not.toBeInTheDocument();
    expect(useStore.getState().externalEditBannerVisible).toBe(false);
  });

  test('auto-dismisses after ~30 seconds', () => {
    jest.useFakeTimers();
    try {
      useStore.setState({ externalEditBannerVisible: true });
      render(<ExternalEditBanner />);
      expect(screen.getByTestId('external-edit-banner')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(30100);
      });
      expect(screen.queryByTestId('external-edit-banner')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('re-appears for a subsequent external edit after auto-dismiss', () => {
    jest.useFakeTimers();
    try {
      useStore.setState({ externalEditBannerVisible: true });
      render(<ExternalEditBanner />);
      act(() => {
        jest.advanceTimersByTime(30100);
      });
      expect(screen.queryByTestId('external-edit-banner')).not.toBeInTheDocument();

      act(() => {
        useStore.setState({ externalEditBannerVisible: true });
      });
      expect(screen.getByTestId('external-edit-banner')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
