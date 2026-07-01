import React, { useRef, useState } from 'react';
import { describeSlice } from '../../../../utils/queryString';
import SliceMenu from './SliceMenu';

/**
 * SliceBadge — small pill rendered next to a chip when a slice is set.
 *
 * Displays the human-readable slice label ("First (0)", "Last (-1)",
 * "Row N", "Rows a-b") and opens the SliceMenu on click. Designed to
 * sit alongside the RefTextArea chip — visually similar (rounded pill)
 * but with a lighter color to signal it's a different kind of token.
 *
 * @param {object} props
 * @param {string|null} props.slice - The current slice expression
 *   ("[0]" / "[-1]" / "[1:5]" / ...) or null for "no slice set".
 * @param {(newSlice: string|null) => void} props.onChange - Called
 *   when the user picks a new slice from the menu.
 * @param {'scalar-only' | 'array-only' | 'mixed' | 'unknown'} props.slotShape
 *   - Drives which menu options are enabled.
 * @param {string} [props.testId] - data-testid for tests.
 */
export function SliceBadge({ slice, onChange, slotShape = 'unknown', testId = 'slice-badge' }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  const label = describeSlice(slice);

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-white text-secondary-700 hover:bg-secondary-50 border border-secondary-300 transition-colors whitespace-nowrap"
        data-testid={testId}
        aria-label="Edit slice"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <SliceMenu
        anchorEl={buttonRef.current}
        open={open}
        onClose={() => setOpen(false)}
        slice={slice}
        onChange={onChange}
        slotShape={slotShape}
      />
    </>
  );
}

export default SliceBadge;
