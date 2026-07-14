/**
 * Canonical URL for the ACTIVE workspace tab — the single value the workspace
 * exposes in the URL (VIS thread: "put the tab in the URL and the Back button
 * works"). One clean loop: a store action routes the active selection through
 * the URL (see `workspaceStore.openWorkspaceTab`), `useWorkspaceUrlSync` reads
 * the URL back into the store, and every surface reads the store.
 *
 * The project + object tabs live at `<base>`, distinguished by
 * `?edit=<type>:<name>`; dashboard and semantic-layer keep their dedicated
 * routes (the dashboard path also drives scope detection). Adding a NEW
 * URL-addressable value is a param here + a case in `useWorkspaceUrlSync`.
 *
 * `base` is the mount prefix. Studio serves the viewer at the root, so it
 * defaults to `/workspace`; a host that mounts the viewer under a path prefix
 * (the cloud app, at `/:account/:stage/:project/workspace`) passes its own
 * base so tab navigation stays inside the mount instead of escaping to the
 * root. The Workspace derives that base from the URL and registers it on the
 * store (see `registerWorkspaceUrlBase`).
 */

export const WORKSPACE_BASE = '/workspace';

// Escape a base path for embedding in a RegExp — a host mount prefix can carry
// regex-special characters (e.g. a `.` or `+` in an account slug).
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The URL that represents `tab` as the active tab. `null`/project → the base. */
export const workspaceTabUrl = (tab, base = WORKSPACE_BASE) => {
  if (!tab || tab.type === 'project') return base;
  if (tab.type === 'dashboard') {
    return `${base}/dashboard/${encodeURIComponent(tab.name)}`;
  }
  if (tab.type === 'semantic-layer') return `${base}/semantic-layer`;
  return `${base}?edit=${encodeURIComponent(`${tab.type}:${tab.name}`)}`;
};

/**
 * The tab a URL points at, or `null` for the base/project. Inverse of
 * `workspaceTabUrl`: dashboard/semantic-layer come from the path; every other
 * object comes from `?edit=<type>:<name>`.
 */
export const workspaceTabFromUrl = (pathname, searchParams, base = WORKSPACE_BASE) => {
  const dashMatch = pathname.match(new RegExp(`^${escapeRegExp(base)}/dashboard/([^/]+)/?$`));
  if (dashMatch) {
    return { type: 'dashboard', name: decodeURIComponent(dashMatch[1]) };
  }
  if (pathname === `${base}/semantic-layer`) {
    return { type: 'semantic-layer', name: 'semantic-layer' };
  }
  const edit = searchParams.get('edit');
  if (edit && edit.includes(':')) {
    const [type, ...rest] = edit.split(':');
    const name = rest.join(':');
    if (type && name) return { type, name };
  }
  return null; // base → project tab
};
