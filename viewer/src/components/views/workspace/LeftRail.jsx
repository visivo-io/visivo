import React, { useEffect, useRef } from 'react';
import { PiMagnifyingGlass, PiSidebar } from 'react-icons/pi';
import Library from './library/Library';
import ViewSwitcher from './ViewSwitcher';
import useStore from '../../../stores/store';
import { LAYOUT_TYPES, DATA_TYPES, getTypeDef } from './library/LibraryRow';

/**
 * LeftRail — project-wide Library navigator (VIS-775 / Track B B2, VIS-769 /
 * Track C C1), topped by the destination `<ViewSwitcher>` (D1, Explore 2.0
 * Phase 0 — 01-ux-spec.md §1).
 *
 *   - Expanded: the switcher's three rows, then the full Library (Track C C1+).
 *   - Collapsed (48-px icon strip): the switcher's three icons (fixed
 *     positions, tooltips), then one icon per Library subsection so the user
 *     can identify what's in the rail at a glance. The two-section
 *     vocabulary matches the Library — Data Layer above the divider, Layout
 *     Items below, the SAME order the expanded tree renders (Library.jsx
 *     composes `[...DATA_TYPES, ...LAYOUT_TYPES]`). The strip used to run the
 *     other way round, so collapsing the rail reordered it. Icons come from
 *     the canonical `objectTypeConfigs.js` (MUI) via `getTypeDef`, so the two
 *     views read as the same Library.
 *   - Popped out: on a viewport too narrow to host the rail in flow, opening
 *     it draws the Library OVER the content instead of beside it. Expanding
 *     in flow there would leave the canvas below its minimum, which is why
 *     the shell used to undo it immediately — see `expandWorkspaceLeft`.
 */

const TypeBtn = ({ typeKey, active, onClick }) => {
  const def = getTypeDef(typeKey);
  const Icon = def.icon;
  return (
    <button
      type="button"
      title={def.plural}
      aria-label={def.plural}
      onClick={onClick}
      data-testid={`workspace-left-rail-collapsed-${typeKey}`}
      data-active={active ? 'true' : 'false'}
      className={[
        'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
        active
          ? 'bg-primary-100 text-primary-600'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
      ].join(' ')}
    >
      <Icon aria-hidden="true" style={{ fontSize: 18 }} />
    </button>
  );
};

/**
 * The Library drawn over the content, for viewports that cannot seat it.
 *
 * Dismisses on backdrop click, on Escape, and on navigation — opening an
 * object is the whole point of the panel, and on a phone it would otherwise
 * sit on top of the thing it just opened.
 */
const LeftRailOverlay = ({ onClose }) => {
  const activeTabId = useStore(s => s.workspaceActiveTabId);
  const openedWith = useRef(activeTabId);

  useEffect(() => {
    // Not on mount — only once the selection actually moves.
    if (activeTabId !== openedWith.current) onClose();
  }, [activeTabId, onClose]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-y-0 left-12 right-0 z-40 flex"
      data-testid="workspace-left-rail-overlay"
    >
      <div className="h-full w-72 max-w-[85vw] border-r border-gray-200 bg-white shadow-xl">
        <Library />
      </div>
      {/* Sits beside the panel rather than under it, so a tap anywhere on the
          content dismisses without also reaching the content. */}
      <button
        type="button"
        aria-label="Close navigator"
        data-testid="workspace-left-rail-overlay-backdrop"
        onClick={onClose}
        className="h-full flex-1 cursor-default bg-gray-900/20"
      />
    </div>
  );
};

const LeftRailCollapsed = ({ onExpand }) => {
  // Highlight the type matching the active workspace object so the
  // collapsed strip reads as "you're inside X" — matches the design's
  // mulberry pill on the active section.
  const activeObject = useStore(s => s.workspaceActiveObject);
  const activeType = activeObject?.type || null;
  const setLibrarySubsectionCollapsed = useStore(s => s.setLibrarySubsectionCollapsed);

  // Collapsed buttons must not be dead affordances (they render hover/title
  // states that promise interactivity): clicking one expands the rail AND
  // applies the selection — a type button lands on that type's (now flat)
  // subsection expanded, the search button focuses the single shared search.
  const handleTypeClick = typeKey => {
    setLibrarySubsectionCollapsed(typeKey, false);
    onExpand();
  };
  const handleSearchClick = () => {
    onExpand();
    // The Library mounts on the re-render after expand — focus its single
    // search input on the next tick (same document-query pattern the Edit
    // panel's breadcrumb focus uses).
    setTimeout(() => {
      const input = document.querySelector('[data-testid="library-search"]');
      if (input && typeof input.focus === 'function') input.focus();
    }, 0);
  };
  return (
    <aside
      data-testid="workspace-left-rail"
      data-collapsed="true"
      className="flex h-full w-12 flex-col items-center border-r border-gray-200 bg-white"
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex h-10 w-12 shrink-0 items-center justify-center border-b border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        title="Expand left rail"
        aria-label="Expand left rail"
        data-testid="workspace-left-rail-expand"
      >
        <PiSidebar className="h-4 w-4" />
      </button>
      <ViewSwitcher collapsed />
      <div className="flex flex-1 flex-col items-center gap-1 py-2">
        <button
          type="button"
          title="Search"
          aria-label="Search"
          onClick={handleSearchClick}
          data-testid="workspace-left-rail-collapsed-search"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <PiMagnifyingGlass className="h-[18px] w-[18px]" />
        </button>
        {/* Data Layer first, then Layout Items — the order Library.jsx
            renders, so collapsing the rail no longer reshuffles it. */}
        <div className="my-1 h-px w-6 bg-gray-200" aria-hidden="true" />
        {DATA_TYPES.map(t => (
          <TypeBtn key={t} typeKey={t} active={t === activeType} onClick={() => handleTypeClick(t)} />
        ))}
        <div className="my-1 h-px w-6 bg-gray-200" aria-hidden="true" />
        {LAYOUT_TYPES.map(t => (
          <TypeBtn key={t} typeKey={t} active={t === activeType} onClick={() => handleTypeClick(t)} />
        ))}
      </div>
    </aside>
  );
};

const LeftRail = () => {
  const collapsed = useStore(s => s.workspaceLeftCollapsed);
  const overlayOpen = useStore(s => s.workspaceLeftOverlayOpen);
  // Not the plain toggle: on a narrow viewport the rail opens over the content
  // instead of beside it, and only the store knows which case applies.
  const expandLeft = useStore(s => s.expandWorkspaceLeft);
  const closeOverlay = useStore(s => s.closeWorkspaceLeftOverlay);

  if (!collapsed) return <Library />;
  return (
    <>
      <LeftRailCollapsed onExpand={expandLeft} />
      {overlayOpen && <LeftRailOverlay onClose={closeOverlay} />}
    </>
  );
};

export default LeftRail;
