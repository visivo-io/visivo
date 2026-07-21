import React from 'react';
import { PiList, PiPencil, PiSidebar, PiSlidersHorizontal, PiTreeStructure } from 'react-icons/pi';
import useStore from '../../../stores/store';
import useWorkspaceScope from './useWorkspaceScope';
import OutlineTreePanel from './OutlineTreePanel';
import SourceOutlineTreePanel from './SourceOutlineTreePanel';
import RightRailEditPanel from './RightRailEditPanel';
import ExplorationBuildRail from './ExplorationBuildRail';
import { emitWorkspaceEvent } from './telemetry';

/**
 * RightRail — Outline / Edit / Build tab host (VIS-775 / Track B B2; VIS-802
 * / G-1; 6c-T2 / D6 — the single right rail).
 *
 * ONE right rail, everywhere, always — no second panel ever mounts beside
 * it. The active tab set is per-object-type and there is no dead-end tab: a
 * type with no real editor gets NO Edit tab at all (the pre-6c-T2 "No editor
 * for this object yet — coming soon" placeholder is gone from every
 * context).
 *   - **Outline** — compact tree of the scoped dashboard (<OutlineTreePanel>,
 *     F-3).
 *   - **Data** — a source's db → schema → table → column tree
 *     (<SourceOutlineTreePanel>, VIS-1004).
 *   - **Build** — an exploration's Insight+Chart CRUD (<ExplorationBuildRail>,
 *     D6). This IS the exploration's editor; there is no separate "Edit" tab
 *     for explorations, and `ExplorationWorkbench` no longer mounts its own
 *     copy in-pane (the two-rails bug this closes).
 *   - **Edit** — the selection-driven property editor (<RightRailEditPanel>,
 *     G-1) for every other object type. Routes the form per Q25 from
 *     `workspaceActiveObject` + `workspaceOutlineSelectedKey`, fronts each
 *     with a selection chip, and auto-saves with a debounce (no Save buttons
 *     for the structure forms).
 */

// The Outline-style first tab is contextual and ONLY offered where it's
// meaningful (VIS-1004 §8.5 — show the outline only where relevant):
//   - dashboard    → "Outline" (the compact tree of the scoped dashboard).
//   - source       → "Data" (the db → schema → table → column tree).
//   - exploration  → "Build" ONLY (D6) — the Insight+Chart CRUD rail IS the
//     editor; there is no separate Edit tab to fall back to.
//   - every other object type → no Outline/Data tab at all, just "Edit".
//   - no selection at all (a DESTINATION owns the center — Project/Semantic
//     Layer/Explorer, Explore 2.0 Phase 0) → NO tabs. B2 fix: destinations
//     never had a real Edit surface, so the rail no longer offers one to
//     dead-end into ("No editor for this object yet / coming soon").
const EDIT_TAB = { key: 'edit', label: 'Edit', icon: PiPencil };
const BUILD_TAB = { key: 'build', label: 'Build', icon: PiSlidersHorizontal };

const getTabs = type => {
  if (!type) return [];
  if (type === 'dashboard') {
    return [{ key: 'outline', label: 'Outline', icon: PiList }, EDIT_TAB];
  }
  if (type === 'source') {
    return [{ key: 'outline', label: 'Data', icon: PiTreeStructure }, EDIT_TAB];
  }
  if (type === 'exploration') {
    return [BUILD_TAB];
  }
  return [EDIT_TAB];
};

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

const RightRailBody = ({ activeTab, selectedItem }) => {
  // D6 — the exploration scope's ONLY tab is Build: the Insight+Chart CRUD
  // rail (`ExplorationBuildRail`) IS its editor. `selectedItem.name` is the
  // exploration's stable backend id (a tab's `name` for type `exploration`
  // — see TabStrip's docstring), which is exactly what the rail's promoted
  // trail + promote checklist need.
  if (selectedItem && selectedItem.type === 'exploration') {
    return <ExplorationBuildRail explorationId={selectedItem.name} />;
  }
  if (activeTab === 'outline') {
    // VIS-1004 — when a `source` is the active object, the Outline ("Data") tab
    // browses its db → schema → table → column tree instead of dead-ending on
    // NoDashboardState. Every other object keeps the dashboard outline (F-3).
    if (selectedItem && selectedItem.type === 'source') {
      return <SourceOutlineTreePanel sourceName={selectedItem.name} />;
    }
    return <OutlineTreePanel />;
  }
  // Edit is the default tab — also the fallthrough so any unknown tab key
  // still renders the editor surface rather than a blank panel. The full
  // selection-driven router lives in <RightRailEditPanel> (VIS-802 / G-1).
  return <RightRailEditPanel />;
};

const RightRailExpanded = ({
  activeTab,
  tabs,
  selectedItem,
  onSelectTab,
  onCollapse,
}) => {
  return (
    <aside
      data-testid="workspace-right-rail"
      data-collapsed="false"
      className="flex h-full flex-col border-l border-gray-200 bg-white"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-200 pl-2 pr-3">
        <div role="tablist" aria-label="Right rail" className="flex h-full items-center gap-1">
          {tabs.map((tab) => (
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
      <RightRailBody activeTab={activeTab} selectedItem={selectedItem} />
    </aside>
  );
};

const RightRailCollapsed = ({ activeTab, tabs, onExpand, onSelectTab }) => {
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
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
          return (
            <button
              type="button"
              key={tab.key}
              title={tab.label}
              aria-label={tab.label}
              // A collapsed tab icon must not be a dead affordance: clicking
              // it expands the rail AND applies the selection.
              onClick={() => onSelectTab && onSelectTab(tab.key)}
              data-testid={`workspace-right-rail-collapsed-${tab.key}`}
              className={[
                'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                active
                  ? 'bg-primary-100 text-primary-600'
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
  const setRightTab = useStore(s => s.setWorkspaceRightTab);

  // The active object decides the tab set: only a dashboard (Outline) or a
  // source (Data) gets an outline-style first tab; an exploration gets ONLY
  // Build (D6); every other type is Edit-only (VIS-1004). The active object
  // also decides which Outline body mounts (source → schema tree).
  const { selectedItem } = useWorkspaceScope();
  const tabs = React.useMemo(() => getTabs(selectedItem?.type), [selectedItem?.type]);

  // Guard against a stale tab selection that this object doesn't offer (e.g.
  // an `outline` tab left over from a dashboard, now looking at a metric —
  // or `edit` left over from anything, now looking at an exploration whose
  // ONLY tab is `build`): fall back to the object's OWN first tab rather than
  // a hardcoded 'edit', which doesn't exist for every type.
  const effectiveTab = tabs.some(t => t.key === activeTab) ? activeTab : tabs[0]?.key;

  // Wrap the store setter so the right-rail tab switch fires telemetry
  // (VIS-793). Only emit when the tab actually changes — re-clicking the
  // active tab is a no-op.
  const onSelectTab = React.useCallback(
    tab => {
      if (tab === activeTab) return;
      setRightTab(tab);
      emitWorkspaceEvent('right_rail_tab_switched', { tab });
    },
    [activeTab, setRightTab]
  );

  // Collapsed-strip tab click: expand the rail AND apply the tab selection so
  // the icon buttons aren't dead affordances (they already render hover/title
  // states that promise interactivity).
  const onCollapsedSelectTab = React.useCallback(
    tab => {
      toggleCollapsed();
      onSelectTab(tab);
    },
    [toggleCollapsed, onSelectTab]
  );

  return collapsed ? (
    <RightRailCollapsed
      activeTab={effectiveTab}
      tabs={tabs}
      onExpand={toggleCollapsed}
      onSelectTab={onCollapsedSelectTab}
    />
  ) : (
    <RightRailExpanded
      activeTab={effectiveTab}
      tabs={tabs}
      selectedItem={selectedItem}
      onSelectTab={onSelectTab}
      onCollapse={toggleCollapsed}
    />
  );
};

export default RightRail;
