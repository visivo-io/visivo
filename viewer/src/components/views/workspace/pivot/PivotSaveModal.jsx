import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PiFloppyDisk } from 'react-icons/pi';

/**
 * PivotSaveModal — the pivot Build-lens "Save" choice.
 *
 * When the user clicks Save in the pivot playground we don't silently commit:
 * we ask whether to (1) REPLACE the current table with this pivot config, or
 * (2) ADD it AS A NEW table (a fresh table object with a unique name). Matches
 * the app's modal style (portal + backdrop + ring card + primary buttons) used
 * by TabCloseConfirmDialog. Escape and a backdrop click both cancel.
 *
 * Props:
 *   - open        — whether the modal is mounted.
 *   - tableName   — the table being edited (shown in the copy).
 *   - saving      — disables the action buttons while a save is in flight.
 *   - error       — a failed save's error message (the modal stays open so the
 *                   user can retry or cancel).
 *   - onReplace   — chose "Replace the current table".
 *   - onAddNew    — chose "Add as a new table".
 *   - onCancel    — dismissed (backdrop / Escape / Cancel button).
 */
const PivotSaveModal = ({
  open,
  tableName,
  saving = false,
  error = null,
  onReplace,
  onAddNew,
  onCancel,
}) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    if (cancelRef.current) cancelRef.current.focus();
    const onKey = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel && onCancel();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      data-testid="pivot-save-backdrop"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30"
      onPointerDown={e => {
        if (e.target === e.currentTarget) onCancel && onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pivot-save-title"
        data-testid="pivot-save-modal"
        className="w-[420px] max-w-[calc(100vw-32px)] rounded-lg bg-white p-5 shadow-xl ring-1 ring-gray-200"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary">
            <PiFloppyDisk style={{ fontSize: 20 }} />
          </span>
          <div className="min-w-0">
            <h2 id="pivot-save-title" className="text-[15px] font-semibold text-gray-900">
              Save pivot
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
              Replace{' '}
              <span className="font-medium text-gray-900">“{tableName}”</span> with this pivot
              configuration, or save it as a brand-new table.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            data-testid="pivot-save-replace"
            disabled={saving}
            onClick={() => onReplace && onReplace()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-white transition-all duration-200 hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Replace “{tableName}”
          </button>
          <button
            type="button"
            data-testid="pivot-save-add-new"
            disabled={saving}
            onClick={() => onAddNew && onAddNew()}
            className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-[13px] font-semibold text-primary ring-1 ring-primary-300 transition-all duration-200 hover:bg-primary-50 focus:outline-none focus:ring-4 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add as a new table
          </button>
        </div>
        {error && (
          <p
            data-testid="pivot-save-error"
            className="mt-3 rounded-md bg-highlight-50 px-3 py-2 text-[12px] leading-relaxed text-highlight-700"
          >
            {error}
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            ref={cancelRef}
            data-testid="pivot-save-cancel"
            disabled={saving}
            onClick={() => onCancel && onCancel()}
            className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-medium text-gray-600 transition-all duration-200 hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-gray-200 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PivotSaveModal;
