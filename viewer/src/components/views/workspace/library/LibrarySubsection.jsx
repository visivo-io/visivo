import React, { useCallback } from 'react';
import { PiCaretDown } from 'react-icons/pi';
import LibraryRow from './LibraryRow';
import { getTypeDef } from './LibraryRow';
import LibrarySourceRow from './LibrarySourceRow';
import useStore from '../../../../stores/store';
import { isLibrarySubsectionCollapsed } from '../../../../stores/libraryPrefsStore';

/**
 * LibrarySubsection — VIS-769 / Track C C1.
 *
 * One per-type collapsible group inside a Library section. Mirrors the
 * `Subsection` function in the C-1 `library.jsx` blueprint:
 *
 *   - A header (caret + type icon + UPPERCASE plural + count) that toggles
 *     the subsection's collapse.
 *   - The list of `<LibraryRow>` rows for this type.
 *   - An italic empty-state line ("No charts yet") when the subsection has
 *     no rows.
 *
 * Creation happens from the Library's single "+ New" menu (VIS thread: the
 * per-subsection inline "+ New X" CTAs were redundant with that menu, so
 * they were removed).
 *
 * Collapse state persists in the `libraryPrefsStore` Zustand slice. Per
 * VIS-828 subsections default to COLLAPSED — with no saved preference the
 * user sees only the type headers + counts and expands a type on demand —
 * while an explicitly-expanded subsection (persisted `false`) stays open
 * across reloads. When a search is active and the subsection has no matching
 * rows, the parent hides it entirely; this component handles the "still has
 * rows" case.
 */
const LibrarySubsection = ({
  typeKey,
  rows = [],
  selectedRowId = null,
  onRowClick,
  onContextAction,
  canAddToExploration = false,
}) => {
  const def = getTypeDef(typeKey);
  const Icon = def.icon;

  // Subsections default to COLLAPSED (VIS-828): absence of a saved preference
  // reads as collapsed; an explicit `false` keeps a user-expanded subsection
  // open across reloads.
  const collapsed = useStore(s =>
    isLibrarySubsectionCollapsed(s.libraryCollapsedSubsections, typeKey)
  );
  const toggleSubsectionCollapsed = useStore(s => s.toggleLibrarySubsectionCollapsed);

  const handleToggle = useCallback(() => {
    toggleSubsectionCollapsed(typeKey);
  }, [typeKey, toggleSubsectionCollapsed]);

  return (
    <div
      className="flex flex-col"
      data-testid={`library-subsection-${typeKey}`}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={!collapsed}
        aria-controls={`library-subsection-${typeKey}-body`}
        data-testid={`library-subsection-${typeKey}-header`}
        className="group flex h-7 items-center gap-1.5 rounded px-1.5 text-left transition-colors hover:bg-gray-50"
      >
        <PiCaretDown
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${
            collapsed ? '-rotate-90' : ''
          }`}
        />
        <Icon aria-hidden="true" style={{ fontSize: 14 }} className="shrink-0 text-gray-500" />
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-gray-600">
          {def.plural}
        </span>
        <span
          className="text-[10.5px] text-gray-400"
          data-testid={`library-subsection-${typeKey}-count`}
        >
          ({rows.length})
        </span>
      </button>

      {!collapsed && (
        <div id={`library-subsection-${typeKey}-body`} data-testid={`library-subsection-${typeKey}-body`}>
          {rows.length === 0 && (
            <p
              className="px-3 py-1.5 text-[11px] italic text-gray-400"
              data-testid={`library-subsection-${typeKey}-empty`}
            >
              No {def.plural.toLowerCase()} yet
            </p>
          )}
          {rows.length > 0 && (
            <ul
              className="flex flex-col gap-px"
              data-testid={`library-subsection-${typeKey}-rows`}
            >
              {rows.map(obj =>
                // Sources get the D9 source → table → column drill-down
                // (Explore 2.0 Phase 3a) instead of the plain flat row — see
                // LibrarySourceRow's docstring.
                typeKey === 'source' ? (
                  <li key={obj.id} className="relative">
                    <LibrarySourceRow
                      obj={obj}
                      selected={selectedRowId === obj.id}
                      onClick={onRowClick}
                      onContextAction={onContextAction}
                    />
                  </li>
                ) : (
                  <li key={obj.id} className="relative">
                    <LibraryRow
                      obj={obj}
                      selected={selectedRowId === obj.id}
                      draggable={def.droppable || def.explorationDragSource}
                      onClick={onRowClick}
                      onContextAction={onContextAction}
                      canAddToExploration={canAddToExploration}
                    />
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default LibrarySubsection;
