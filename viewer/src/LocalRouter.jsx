import React from 'react';
import { Route, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';
import { futureFlags } from './router-config';
import { loadProject } from './loaders/project';
import { loadError } from './loaders/error';
import Home from './components/Home';
import ProjectContainer from './components/project/ProjectContainer';
import BreadcrumbLink from './components/common/BreadcrumbLink';
import ErrorPage from './components/common/ErrorPage';
import Lineage from './components/lineage/Lineage';
import Explorer from './components/explorer/Explorer';
import Editor from './components/editors/Editor';
import { createURLConfig, setGlobalURLConfig } from './contexts/URLContext';

// Set global URL config early for router loaders
export const localURLConfig = createURLConfig({ environment: 'local' });
setGlobalURLConfig(localURLConfig);

const LocalRouter = createBrowserRouter(
  createRoutesFromElements(
    <Route
      path="/"
      element={<Home />}
      loader={loadError}
      handle={{ crumb: () => <a href="/">Home</a> }}
    >
      <Route
        id="lineage"
        path="/lineage"
        element={<Lineage />}
        handle={{
          crumb: () => <BreadcrumbLink to="/lineage">Lineage</BreadcrumbLink>,
        }}
      />
      <Route
        id="explorer"
        path="/explorer"
        element={<Explorer />}
        loader={loadProject}
        handle={{
          crumb: () => <BreadcrumbLink to="/explorer">Explorer</BreadcrumbLink>,
        }}
      />
      <Route
        id="editor"
        path="/editor"
        element={<Editor />}
        loader={loadProject}
        handle={{
          crumb: () => <BreadcrumbLink to="/editor">Editor</BreadcrumbLink>,
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
  ),
  {
    future: futureFlags,
  }
);

export default LocalRouter;
