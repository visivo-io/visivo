import React from 'react';
import { Route, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';
import { futureFlags } from './router-config';
import { loadProject } from './loaders/project';
import { loadError } from './loaders/error';
import Home from './components/Home';
import BreadcrumbLink from './components/common/BreadcrumbLink';
import ErrorPage from './components/common/ErrorPage';
import Onboarding from './components/onboarding/Onboarding';
import LineageNew from './components/new-views/lineage/LineageNew';
import Editor from './components/editor/Editor';
import Project from './components/project/Project';
import ExplorerNewPage from './components/explorerNew/ExplorerNewPage';
import { createURLConfig, setGlobalURLConfig } from './contexts/URLContext';

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
        <Route
          id="lineage"
          path="/lineage"
          element={<LineageNew />}
          loader={loadProject}
          handle={{
            crumb: () => <BreadcrumbLink to="/lineage">Lineage</BreadcrumbLink>,
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
