import React from "react";
import {
  Route,
  createBrowserRouter,
  createRoutesFromElements,
} from 'react-router-dom';
import { loadProject } from './loaders/project'
import logo from './images/logo.png';
import Home from './components/Home'
import ProjectContainer from './components/ProjectContainer'
import BreadcrumbLink from './components/styled/BreadcrumbLink'
import ErrorPage from './components/ErrorPage'
import Dag from './components/Dag'

const Viewer = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/"
      element={<Home />}
      handle={{ crumb: () => <a href="https://docs.visivo.io"><img className='h-6' src={logo} alt="Logo" /></a> }}
    >
      <Route
        id="dag"
        path="/_dag"
        element={<Dag />}
        loader={loadProject} />
      <Route
        path="/"
        element={<ProjectContainer />}
        errorElement={<ErrorPage />}
        shouldRevalidate={() => false}
        loader={loadProject}
        handle={{ crumb: () => <BreadcrumbLink to={"/"}>Project</BreadcrumbLink> }}
      >
        <Route index element={<ProjectContainer />} />

        <Route
          id="project"
          path=":dashboardName?/*"
          element={<ProjectContainer />}
          loader={loadProject}
          shouldRevalidate={() => false}
          handle={{ crumb: (match) => <BreadcrumbLink to={`${match.params.dashboardName}`}>{match.params.dashboardName}</BreadcrumbLink> }}
        />
      </Route>
    </Route >
  )
);

export default Viewer;
