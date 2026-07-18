import React from 'react';
import { Navigate, Route, createBrowserRouter, createRoutesFromElements, useParams } from 'react-router-dom';
import { futureFlags } from './router-config';
import { loadProject } from './loaders/project';
import { loadError } from './loaders/error';
import Home from './components/Home';
import Project from './components/project/Project';
import BreadcrumbLink from './components/common/BreadcrumbLink';
import ErrorPage from './components/common/ErrorPage';
import Onboarding from './components/onboarding/Onboarding';
import ExplorerPage from './components/explorer/ExplorerPage';
import ExplorerOverlay from './components/explorer/ExplorerOverlay';
import Workspace from './components/views/workspace/Workspace';
import RunsView from './components/RunsView';
import { createURLConfig, setGlobalURLConfig } from './contexts/URLContext';

// VIS-778 / J-2: Build-mode → Explorer round-trip. The overlay composes OVER
// the Workspace shell (so the origin canvas stays visible underneath).
const WorkspaceWithExplorerOverlay = () => (
  <>
    <Workspace />
    <ExplorerOverlay />
  </>
);

// VIS-772: /editor/<type>/<name> redirects into Workspace with the edit selector encoded
// as a query param. Wrapping <Navigate /> so we can pull params out of the URL.
export const EditorTypeNameRedirect = () => {
  const { type, name } = useParams();
  // useParams returns the DECODED name; re-encode so names with &, +, %, #
  // survive the query string (searchParams.get('edit') decodes on the way in).
  return <Navigate to={`/workspace?edit=${encodeURIComponent(`${type}:${name}`)}`} replace />;
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
        <Route
          id="workspace-dashboard-explorer-overlay"
          path="/workspace/dashboard/:dashboardName/explorer"
          element={<WorkspaceWithExplorerOverlay />}
          loader={loadProject}
          handle={{
            crumb: match => (
              <BreadcrumbLink to={`/workspace/dashboard/${match.params.dashboardName}`}>
                {match.params.dashboardName}
              </BreadcrumbLink>
            ),
          }}
        />
        <Route
          id="explorer"
          path="/explorer"
          element={<ExplorerPage />}
          handle={{
            crumb: () => <BreadcrumbLink to="/explorer">Explorer</BreadcrumbLink>,
          }}
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
