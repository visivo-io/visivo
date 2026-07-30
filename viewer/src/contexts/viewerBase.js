/**
 * Where the viewer is mounted in the host's URL space.
 *
 * Visivo Studio serves the viewer at the router root — `/workspace`,
 * `/explorer`, `/runs` — so its internal navigations are written root-absolute
 * and the base is `''`. A host that mounts the viewer deeper (the cloud app, at
 * `/:account/:stage/:project/…`) sets the base once and every navigation lands
 * inside it.
 *
 * Before this existed, the cloud app let those root-absolute navigations escape
 * and caught them at its router root with a redirect back into the project
 * prefix. That worked, but it cost two navigations per click and unmounted the
 * whole project subtree in between — which is what made a "Loading" placeholder
 * flash on every sidebar click. Being *told* the base removes the round trip
 * rather than repairing it after the fact.
 *
 * Module state, not a React context, deliberately: navigation happens from
 * stores and callbacks that aren't inside the tree (the workspace tab loop
 * already registers its navigate this way), and a context would only be
 * reachable from components. Same shape as `setAuthHeaderProvider` in
 * `api/utils.js` — the host installs it at boot.
 */

let viewerBase = '';

/**
 * Set the mount base, e.g. `/acme/production/analytics`. Pass `''` (or nothing)
 * for a root mount. A trailing slash is trimmed so callers can pass either form.
 */
export const setViewerBase = base => {
  if (typeof base !== 'string' || base === '/') {
    viewerBase = '';
    return;
  }
  viewerBase = base.replace(/\/+$/, '');
};

export const getViewerBase = () => viewerBase;

/**
 * Resolve a viewer path against the mount base.
 *
 * Only root-absolute paths are rebased — a relative path is already resolved
 * against the current location by the router, and an absolute URL belongs to
 * someone else. Passing an already-based path through is a no-op, so this is
 * safe to apply twice (a call site that gets converted while its caller already
 * rebased won't double up).
 */
export const viewerPath = path => {
  if (typeof path !== 'string' || !path.startsWith('/')) return path;
  if (!viewerBase) return path;
  if (path === viewerBase || path.startsWith(`${viewerBase}/`)) return path;
  return `${viewerBase}${path}`;
};
