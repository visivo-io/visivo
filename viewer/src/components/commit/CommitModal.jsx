import React, { useState } from 'react';
import { ModalOverlay, ModalWrapper } from '../styled/Modal';
import useStore from '../../stores/store';
import PendingChangesList from './PendingChangesList';

const CommitModal = () => {
  const commitModalOpen = useStore(state => state.commitModalOpen);
  const closeCommitModal = useStore(state => state.closeCommitModal);
  const pendingChanges = useStore(state => state.pendingChanges);
  const commitLoading = useStore(state => state.commitLoading);
  const commitError = useStore(state => state.commitError);
  const commitAction = useStore(state => state.commitAction);
  const commitChanges = useStore(state => state.commitChanges);
  // The list owns the per-row "Restoring…" state; this is just the action.
  const restoreDeleted = useStore(state => state.restoreDeleted);
  // Discard (Q14 rollback) — drops the draft cache without writing YAML. It's
  // destructive, so it confirms inline before firing.
  //
  // This used to hide itself whenever capabilities were non-null, reading that
  // as "cloud". Local serve answers the capabilities endpoint too now, so the
  // button had quietly disappeared from the one place it works — and cloud
  // never saw it either, because core renders its own CommitModal, not this
  // one. The same action also hangs off the Commit button's menu.
  const discardChanges = useStore(state => state.discardChanges);
  const discardLoading = useStore(state => state.discardLoading);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  if (!commitModalOpen) return null;

  // commitChanges handles every backend: it publishes (closing the modal on
  // success), no-ops when there's nothing to commit, and surfaces run/role
  // gate actions as commitError otherwise.
  const handleCommit = async () => {
    await commitChanges();
  };

  const handleDiscard = async () => {
    const result = await discardChanges();
    if (result?.success) {
      setConfirmingDiscard(false);
      closeCommitModal();
    }
  };

  const count = pendingChanges.length;

  return (
    <ModalOverlay>
      <ModalWrapper>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Commit Changes</h2>
          <button
            onClick={closeCommitModal}
            className="hover:text-gray-800 text-gray-500 text-2xl font-bold focus:outline-none cursor-pointer"
            disabled={commitLoading}
          >
            &times;
          </button>
        </div>

        <p className="text-gray-600 mb-4">
          The following changes will be written to your project YAML files:
        </p>

        {commitError && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {commitError}
            {/* With a manual run trigger this refusal is the ordinary path, not
                an edge case — so say where to go and do something about it. */}
            {(commitAction === 'run_required' || commitAction === 'run_failed') && (
              <span className="block mt-1 text-xs">
                Open the Runs tab to see what needs building and start a run.
              </span>
            )}
          </div>
        )}

        <div className="max-h-64 overflow-y-auto mb-6" data-testid="commit-modal-pending-list">
          <PendingChangesList changes={pendingChanges} onRestore={restoreDeleted} />
        </div>

        {confirmingDiscard ? (
          <div
            className="flex items-center justify-between gap-3 rounded-md bg-highlight-50 p-3"
            data-testid="commit-modal-discard-confirm"
          >
            <span className="text-sm text-highlight-900">
              Discard all {count} {count === 1 ? 'change' : 'changes'}? This can&apos;t be undone.
            </span>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setConfirmingDiscard(false)}
                disabled={discardLoading}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none"
              >
                Keep
              </button>
              <button
                onClick={handleDiscard}
                disabled={discardLoading}
                data-testid="commit-modal-discard-confirm-button"
                className="px-3 py-1.5 text-sm text-white bg-highlight rounded-md hover:bg-highlight-700 focus:outline-none disabled:opacity-60"
              >
                {discardLoading ? 'Discarding…' : 'Discard'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setConfirmingDiscard(true)}
              disabled={commitLoading || count === 0}
              data-testid="commit-modal-discard"
              className="px-4 py-2 text-highlight-700 rounded-md hover:bg-highlight-50 focus:outline-none disabled:text-gray-300 disabled:hover:bg-transparent"
            >
              Discard
            </button>
            <div className="flex gap-3">
              <button
                onClick={closeCommitModal}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none"
                disabled={commitLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={commitLoading || count === 0}
                className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {commitLoading ? 'Committing...' : 'Commit Changes'}
              </button>
            </div>
          </div>
        )}
      </ModalWrapper>
    </ModalOverlay>
  );
};

export default CommitModal;
