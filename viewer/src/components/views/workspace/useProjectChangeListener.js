import { useEffect } from 'react';
import { io } from 'socket.io-client';
import useStore from '../../../stores/store';
import { emitWorkspaceEvent } from './telemetry';

/**
 * useProjectChangeListener — VIS-808 (Track H H-2).
 *
 * While the Workspace is mounted, listen for the backend's `project_changed`
 * Socket.IO event (fired after every successful recompile — external YAML
 * edits AND post-publish refreshes) and soft-refresh the store instead of
 * letting the page hard-reload:
 *
 *   - `drafts_dropped: true` means the recompile happened during a dirty
 *     Build session and the backend dropped the drafts (Q15
 *     last-write-wins) — the store shows the external-edit banner and the
 *     canvas re-renders from the file's state via the refetch.
 *   - The hook also sets `window.__VISIVO_SOFT_RELOAD__` so the legacy
 *     `/hot-reload.js` script (injected when Flask serves the bundle) skips
 *     its `window.location.reload()` while the Workspace handles updates.
 *
 * The socket connects to the page origin; the vite dev server proxies
 * `/socket.io` to the Flask backend (see vite.config.mjs).
 */
export default function useProjectChangeListener() {
  useEffect(() => {
    window.__VISIVO_SOFT_RELOAD__ = true;
    const socket = io({
      // The Flask-SocketIO server runs in threading mode — polling is its
      // native transport; websocket upgrade is attempted automatically.
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
    });

    socket.on('project_changed', payload => {
      const draftsDropped = Boolean(payload?.drafts_dropped);
      const refresh = useStore.getState().refreshFromProjectChange;
      if (typeof refresh === 'function') {
        refresh({ draftsDropped });
      }
      if (draftsDropped) {
        emitWorkspaceEvent('external_edit_overwrite', {});
      }
    });

    return () => {
      window.__VISIVO_SOFT_RELOAD__ = false;
      socket.close();
    };
  }, []);
}
