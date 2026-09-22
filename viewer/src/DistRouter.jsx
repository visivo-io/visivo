import React from 'react';
import { Route, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';
import { futureFlags } from './router-config';
import { loadProject } from './loaders/project';
import Project from './components/project/Project';
import BreadcrumbLink from './components/common/BreadcrumbLink';
import ErrorPage from './components/common/ErrorPage';
import DistHome from './components/DistHome';
import { loadError } from './loaders/error';
import logo from './images/logo.png';
import { createURLConfig, setGlobalURLConfig } from './contexts/URLContext';
import { withDeploymentRoot } from './config/urls';

// Set global URL config early for router loaders
export const distURLConfig = createURLConfig({ environment: 'dist' });
setGlobalURLConfig(distURLConfig);
const root = distURLConfig.getRoute();

// An <img src>, not a router link, so the basename below does not reach it —
// it takes the same prefix every other baked-in asset URL needs.
const logo_path = withDeploymentRoot(logo);

const DistRouter = createBrowserRouter(
  createRoutesFromElements(
    <Route
      path="/"
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
        path="/"
        element={<Project />}
        errorElement={<ErrorPage />}
        shouldRevalidate={() => false}
        loader={loadProject}
        handle={{
          crumb: () => <BreadcrumbLink to="/">Project</BreadcrumbLink>,
        }}
      >
        <Route index element={<Project />} />
        <Route
          id="project"
          path=":dashboardName?/*"
          element={<Project />}
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
    // The deployment root belongs here, not on each route's `path`. As a path it
    // matched the URL but nothing else knew about it: every `to="/…"` rendered
    // an href at the SERVER root, so a dist under /path/sub linked straight out
    // of itself. A basename is what React Router prepends to generated links and
    // strips before matching, which is the whole job.
    basename: root,
    future: futureFlags,
  }
);

export default DistRouter;
