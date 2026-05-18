import React from 'react';
import { Navigate, Route, createBrowserRouter, createRoutesFromElements, useParams } from 'react-router-dom';
import { futureFlags } from './router-config';
import { loadProject } from './loaders/project';
import { loadError } from './loaders/error';
import Home from './components/Home';
import ProjectContainer from './components/project/ProjectContainer';
import BreadcrumbLink from './components/common/BreadcrumbLink';
import ErrorPage from './components/common/ErrorPage';
import Onboarding from './components/onboarding/Onboarding';
import ProjectNew from './components/new-views/project/ProjectNew'; // Container component
import ExplorerNewPage from './components/explorerNew/ExplorerNewPage';
import Workspace from './components/new-views/workspace/Workspace';
import { createURLConfig, setGlobalURLConfig } from './contexts/URLContext';

// VIS-772: /editor/<type>/<name> redirects into Workspace with the edit selector encoded
// as a query param. Wrapping <Navigate /> so we can pull params out of the URL.
const EditorTypeNameRedirect = () => {
  const { type, name } = useParams();
  return <Navigate to={`/workspace?edit=${type}:${name}`} replace />;
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
          id="project-new"
          path="/project-new/:dashboardName?"
          element={<ProjectNew />}
          loader={loadProject}
          handle={{
            crumb: match => (
              <BreadcrumbLink to={match.params.dashboardName ? `/project-new/${match.params.dashboardName}` : '/project-new'}>
                {match.params.dashboardName ? `${match.params.dashboardName} (New)` : 'Project (New)'}
              </BreadcrumbLink>
            ),
          }}
        />
        <Route
          id="explorer"
          path="/explorer"
          element={<ExplorerNewPage />}
          handle={{
            crumb: () => <BreadcrumbLink to="/explorer">Explorer</BreadcrumbLink>,
          }}
        />
        <Route
          id="project"
          path="/project"
          element={<ProjectContainer />}
          errorElement={<ErrorPage />}
          shouldRevalidate={() => false}
          loader={loadProject}
          handle={{
            crumb: () => <BreadcrumbLink to="/project">Project</BreadcrumbLink>,
          }}
        >
          <Route index element={<ProjectContainer />} />
          <Route
            path=":dashboardName?/*"
            element={<ProjectContainer />}
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
