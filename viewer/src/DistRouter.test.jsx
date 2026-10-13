/**
 * Where a dist mounts.
 *
 * The deployment root used to be each route's `path`. That matched the URL, so
 * the page rendered — but nothing else knew about it, and every `to="/…"`
 * produced an href at the SERVER root, so a bundle under /path/sub linked
 * straight out of itself. A basename is what React Router strips before
 * matching and prepends when generating, which is the whole job.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import DistRouter from './DistRouter';
import { futureFlags } from './router-config';

test('renders Visivo dist router', () => {
  render(<RouterProvider router={DistRouter} future={futureFlags} />);
});

/**
 * A fresh router for a given mount point.
 *
 * DistRouter reads window.deploymentRoot at import, so each case needs its own
 * module instance. Deliberately not rendered: resetModules gives the re-required
 * graph its own React, and hooks from two copies cannot meet. What is asserted
 * here is what this module decides — where it mounts — not what React Router
 * then does with it.
 */
const routerAt = (pathname, deploymentRoot) => {
  window.deploymentRoot = deploymentRoot;
  window.history.pushState({}, '', pathname);
  jest.resetModules();
  // eslint-disable-next-line global-require
  return require('./DistRouter').default;
};

afterEach(() => {
  delete window.deploymentRoot;
  window.history.pushState({}, '', '/');
});

describe.each([
  ['one segment deep', '/sub'],
  ['two segments deep', '/path/sub'],
])('mounted %s', (_label, root) => {
  test('the deployment root is the basename, not a route path', () => {
    expect(routerAt(`${root}/`, root).basename).toBe(root);
  });

  test('the entry URL matches a route', () => {
    expect(routerAt(`${root}/`, root).state.matches).not.toHaveLength(0);
  });

  test('a deep link into a dashboard matches', () => {
    const router = routerAt(`${root}/sales`, root);

    expect(router.state.matches).not.toHaveLength(0);
    expect(router.state.matches.at(-1).params.dashboardName).toBe('sales');
  });

  test('a root typed without its slash still mounts absolutely', () => {
    // dist_phase normalizes, but window.deploymentRoot is read straight off the
    // page and a hand-edited index.html is a real thing.
    expect(routerAt(`${root}/`, root.slice(1)).basename).toBe(root);
  });
});

describe('mounted at the site root', () => {
  test('nothing is prefixed', () => {
    expect(routerAt('/', '').basename).toBe('/');
  });

  test('the entry URL matches a route', () => {
    expect(routerAt('/', '').state.matches).not.toHaveLength(0);
  });
});
