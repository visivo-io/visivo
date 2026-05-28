import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { PiMagnifyingGlass, PiPlus } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeIcon } from '../../common/objectTypeConfigs';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import {
  groupDashboardsByLevel,
  buildHealthSummary,
} from './useProjectEditorData';
import LevelGroup from './LevelGroup';

/**
 * ProjectEditor — VIS-805 / Track M M-1.
 *
 * The editable middle-pane surface shown in the unscoped Workspace
 * (`/workspace`, no dashboard scoped). A grouped tile grid of dashboards by
 * level plus an overview header:
 *
 *   - Project health summary ("N dashboards · M insights · K models · J sources").
 *   - Recent-edits feed (last ~5 edits).
 *   - Grouped tile grid by level (`defaults.levels` order + trailing
 *     "Unassigned"), each group a dnd-kit drop target.
 *   - Drag a tile to a different level group → reassigns the dashboard's
 *     `level` via the draft cache (`reassignDashboardLevel`).
 *   - Click a tile → dispatch a `dashboard` selection to the workspace store.
 *   - Click whitespace → dispatch a `project` (chrome) selection.
 *   - Search field appears once the project has >5 dashboards.
 *   - "+ New Dashboard" CTA.
 *
 * Right-rail forms (dashboard / level / defaults) are deferred to M-2/M-3 —
 * this surface only DISPATCHES selections, it does not mount the forms.
 */

const SEARCH_THRESHOLD = 5;

const DashboardIcon = getTypeIcon('dashboard');
const InsightIcon = getTypeIcon('insight');
const ModelIcon = getTypeIcon('model');
const SourceIcon = getTypeIcon('source');

const HEALTH_ICONS = {
  dashboards: DashboardIcon,
  insights: InsightIcon,
  models: ModelIcon,
  sources: SourceIcon,
};

const HealthRow = ({ summary }) => (
  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="project-editor-health">
    {['dashboards', 'insights', 'models', 'sources'].map(key => {
      const Icon = HEALTH_ICONS[key];
      return (
        <div
          key={key}
          data-testid={`project-editor-health-${key}`}
          className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-gray-200"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#e6edf8] text-[#1e3a5f]">
            <Icon style={{ fontSize: 18 }} />
          </span>
          <div className="flex flex-col">
            <span className="text-[20px] font-semibold leading-none tabular-nums text-gray-900">
              {summary[key]}
            </span>
            <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
              {key}
            </span>
          </div>
        </div>
      );
    })}
  </div>
);

const RECENT_TYPE_ICON = type => getTypeIcon(type) || DashboardIcon;

const RecentEdits = ({ edits, onSelect }) => (
  <div data-testid="project-editor-recent">
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
      Recent edits
    </h3>
    {edits.length === 0 ? (
      <div className="rounded-lg bg-white px-3 py-4 text-[12px] text-gray-400 ring-1 ring-gray-200">
        No recent edits yet.
      </div>
    ) : (
      <ul className="flex flex-col divide-y divide-gray-200 rounded-lg bg-white ring-1 ring-gray-200">
        {edits.map(edit => {
          const Icon = RECENT_TYPE_ICON(edit.type);
          return (
            <li key={`${edit.type}:${edit.name}`}>
              <button
                type="button"
                data-testid={`project-editor-recent-${edit.name}`}
                onClick={e => {
                  e.stopPropagation();
                  onSelect && onSelect(edit);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-gray-50"
              >
                <Icon style={{ fontSize: 14 }} className="shrink-0 text-gray-500" />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                  {edit.name}
                </span>
                {edit.when && (
                  <span className="shrink-0 text-[11px] text-gray-500">{edit.when}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

const ProjectEditor = () => {
  const project = useStore(s => s.project);
  const dashboards = useStore(s => s.dashboards);
  const fetchDashboards = useStore(s => s.fetchDashboards);
  const insights = useStore(s => s.insights);
  const models = useStore(s => s.models);
  const csvScriptModels = useStore(s => s.csvScriptModels);
  const localMergeModels = useStore(s => s.localMergeModels);
  const sources = useStore(s => s.sources);
  const defaults = useStore(s => s.defaults);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const reassignDashboardLevel = useStore(s => s.reassignDashboardLevel);
  const activeObject = useStore(s => s.workspaceActiveObject);
  const openCreateDashboardModal = useStore(s => s.openCreateDashboardModal);

  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [activeDrag, setActiveDrag] = useState(null);

  // The Project Editor may mount before the workspace route's collection
  // fetch resolves; guard with a self-fetch so a direct visit still renders.
  useEffect(() => {
    if ((!dashboards || dashboards.length === 0) && fetchDashboards) {
      fetchDashboards();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectName =
    project?.project_json?.name || project?.name || 'project';
  const projectDefaults =
    defaults || project?.config?.defaults || project?.project_json?.defaults || null;

  const summary = useMemo(
    () =>
      buildHealthSummary({
        dashboards: dashboards || [],
        insights: insights || [],
        models: models || [],
        csvScriptModels: csvScriptModels || [],
        localMergeModels: localMergeModels || [],
        sources: sources || [],
      }),
    [dashboards, insights, models, csvScriptModels, localMergeModels, sources]
  );

  const filteredDashboards = useMemo(() => {
    const list = dashboards || [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(d => d.name.toLowerCase().includes(q));
  }, [dashboards, search]);

  const groups = useMemo(
    () => groupDashboardsByLevel(filteredDashboards, projectDefaults),
    [filteredDashboards, projectDefaults]
  );

  // Recent edits — the ~5 most recently changed dashboards. We derive from the
  // dashboard list (status NEW/MODIFIED first, then by updated time when the
  // backend supplies it). When no timestamps exist we fall back to list order.
  const recentEdits = useMemo(() => {
    const list = (dashboards || []).slice();
    list.sort((a, b) => {
      const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
      const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
      return tb - ta;
    });
    return list.slice(0, 5).map(d => ({
      type: 'dashboard',
      name: d.name,
      when: d.updated_at ? new Date(d.updated_at).toLocaleDateString() : null,
    }));
  }, [dashboards]);

  const selectedDashboardName =
    activeObject?.type === 'dashboard' ? activeObject.name : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const dispatchDashboardSelection = useCallback(
    tile => {
      if (openWorkspaceTab) {
        openWorkspaceTab({
          id: `dashboard:${tile.name}`,
          type: 'dashboard',
          name: tile.name,
        });
      }
      emitWorkspaceEvent('project_editor_action', {
        kind: 'select_tile',
        name: tile.name,
      });
    },
    [openWorkspaceTab]
  );

  const dispatchChromeSelection = useCallback(() => {
    if (openWorkspaceTab) {
      openWorkspaceTab({
        id: `project:${projectName}`,
        type: 'project',
        name: projectName,
      });
    }
    emitWorkspaceEvent('project_editor_action', { kind: 'select_chrome' });
  }, [openWorkspaceTab, projectName]);

  const handleDragStart = useCallback(event => {
    const data = event.active?.data?.current;
    if (data?.type === 'dashboard') {
      setActiveDrag({ name: data.name, level: data.level });
    }
  }, []);

  const handleDragEnd = useCallback(
    event => {
      const { active, over } = event;
      setActiveDrag(null);
      if (!over) return;
      const dragData = active?.data?.current;
      const dropData = over?.data?.current;
      if (!dragData || dragData.type !== 'dashboard' || !dropData) return;

      const target = groups.find(g => g.levelKey === dropData.levelKey);
      if (!target) return;

      if (reassignDashboardLevel) {
        reassignDashboardLevel(dragData.name, target.levelValue);
      }
      emitWorkspaceEvent('project_editor_action', {
        kind: 'reassign_level',
        name: dragData.name,
        level: target.levelValue,
      });
    },
    [groups, reassignDashboardLevel]
  );

  const handleToggle = useCallback(levelKey => {
    setCollapsed(prev => ({ ...prev, [levelKey]: !prev[levelKey] }));
  }, []);

  const handleCreateDashboard = useCallback(() => {
    emitWorkspaceEvent('inline_create_used', { source: 'project-editor', kind: 'dashboard' });
    if (openCreateDashboardModal) openCreateDashboardModal();
  }, [openCreateDashboardModal]);

  const showSearch = (dashboards || []).length > SEARCH_THRESHOLD;
  const isEmpty = (dashboards || []).length === 0;

  return (
    <div
      data-testid="project-editor"
      className="flex-1 overflow-y-auto"
      onClick={dispatchChromeSelection}
    >
      <div className="mx-auto max-w-[1100px] px-6 py-8 sm:px-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-gray-900">{projectName}</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              Dashboards, insights, and the data behind them.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showSearch && (
              <div className="flex h-8 items-center gap-1.5 rounded-md bg-gray-100 px-2.5 text-[12.5px] text-gray-600">
                <PiMagnifyingGlass className="h-3.5 w-3.5 text-gray-500" />
                <input
                  data-testid="project-editor-search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  placeholder="Search dashboards…"
                  className="w-44 bg-transparent text-[12.5px] text-gray-900 outline-none placeholder:text-gray-400"
                />
              </div>
            )}
            <button
              type="button"
              data-testid="project-editor-new-dashboard"
              onClick={e => {
                e.stopPropagation();
                handleCreateDashboard();
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#713b57] px-3 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-[#5a2f45]"
            >
              <PiPlus className="h-3.5 w-3.5" /> New Dashboard
            </button>
          </div>
        </div>

        <HealthRow summary={summary} />

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {isEmpty ? (
              <div
                data-testid="project-editor-empty"
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white/60 px-12 py-16 text-center"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#e6edf8] text-[#1e3a5f]">
                  <DashboardIcon style={{ fontSize: 26 }} />
                </span>
                <h2 className="mt-4 text-[18px] font-semibold text-gray-900">
                  Create your first dashboard
                </h2>
                <p className="mx-auto mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-gray-500">
                  Dashboards compose charts, tables, and notes for an audience. Group them into
                  levels later as your project grows.
                </p>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleCreateDashboard();
                  }}
                  className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-md bg-[#713b57] px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-[#5a2f45]"
                >
                  <PiPlus className="h-4 w-4" /> New Dashboard
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDrag(null)}
              >
                {groups.map(group => {
                  const isActiveSourceGroup =
                    !!activeDrag && group.dashboards.some(t => t.name === activeDrag.name);
                  return (
                    <LevelGroup
                      key={group.levelKey}
                      group={group}
                      collapsed={!!collapsed[group.levelKey]}
                      onToggle={() => handleToggle(group.levelKey)}
                      selectedDashboardName={selectedDashboardName}
                      onSelectTile={dispatchDashboardSelection}
                      activeDragName={activeDrag?.name || null}
                      isActiveSourceGroup={isActiveSourceGroup}
                    />
                  );
                })}
                <DragOverlay>
                  {activeDrag ? (
                    <div className="flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-[13px] font-semibold text-gray-900 shadow-lg ring-2 ring-[#713b57]">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#e6edf8] text-[#1e3a5f]">
                        <DashboardIcon style={{ fontSize: 12 }} />
                      </span>
                      {activeDrag.name}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>

          <aside className="lg:col-span-4">
            <RecentEdits edits={recentEdits} onSelect={dispatchDashboardSelection} />
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ProjectEditor;
