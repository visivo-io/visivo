import React, { useState } from 'react';
import { PiWarningCircle } from 'react-icons/pi';
import ReferencePicker from './ReferencePicker';
import { getTypeByValue } from '../../common/objectTypeConfigs';

/**
 * BrokenRefCard — VIS-792 / Track L L-1.
 *
 * Placeholder card rendered in place of a canvas leaf whose chart / table /
 * markdown / input reference no longer resolves (the object was deleted or
 * renamed). Per Q16 + the L-1 brief (`specs/.../06-phase-5-polish.md`):
 *
 *   - Slot-sized — fills whatever slot the broken item occupied (it's rendered
 *     into the slot's `h-full w-full` wrapper, so it inherits the slot's box;
 *     it adapts content density from ~200×150 up to 1024×512 via container
 *     queries on its own size, but the layout is fluid so no fixed dimensions
 *     are imposed).
 *   - WARNING palette, MUTED — the `highlight` family (`highlight`) at low
 *     saturation; this is a fix-this signal, not a danger signal.
 *   - Heading "Chart 'foo' not found" (type-aware), the missing ref name in
 *     monospace for copy/paste, an explanatory subheading.
 *   - Primary "Fix…" → opens <ReferencePicker> (L-2); picking re-points the leaf.
 *   - Destructive "Delete this slot" → inline confirm → removes the item.
 *
 * Behaviour-only: the parent (Dashboard renderer) owns the actual config
 * mutation via `onFix(type, name)` and `onDelete()`. `onCreateNew(type)` routes
 * the picker's "Create new…" to the existing CreateButton flow.
 */

const HIGHLIGHT = 'var(--color-highlight-500)';
// Muted warning tones (the highlight family at low saturation) — a fix-this
// signal, not danger. Kept inline (these are warning-surface tints, not an
// object-type colour, so they don't belong in objectTypeConfigs).
const WARN_BG = 'var(--color-highlight-50)';
const WARN_BORDER = 'var(--color-highlight-200)';
const WARN_ICON = 'var(--color-highlight-500)'; // highlight

const BrokenRefCard = ({ type, name, onFix, onDelete, onCreateNew }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const typeMeta = getTypeByValue(type);
  const typeLabel = typeMeta?.singularLabel || type || 'Object';

  const handleSelect = pickedName => {
    setPickerOpen(false);
    if (typeof onFix === 'function') onFix(type, pickedName);
  };

  return (
    <div
      data-testid="broken-ref-card"
      data-broken-type={type}
      data-broken-name={name}
      role="group"
      aria-label={`${typeLabel} "${name}" not found`}
      className="@container flex h-full w-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center"
      style={{ backgroundColor: WARN_BG, borderColor: WARN_BORDER }}
    >
      <PiWarningCircle
        className="h-7 w-7 shrink-0 @[280px]:h-9 @[280px]:w-9"
        style={{ color: WARN_ICON }}
        aria-hidden="true"
      />

      <h3
        data-testid="broken-ref-heading"
        className="text-sm font-semibold text-gray-800 @[280px]:text-base"
      >
        {typeLabel} ‘{name}’ not found
      </h3>

      {/* Explanatory copy — abbreviated in small slots via container query. */}
      <p className="hidden max-w-sm text-xs text-gray-500 @[240px]:block">
        The referenced object doesn’t exist in this project. It may have been
        deleted or renamed.
      </p>

      {/* Missing ref name in monospace for easy copy/paste-to-search. */}
      <code
        data-testid="broken-ref-name"
        className="max-w-full truncate rounded bg-white/70 px-2 py-0.5 font-mono text-[11px] text-gray-600 ring-1 ring-gray-200"
      >
        {name}
      </code>

      {confirmingDelete ? (
        <div
          data-testid="broken-ref-confirm-delete"
          className="mt-1 flex flex-col items-center gap-2 rounded-md bg-white/80 px-3 py-2 ring-1 ring-gray-200"
        >
          <p className="max-w-xs text-xs text-gray-600">
            Remove this slot? This won’t delete the underlying {typeLabel.toLowerCase()}{' '}
            definition (which is missing anyway).
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              data-testid="broken-ref-cancel-delete"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                if (typeof onDelete === 'function') onDelete();
              }}
              data-testid="broken-ref-confirm-delete-button"
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors"
              style={{ backgroundColor: HIGHLIGHT }}
            >
              Remove slot
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            data-testid="broken-ref-fix"
            className="inline-flex items-center rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-200 active:bg-primary-700"
          >
            Fix…
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            data-testid="broken-ref-delete"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-highlight-100 focus:outline-none focus:ring-2 focus:ring-highlight-200"
            style={{ color: HIGHLIGHT }}
          >
            Delete this slot
          </button>
        </div>
      )}

      {pickerOpen && (
        <ReferencePicker
          type={type}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
          onCreateNew={onCreateNew}
        />
      )}
    </div>
  );
};

export default BrokenRefCard;
