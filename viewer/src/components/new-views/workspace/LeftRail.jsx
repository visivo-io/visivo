import React from 'react';
import {
  PiMagnifyingGlass,
  PiPlus,
  PiChartBar,
  PiLightbulb,
  PiCube,
  PiDatabase,
  PiSidebar,
} from 'react-icons/pi';
import Library from './library/Library';
import useStore from '../../../stores/store';

/**
 * LeftRail — project-wide Library navigator (VIS-775 / Track B B2, VIS-769 /
 * Track C C1).
 *
 * Track B B2 shipped the shell. Track C C1 + C2 + C3 fills it with the real
 * Library:
 *
 *   - Five sections: Insert · Charts · Insights · Models · Sources.
 *   - Per-section debounced search + scope chips (`All` · `Used here` ·
 *     `Compatible`).
 *   - Drag-source rows (Insert / Charts / Insights) for the canvas drop
 *     target (Track D).
 *   - Hover-revealed flip popover with an inline mini-lineage preview.
 *   - Persisted section collapse (localStorage `library:section-collapsed:*`).
 *
 * Collapsed mode (48-px icon strip) is unchanged from B-2: shows one icon
 * per section so the user can quickly re-expand.
 */

const SECTIONS = [
  { key: 'insert', label: 'Insert', icon: PiPlus, hint: 'layout primitives' },
  { key: 'charts', label: 'Charts', icon: PiChartBar },
  { key: 'insights', label: 'Insights', icon: PiLightbulb },
  { key: 'models', label: 'Models', icon: PiCube },
  { key: 'sources', label: 'Sources', icon: PiDatabase },
];

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
