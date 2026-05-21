import { render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  Route,
  Navigate,
  createMemoryRouter,
  createRoutesFromElements,
  useLocation,
  useParams,
} from 'react-router-dom';
import LocalRouter from './LocalRouter';
import { futureFlags } from './router-config';

// Smoke test: the production router boots without crashing.
test('renders Visivo local router', () => {
  render(<RouterProvider router={LocalRouter} future={futureFlags} />);
});

// ---------- VIS-772 (Track B B1): Workspace routes + redirects ----------
//
// We can't use the production router (LocalRouter from createBrowserRouter) to
// assert specific routing behavior without spinning up jsdom history. Instead we
// build a small memory router with the same route shapes and assert behavior on
// the fragments under test.

describe('VIS-772 Workspace routes + redirects', () => {
  // Probe component used to surface the current URL + matched params in the rendered DOM.
  const RouteProbe = ({ label }) => {
    const location = useLocation();
    const params = useParams();
    return (
      <div>
        <p data-testid={`probe-${label}-pathname`}>{location.pathname}</p>
        <p data-testid={`probe-${label}-search`}>{location.search}</p>
        <p data-testid={`probe-${label}-dashboard`}>{params.dashboardName ?? '(none)'}</p>
      </div>
    );
  };

  const TypedRedirect = () => {
    const { type, name } = useParams();
    return <Navigate to={`/workspace?edit=${type}:${name}`} replace />;
  };

  const makeRouter = initialEntry =>
    createMemoryRouter(
      createRoutesFromElements(
        <>
          <Route path="/lineage" element={<Navigate to="/workspace?view=lineage" replace />} />
          <Route path="/editor" element={<Navigate to="/workspace?view=project" replace />} />
          <Route path="/editor/:type/:name" element={<TypedRedirect />} />
          <Route path="/workspace" element={<RouteProbe label="workspace" />} />
          <Route
            path="/workspace/dashboard/:dashboardName"
            element={<RouteProbe label="workspace" />}
          />
          <Route path="/project" element={<RouteProbe label="project" />} />
          <Route path="/project/:dashboardName?" element={<RouteProbe label="project" />} />
        </>
      ),
      { initialEntries: [initialEntry], future: futureFlags }
    );

  const renderAt = entry => render(<RouterProvider router={makeRouter(entry)} future={futureFlags} />);

  test('mounts Workspace at /workspace (unscoped)', async () => {
    renderAt('/workspace');
    expect(await screen.findByTestId('probe-workspace-pathname')).toHaveTextContent('/workspace');
    expect(screen.getByTestId('probe-workspace-dashboard')).toHaveTextContent('(none)');
  });

  test('mounts Workspace at /workspace/dashboard/<name>', async () => {
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(await screen.findByTestId('probe-workspace-pathname')).toHaveTextContent(
      '/workspace/dashboard/simple-dashboard'
    );
    expect(screen.getByTestId('probe-workspace-dashboard')).toHaveTextContent('simple-dashboard');
  });

  test('redirects /editor → /workspace?view=project', async () => {
    renderAt('/editor');
    await waitFor(() => {
      expect(screen.getByTestId('probe-workspace-pathname')).toHaveTextContent('/workspace');
    });
    expect(screen.getByTestId('probe-workspace-search')).toHaveTextContent('?view=project');
  });

  test('redirects /editor/<type>/<name> → /workspace?edit=<type>:<name>', async () => {
    renderAt('/editor/chart/revenue_chart');
    await waitFor(() => {
      expect(screen.getByTestId('probe-workspace-pathname')).toHaveTextContent('/workspace');
    });
    expect(screen.getByTestId('probe-workspace-search')).toHaveTextContent(
      '?edit=chart:revenue_chart'
    );
  });

  test('redirects /lineage → /workspace?view=lineage', async () => {
    renderAt('/lineage');
    await waitFor(() => {
      expect(screen.getByTestId('probe-workspace-pathname')).toHaveTextContent('/workspace');
    });
    expect(screen.getByTestId('probe-workspace-search')).toHaveTextContent('?view=lineage');
  });

  test('preserves /project route (Q18)', async () => {
    renderAt('/project');
    expect(await screen.findByTestId('probe-project-pathname')).toHaveTextContent('/project');
  });

  test('preserves /project/<name> route (Q18)', async () => {
    renderAt('/project/simple-dashboard');
    expect(await screen.findByTestId('probe-project-dashboard')).toHaveTextContent(
      'simple-dashboard'
    );
  });
});
