import React, { useEffect, useRef, useState } from 'react';
import {
  PiCheckCircle,
  PiCircleNotch,
  PiClock,
  PiWarningCircle,
} from 'react-icons/pi';
import useStore from '../../../stores/store';

/**
 * CommitCluster — VIS-806 (Track H H-1).
 *
 * The TopBar right-group cluster that surfaces save/publish state in Build
 * mode, per the H-1 design brief (`design/04-phase-3-save-semantics.md`):
 *
 *   [ status pill ]  [ Discard ]  [ Commit · N ]
 *
 * Status pill precedence (highest first):
 *   Saving…      — any draft write in flight (`saveActivityCount > 0`)
 *   Save failed  — the last draft write errored
 *   Committed ✓  — ≤2s after a successful commit (transient flash)
 *   N change(s)  — unpublished drafts pending
 *   Saved        — clean
 *
 * Commit opens the existing CommitModal (pending-change list + confirm);
 * a commit failure surfaces here as "Commit failed" + Retry (which
 * re-commits directly, skipping the modal). Discard asks for confirmation
 * (it's the v1 rollback — no undo per Q14) then drops the entire draft
 * cache; the canvas reverts via the store's named-child refetch.
 */

const COMMIT_FLASH_MS = 2000;

const StatusPill = ({ icon: Icon, label, tone, spin = false, testId }) => (
  <span
    data-testid={testId}
    className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium tabular-nums ${tone}`}
  >
    <Icon
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 ${spin ? 'animate-spin' : ''}`}
    />
    {label}
  </span>
);

const ConfirmDiscardDialog = ({ count, busy, onCancel, onConfirm }) => (
  <div
    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
    data-testid="workspace-discard-confirm"
  >
    <div className="w-[360px] rounded-lg bg-white p-6 shadow-xl">
      <h3 className="text-lg font-medium text-gray-900">
        Discard {count} {count === 1 ? 'change' : 'changes'}?
      </h3>
      <p className="mt-2 text-sm text-gray-600">
        This clears every unsaved draft and reverts the canvas to the last
        published state. There is no undo.
      </p>
      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          disabled={busy}
          data-testid="workspace-discard-cancel"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          data-testid="workspace-discard-confirm-button"
          className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-highlight-700 disabled:opacity-60"
        >
          {busy ? 'Discarding…' : 'Discard'}
        </button>
      </div>
    </div>
  </div>
);

const CommitCluster = () => {
  const pendingCount = useStore(s => s.pendingCount);
  const saveActivityCount = useStore(s => s.saveActivityCount);
  const lastSaveFailed = useStore(s => s.lastSaveFailed);
  const commitLoading = useStore(s => s.commitLoading);
  const commitError = useStore(s => s.commitError);
  const commitModalOpen = useStore(s => s.commitModalOpen);
  const lastCommittedAt = useStore(s => s.lastCommittedAt);
  const discardLoading = useStore(s => s.discardLoading);
  const openCommitModal = useStore(s => s.openCommitModal);
  const commitChanges = useStore(s => s.commitChanges);
  const discardChanges = useStore(s => s.discardChanges);

  const [justCommitted, setJustCommitted] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  // Skip the flash for a `lastCommittedAt` that predates this mount (e.g.
  // re-entering the Workspace after committing elsewhere).
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!lastCommittedAt || lastCommittedAt < mountedAtRef.current) return undefined;
    setJustCommitted(true);
    const timer = setTimeout(() => setJustCommitted(false), COMMIT_FLASH_MS);
    return () => clearTimeout(timer);
  }, [lastCommittedAt]);

  const handleConfirmDiscard = async () => {
    const result = await discardChanges();
    if (result?.success) setConfirmDiscardOpen(false);
  };

  // "Commit failed" surfaces in the cluster only while the modal is closed
  // (the modal shows the same error inline when it's open).
  const commitFailed = Boolean(commitError) && !commitModalOpen;

  let pill;
  if (saveActivityCount > 0) {
    pill = (
      <StatusPill
        icon={PiCircleNotch}
        spin
        label="Saving…"
        tone="bg-white/10 text-white/80"
        testId="workspace-save-pill-saving"
      />
    );
  } else if (lastSaveFailed) {
    pill = (
      <StatusPill
        icon={PiWarningCircle}
        label="Save failed"
        tone="bg-highlight-700/60 text-white"
        testId="workspace-save-pill-error"
      />
    );
  } else if (justCommitted) {
    pill = (
      <StatusPill
        icon={PiCheckCircle}
        label="Committed ✓"
        tone="bg-green-600/30 text-green-100"
        testId="workspace-save-pill-committed"
      />
    );
  } else if (pendingCount > 0) {
    pill = (
      <StatusPill
        icon={PiClock}
        label={`${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'}`}
        tone="bg-white/10 text-white/80"
        testId="workspace-save-pill-dirty"
      />
    );
  } else {
    pill = (
      <StatusPill
        icon={PiCheckCircle}
        label="Saved"
        tone="text-white/45"
        testId="workspace-save-pill-clean"
      />
    );
  }

  return (
    <div className="flex items-center gap-2" data-testid="workspace-publish-cluster">
      {pill}
      {commitFailed && (
        <button
          type="button"
          onClick={commitChanges}
          data-testid="workspace-top-bar-commit-retry"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-highlight px-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-highlight-700"
        >
          Commit failed — Retry
        </button>
      )}
      {pendingCount > 0 && !commitLoading && (
        <button
          type="button"
          onClick={() => setConfirmDiscardOpen(true)}
          data-testid="workspace-top-bar-discard"
          className="inline-flex h-8 items-center rounded-md border border-white/20 px-3 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          Discard
        </button>
      )}
      <button
        type="button"
        onClick={openCommitModal}
        disabled={pendingCount === 0 || commitLoading}
        data-testid="workspace-top-bar-commit"
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {commitLoading ? (
          <>
            <PiCircleNotch aria-hidden="true" className="h-4 w-4 animate-spin" />
            Committing…
          </>
        ) : (
          <>
            Commit
            {pendingCount > 0 && (
              <span className="rounded-sm bg-white/20 px-1.5 py-px text-[11px] font-bold tabular-nums">
                {pendingCount}
              </span>
            )}
          </>
        )}
      </button>
      {confirmDiscardOpen && (
        <ConfirmDiscardDialog
          count={pendingCount}
          busy={discardLoading}
          onCancel={() => setConfirmDiscardOpen(false)}
          onConfirm={handleConfirmDiscard}
        />
      )}
    </div>
  );
};

export default CommitCluster;
