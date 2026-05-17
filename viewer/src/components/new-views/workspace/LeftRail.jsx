import React from 'react';
import {
  PiMagnifyingGlass,
  PiPlus,
  PiChartBar,
  PiLightbulb,
  PiCube,
  PiDatabase,
  PiCaretDown,
  PiSidebar,
} from 'react-icons/pi';

/**
 * LeftRail — project-wide Library navigator (VIS-775 / Track B B2).
 *
 * Phase 0 ships the **shell** only: section headers (Insert · Charts ·
 * Insights · Models · Sources) and a search-input placeholder. The actual
 * Library content (per-section item lists, drag sources, scope chips
 * `[All] [Used here] [Compatible]`) ships in VIS-C1 (Track C).
 *
 * The rail anchors full-height (top bar to bottom of viewport). When
 * collapsed it becomes a 48-px icon strip with the same vocabulary so the
 * user can quickly re-expand or jump to a specific section.
 */

const SECTIONS = [
  { key: 'insert', label: 'Insert', icon: PiPlus, hint: 'layout primitives' },
  { key: 'charts', label: 'Charts', icon: PiChartBar },
  { key: 'insights', label: 'Insights', icon: PiLightbulb },
  { key: 'models', label: 'Models', icon: PiCube },
  { key: 'sources', label: 'Sources', icon: PiDatabase },
];

const SectionHeader = ({ section }) => (
  <button
    type="button"
    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-50"
    data-testid={`workspace-left-rail-section-${section.key}`}
  >
    <PiCaretDown aria-hidden="true" className="h-3 w-3 -rotate-90 transition-transform" />
    {section.label}
    {section.hint && (
      <span className="ml-auto pr-1 font-normal normal-case tracking-normal text-gray-400">
        {section.hint}
      </span>
    )}
  </button>
);

const LeftRailExpanded = ({ onCollapse }) => {
  return (
    <aside
      data-testid="workspace-left-rail"
      data-collapsed="false"
      className="flex h-full flex-col border-r border-gray-200 bg-white"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-200 px-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-gray-900">Library</span>
          <span className="text-[11px] text-gray-400">· project</span>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          title="Collapse left rail"
          aria-label="Collapse left rail"
          data-testid="workspace-left-rail-collapse"
        >
          <PiSidebar className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 border-b border-gray-200 px-3 py-2">
        <div className="flex h-8 items-center gap-2 rounded-md bg-gray-100 px-2 text-[12px] text-gray-500">
          <PiMagnifyingGlass aria-hidden="true" className="h-3.5 w-3.5" />
          Search library…
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2 text-[13px] text-gray-800">
        {SECTIONS.map((section) => (
          <div key={section.key} className="mb-1">
            <SectionHeader section={section} />
          </div>
        ))}

        <div
          data-testid="workspace-left-rail-placeholder"
          className="mt-4 rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-[12px] text-gray-500"
        >
          Library coming soon (VIS-C1)
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-200 px-3 py-2 text-[11px] text-gray-400">
        Drag any item onto the canvas or onto the Edit panel.
      </div>
    </aside>
  );
};

const LeftRailCollapsed = ({ onExpand }) => {
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <PiMagnifyingGlass className="h-[18px] w-[18px]" />
        </button>
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            title={label}
            aria-label={label}
            data-testid={`workspace-left-rail-collapsed-${key}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <Icon className="h-[18px] w-[18px]" />
          </button>
        ))}
      </div>
    </aside>
  );
};

const LeftRail = ({ collapsed = false, onToggleCollapsed }) => {
  return collapsed ? (
    <LeftRailCollapsed onExpand={onToggleCollapsed} />
  ) : (
    <LeftRailExpanded onCollapse={onToggleCollapsed} />
  );
};

export default LeftRail;
