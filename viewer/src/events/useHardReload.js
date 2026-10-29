import { useEffect } from 'react';
import { subscribe } from './eventSource';

/**
 * Reload the page when the server says the project changed.
 *
 * This used to be an injected `/hot-reload.js` whose `io()` came from a cdnjs
 * script tag, so an unreachable CDN meant a ReferenceError and file changes
 * silently stopped reloading. The SPA already bundles `socket.io-client`, so it
 * owns the reload — which also leaves one socket.io version in play instead of
 * two at different versions.
 *
 * The Workspace handles `reload` itself (refetch plus the external-edit banner,
 * VIS-808) and sets `__VISIVO_SOFT_RELOAD__` while mounted. Reloading the page
 * under it would wipe that UI state, so this stands down while the flag is set.
 */
const reloadPage = () => window.location.reload();

export default function useHardReload(reload = reloadPage) {
  useEffect(
    () =>
      subscribe({ event: 'reload' }, () => {
        if (window.__VISIVO_SOFT_RELOAD__) return;
        reload();
      }),
    [reload]
  );
}
