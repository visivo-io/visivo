import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import useStore from '../../../stores/store';

/**
 * DashboardExplorerRedirect — Explore 2.0 Phase 3b cutover
 * (02-architecture.md §5, 01-ux-spec.md §5). The old `/workspace/dashboard/
 * :dashboardName/explorer` route composed `<Workspace/>` + `ExplorerOverlay`
 * (now deleted, along with the standalone `/explorer` route it round-tripped
 * to). Its replacement: mint a FRESH exploration carrying a `return_to`
 * placement intent (`{ dashboard: dashboardName }`) and redirect straight to
 * its own `/workspace/exploration/:id` path — the already-proven deep-link
 * mechanism (`exploration-lifecycle.spec.mjs`) sets `workspaceActiveView` and
 * opens its tab with no further plumbing needed here. Consuming the intent
 * ("Place in <dashboard>" after promote) is Phase 4/5 — this route's job is
 * only to persist it via the existing `return_to` field/`consumeReturnTo`
 * endpoint, both already live (07-exploration-api-contract.md).
 *
 * Lives in its own module, not in `LocalRouter.jsx`, because the cloud app
 * (core) mounts this same route and must be able to import the component
 * WITHOUT importing that router. `LocalRouter.jsx` calls `setGlobalURLConfig`
 * and `createBrowserRouter` at module scope; importing it from core would
 * silently repoint every API call at the local-serve config and build a second
 * router. It is re-exported from `LocalRouter.jsx` for existing callers.
 */
export const DashboardExplorerRedirect = () => {
  const { dashboardName } = useParams();
  const createExploration = useStore(s => s.createExploration);
  const [targetId, setTargetId] = useState(null);
  const [failed, setFailed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    createExploration(null, { dashboard: dashboardName }).then(result => {
      if (result?.success) setTargetId(result.id);
      else setFailed(true);
    });
  }, [dashboardName, createExploration]);

  if (targetId) return <Navigate to={`/workspace/exploration/${targetId}`} replace />;
  // Fail open to Explorer Home rather than stranding the user on a blank
  // route if minting the exploration itself failed (network/API error).
  if (failed) return <Navigate to="/workspace/exploration" replace />;
  return null;
};

export default DashboardExplorerRedirect;
