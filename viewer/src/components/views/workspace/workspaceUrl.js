/**
 * Canonical URL for the ACTIVE workspace tab — the single value the workspace
 * exposes in the URL (VIS thread: "put the tab in the URL and the Back button
 * works"). One clean loop: a store action routes the active selection through
 * the URL (see `workspaceStore.openWorkspaceTab`), `useWorkspaceUrlSync` reads
 * the URL back into the store, and every surface reads the store.
 *
 * The project + object tabs live at `/workspace`, distinguished by
 * `?edit=<type>:<name>`; dashboard and semantic-layer keep their dedicated
 * routes (the dashboard path also drives scope detection). Adding a NEW
 * URL-addressable value is a param here + a case in `useWorkspaceUrlSync`.
 */

export const WORKSPACE_BASE = '/workspace';

/** The URL that represents `tab` as the active tab. `null`/project → the base. */
export const workspaceTabUrl = tab => {
  if (!tab || tab.type === 'project') return WORKSPACE_BASE;
  if (tab.type === 'dashboard') {
    return `${WORKSPACE_BASE}/dashboard/${encodeURIComponent(tab.name)}`;
  }
  if (tab.type === 'semantic-layer') return `${WORKSPACE_BASE}/semantic-layer`;
  return `${WORKSPACE_BASE}?edit=${encodeURIComponent(`${tab.type}:${tab.name}`)}`;
};

/**
 * The tab a URL points at, or `null` for the base/project. Inverse of
 * `workspaceTabUrl`: dashboard/semantic-layer come from the path; every other
 * object comes from `?edit=<type>:<name>`.
 */
export const workspaceTabFromUrl = (pathname, searchParams) => {
  const dashMatch = pathname.match(/^\/workspace\/dashboard\/([^/]+)\/?$/);
  if (dashMatch) {
    return { type: 'dashboard', name: decodeURIComponent(dashMatch[1]) };
  }
  if (pathname === `${WORKSPACE_BASE}/semantic-layer`) {
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
