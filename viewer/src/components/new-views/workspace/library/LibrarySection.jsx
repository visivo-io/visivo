import React, { useCallback, useEffect, useState } from 'react';
import { PiCaretDown, PiPlus } from 'react-icons/pi';
import LibrarySearch from './LibrarySearch';
import LibraryScopeChips from './LibraryScopeChips';
import LibraryRow from './LibraryRow';
import useLibraryFilter from './useLibraryFilter';

/**
 * LibrarySection — VIS-769 / Track C C1.
 *
 * One collapsible section in the Library rail (Insert · Charts · Insights ·
 * Models · Sources). Each section gets:
 *
 *   - a header with caret + uppercase label + count badge (header itself
 *     toggles the collapse),
 *   - a search input + scope chips (rendered only when expanded),
 *   - the body of rows (rendered only when expanded),
 *   - an optional "+ New X" CTA (one per droppable section).
 *
 * Collapse state persists per-section in localStorage under
 * `library:section-collapsed:<key>` (per VIS-773). The initial render uses
 * the persisted value (or `false` when no entry exists).
 */
const STORAGE_PREFIX = 'library:section-collapsed:';

function readPersistedCollapsed(key) {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return raw === '1';
  } catch {
    return false;
  }
}

function writePersistedCollapsed(key, collapsed) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (collapsed) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, '1');
    } else {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    }
  } catch {
    // Ignore quota errors etc. — collapsing the section is non-critical.
  }
}

const LibrarySection = ({
  sectionKey,
  label,
  hint,
  rows = [],
  scope = 'root',
  selectedRowId = null,
  emptyText,
  showSearch = true,
  showScopeChips = true,
  showCreate = false,
  createLabel,
  onRowClick,
  onCreate,
  onContextAction,
  initialCollapsed,
  // Whether rows in this section are draggable. The Insert section is
  // droppable + draggable (4 layout primitives), Charts/Insights are
  // draggable, Models/Sources are click-to-edit only per the design.
  draggable = false,
  // Hooks for the parent to read child state in tests / Workspace store.
  searchValue,
  onSearchChange,
  scopeChip = 'all',
  onScopeChipChange,
  // Compatibility chip is only enabled when a typed slot is selected.
  hasSelectedSlot = false,
}) => {
  const [collapsedState, setCollapsedState] = useState(() => {
    if (typeof initialCollapsed === 'boolean') return initialCollapsed;
    return readPersistedCollapsed(sectionKey);
  });

  const [localSearch, setLocalSearch] = useState(searchValue || '');
  const [localScope, setLocalScope] = useState(scopeChip || 'all');

  // Sync from parent if it controls these (we accept both controlled and
  // uncontrolled patterns to keep the LibrarySection self-contained).
  useEffect(() => {
    if (typeof searchValue === 'string' && searchValue !== localSearch) {
      setLocalSearch(searchValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  useEffect(() => {
    if (scopeChip && scopeChip !== localScope) {
      setLocalScope(scopeChip);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeChip]);

  const handleToggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writePersistedCollapsed(sectionKey, next);
      return next;
    });
  }, [sectionKey]);

  const handleSearchChange = useCallback(
    (next) => {
      setLocalSearch(next);
      if (onSearchChange) onSearchChange(next);
    },
    [onSearchChange]
  );

  const handleScopeChange = useCallback(
    (next) => {
      setLocalScope(next);
      if (onScopeChipChange) onScopeChipChange(next);
    },
    [onScopeChipChange]
  );

  // Apply the filter logic (search + scope chip).
  const filteredRows = useLibraryFilter({
    rows,
    search: localSearch,
    scopeChip: localScope,
    scope,
    usedNames: [],
    compatibleTypes: [],
  });

  const count = rows.length;
  const collapsed = collapsedState;

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
          {label}
        </h2>
        <span
          className="text-[11px] text-gray-400"
          data-testid={`library-section-${sectionKey}-count`}
        >
          ({count})
        </span>
        {!collapsed && hint && (
          <span className="ml-auto text-[10px] text-gray-400">{hint}</span>
        )}
      </button>

      {!collapsed && (
        <div
          id={`library-section-${sectionKey}-body`}
          data-testid={`library-section-${sectionKey}-body`}
        >
          {(showSearch || showScopeChips) && (
            <div className="flex flex-col gap-1.5 px-3 py-2">
              {showSearch && (
                <LibrarySearch
                  sectionKey={sectionKey}
                  value={localSearch}
                  onChange={handleSearchChange}
                />
              )}
              {showScopeChips && (
                <LibraryScopeChips
                  sectionKey={sectionKey}
                  value={localScope}
                  onChange={handleScopeChange}
                  scope={scope}
                  hasSelectedSlot={hasSelectedSlot}
                />
              )}
            </div>
          )}
          <div className="flex flex-col gap-px px-1.5 pb-2">
            {filteredRows.length === 0 ? (
              <p
                className="px-3 py-1.5 text-[11px] italic text-gray-400"
                data-testid={`library-section-${sectionKey}-empty`}
              >
                {emptyText || `No ${label.toLowerCase()} yet`}
              </p>
            ) : (
              <ul
                className="flex flex-col gap-px"
                data-testid={`library-section-${sectionKey}-rows`}
              >
                {filteredRows.map((obj) => (
                  <li key={obj.id} className="relative">
                    <LibraryRow
                      obj={obj}
                      selected={selectedRowId === obj.id}
                      draggable={draggable}
                      onClick={onRowClick}
                      onContextAction={onContextAction}
                    />
                  </li>
                ))}
              </ul>
            )}
            {showCreate && (
              <button
                type="button"
                onClick={onCreate}
                data-testid={`library-section-${sectionKey}-create`}
                className="mt-0.5 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[#713b57] hover:bg-[#e2d7dd]/40"
              >
                <PiPlus className="h-3 w-3" /> New {createLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export { readPersistedCollapsed, writePersistedCollapsed, STORAGE_PREFIX };
export default LibrarySection;
