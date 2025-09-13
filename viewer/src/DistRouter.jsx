import React from 'react';
import { Route, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';
import { futureFlags } from './router-config';
import { loadProject } from './loaders/project';
import ProjectContainer from './components/project/ProjectContainer';
import BreadcrumbLink from './components/common/BreadcrumbLink';
import ErrorPage from './components/common/ErrorPage';
import DistHome from './components/DistHome';
import { loadError } from './loaders/error';
import logo from './images/logo.png';
import { createURLConfig, setGlobalURLConfig } from './contexts/URLContext';

// Set global URL config early for router loaders
export const distURLConfig = createURLConfig({ environment: 'dist' });
setGlobalURLConfig(distURLConfig);
const root = distURLConfig.getRoute();

const logo_path = root === '/' ? logo : root + logo;

const DistRouter = createBrowserRouter(
  createRoutesFromElements(
    <Route
      path={root}
      element={<DistHome />}
      loader={loadError}
      handle={{
        crumb: () => (
          <a href="https://visivo.io">
            <img src={logo_path} className="h-8" alt="Visivo Logo" />
          </a>
        ),
      }}
    >
      <Route
        path={root}
        element={<ProjectContainer />}
        errorElement={<ErrorPage />}
        shouldRevalidate={() => false}
        loader={loadProject}
        handle={{
          crumb: () => <BreadcrumbLink to="/">Project</BreadcrumbLink>,
        }}
      >
        <Route index element={<ProjectContainer />} />
        <Route
          id="project"
          path=":dashboardName?/*"
          element={<ProjectContainer />}
          loader={loadProject}
          shouldRevalidate={() => false}
          handle={{
            crumb: match => (
              <BreadcrumbLink to={`/${match.params.dashboardName}`}>
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

export default DistRouter;
