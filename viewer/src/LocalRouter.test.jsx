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
import LocalRouter, { EditorTypeNameRedirect, DashboardExplorerRedirect } from './LocalRouter';
import { futureFlags } from './router-config';
import * as explorationsApi from './api/explorations';

jest.mock('./api/explorations');

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

  const makeRouter = initialEntry =>
    createMemoryRouter(
      createRoutesFromElements(
        <>
          <Route path="/lineage" element={<Navigate to="/workspace?view=lineage" replace />} />
          <Route path="/editor" element={<Navigate to="/workspace?view=project" replace />} />
          <Route path="/editor/:type/:name" element={<EditorTypeNameRedirect />} />
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
      '?edit=chart%3Arevenue_chart'
    );
  });

  test.each([
    ['P&L', 'chart%3AP%26L'],
    ['A+B', 'chart%3AA%2BB'],
    ['100% Done', 'chart%3A100%25%20Done'],
  ])('URL-encodes the ?edit= selector for object name %j', async (name, encoded) => {
    renderAt(`/editor/chart/${encodeURIComponent(name)}`);
    await waitFor(() => {
      expect(screen.getByTestId('probe-workspace-pathname')).toHaveTextContent('/workspace');
    });
    // location.search keeps the encoded form; searchParams.get('edit') on the
    // consumer side decodes it back to `chart:<name>`.
    expect(screen.getByTestId('probe-workspace-search')).toHaveTextContent(`?edit=${encoded}`);
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

// ---------- Explore 2.0 Phase 3b cutover: /explorer + the dashboard-scoped
// explorer round-trip route ----------
describe('Explore 2.0 Phase 3b cutover routes', () => {
  test('/explorer is a permanent redirect to /workspace/exploration', async () => {
    const RouteProbe = () => {
      const location = useLocation();
      return <p data-testid="probe-pathname">{location.pathname}</p>;
    };
    const router = createMemoryRouter(
      createRoutesFromElements(
        <>
          <Route path="/explorer" element={<Navigate to="/workspace/exploration" replace />} />
          <Route path="/workspace/exploration" element={<RouteProbe />} />
        </>
      ),
      { initialEntries: ['/explorer'], future: futureFlags }
    );
    render(<RouterProvider router={router} future={futureFlags} />);
    expect(await screen.findByTestId('probe-pathname')).toHaveTextContent(
      '/workspace/exploration'
    );
  });

  describe('DashboardExplorerRedirect', () => {
    const RouteProbe = () => {
      const location = useLocation();
      return (
        <div>
          <p data-testid="probe-pathname">{location.pathname}</p>
        </div>
      );
    };

    const makeRedirectRouter = initialEntry =>
      createMemoryRouter(
        createRoutesFromElements(
          <>
            <Route
              path="/workspace/dashboard/:dashboardName/explorer"
              element={<DashboardExplorerRedirect />}
            />
            <Route path="/workspace/exploration" element={<RouteProbe />} />
            <Route path="/workspace/exploration/:id" element={<RouteProbe />} />
          </>
        ),
        { initialEntries: [initialEntry], future: futureFlags }
      );

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('mints an exploration carrying return_to={dashboard} and redirects into it', async () => {
      explorationsApi.createExploration.mockResolvedValueOnce({
        id: 'exp_new1',
        name: 'Scratch',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        seeded_from: null,
        return_to: { dashboard: 'sales' },
        draft: { queries: [], insights: [], chart: null, computed_columns: [] },
        promoted: [],
      });

      render(
        <RouterProvider router={makeRedirectRouter('/workspace/dashboard/sales/explorer')} future={futureFlags} />
      );

      expect(await screen.findByTestId('probe-pathname')).toHaveTextContent(
        '/workspace/exploration/exp_new1'
      );
      expect(explorationsApi.createExploration).toHaveBeenCalledWith({
        return_to: { dashboard: 'sales' },
      });
    });

    test('fails open to Explorer Home if minting the exploration fails', async () => {
      explorationsApi.createExploration.mockRejectedValueOnce(new Error('network down'));

      render(
        <RouterProvider router={makeRedirectRouter('/workspace/dashboard/sales/explorer')} future={futureFlags} />
      );

      expect(await screen.findByTestId('probe-pathname')).toHaveTextContent(
        '/workspace/exploration'
      );
    });
  });
});
