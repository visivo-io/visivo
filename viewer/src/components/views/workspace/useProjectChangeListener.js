import { useEffect } from 'react';
import useStore from '../../../stores/store';
import { emitWorkspaceEvent } from './telemetry';
import { subscribe, canDeliver } from '../../../events/eventSource';
import { PROJECT_CHANGED } from '../../../events/topics';

/**
 * useProjectChangeListener — VIS-808 (Track H H-2).
 *
 * While the Workspace is mounted, listen for the backend's `project_changed`
 * event (fired after every successful recompile — external YAML edits AND
 * post-publish refreshes) and soft-refresh the store instead of letting the
 * page hard-reload:
 *
 *   - `drafts_dropped: true` means the recompile happened during a dirty
 *     Build session and the backend dropped the drafts (Q15
 *     last-write-wins) — the store shows the external-edit banner and the
 *     canvas re-renders from the file's state via the refetch.
 *   - The hook also sets `window.__VISIVO_SOFT_RELOAD__` so the legacy
 *     `/hot-reload.js` script (injected when Flask serves the bundle) skips
 *     its `window.location.reload()` while the Workspace handles updates.
 *
 * Subscribes through the event-source seam rather than opening its own socket
 * (VIS-1345): the run view and the agent tab want the same kind of "this is
 * happening now" event, and the seam is what lets one screen serve both a
 * pushing environment and a polling one.
 *
 * Still a no-op on a dist build (VIS-1326): static files have no server to
 * push, and this topic has no polling equivalent — only a server watching the
 * filesystem knows a recompile happened.
 */
export default function useProjectChangeListener() {
  useEffect(() => {
    if (!canDeliver(PROJECT_CHANGED)) return;

    window.__VISIVO_SOFT_RELOAD__ = true;
    const unsubscribe = subscribe(PROJECT_CHANGED, payload => {
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
      unsubscribe();
    };
  }, []);
}
