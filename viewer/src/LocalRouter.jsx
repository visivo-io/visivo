import React, { useEffect, useRef, useState } from 'react';
import { Navigate, Route, createBrowserRouter, createRoutesFromElements, useParams } from 'react-router-dom';
import { futureFlags } from './router-config';
import { loadProject } from './loaders/project';
import { loadError } from './loaders/error';
import Home from './components/Home';
import Project from './components/project/Project';
import BreadcrumbLink from './components/common/BreadcrumbLink';
import ErrorPage from './components/common/ErrorPage';
import Onboarding from './components/onboarding/Onboarding';
import Workspace from './components/views/workspace/Workspace';
import RunsView from './components/RunsView';
import { createURLConfig, setGlobalURLConfig } from './contexts/URLContext';
import useStore from './stores/store';

// VIS-772: /editor/<type>/<name> redirects into Workspace with the edit selector encoded
// as a query param. Wrapping <Navigate /> so we can pull params out of the URL.
export const EditorTypeNameRedirect = () => {
  const { type, name } = useParams();
  // useParams returns the DECODED name; re-encode so names with &, +, %, #
  // survive the query string (searchParams.get('edit') decodes on the way in).
  return <Navigate to={`/workspace?edit=${encodeURIComponent(`${type}:${name}`)}`} replace />;
};

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

// Set global URL config early for router loaders
export const localURLConfig = createURLConfig({ environment: 'server' });
setGlobalURLConfig(localURLConfig);

const LocalRouter = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route
        id="onboarding"
        path="/onboarding"
        element={<Onboarding />}
        handle={{
          crumb: () => <BreadcrumbLink to="/onboarding">Onboarding</BreadcrumbLink>,
        }}
      />
      <Route
        path="/"
        element={<Home />}
        loader={loadError}
        handle={{ crumb: () => <a href="/">Home</a> }}
      >
        {/* VIS-772 Track B B1: /lineage and /editor become redirects into Workspace.
            See specs/dashboard-building/04-open-questions.md Q19 — these routes
            forever redirect into /workspace. */}
        <Route
          id="lineage-redirect"
          path="/lineage"
          element={<Navigate to="/workspace?view=lineage" replace />}
        />
        <Route
          id="editor-redirect"
          path="/editor"
          element={<Navigate to="/workspace?view=project" replace />}
        />
        <Route
          id="editor-typed-redirect"
          path="/editor/:type/:name"
          element={<EditorTypeNameRedirect />}
        />
        {/* VIS-772 Track B B1: Workspace shell mounts here. The placeholder Workspace
            component ships with B1; VIS-775 (B2) builds out the full shell per the
            B-1 design at design/cofounder-mockups/. */}
        <Route
          id="workspace"
          path="/workspace"
          element={<Workspace />}
          loader={loadProject}
          handle={{
            crumb: () => <BreadcrumbLink to="/workspace">Workspace</BreadcrumbLink>,
          }}
        />
        <Route
          id="workspace-semantic-layer"
          path="/workspace/semantic-layer"
          element={<Workspace />}
          loader={loadProject}
          handle={{
            crumb: () => (
              <BreadcrumbLink to="/workspace/semantic-layer">Semantic Layer</BreadcrumbLink>
            ),
          }}
        />
        <Route
          id="workspace-exploration"
          path="/workspace/exploration"
          element={<Workspace />}
          loader={loadProject}
          handle={{
            crumb: () => <BreadcrumbLink to="/workspace/exploration">Explorer</BreadcrumbLink>,
          }}
        />
        {/* Explore 2.0 Phase 2: a single exploration's document-instance path
            (like /workspace/dashboard/:dashboardName). `:id` is the
            exploration's stable backend id, not its display name. */}
        <Route
          id="workspace-exploration-detail"
          path="/workspace/exploration/:id"
          element={<Workspace />}
          loader={loadProject}
          handle={{
            crumb: match => (
              <BreadcrumbLink to={`/workspace/exploration/${match.params.id}`}>
                Explorer
              </BreadcrumbLink>
            ),
          }}
        />
        <Route
          id="workspace-dashboard"
          path="/workspace/dashboard/:dashboardName"
          element={<Workspace />}
          loader={loadProject}
          handle={{
            crumb: match => (
              <BreadcrumbLink to={`/workspace/dashboard/${match.params.dashboardName}`}>
                {match.params.dashboardName}
              </BreadcrumbLink>
            ),
          }}
        />
        {/* Explore 2.0 Phase 3b cutover: the old ExplorerOverlay round-trip
            composed route now mints a fresh exploration carrying a
            return_to placement intent and redirects into it —
            DashboardExplorerRedirect's own docstring has the detail. */}
        <Route
          id="workspace-dashboard-explorer-overlay"
          path="/workspace/dashboard/:dashboardName/explorer"
          element={<DashboardExplorerRedirect />}
          loader={loadProject}
          handle={{
            crumb: match => (
              <BreadcrumbLink to={`/workspace/dashboard/${match.params.dashboardName}`}>
                {match.params.dashboardName}
              </BreadcrumbLink>
            ),
          }}
        />
        {/* Explore 2.0 Phase 3b cutover: /explorer is now a PERMANENT
            redirect — the standalone 3-panel route (ExplorerPage) and its
            whole bundle (ExplorerLeftPanel/SourceBrowser/ExplorerDndContext/
            ExplorerOverlay/ExplorerRoundTripContext/ExplorerReturnChip) are
            deleted; the exploration surface lives in the Workspace shell. */}
        <Route
          id="explorer"
          path="/explorer"
          element={<Navigate to="/workspace/exploration" replace />}
        />
        <Route
          id="runs"
          path="/runs"
          element={<RunsView />}
          handle={{
            crumb: () => <BreadcrumbLink to="/runs">Runs</BreadcrumbLink>,
          }}
        />
        <Route
          id="project"
          path="/project"
          element={<Project />}
          errorElement={<ErrorPage />}
          shouldRevalidate={() => false}
          loader={loadProject}
          handle={{
            crumb: () => <BreadcrumbLink to="/project">Project</BreadcrumbLink>,
          }}
        >
          <Route index element={<Project />} />
          <Route
            path=":dashboardName?/*"
            element={<Project />}
            loader={loadProject}
            shouldRevalidate={() => false}
            handle={{
              crumb: match => (
                <BreadcrumbLink to={`/project/${match.params.dashboardName}`}>
                  {match.params.dashboardName}
                </BreadcrumbLink>
              ),
            }}
          />
        </Route>
      </Route>
    </>
  ),
  {
    future: futureFlags,
  }
);

export default LocalRouter;
