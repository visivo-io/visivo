import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PiMagnifyingGlass, PiPlus } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeIcon, getTypeColors } from '../../common/objectTypeConfigs';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import { useWorkspaceDrag } from '../../workspace/WorkspaceDndContext';
import {
  groupDashboardsByLevel,
  buildHealthSummary,
  UNASSIGNED_KEY,
} from './useProjectEditorData';
import LevelGroup from './LevelGroup';

const levelIndexFromKey = levelKey => {
  if (typeof levelKey !== 'string') return -1;
  const match = levelKey.match(/^level:(\d+)$/);
  return match ? Number(match[1]) : -1;
};

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
 *
 * ### DndContext (VIS-802 / G-1)
 *
 * This surface NO LONGER mounts its own `<DndContext>`. The Workspace shell's
 * single shared `<WorkspaceDndContext>` (G-1) owns drag handling for the whole
 * workspace so Library-row drags can reach right-rail RefDropZones. The
 * drag-between-levels `onDragEnd` now lives in that shared handler; this surface
 * only declares its drop targets (`<LevelGroup>` `useDroppable`) and reads the
 * live drag via `useWorkspaceDrag()` for the source-group dimming + tile ghost.
 */

const SEARCH_THRESHOLD = 5;

const DashboardIcon = getTypeIcon('dashboard');
const DASH_COLORS = getTypeColors('dashboard');
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
  <div className="grid grid-cols-2 gap-3 @[620px]/editor:grid-cols-4 @[620px]/editor:gap-4" data-testid="project-editor-health">
    {['dashboards', 'insights', 'models', 'sources'].map(key => {
      const Icon = HEALTH_ICONS[key];
      const colors = getTypeColors(key.slice(0, -1));
      return (
        <div
          key={key}
          data-testid={`project-editor-health-${key}`}
          className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-gray-200"
        >
          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${colors.bg} ${colors.text}`}>
            <Icon style={{ fontSize: 18 }} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-[20px] font-semibold leading-none tabular-nums text-gray-900">
              {summary[key]}
            </span>
            <span className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider text-gray-500">
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
  const openWorkspaceTabBackground = useStore(s => s.openWorkspaceTabBackground);
  // M-2a level CRUD (merged from feature). Drag-between-levels reassignment now
  // lives in the shell's shared WorkspaceDndContext handler, so this surface no
  // longer needs `reassignDashboardLevel` — only the level-editing actions.
  const createLevel = useStore(s => s.createLevel);
  const renameLevel = useStore(s => s.renameLevel);
  const reorderLevel = useStore(s => s.reorderLevel);
  const deleteLevel = useStore(s => s.deleteLevel);
  const activeObject = useStore(s => s.workspaceActiveObject);
  const createDashboard = useStore(s => s.createDashboard);

  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});

  // The live shell-level drag (VIS-802 / G-1). When a ProjectEditor tile is in
  // flight this is `{ kind: 'dashboard', name, level }`; the source-group dimming
  // + the shell's shared <DragOverlay> read from it.
  const workspaceDrag = useWorkspaceDrag();
  const activeDrag =
    workspaceDrag?.kind === 'dashboard' ? workspaceDrag : null;

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

  // Right-click "Open in new tab" on a tile (VIS-811 / O-2): background-open —
  // the tab joins the strip but the Project Editor keeps focus.
  const dispatchDashboardOpenInNewTab = useCallback(
    tile => {
      if (openWorkspaceTabBackground) {
        openWorkspaceTabBackground({
          id: `dashboard:${tile.name}`,
          type: 'dashboard',
          name: tile.name,
        });
      }
      emitWorkspaceEvent('project_editor_action', {
        kind: 'open_tile_in_new_tab',
        name: tile.name,
      });
    },
    [openWorkspaceTabBackground]
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

  const handleToggle = useCallback(levelKey => {
    setCollapsed(prev => ({ ...prev, [levelKey]: !prev[levelKey] }));
  }, []);

  const handleCreateLevel = useCallback(() => {
    if (createLevel) createLevel();
    emitWorkspaceEvent('project_editor_action', { kind: 'level_create' });
  }, [createLevel]);

  const handleRenameLevel = useCallback(
    (index, nextTitle) => {
      if (renameLevel) renameLevel(index, nextTitle);
      emitWorkspaceEvent('project_editor_action', {
        kind: 'level_rename',
        index,
        title: nextTitle,
      });
    },
    [renameLevel]
  );

  const handleReorderLevel = useCallback(
    (index, direction) => {
      if (reorderLevel) reorderLevel(index, direction);
      emitWorkspaceEvent('project_editor_action', {
        kind: 'level_reorder',
        index,
        direction,
      });
    },
    [reorderLevel]
  );

  const handleDeleteLevel = useCallback(
    index => {
      if (deleteLevel) deleteLevel(index);
      emitWorkspaceEvent('project_editor_action', { kind: 'level_delete', index });
    },
    [deleteLevel]
  );

  // The highest configured-level index currently rendered — used to disable the
  // "move down" arrow on the last reorderable group (the trailing Unassigned
  // bucket isn't a configured level).
  const maxLevelIndex = useMemo(() => {
    const indices = groups
      .map(g => levelIndexFromKey(g.levelKey))
      .filter(i => i >= 0);
    return indices.length ? Math.max(...indices) : -1;
  }, [groups]);

  // Inline create (no modal): persist an empty draft dashboard, then open it
  // as a workspace tab so the user lands on the empty canvas ready to build.
  const handleCreateDashboard = useCallback(async () => {
    emitWorkspaceEvent('inline_create_used', { source: 'project-editor', kind: 'dashboard' });
    if (!createDashboard) return;
    const result = await createDashboard();
    if (result?.success && result.name && openWorkspaceTab) {
      openWorkspaceTab({
        id: `dashboard:${result.name}`,
        type: 'dashboard',
        name: result.name,
      });
    }
  }, [createDashboard, openWorkspaceTab]);

  const showSearch = (dashboards || []).length > SEARCH_THRESHOLD;
  const isEmpty = (dashboards || []).length === 0;

  return (
    <div
      data-testid="project-editor"
      className="@container/editor flex-1 overflow-y-auto"
      onClick={dispatchChromeSelection}
    >
      <div className="mx-auto max-w-[1100px] px-5 py-8 @[700px]/editor:px-10">
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
                  className="w-28 bg-transparent text-[12.5px] text-gray-900 outline-none placeholder:text-gray-400 @[700px]/editor:w-44"
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
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
            >
              <PiPlus className="h-3.5 w-3.5" /> New Dashboard
            </button>
          </div>
        </div>

        <HealthRow summary={summary} />

        <div className="mt-8 grid grid-cols-1 gap-6 @[860px]/editor:grid-cols-12 @[860px]/editor:gap-8">
          <div className="@container/groups @[860px]/editor:col-span-8">
            {isEmpty ? (
              <div
                data-testid="project-editor-empty"
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white/60 px-12 py-16 text-center"
              >
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${DASH_COLORS.bg} ${DASH_COLORS.text}`}>
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
                  className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-primary-600"
                >
                  <PiPlus className="h-4 w-4" /> New Dashboard
                </button>
              </div>
            ) : (
              // The shell's shared <WorkspaceDndContext> (G-1) is the dnd-kit
              // provider; this surface only declares its drop targets and reads
              // the live drag for source-group dimming. The drag overlay lives
              // in the shared context too.
              <>
                {groups.map(group => {
                  const isActiveSourceGroup =
                    !!activeDrag && group.dashboards.some(t => t.name === activeDrag.name);
                  const levelIndex = levelIndexFromKey(group.levelKey);
                  const editable =
                    group.levelKey !== UNASSIGNED_KEY && levelIndex >= 0;
                  return (
                    <LevelGroup
                      key={group.levelKey}
                      group={group}
                      levelIndex={levelIndex}
                      collapsed={!!collapsed[group.levelKey]}
                      onToggle={() => handleToggle(group.levelKey)}
                      selectedDashboardName={selectedDashboardName}
                      onSelectTile={dispatchDashboardSelection}
                      onOpenTileInNewTab={dispatchDashboardOpenInNewTab}
                      activeDragName={activeDrag?.name || null}
                      isActiveSourceGroup={isActiveSourceGroup}
                      editable={editable}
                      canMoveUp={editable && levelIndex > 0}
                      canMoveDown={editable && levelIndex < maxLevelIndex}
                      onRename={nextTitle => handleRenameLevel(levelIndex, nextTitle)}
                      onMoveUp={() => handleReorderLevel(levelIndex, -1)}
                      onMoveDown={() => handleReorderLevel(levelIndex, 1)}
                      onDelete={() => handleDeleteLevel(levelIndex)}
                    />
                  );
                })}
                {/* M-2a "Add level" affordance (merged from feature). The drag
                    overlay/ghost is no longer rendered here — the shell's shared
                    WorkspaceDndContext (G-1) owns the single <DragOverlay>. */}
                <button
                  type="button"
                  data-testid="project-editor-add-level"
                  onClick={e => {
                    e.stopPropagation();
                    handleCreateLevel();
                  }}
                  className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 px-3 py-2.5 text-[12.5px] font-medium text-gray-500 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary"
                >
                  <PiPlus className="h-3.5 w-3.5" /> Add level
                </button>
              </>
            )}
          </div>

          <aside className="@[860px]/editor:col-span-4">
            <RecentEdits edits={recentEdits} onSelect={dispatchDashboardSelection} />
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ProjectEditor;
