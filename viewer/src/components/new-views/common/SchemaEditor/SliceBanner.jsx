import React from 'react';

/**
 * SliceBanner — one-time educational banner shown when an
 * array-producing column chip is freshly dropped into a scalar-only
 * property slot. Surfaces the concept that "the column has many rows;
 * this slot needs one" and offers quick actions (First / Last / Pick
 * row).
 *
 * Banner state is held in PropertyRow (per-drop, not per-session).
 * It dismisses when the user picks an action OR when the user opens
 * the slice menu through the badge / chevron — i.e. any acknowledgement
 * of the slice concept clears it.
 *
 * @param {object} props
 * @param {() => void} props.onPickFirst - "First (0)" handler.
 * @param {() => void} props.onPickLast - "Last (-1)" handler.
 * @param {() => void} props.onPickCustom - "Pick row..." handler;
 *   should open the SliceMenu in "At row" mode.
 * @param {() => void} [props.onDismiss] - Optional dismiss handler
 *   for the close button.
 */
export function SliceBanner({ onPickFirst, onPickLast, onPickCustom, onDismiss }) {
  return (
    <div
      className="mt-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 flex flex-col gap-1.5"
      data-testid="slice-banner"
      role="alert"
    >
      <div className="flex items-start justify-between gap-2">
        <span>
          This prop expects a single value; the column has many rows. Pick which one to use.
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-amber-700 hover:text-amber-900 -mt-0.5 -mr-1 px-1"
            aria-label="Dismiss"
            data-testid="slice-banner-dismiss"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onPickFirst}
          className="px-2 py-0.5 rounded bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors"
          data-testid="slice-banner-first"
        >
          First (0)
        </button>
        <button
          type="button"
          onClick={onPickLast}
          className="px-2 py-0.5 rounded bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors"
          data-testid="slice-banner-last"
        >
          Last (-1)
        </button>
        <button
          type="button"
          onClick={onPickCustom}
          className="px-2 py-0.5 rounded bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors"
          data-testid="slice-banner-pick"
        >
          Pick row…
        </button>
      </div>
    </div>
  );
}

export default SliceBanner;
