import React from "react";
import {
  Route,
  createBrowserRouter,
  createRoutesFromElements,
} from 'react-router-dom';
import { loadProject } from './loaders/project'
import { loadDag } from './loaders/dag'
import { loadError } from './loaders/error'
import Home from './components/Home'
import ProjectContainer from './components/ProjectContainer'
import BreadcrumbLink from './components/styled/BreadcrumbLink'
import ErrorPage from './components/ErrorPage'
import LineageGraph from './components/lineage/LineageGraph'
import QueryExplorer from './components/QueryExplorer'
import Editor from './components/Editor'

const LocalRouter = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/"
      element={<Home />}
      loader={loadError}
      handle={{ crumb: () => <a href="/">Home</a> }}
    >
      <Route
        id="dag"
        path="/dag"
        element={<LineageGraph />}
        loader={loadDag}
        handle={{ crumb: () => <BreadcrumbLink to="/dag">DAG Explorer</BreadcrumbLink> }}
      />
      <Route
        id="query"
        path="/query"
        element={<QueryExplorer />}
        loader={loadProject}
        handle={{ crumb: () => <BreadcrumbLink to="/query">Query Explorer</BreadcrumbLink> }}
      />
      <Route
        id="editor"
        path="/editor"
        element={<Editor />}
        loader={loadProject}
        handle={{ crumb: () => <BreadcrumbLink to="/editor">Editor</BreadcrumbLink> }}
      />
      <Route
        path="/project"
        element={<ProjectContainer />}
        errorElement={<ErrorPage />}
        shouldRevalidate={() => false}
        loader={loadProject}
        handle={{ crumb: () => <BreadcrumbLink to="/project">Project</BreadcrumbLink> }}
      >
        <Route index element={<ProjectContainer />} />
        <Route
          id="project"
          path=":dashboardName?/*"
          element={<ProjectContainer />}
          loader={loadProject}
          shouldRevalidate={() => false}
          handle={{ crumb: (match) => <BreadcrumbLink to={`/project/${match.params.dashboardName}`}>{match.params.dashboardName}</BreadcrumbLink> }}
        />
      </Route>
    </Route>
  )
);

export default LocalRouter;
