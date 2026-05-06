import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { futureFlags } from '../../../router-config';
import ProjectNew from './ProjectNew';
import useStore from '../../../stores/store';

jest.mock('../../../stores/store');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ dashboardName: undefined }),
}));

jest.mock('./DashboardNew', () => ({
  __esModule: true,
  default: ({ dashboardName }) => (
    <div data-testid="dashboard-new">{dashboardName}</div>
  ),
}));

jest.mock('../../project/DashboardSection', () => ({
  __esModule: true,
  default: ({ title, dashboards, projectDefaults }) => (
    <div data-testid={`section-${title}`}>
      <span data-testid={`section-${title}-defaults`}>
        {projectDefaults ? JSON.stringify(projectDefaults) : 'no-defaults'}
      </span>
      <span data-testid={`section-${title}-count`}>{dashboards.length}</span>
    </div>
  ),
}));

jest.mock('../../project/FilterBar', () => ({
  __esModule: true,
  default: () => <div data-testid="filter-bar" />,
}));

const renderWithStore = (state) => {
  useStore.mockImplementation((selector) => selector(state));
  return render(
    <BrowserRouter future={futureFlags}>
      <ProjectNew />
    </BrowserRouter>
  );
};

const baseDashboard = {
  name: 'Sales',
  config: {
    description: 'Sales dashboard',
    tags: ['priority'],
    level: 0,
    type: null,
    href: null,
  },
};

describe('ProjectNew', () => {
  it('calls fetchDashboards and fetchDefaults on mount', () => {
    const fetchDashboards = jest.fn();
    const fetchDefaults = jest.fn();
    renderWithStore({
      project: { id: 'p1', name: 'Test' },
      dashboards: [baseDashboard],
      dashboardsLoading: false,
      fetchDashboards,
      defaults: null,
      fetchDefaults,
      filteredDashboards: [],
      dashboardsByLevel: {},
      initializeDashboardView: jest.fn(),
    });
    expect(fetchDashboards).toHaveBeenCalled();
    expect(fetchDefaults).toHaveBeenCalled();
  });

  it('passes defaults from the store (not project_json) into DashboardSection', () => {
    const defaults = { source_name: 'snowflake' };
    renderWithStore({
      project: { id: 'p1', name: 'Test' },
      dashboards: [baseDashboard],
      dashboardsLoading: false,
      fetchDashboards: jest.fn(),
      defaults,
      fetchDefaults: jest.fn(),
      filteredDashboards: [baseDashboard],
      dashboardsByLevel: { 'Level 0': [baseDashboard] },
      initializeDashboardView: jest.fn(),
    });
    expect(screen.getByTestId('section-Level 0-defaults')).toHaveTextContent(
      JSON.stringify(defaults)
    );
  });

  it('passes defaults from the store into initializeDashboardView', () => {
    const defaults = { source_name: 'snowflake' };
    const initializeDashboardView = jest.fn();
    renderWithStore({
      project: { id: 'p1', name: 'Test' },
      dashboards: [baseDashboard],
      dashboardsLoading: false,
      fetchDashboards: jest.fn(),
      defaults,
      fetchDefaults: jest.fn(),
      filteredDashboards: [],
      dashboardsByLevel: {},
      initializeDashboardView,
    });
    expect(initializeDashboardView).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      defaults
    );
  });

  it('renders loading state when dashboards are loading', () => {
    renderWithStore({
      project: { id: 'p1', name: 'Test' },
      dashboards: null,
      dashboardsLoading: true,
      fetchDashboards: jest.fn(),
      defaults: null,
      fetchDefaults: jest.fn(),
      filteredDashboards: [],
      dashboardsByLevel: {},
      initializeDashboardView: jest.fn(),
    });
    expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();
  });

  it('renders empty state when no dashboards exist', () => {
    renderWithStore({
      project: { id: 'p1', name: 'Test' },
      dashboards: [],
      dashboardsLoading: false,
      fetchDashboards: jest.fn(),
      defaults: null,
      fetchDefaults: jest.fn(),
      filteredDashboards: [],
      dashboardsByLevel: {},
      initializeDashboardView: jest.fn(),
    });
    expect(screen.getByText(/No dashboards found/i)).toBeInTheDocument();
  });
});
