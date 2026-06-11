import React, { useEffect } from 'react';
import { PiWarningCircle, PiX } from 'react-icons/pi';
import useStore from '../../../stores/store';

/**
 * ExternalEditBanner — VIS-808 (Track H H-2, design brief H-2).
 *
 * Dismissible warning shown at the top of the canvas area when an external
 * YAML edit overwrote unsaved canvas changes (Q15 last-write-wins). Sits
 * below the Workspace top bar, full-width within the middle pane, in the
 * muted highlight palette — visible but not alarming — and never blocks
 * canvas interaction. Auto-dismisses after ~30s; dismissing only hides the
 * warning (the overwrite already happened).
 */

const AUTO_DISMISS_MS = 30000;

const ExternalEditBanner = () => {
  const visible = useStore(s => s.externalEditBannerVisible);
  const dismiss = useStore(s => s.dismissExternalEditBanner);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      role="status"
      data-testid="external-edit-banner"
      className="flex w-full shrink-0 items-start gap-3 border-b border-highlight-200 bg-highlight-50 px-4 py-3"
    >
      <PiWarningCircle
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-highlight-600"
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-highlight-900">File changed externally.</p>
        <p className="mt-0.5 text-highlight-800">
          Your unsaved canvas changes were dropped because the YAML file was edited outside
          Visivo. The canvas now reflects the file&apos;s current state.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        data-testid="external-edit-banner-dismiss"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-highlight-700 transition-colors hover:bg-highlight-100 hover:text-highlight-900"
      >
        <PiX className="h-4 w-4" />
      </button>
    </div>
  );
};

export default ExternalEditBanner;
