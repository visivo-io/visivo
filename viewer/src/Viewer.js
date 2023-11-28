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

const App = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/"
      element={<Home />}
      handle={{ crumb: () => <a href="https://docs.visivo.io"><img className='h-6' src={logo} alt="Logo" /></a> }}
    >
      <Route
        path="/*"
        element={<ProjectContainer />}
        errorElement={<ErrorPage />}
        loader={loadProject}
        handle={{ crumb: () => <BreadcrumbLink to={"/"}>Project</BreadcrumbLink> }}
      >
        <Route index element={<ProjectContainer />} />
        <Route
          path=":dashboardName?/*"
          element={<ProjectContainer />}
          loader={loadProject}
          handle={{ crumb: (match) => <BreadcrumbLink to={`${match.params.dashboardName}`}>{match.params.dashboardName}</BreadcrumbLink> }}
        />
      </Route>
    </Route >
  )
);

export default App;
