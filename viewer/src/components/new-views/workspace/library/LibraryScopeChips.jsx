import React from 'react';
import { PiFunnel } from 'react-icons/pi';

/**
 * LibraryScopeChips — VIS-773 / Track C C2.
 *
 * Three-way scope-chip row at the top of each Library section. Per the
 * revised B-1 design, the original "type filter" chips from the C-1 mockup
 * were replaced with **scope** chips because the section already filters by
 * type (Charts section only contains charts, etc.).
 *
 *   - `All`         — every row in this section (default).
 *   - `Used here`   — only rows referenced by the currently scoped object
 *                     (a dashboard, chart, insight, etc.). Disabled when the
 *                     workspace scope is `root`.
 *   - `Compatible`  — only rows compatible with the currently selected slot
 *                     on the canvas. Disabled when no typed slot is selected
 *                     (always disabled in C2 until D-2 wires drop targets).
 *
 * Pure presentational; the parent owns the active chip + disabled flags.
 */
const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'usedHere', label: 'Used here' },
  { key: 'compatible', label: 'Compatible' },
];

const Chip = ({ chip, active, disabled, onClick, sectionKey }) => {
  const baseClasses = [
    'inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium transition-colors',
  ];

  if (active) {
    baseClasses.push('bg-[#713b57] text-white');
  } else if (disabled) {
    baseClasses.push('text-gray-300 ring-1 ring-gray-100 cursor-not-allowed');
  } else {
    baseClasses.push(
      'text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-900'
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onClick && onClick(chip.key)}
      title={
        disabled
          ? chip.key === 'usedHere'
            ? 'Open a dashboard or object first'
            : 'Select a slot on the canvas first'
          : chip.label
      }
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      data-testid={`library-scope-chip-${sectionKey}-${chip.key}`}
      data-active={active ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      className={baseClasses.join(' ')}
    >
      {chip.label}
    </button>
  );
};

/**
 * Determine which chips are disabled given the current workspace scope and
 * selected slot. Memoising is overkill here — the result depends on two
 * scalars and recomputing on every render is cheap.
 */
const computeDisabled = ({ scope, hasSelectedSlot }) => ({
  all: false,
  usedHere: scope === 'root' || scope === undefined || scope === null,
  compatible: !hasSelectedSlot,
});

const LibraryScopeChips = ({
  sectionKey,
  value = 'all',
  onChange,
  scope = 'root',
  hasSelectedSlot = false,
}) => {
  const disabled = computeDisabled({ scope, hasSelectedSlot });

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      data-testid={`library-scope-chips-${sectionKey}`}
      role="group"
      aria-label={`${sectionKey} scope filter`}
    >
      <PiFunnel aria-hidden="true" className="mr-0.5 h-3 w-3 shrink-0 text-gray-400" />
      {CHIPS.map((chip) => (
        <Chip
          key={chip.key}
          chip={chip}
          active={value === chip.key}
          disabled={disabled[chip.key]}
          onClick={onChange}
          sectionKey={sectionKey}
        />
      ))}
    </div>
  );
};

export { computeDisabled, CHIPS };
export default LibraryScopeChips;
