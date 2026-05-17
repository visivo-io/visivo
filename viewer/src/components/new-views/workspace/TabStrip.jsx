import React from 'react';
import { PiX, PiPlus } from 'react-icons/pi';
import { getKind } from './objKind';

/**
 * WorkspaceTab — a single tab in the strip.
 *
 * Per the delivered B-1 design:
 *   - type icon (from OBJ_KIND) + name + dirty dot + close (×).
 *   - Active tab: white background, dark text, mulberry bottom underline.
 *   - Inactive tab: gray track, lighter text; hover lifts to white.
 *   - Close button: always visible when active or dirty (so the user can
 *     dismiss the dirty dot); fades in on hover otherwise.
 *
 * Project is just another tab with the cube icon — no special chrome.
 */
const WorkspaceTab = ({ tab, active, onSelect, onClose }) => {
  const kind = getKind(tab.type);
  const TypeIcon = kind.icon;
  return (
    <div
      role="tab"
      aria-selected={active}
      data-testid={`workspace-tab-${tab.id}`}
      data-active={active ? 'true' : 'false'}
      className={[
        'group/tab relative flex h-9 min-w-0 max-w-[220px] shrink-0 items-center gap-1.5 border-r border-gray-200 px-3 text-[12.5px] transition-colors',
        active
          ? 'bg-white text-gray-900 font-medium'
          : 'bg-gray-50 text-gray-600 hover:bg-white/70 hover:text-gray-900',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect && onSelect(tab.id)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={tab.name}
        data-testid={`workspace-tab-select-${tab.id}`}
      >
        <TypeIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        <span className="truncate">{tab.name}</span>
        {tab.dirty && (
          <span
            title="Unsaved changes"
            data-testid={`workspace-tab-dirty-${tab.id}`}
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          />
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose && onClose(tab.id);
        }}
        title="Close tab"
        aria-label={`Close ${tab.name}`}
        data-testid={`workspace-tab-close-${tab.id}`}
        className={[
          'ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-gray-400 transition-opacity',
          active || tab.dirty
            ? 'opacity-100 hover:bg-gray-200 hover:text-gray-900'
            : 'opacity-0 group-hover/tab:opacity-100 hover:bg-gray-200 hover:text-gray-900',
        ].join(' ')}
      >
        <PiX className="h-3 w-3" />
      </button>
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary"
        />
      )}
    </div>
  );
};

/**
 * TabStrip — h-9 white bar between the top bar and the middle/right area.
 *
 * Sits OVER the middle + right rail only — the left rail anchors full-height.
 * This visually signals that tabs scope the active-object area (middle +
 * right rail), not the project-wide Library.
 *
 * Phase 0 supports: open project tab on mount, click-to-switch, close.
 * Drag-to-reorder ships in VIS-O3.
 */
const TabStrip = ({
  tabs = [],
  activeId,
  onSelect,
  onClose,
  onNewTab,
}) => {
  if (!tabs || tabs.length === 0) return null;
  return (
    <div
      data-testid="workspace-tab-strip"
      role="tablist"
      aria-label="Workspace tabs"
      className="relative flex h-9 shrink-0 items-stretch border-b border-gray-200 bg-gray-50"
    >
      <div className="flex flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => (
          <WorkspaceTab
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            onSelect={onSelect}
            onClose={onClose}
          />
        ))}
        <button
          type="button"
          onClick={onNewTab}
          title="New tab"
          aria-label="New tab"
          data-testid="workspace-tab-new"
          className="ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <PiPlus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default TabStrip;
