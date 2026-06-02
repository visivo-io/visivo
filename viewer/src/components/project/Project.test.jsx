import React from 'react';
import { render, screen } from '@testing-library/react';
import { useParams } from 'react-router-dom';
import Project from './Project';
import useStore from '../../stores/store';

jest.mock('../../stores/store');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
}));

// Mock the children so this stays a unit test of Project's branching/effects.
jest.mock('./Dashboard', () => ({ projectId, dashboardName }) => (
  <div data-testid="dashboard" data-project={projectId} data-name={dashboardName} />
));
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
  ...overrides,
});

const mockStore = state => {
  useStore.mockImplementation(selector => selector(state));
};

describe('Project', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useParams.mockReturnValue({});
  });

  it('renders a loading indicator while dashboards are loading', () => {
    mockStore(buildState({ dashboardsLoading: true }));
    render(<Project />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows a message when no project is loaded', () => {
    mockStore(buildState({ project: null }));
    render(<Project />);
    expect(screen.getByText('No project loaded')).toBeInTheDocument();
  });

  it('shows an empty message when the project has no dashboards', () => {
    mockStore(buildState({ dashboards: [] }));
    render(<Project />);
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
    render(<Project />);

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
    render(<Project />);
    expect(screen.getByText('No dashboards match your search criteria.')).toBeInTheDocument();
  });

  it('renders the selected Dashboard when a dashboardName param is present', () => {
    useParams.mockReturnValue({ dashboardName: 'sales' });
    mockStore(buildState({ dashboards: [{ name: 'sales', config: {} }] }));
    render(<Project />);

    const dash = screen.getByTestId('dashboard');
    expect(dash).toHaveAttribute('data-name', 'sales');
    expect(dash).toHaveAttribute('data-project', 'project-1');
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
    render(<Project />);

    expect(fetchDashboards).toHaveBeenCalled();
    expect(initializeDashboardView).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'a' })]),
      undefined,
      expect.anything()
    );
  });
});
