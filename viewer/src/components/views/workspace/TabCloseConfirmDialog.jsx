import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PiWarningCircle } from 'react-icons/pi';
import useStore from '../../../stores/store';

/**
 * TabCloseConfirmDialog — VIS-812 / Track O O-3.
 *
 * The dirty-close confirmation. Renders (via portal) whenever the store has
 * a `workspacePendingCloseTabId` parked by `requestCloseWorkspaceTab` — i.e.
 * the user tried to close a tab whose `dirty` flag is set (the mulberry ●).
 *
 *   - "Keep editing"          → cancelCloseWorkspaceTab (tab stays open).
 *   - "Close without saving"  → confirmCloseWorkspaceTab (destructive —
 *                               highlight palette per the design system).
 *
 * Escape and a backdrop click both cancel — closing a dirty tab must always
 * be the explicit choice. Focus starts on the safe action.
 */
const TabCloseConfirmDialog = () => {
  const pendingId = useStore(s => s.workspacePendingCloseTabId);
  const tabs = useStore(s => s.workspaceTabs);
  const confirmClose = useStore(s => s.confirmCloseWorkspaceTab);
  const cancelClose = useStore(s => s.cancelCloseWorkspaceTab);

  const cancelRef = useRef(null);
  const tab = pendingId ? (tabs || []).find(t => t.id === pendingId) : null;

  useEffect(() => {
    if (!tab) return undefined;
    // Focus the safe action so Enter keeps editing rather than discarding.
    if (cancelRef.current) cancelRef.current.focus();
    const onKey = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancelClose && cancelClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [tab, cancelClose]);

  if (!tab) return null;

  return createPortal(
    <div
      data-testid="tab-close-confirm-backdrop"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30"
      onPointerDown={e => {
        if (e.target === e.currentTarget) cancelClose && cancelClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tab-close-confirm-title"
        data-testid="tab-close-confirm-dialog"
        className="w-[400px] max-w-[calc(100vw-32px)] rounded-lg bg-white p-5 shadow-xl ring-1 ring-gray-200"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-highlight-100 text-highlight">
            <PiWarningCircle style={{ fontSize: 20 }} />
          </span>
          <div className="min-w-0">
            <h2
              id="tab-close-confirm-title"
              className="text-[15px] font-semibold text-gray-900"
            >
              Close tab with unsaved changes?
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
              <span className="font-medium text-gray-900">“{tab.name}”</span> has unsaved
              changes. If you close it now, those changes will be discarded.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            ref={cancelRef}
            data-testid="tab-close-confirm-cancel"
            onClick={() => cancelClose && cancelClose()}
            className="inline-flex h-9 items-center rounded-lg px-4 text-[13px] font-medium text-gray-700 ring-1 ring-gray-300 transition-all duration-200 hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-primary-200"
          >
            Keep editing
          </button>
          <button
            type="button"
            data-testid="tab-close-confirm-close"
            onClick={() => confirmClose && confirmClose()}
            className="inline-flex h-9 items-center rounded-lg bg-highlight px-4 text-[13px] font-semibold text-white transition-all duration-200 hover:bg-highlight-700 focus:outline-none focus:ring-4 focus:ring-highlight-200"
          >
            Close without saving
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TabCloseConfirmDialog;
