import React from 'react';
import { PiFunnel } from 'react-icons/pi';
import { getTypeDef } from './LibraryRow';

/**
 * LibraryFilterChips — VIS-773 / Track C C2.
 *
 * The type-filter chip row at the top of each Library section. Mirrors the
 * `FilterChips` function in the C-1 `library.jsx` blueprint:
 *
 *   - The row always leads with a small filter icon, so it reads as
 *     "filter to one type" even when no chip is active.
 *   - One rounded-full chip per type in the section (`Charts | Tables |
 *     Markdowns | Inputs` for Layout Items; the six data types for Data
 *     Layer). The chip label is the type's plural noun.
 *   - The active chip is mulberry-fill (`bg-[#713b57] text-white`); inactive
 *     chips carry a hairline ring.
 *
 * Filtering is single-select: clicking a chip activates it (and hides every
 * non-matching subsection); clicking the active chip again clears the
 * filter. Pure presentational — the parent owns the active value.
 */
const LibraryFilterChips = ({ sectionKey, types = [], value = null, onChange }) => {
  const handleClick = type => {
    if (!onChange) return;
    // Single-select toggle — clicking the active chip clears the filter.
    onChange(value === type ? null : type);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      data-testid={`library-filter-chips-${sectionKey}`}
      role="group"
      aria-label={`${sectionKey} type filter`}
    >
      <PiFunnel aria-hidden="true" className="mr-0.5 h-3 w-3 shrink-0 text-gray-400" />
      {types.map(type => {
        const def = getTypeDef(type);
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => handleClick(type)}
            title={`Filter to ${def.plural}`}
            aria-pressed={active}
            data-testid={`library-filter-chip-${sectionKey}-${type}`}
            data-active={active ? 'true' : 'false'}
            className={[
              'inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium transition-colors',
              active
                ? 'bg-[#713b57] text-white'
                : 'text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-900',
            ].join(' ')}
          >
            {def.plural}
          </button>
        );
      })}
    </div>
  );
};

export default LibraryFilterChips;
