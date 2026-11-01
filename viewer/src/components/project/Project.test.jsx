import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useParams } from 'react-router-dom';
import { futureFlags } from '../../router-config';
import Project from './Project';
import useStore from '../../stores/store';

jest.mock('../../stores/store');

// D7 (e2e-gap-review.md): Project now mounts the same H-2 project-change
// socket listener the Workspace uses (useProjectChangeListener) — stub the
// socket client so jsdom never attempts a real polling connection (mirrors
// Workspace.test.jsx's identical stub).
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({ on: jest.fn(), off: jest.fn(), close: jest.fn() })),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
}));

// Mock the children so this stays a unit test of Project's branching/effects.
jest.mock('./Dashboard', () => ({ projectId, dashboardName }) => (
  <div data-testid="dashboard" data-project={projectId} data-name={dashboardName} />
));
jest.mock('./ProjectViewFlipLayer', () => () => <div data-testid="view-flip-layer" />);
jest.mock('../project/DashboardSection', () => ({ title, dashboards }) => (
  <div data-testid="dashboard-section" data-level={title} data-count={dashboards?.length} />
));
jest.mock('../project/FilterBar', () => () => <div data-testid="filter-bar" />);
jest.mock('../common/Loading', () => () => <div data-testid="loading" />);
jest.mock('../styled/Container', () => ({
  Container: ({ children }) => <div data-testid="container">{children}</div>,
}));

const buildState = (overrides = {}) => ({
  project: { id: 'project-1', name: 'Test Project', config: { defaults: {} } },
  dashboards: [],
  dashboardsLoading: false,
  fetchDashboards: jest.fn(),
  filteredDashboards: [],
  dashboardsByLevel: {},
  initializeDashboardView: jest.fn(),
  themeModeOverrides: {},
  setThemeModeOverride: jest.fn(),
  ...overrides,
});

const mockStore = state => {
  useStore.mockImplementation(selector => selector(state));
};

const renderProject = (path = '/project') =>
  render(
    <MemoryRouter initialEntries={[path]} future={futureFlags}>
      <Project />
    </MemoryRouter>
  );

describe('Project', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useParams.mockReturnValue({});
  });

  it('renders a loading indicator while dashboards are loading', () => {
    mockStore(buildState({ dashboardsLoading: true }));
    renderProject();
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows a message when no project is loaded', () => {
    mockStore(buildState({ project: null }));
    renderProject();
    expect(screen.getByText('No project loaded')).toBeInTheDocument();
  });

  it('shows an empty message when the project has no dashboards', () => {
    mockStore(buildState({ dashboards: [] }));
    renderProject();
    expect(screen.getByText('No dashboards found')).toBeInTheDocument();
  });

  it('renders FilterBar + a DashboardSection per level when no dashboard is selected', () => {
    mockStore(
      buildState({
        dashboards: [{ name: 'a', config: { level: 'L1' } }],
        dashboardsByLevel: { L1: [{ name: 'a' }], L2: [{ name: 'b' }] },
        filteredDashboards: [{ name: 'a' }, { name: 'b' }],
      })
    );
    renderProject();

    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    const sections = screen.getAllByTestId('dashboard-section');
    expect(sections).toHaveLength(2);
    expect(sections.map(s => s.getAttribute('data-level'))).toEqual(['L1', 'L2']);
    // The "Dashboard" view should NOT render in list mode.
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  it('renders the empty-search state when nothing matches the filter', () => {
    mockStore(
      buildState({
        dashboards: [{ name: 'a', config: { level: 'L1' } }],
        dashboardsByLevel: { L1: [{ name: 'a' }] },
        filteredDashboards: [],
      })
    );
    renderProject();
    expect(screen.getByText('No dashboards match your search criteria.')).toBeInTheDocument();
  });

  it('renders the selected Dashboard when a dashboardName param is present', () => {
    useParams.mockReturnValue({ dashboardName: 'sales' });
    mockStore(buildState({ dashboards: [{ name: 'sales', config: {} }] }));
    renderProject();

    const dash = screen.getByTestId('dashboard');
    expect(dash).toHaveAttribute('data-name', 'sales');
    expect(dash).toHaveAttribute('data-project', 'project-1');
  });

  it('wraps the selected Dashboard in the project theme, honouring the viewer override', () => {
    useParams.mockReturnValue({ dashboardName: 'sales' });
    mockStore(
      buildState({
        project: { id: 'project-1', config: { theme: { mode: 'light' } } },
        dashboards: [{ name: 'sales', config: {} }],
        themeModeOverrides: { 'project-1': 'dark' },
      })
    );
    renderProject();

    const root = screen.getByTestId('dashboard-theme-root');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root).toContainElement(screen.getByTestId('dashboard'));
    expect(screen.getByRole('radio', { name: 'Dark theme' })).toHaveAttribute('aria-checked', 'true');
  });

  it('hides the theme toggle when the project disallows viewer overrides', () => {
    useParams.mockReturnValue({ dashboardName: 'sales' });
    mockStore(
      buildState({
        project: { id: 'project-1', config: { theme: { mode: 'dark', allow_viewer_toggle: false } } },
        dashboards: [{ name: 'sales', config: {} }],
        themeModeOverrides: { 'project-1': 'light' },
      })
    );
    renderProject();

    expect(screen.getByTestId('dashboard-theme-root')).toHaveAttribute('data-theme', 'dark');
    expect(screen.queryByRole('radiogroup', { name: 'Dashboard theme' })).not.toBeInTheDocument();
  });

  it('does not theme the dashboard list', () => {
    mockStore(buildState({ dashboards: [{ name: 'a', config: {} }], dashboardsByLevel: { L1: [] } }));
    renderProject();
    expect(screen.queryByTestId('dashboard-theme-root')).not.toBeInTheDocument();
  });

  it('fetches dashboards on mount and initializes the dashboard view', () => {
    const fetchDashboards = jest.fn();
    const initializeDashboardView = jest.fn();
    mockStore(
      buildState({
        dashboards: [{ name: 'a', config: { level: 'L1' } }],
        dashboardsByLevel: { L1: [{ name: 'a' }] },
        fetchDashboards,
        initializeDashboardView,
      })
    );
    renderProject();

    expect(fetchDashboards).toHaveBeenCalled();
    expect(initializeDashboardView).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'a' })]),
      undefined,
      expect.anything()
    );
  });

  describe('unknown dashboard', () => {
    const known = [
      { name: 'sales', config: {} },
      { name: 'sales-overview', config: {} },
      { name: 'ops', config: {} },
    ];

    it('shows a not-found message with a link back to the list instead of loading forever', () => {
      useParams.mockReturnValue({ dashboardName: 'nope' });
      mockStore(buildState({ dashboards: known }));
      renderProject('/project/nope');
      expect(screen.getByText('No dashboard named nope')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to the dashboard list' })).toHaveAttribute(
        'href',
        '/project'
      );
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
      expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
    });

    it('suggests close names', () => {
      useParams.mockReturnValue({ dashboardName: 'Sale' });
      mockStore(buildState({ dashboards: known }));
      renderProject('/project/Sale');
      expect(screen.getByRole('link', { name: 'sales' })).toHaveAttribute(
        'href',
        '/project/sales'
      );
      expect(screen.getByRole('link', { name: 'sales-overview' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'ops' })).not.toBeInTheDocument();
    });

    it('links to the root list when served from the site root', () => {
      useParams.mockReturnValue({ dashboardName: 'sale' });
      mockStore(buildState({ dashboards: known }));
      renderProject('/sale');
      expect(screen.getByRole('link', { name: 'Back to the dashboard list' })).toHaveAttribute(
        'href',
        '/'
      );
      expect(screen.getByRole('link', { name: 'sales' })).toHaveAttribute('href', '/sales');
    });

    it('still renders a dashboard that exists', () => {
      useParams.mockReturnValue({ dashboardName: 'ops' });
      mockStore(buildState({ dashboards: known }));
      renderProject('/project/ops');
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-not-found')).not.toBeInTheDocument();
    });
  });
});
