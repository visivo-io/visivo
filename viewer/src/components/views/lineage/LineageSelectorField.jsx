import React from 'react';

/**
 * The lineage selector input — one compact `sel` pill, shared by the main
 * lineage canvas and the mini lineage card.
 *
 * It started as markup inside `MiniLineageCard`, while the main canvas had a
 * full-height bordered input of its own. Two controls for the same grammar,
 * looking nothing alike. This is the mini card's treatment, lifted out: both
 * now render the same thing, and a change to the selector affordance happens
 * once.
 *
 * Being one component is also the groundwork for dropping objects INTO the
 * selector — a drag target has to live somewhere, and it should not be built
 * twice. `trailing` exists for that: it takes whatever a host wants beside the
 * input (today, the main canvas's reset button) without either host needing to
 * rebuild the pill around it.
 */
const LineageSelectorField = ({
  value,
  onChange,
  onKeyDown,
  placeholder,
  ariaLabel = 'Lineage selector — edit to change depth in either direction',
  testId,
  trailing = null,
}) => (
  <div className="flex min-w-0 flex-1 items-center gap-2">
    <div
      className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-gray-50 px-2 ring-1 ring-gray-200 focus-within:ring-primary/40"
      data-testid={testId}
    >
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">
        sel
      </span>
      <input
        type="text"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        spellCheck={false}
        aria-label={ariaLabel}
        data-testid={testId ? `${testId}-input` : undefined}
        className="min-w-0 flex-1 truncate bg-transparent font-mono text-[11px] text-gray-800 placeholder-gray-400 outline-none"
        placeholder={placeholder}
      />
    </div>
    {trailing}
  </div>
);

export default LineageSelectorField;
