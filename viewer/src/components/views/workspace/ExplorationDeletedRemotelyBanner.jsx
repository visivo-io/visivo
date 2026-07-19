import React, { useState } from 'react';
import { PiWarningCircle } from 'react-icons/pi';
import useStore from '../../../stores/store';

/**
 * ExplorationDeletedRemotelyBanner — VIS-1083.
 *
 * Rendered by `ExplorationPane` above the workbench whenever this
 * exploration's `syncStatus` is `'deleted-remotely'` (`workspaceExplorationsStore.js`'s
 * `runSync` sets it after a 404 — the backend record was deleted in another
 * session, or removed out-of-band). Unlike `ExternalEditBanner`, this never
 * auto-dismisses and isn't merely informational: the record's sync loop has
 * already been stopped (`updateExplorationDraft` stops re-arming it once
 * `syncStatus` is this value), so silence here would leave the user editing
 * a tab that can never save again with no indication why. Offers the two
 * real options: recreate the local draft as a brand-new exploration, or
 * close the tab (nothing left to lose — the backend record is already
 * gone).
 */
const ExplorationDeletedRemotelyBanner = ({ id }) => {
  const recreateExplorationFromDeleted = useStore(s => s.recreateExplorationFromDeleted);
  const discardDeletedExploration = useStore(s => s.discardDeletedExploration);
  const [busy, setBusy] = useState(false);

  const handleRecreate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await recreateExplorationFromDeleted(id);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    discardDeletedExploration(id);
  };

  return (
    <div
      role="alert"
      data-testid="exploration-deleted-remotely-banner"
      className="flex w-full shrink-0 items-start gap-3 border-b border-highlight-200 bg-highlight-50 px-4 py-3"
    >
      <PiWarningCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-highlight-600" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-highlight-900">This exploration was deleted.</p>
        <p className="mt-0.5 text-highlight-800">
          It was removed elsewhere (another tab, or outside Visivo) while you were editing here.
          Your unsaved changes are still on this screen, but they can no longer be saved to that
          record.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={handleRecreate}
            disabled={busy}
            data-testid="exploration-deleted-remotely-recreate"
            className="rounded bg-highlight-600 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-highlight-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Recreate as new exploration
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            data-testid="exploration-deleted-remotely-close"
            className="rounded px-2.5 py-1 text-[12px] font-medium text-highlight-700 transition-colors hover:bg-highlight-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close tab
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExplorationDeletedRemotelyBanner;
