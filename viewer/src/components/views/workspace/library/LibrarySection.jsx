import React, { useCallback, useMemo, useState } from 'react';
import { PiCaretDown } from 'react-icons/pi';
import LibrarySearch from './LibrarySearch';
import LibraryFilterChips from './LibraryFilterChips';
import LibrarySubsection from './LibrarySubsection';
import useLibraryFilter from './useLibraryFilter';
import useStore from '../../../../stores/store';

/**
 * LibrarySection — VIS-769 / Track C C1.
 *
 * One of the two stacked sections in the Library rail (Layout Items or
 * Data Layer). Mirrors the `Section` function in the C-1 `library.jsx`
 * blueprint. Each section gets:
 *
 *   - A header bar (caret + UPPERCASE title + `(count)` + right-aligned
 *     subtitle). The header toggles the section's collapse.
 *   - A toolbar block — a search input (`<LibrarySearch>`) + a type-filter
 *     chip row (`<LibraryFilterChips>`).
 *   - A list of per-type `<LibrarySubsection>` groups, one per type the
 *     section owns.
 *
 * Filtering rules:
 *   - When a filter chip is active, every non-matching subsection is hidden.
 *   - When the search is non-empty, rows are filtered by name and any
 *     subsection left with zero matches is hidden.
 *
 * Section-level collapse persists in the `library-prefs-storage` Zustand
 * slice (`libraryPrefsStore`), which uses Zustand's `persist` middleware so
 * the rail remembers what was collapsed across reloads.
 */
const LibrarySection = ({
  sectionKey,
  title,
  subtitle,
  // The type keys this section owns, in display order.
  types = [],
  // Map of typeKey -> row[] for every type the section owns.
  rowsByType = {},
  selectedRowId = null,
  onRowClick,
  onContextAction,
  onCreate,
}) => {
  const collapsed = useStore(s => !!s.libraryCollapsedSections[sectionKey]);
  const toggleSectionCollapsed = useStore(s => s.toggleLibrarySectionCollapsed);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);

  const handleToggleCollapsed = useCallback(() => {
    toggleSectionCollapsed(sectionKey);
  }, [sectionKey, toggleSectionCollapsed]);

  // Flat list of every row across the section's types — used both for the
  // header count and as the input to the search/type-filter.
  const allRows = useMemo(
    () => types.flatMap(t => rowsByType[t] || []),
    [types, rowsByType]
  );

  // Apply search + type-filter across the whole section at once.
  const filteredRows = useLibraryFilter({ rows: allRows, search, typeFilter });
  const searchActive = search.trim().length > 0;

  return (
    <section
      data-testid={`library-section-${sectionKey}`}
      data-collapsed={collapsed ? 'true' : 'false'}
      className="flex flex-col border-b border-gray-200 last:border-b-0"
    >
      <button
        type="button"
        onClick={handleToggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls={`library-section-${sectionKey}-body`}
        data-testid={`library-section-${sectionKey}-header`}
        className={[
          'flex h-9 shrink-0 items-center gap-1.5 px-3 text-left transition-colors',
          collapsed ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/60',
        ].join(' ')}
      >
        <PiCaretDown
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 text-gray-500 transition-transform ${
            collapsed ? '-rotate-90' : ''
          }`}
        />
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-gray-700">
          {title}
        </h2>
        <span
          className="text-[11px] text-gray-400"
          data-testid={`library-section-${sectionKey}-count`}
        >
          ({allRows.length})
        </span>
        {!collapsed && subtitle && (
          <span className="ml-auto text-[10px] text-gray-400">{subtitle}</span>
        )}
      </button>

      {!collapsed && (
        <div id={`library-section-${sectionKey}-body`} data-testid={`library-section-${sectionKey}-body`}>
          {/* Section toolbar — search + type-filter chips. */}
          <div className="flex flex-col gap-1.5 px-3 py-2">
            <LibrarySearch sectionKey={sectionKey} value={search} onChange={setSearch} />
            <LibraryFilterChips
              sectionKey={sectionKey}
              types={types}
              value={typeFilter}
              onChange={setTypeFilter}
            />
          </div>

          {/* Per-type subsections. */}
          <div className="flex flex-1 flex-col gap-1 px-1.5 pb-2">
            {types.map(typeKey => {
              // Hide entirely when a filter chip is set and this isn't it.
              if (typeFilter && typeFilter !== typeKey) return null;
              const rows = filteredRows.filter(r => r.type === typeKey);
              // When a search is active and the subsection has no matches,
              // hide it to keep the rail uncluttered.
              if (searchActive && rows.length === 0) return null;
              return (
                <LibrarySubsection
                  key={typeKey}
                  typeKey={typeKey}
                  rows={rows}
                  selectedRowId={selectedRowId}
                  onRowClick={onRowClick}
                  onContextAction={onContextAction}
                  onCreate={onCreate}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default LibrarySection;
