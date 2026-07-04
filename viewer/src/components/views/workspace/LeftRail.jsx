import React from 'react';
import { PiMagnifyingGlass, PiSidebar } from 'react-icons/pi';
import Library from './library/Library';
import useStore from '../../../stores/store';
import { LAYOUT_TYPES, DATA_TYPES, getTypeDef } from './library/LibraryRow';

/**
 * LeftRail — project-wide Library navigator (VIS-775 / Track B B2, VIS-769 /
 * Track C C1).
 *
 *   - Expanded: mounts the full Library (Track C C1+).
 *   - Collapsed (48-px icon strip): one icon per subsection so the user
 *     can identify what's in the rail at a glance. The two-section
 *     vocabulary matches the Library — Layout Items above the divider,
 *     Data Layer below. Icons come from the canonical `objectTypeConfigs.js`
 *     (MUI) via `getTypeDef`, so the collapsed and expanded views read as
 *     the same Library.
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
          ? 'bg-[#e2d7dd] text-[#5a2f45]'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
      ].join(' ')}
    >
      <Icon aria-hidden="true" style={{ fontSize: 18 }} />
    </button>
  );
};

const LeftRailCollapsed = ({ onExpand }) => {
  // Highlight the type matching the active workspace object so the
  // collapsed strip reads as "you're inside X" — matches the design's
  // mulberry pill on the active section.
  const activeObject = useStore(s => s.workspaceActiveObject);
  const activeType = activeObject?.type || null;
  const setLibrarySectionCollapsed = useStore(s => s.setLibrarySectionCollapsed);
  const setLibrarySubsectionCollapsed = useStore(s => s.setLibrarySubsectionCollapsed);

  // Collapsed buttons must not be dead affordances (they render hover/title
  // states that promise interactivity): clicking one expands the rail AND
  // applies the selection — a type button lands on that type's subsection
  // (section + subsection expanded), the search button focuses the search.
  const handleTypeClick = typeKey => {
    const sectionKey = LAYOUT_TYPES.includes(typeKey) ? 'layout' : 'data';
    setLibrarySectionCollapsed(sectionKey, false);
    setLibrarySubsectionCollapsed(typeKey, false);
    onExpand();
  };
  const handleSearchClick = () => {
    setLibrarySectionCollapsed('layout', false);
    onExpand();
    // The Library mounts on the re-render after expand — focus its first
    // search input on the next tick (same document-query pattern the Edit
    // panel's breadcrumb focus uses).
    setTimeout(() => {
      const input = document.querySelector('[data-testid="library-search-layout"]');
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
        {/* Layout Items group — droppable types. */}
        <div className="my-1 h-px w-6 bg-gray-200" aria-hidden="true" />
        {LAYOUT_TYPES.map(t => (
          <TypeBtn key={t} typeKey={t} active={t === activeType} onClick={() => handleTypeClick(t)} />
        ))}
        {/* Data Layer group — click-to-edit types. */}
        <div className="my-1 h-px w-6 bg-gray-200" aria-hidden="true" />
        {DATA_TYPES.map(t => (
          <TypeBtn key={t} typeKey={t} active={t === activeType} onClick={() => handleTypeClick(t)} />
        ))}
      </div>
    </aside>
  );
};

const LeftRail = () => {
  const collapsed = useStore(s => s.workspaceLeftCollapsed);
  const toggleCollapsed = useStore(s => s.toggleWorkspaceLeftCollapsed);
  return collapsed ? (
    <LeftRailCollapsed onExpand={toggleCollapsed} />
  ) : (
    <Library />
  );
};

export default LeftRail;
