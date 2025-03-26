import React from "react";
import {
  Route,
  createBrowserRouter,
  createRoutesFromElements,
} from 'react-router-dom';
import { loadProject } from './loaders/project'
import ProjectContainer from './components/ProjectContainer'
import BreadcrumbLink from './components/styled/BreadcrumbLink'
import ErrorPage from './components/ErrorPage'
import DistHome from './components/DistHome'
const Viewer = createBrowserRouter(
  createRoutesFromElements(
      <Route
        path="/"
        element={<DistHome/>}
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
  )
);

export default Viewer;
