/**
 * Canonical URL for the workspace's ACTIVE surface — the single value the
 * workspace exposes in the URL (VIS thread: "put the tab in the URL and the
 * Back button works"). One clean loop: a store action routes the active
 * selection through the URL (`workspaceStore.openWorkspaceTab` /
 * `openWorkspaceView`), the Workspace's URL-sync effect reads the URL back
 * into the store, and every surface reads the store.
 *
 * Explore 2.0 Phase 0 simplification: the URL now encodes exactly TWO kinds of
 * target — a workspace VIEW (one of the three destinations,
 * `higherLevelViews.js`) or a document TAB. Views own a path segment under the
 * base (`/workspace`, `/workspace/semantic-layer`, `/workspace/exploration` —
 * the last reserved for Phase 2's per-exploration path); every document keeps
 * the `?edit=<type>:<name>` grammar, with `dashboard` keeping its own
 * `/dashboard/:name` path (both predate this simplification and are
 * unaffected by it).
 *
 * `base` is the mount prefix. Studio serves the viewer at the root, so it
 * defaults to `/workspace`; a host that mounts the viewer under a path prefix
 * (the cloud app, at `/:account/:stage/:project/workspace`) passes its own
 * base so tab navigation stays inside the mount instead of escaping to the
 * root. The Workspace derives that base from the URL and registers it on the
 * store (see `registerWorkspaceUrlBase`).
 *
 * Explore 2.0 Phase 2: `exploration` gets its own per-instance path segment
 * (`/workspace/exploration/:id`, like `dashboard`) instead of the `?edit=`
 * grammar — addressed by its STABLE backend id, never its (renamable) display
 * name. Tab actions pass `tab.name` = the exploration id for this type;
 * `ExplorationPane`/`TabStrip` resolve the display name from
 * `workspaceExplorations` separately.
 */
import { HIGHER_LEVEL_VIEWS, DEFAULT_WORKSPACE_VIEW, getViewDescriptor, isWorkspaceView } from './higherLevelViews';

export const WORKSPACE_BASE = '/workspace';

// Escape a base path for embedding in a RegExp — a host mount prefix can carry
// regex-special characters (e.g. a `.` or `+` in an account slug).
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The URL for a workspace VIEW's home — `base` for the bare-root project view. */
export const workspaceViewUrl = (view, base = WORKSPACE_BASE) => {
  const descriptor = getViewDescriptor(view) || getViewDescriptor(DEFAULT_WORKSPACE_VIEW);
  return descriptor.urlPath ? `${base}/${descriptor.urlPath}` : base;
};

/**
 * The URL that represents a document `tab` as the active tab. Views are
 * accepted here too (routed to `workspaceViewUrl`) so existing callers that
 * still pass `{ type: 'project' | 'semantic-layer', ... }` (e.g. legacy
 * `openWorkspaceTab({ type: 'semantic-layer', ... })` call sites) keep
 * resolving to the right URL without every one needing a rewrite.
 */
export const workspaceTabUrl = (tab, base = WORKSPACE_BASE) => {
  if (!tab || isWorkspaceView(tab.type)) return workspaceViewUrl(tab?.type, base);
  if (tab.type === 'dashboard') {
    return `${base}/dashboard/${encodeURIComponent(tab.name)}`;
  }
  if (tab.type === 'exploration') {
    return `${base}/exploration/${encodeURIComponent(tab.name)}`;
  }
  return `${base}?edit=${encodeURIComponent(`${tab.type}:${tab.name}`)}`;
};

/**
 * Resolve the current URL to either a view or a document-tab target:
 *   `{ kind: 'view', view }` | `{ kind: 'tab', tab: { type, name } }`
 *
 * The bare base (`/workspace`, no `?edit=`, no dashboard path) resolves to
 * `{ kind: 'view', view: DEFAULT_WORKSPACE_VIEW }` — it is BOTH the project
 * view's real home AND the fallback for "no specific target in the URL";
 * those two cases are indistinguishable from the URL alone (callers that need
 * to tell them apart, e.g. restoring a persisted non-project view on a bare
 * reload, do so with their own state — see `Workspace.jsx`).
 */
export const workspaceTargetFromUrl = (pathname, searchParams, base = WORKSPACE_BASE) => {
  const dashMatch = pathname.match(new RegExp(`^${escapeRegExp(base)}/dashboard/([^/]+)/?$`));
  if (dashMatch) {
    return { kind: 'tab', tab: { type: 'dashboard', name: decodeURIComponent(dashMatch[1]) } };
  }
  // `/workspace/exploration/:id` — a document instance path (like dashboard),
  // distinct from the bare `/workspace/exploration` Explorer Home matched by
  // the view loop below (that path has no trailing segment, so the two never
  // collide). `:id` is the exploration's stable backend id.
  const explorationMatch = pathname.match(
    new RegExp(`^${escapeRegExp(base)}/exploration/([^/]+)/?$`)
  );
  if (explorationMatch) {
    return {
      kind: 'tab',
      tab: { type: 'exploration', name: decodeURIComponent(explorationMatch[1]) },
    };
  }
  for (const view of HIGHER_LEVEL_VIEWS) {
    if (!view.urlPath) continue; // the project view's '' is the bare-base fallthrough below
    if (pathname === `${base}/${view.urlPath}`) {
      return { kind: 'view', view: view.key };
    }
  }
  const edit = searchParams.get('edit');
  if (edit && edit.includes(':')) {
    const [type, ...rest] = edit.split(':');
    const name = rest.join(':');
    if (type && name) return { kind: 'tab', tab: { type, name } };
  }
  return { kind: 'view', view: DEFAULT_WORKSPACE_VIEW };
};
