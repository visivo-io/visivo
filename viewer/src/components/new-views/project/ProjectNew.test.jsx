import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { futureFlags } from '../../../router-config';
import ProjectNew from './ProjectNew';
import useStore from '../../../stores/store';
import { SINGLE_SELECT, MULTI_SELECT } from '../../items/Input';

jest.mock('../../../stores/store');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ dashboardName: undefined }),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
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

// Build a default store-state with overridable fields. ProjectNew now reads
// many slices (defaults, inputs, scroll position) so a single source-of-truth
// keeps tests focused on the behavior under test.
const buildState = (overrides = {}) => ({
  project: { id: 'p1', name: 'Test' },
  dashboards: [baseDashboard],
  dashboardsLoading: false,
  fetchDashboards: jest.fn(),
  defaults: null,
  fetchDefaults: jest.fn(),
  inputs: [],
  fetchInputs: jest.fn(),
  setDefaultInputJobValues: jest.fn(),
  setScrollPosition: jest.fn(),
  scrollPositions: {},
  filteredDashboards: [],
  dashboardsByLevel: {},
  initializeDashboardView: jest.fn(),
  ...overrides,
});

const renderWithStore = (overrides = {}) => {
  const state = buildState(overrides);
  useStore.mockImplementation((selector) => selector(state));
  return { state, ...render(
    <BrowserRouter future={futureFlags}>
      <ProjectNew />
    </BrowserRouter>
  ) };
};

describe('ProjectNew', () => {
  it('calls fetchDashboards, fetchDefaults, and fetchInputs on mount', () => {
    const fetchDashboards = jest.fn();
    const fetchDefaults = jest.fn();
    const fetchInputs = jest.fn();
    renderWithStore({ fetchDashboards, fetchDefaults, fetchInputs });
    expect(fetchDashboards).toHaveBeenCalled();
    expect(fetchDefaults).toHaveBeenCalled();
    expect(fetchInputs).toHaveBeenCalled();
  });

  it('passes defaults from the store (not project_json) into DashboardSection', () => {
    const defaults = { source_name: 'snowflake' };
    renderWithStore({
      defaults,
      filteredDashboards: [baseDashboard],
      dashboardsByLevel: { 'Level 0': [baseDashboard] },
    });
    expect(screen.getByTestId('section-Level 0-defaults')).toHaveTextContent(
      JSON.stringify(defaults)
    );
  });

  it('passes defaults from the store into initializeDashboardView', () => {
    const defaults = { source_name: 'snowflake' };
    const initializeDashboardView = jest.fn();
    renderWithStore({ defaults, initializeDashboardView });
    expect(initializeDashboardView).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      defaults
    );
  });

  it('renders loading state when dashboards are loading', () => {
    renderWithStore({ dashboards: null, dashboardsLoading: true });
    expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();
  });

  it('renders empty state when no dashboards exist', () => {
    renderWithStore({ dashboards: [] });
    expect(screen.getByText(/No dashboards found/i)).toBeInTheDocument();
  });

  describe('input default priming', () => {
    it('seeds setDefaultInputJobValues from the input store after fetch', () => {
      const setDefaultInputJobValues = jest.fn();
      renderWithStore({
        setDefaultInputJobValues,
        inputs: [
          {
            name: 'split_threshold',
            config: {
              type: SINGLE_SELECT,
              display: { default: { value: '5' } },
            },
          },
          {
            name: 'regions',
            config: {
              type: MULTI_SELECT,
              display: { default: ['NA', 'EU'] },
            },
          },
          // No default — should be skipped
          {
            name: 'no_default',
            config: { type: SINGLE_SELECT, display: {} },
          },
          // Wrong type — should be skipped
          {
            name: 'wrong_type',
            config: { type: 'date-range', display: { default: '2024-01-01' } },
          },
        ],
      });
      expect(setDefaultInputJobValues).toHaveBeenCalledTimes(1);
      const passed = setDefaultInputJobValues.mock.calls[0][0];
      expect(passed).toEqual([
        { name: 'split_threshold', value: { value: '5' }, type: SINGLE_SELECT },
        { name: 'regions', value: ['NA', 'EU'], type: MULTI_SELECT },
      ]);
    });

    it('does not call setDefaultInputJobValues when there are no inputs', () => {
      const setDefaultInputJobValues = jest.fn();
      renderWithStore({ setDefaultInputJobValues, inputs: [] });
      expect(setDefaultInputJobValues).not.toHaveBeenCalled();
    });
  });
});
