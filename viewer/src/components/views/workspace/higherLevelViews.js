// The three HomePane shells import DIRECTLY (not `React.lazy`) — matching the
// pre-Phase-0 precedent (`ProjectPane`/`SemanticLayerPane` in `MiddlePane.jsx`
// were plain components too): the shell (SubBar, chrome) renders synchronously,
// while any genuinely heavy content lazy-loads INSIDE the pane (e.g.
// `SemanticLayerHomePane` already lazy-loads `SemanticLayerCanvas`, the
// React-Flow ERD). Making the outer pane itself lazy would force every
// consumer (MiddlePane, tests) through an extra Suspense tick for no
// code-splitting benefit — the shells are cheap; only their bodies are heavy.
import ProjectHomePane from './homes/ProjectHomePane';
import SemanticLayerHomePane from './homes/SemanticLayerHomePane';
import ExplorerHomePane from './homes/ExplorerHomePane';

/**
 * higherLevelViews — the workspace's three DESTINATIONS (D1,
 * `specs/plan/explorer-workspace-unification/README.md`): Project · Semantic
 * Layer · Explorer. These are singleton "places" pinned atop the LeftRail's
 * view switcher — never closable, never dirty, and (as of Explore 2.0 Phase 0)
 * no longer tab records (01-ux-spec.md §1).
 *
 * One descriptor per view:
 *   key      — the value stored in `workspaceActiveView` / `?edit=` document
 *              owning-destination lookups. Also the key every OTHER type-driven
 *              surface resolves against `objectTypeConfigs.js` for icon/color
 *              (`getTypeIcon(key)` / `getTypeColors(key)`) — metadata is
 *              deliberately NOT duplicated here, matching the
 *              `objectCanvasRegistry.js` convention.
 *   label    — the switcher row's display name.
 *   HomePane — lazy component MiddlePane mounts when this view is active and
 *              no document tab owns the center.
 *   urlPath  — the path segment under `/workspace` for this view's home ('' for
 *              the bare root — see `workspaceUrl.js`). Reserved segments:
 *              `/workspace`, `/workspace/semantic-layer`, `/workspace/exploration`.
 *   scope    — the `useWorkspaceScope()` scope value this view resolves to
 *              when it owns the center (fixes B3 — semantic-layer no longer
 *              falls through to a nonsensical 'item' scope with a
 *              `+semantic-layer` lineage selector).
 */
export const HIGHER_LEVEL_VIEWS = [
  { key: 'project', label: 'Project', HomePane: ProjectHomePane, urlPath: '', scope: 'root' },
  {
    key: 'semantic-layer',
    label: 'Semantic Layer',
    HomePane: SemanticLayerHomePane,
    urlPath: 'semantic-layer',
    scope: 'semantic-layer',
  },
  {
    key: 'explorer',
    label: 'Explorer',
    HomePane: ExplorerHomePane,
    urlPath: 'exploration',
    scope: 'explorer',
  },
];

export const DEFAULT_WORKSPACE_VIEW = 'project';

/** Resolve a view descriptor by key, or `null` when it isn't one of the three. */
export const getViewDescriptor = key => HIGHER_LEVEL_VIEWS.find(v => v.key === key) || null;

/** Whether `key` names a workspace VIEW (a destination) rather than a document type. */
export const isWorkspaceView = key => HIGHER_LEVEL_VIEWS.some(v => v.key === key);

/**
 * Deep-link rule (01-ux-spec.md §1): opening any document sets
 * `workspaceActiveView` to its owning destination — exploration → explorer;
 * metric/dimension/relation → semantic-layer; everything else → project.
 * `exploration` isn't a real document type yet (it lands in Phase 2) but is
 * listed now so the mapping doesn't need a second edit when it does.
 */
const OWNING_VIEW_BY_DOCUMENT_TYPE = {
  metric: 'semantic-layer',
  dimension: 'semantic-layer',
  relation: 'semantic-layer',
  exploration: 'explorer',
};

/** The destination that owns a document `type` — defaults to 'project'. */
export const viewForDocumentType = type =>
  OWNING_VIEW_BY_DOCUMENT_TYPE[type] || DEFAULT_WORKSPACE_VIEW;

export default HIGHER_LEVEL_VIEWS;
