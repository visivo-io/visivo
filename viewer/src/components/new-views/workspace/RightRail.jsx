import React from 'react';
import { PiList, PiPencil, PiSidebar } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { useActiveObject } from './useActiveObject';

/**
 * RightRail — Outline / Edit tab host (VIS-775 / Track B B2).
 *
 * Two tabs (mulberry underline indicator on the active one):
 *   - **Outline** — compact tree of the active object (project for the
 *     unscoped surface, dashboard structure for a scoped dashboard, etc.).
 *     Real tree ships in VIS-F3.
 *   - **Edit** — selection-driven property editor. Real form ships in
 *     VIS-G1 (and the per-object forms in Track G).
 *
 * The active object's `name` is surfaced in the Edit-tab placeholder so the
 * shell visibly reacts to tab/selection changes during Phase 0.
 */

const TABS = [
  { key: 'outline', label: 'Outline', icon: PiList },
  { key: 'edit', label: 'Edit', icon: PiPencil },
];

const TabBtn = ({ tab, active, onClick }) => {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={`workspace-right-rail-tab-${tab.key}`}
      data-active={active ? 'true' : 'false'}
      className={[
        'relative inline-flex h-full items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors',
        active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" />
      {tab.label}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary"
        />
      )}
    </button>
  );
};

const RightRailBody = ({ activeTab, activeObject }) => {
  if (activeTab === 'outline') {
    return (
      <div
        data-testid="workspace-right-rail-outline"
        className="flex flex-1 items-start justify-center px-6 py-8 text-center"
      >
        <div className="text-gray-500">
          <PiList aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-gray-400" />
          <p className="text-[12px] leading-relaxed">
            Outline tree coming soon (VIS-F3)
          </p>
        </div>
      </div>
    );
  }
  // Edit is the default tab — also the fallthrough so any unknown tab key
  // still renders the editor surface rather than a blank panel.
  return (
    <div
      data-testid="workspace-right-rail-edit"
      className="flex flex-1 items-start justify-center px-6 py-8 text-center"
    >
      <div className="text-gray-500">
        <PiPencil aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-gray-400" />
        <p className="text-[12px] leading-relaxed">
          Edit form coming soon (VIS-G1)
          {activeObject && (
            <>
              {' '}
              — selected:{' '}
              <span
                className="font-medium text-gray-700"
                data-testid="workspace-right-rail-edit-active-name"
              >
                {activeObject.name}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

const RightRailExpanded = ({
  activeTab,
  onSelectTab,
  onCollapse,
  activeObject,
}) => {
  return (
    <aside
      data-testid="workspace-right-rail"
      data-collapsed="false"
      className="flex h-full flex-col border-l border-gray-200 bg-white"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-200 pl-2 pr-3">
        <div role="tablist" aria-label="Right rail" className="flex h-full items-center gap-1">
          {TABS.map((tab) => (
            <TabBtn
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onClick={() => onSelectTab && onSelectTab(tab.key)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse right rail"
          aria-label="Collapse right rail"
          data-testid="workspace-right-rail-collapse"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <PiSidebar className="h-4 w-4 -scale-x-100" />
        </button>
      </div>
      <RightRailBody activeTab={activeTab} activeObject={activeObject} />
    </aside>
  );
};

const RightRailCollapsed = ({ activeTab, onExpand }) => {
  return (
    <aside
      data-testid="workspace-right-rail"
      data-collapsed="true"
      className="flex h-full w-12 flex-col items-center border-l border-gray-200 bg-white"
    >
      <button
        type="button"
        onClick={onExpand}
        title="Expand right rail"
        aria-label="Expand right rail"
        data-testid="workspace-right-rail-expand"
        className="flex h-10 w-12 shrink-0 items-center justify-center border-b border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
      >
        <PiSidebar className="h-4 w-4 -scale-x-100" />
      </button>
      <div className="flex flex-1 flex-col items-center gap-1 py-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
          return (
            <button
              type="button"
              key={tab.key}
              title={tab.label}
              aria-label={tab.label}
              data-testid={`workspace-right-rail-collapsed-${tab.key}`}
              className={[
                'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                active
                  ? 'bg-[#e2d7dd] text-[#5a2f45]'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          );
        })}
      </div>
    </aside>
  );
};

const RightRail = () => {
  // All state + actions come from the workspace store — no prop-drilling.
  const collapsed = useStore(s => s.workspaceRightCollapsed);
  const toggleCollapsed = useStore(s => s.toggleWorkspaceRightCollapsed);
  const activeTab = useStore(s => s.workspaceRightTab);
  const onSelectTab = useStore(s => s.setWorkspaceRightTab);
  const activeObject = useActiveObject();
  return collapsed ? (
    <RightRailCollapsed activeTab={activeTab} onExpand={toggleCollapsed} />
  ) : (
    <RightRailExpanded
      activeTab={activeTab}
      onSelectTab={onSelectTab}
      onCollapse={toggleCollapsed}
      activeObject={activeObject}
    />
  );
};

export default RightRail;
