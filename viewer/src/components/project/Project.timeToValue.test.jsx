/* The terminal mark of the time-to-value ladder on `/project/:dashboardName`
 * (Guided First Run W1, step 6).
 *
 * Kept out of Project.test.jsx: that suite mocks the store per-test, and these
 * need the real timeToValue module plus a clean ledger per test.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { useParams } from 'react-router-dom';
import Project from './Project';
import useStore from '../../stores/store';
import { clearEventBuffer, getEventBuffer } from '../onboarding/telemetry';
import { clearTimeToValueLedger } from '../onboarding/timeToValue';
import { countDashboardItems } from '../onboarding/firstDashboardRendered';
import { writeOnboardingState } from '../onboarding/onboardingState';

jest.mock('../../stores/store');
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({ on: jest.fn(), close: jest.fn() })),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
}));
jest.mock('./Dashboard', () => () => <div data-testid="dashboard" />);
jest.mock('./ProjectViewFlipLayer', () => () => <div data-testid="view-flip-layer" />);
jest.mock('../project/DashboardSection', () => () => <div data-testid="dashboard-section" />);
jest.mock('../project/FilterBar', () => () => <div data-testid="filter-bar" />);
jest.mock('../common/Loading', () => () => <div data-testid="loading" />);
jest.mock('../styled/Container', () => ({
  Container: ({ children }) => <div>{children}</div>,
}));

const ONE_ITEM_DASHBOARD = {
  name: 'revenue',
  config: { rows: [{ items: [{ chart: { name: 'c' } }] }] },
};

const buildState = (overrides = {}) => ({
  project: { id: 'project-1', name: 'Test Project', config: { defaults: {} } },
  dashboards: [ONE_ITEM_DASHBOARD],
  dashboardsLoading: false,
  fetchDashboards: jest.fn(),
  filteredDashboards: [],
  dashboardsByLevel: {},
  initializeDashboardView: jest.fn(),
  ...overrides,
});

const mockStore = state => useStore.mockImplementation(selector => selector(state));
const renderedMarks = () => getEventBuffer().filter(e => e.event === 'first_dashboard_rendered');

beforeEach(() => {
  jest.clearAllMocks();
  clearEventBuffer();
  clearTimeToValueLedger();
  window.localStorage.clear();
  delete window.__VISIVO_FIRST_RUN;
  delete window.__VISIVO_TELEMETRY_DISABLED;
  useParams.mockReturnValue({ dashboardName: 'revenue' });
});

describe('countDashboardItems', () => {
  test('counts the items of a flat dashboard', () => {
    expect(
      countDashboardItems({ rows: [{ items: [{}, {}] }, { items: [{}] }] })
    ).toBe(3);
  });

  test('recurses into nested Item.rows rather than counting the wrapper as one', () => {
    expect(
      countDashboardItems({
        rows: [{ items: [{ rows: [{ items: [{}, {}] }] }, {}] }],
      })
    ).toBe(3);
  });

  test('an empty or malformed dashboard counts zero rather than throwing', () => {
    expect(countDashboardItems(null)).toBe(0);
    expect(countDashboardItems({})).toBe(0);
    expect(countDashboardItems({ rows: [{}] })).toBe(0);
  });
});

describe('first_dashboard_rendered', () => {
  test('fires when a dashboard with items mounts, with item_count', () => {
    mockStore(buildState());

    render(<Project />);

    const [mark] = renderedMarks();
    expect(mark.props.step_index).toBe(6);
    expect(mark.props.item_count).toBe(1);
  });

  test('does not fire for an empty dashboard — an empty shell is not value', () => {
    mockStore(
      buildState({ dashboards: [{ name: 'revenue', config: { rows: [{ items: [] }] } }] })
    );

    render(<Project />);

    expect(renderedMarks()).toHaveLength(0);
  });

  test('does not fire on the dashboard list route', () => {
    useParams.mockReturnValue({});
    mockStore(buildState());

    render(<Project />);

    expect(renderedMarks()).toHaveLength(0);
  });

  test('fires once even across re-renders and re-mounts', () => {
    mockStore(buildState());

    const { rerender, unmount } = render(<Project />);
    rerender(<Project />);
    unmount();
    render(<Project />);

    expect(renderedMarks()).toHaveLength(1);
  });

  test('from_sample is false for a dashboard built from the user’s own data', () => {
    writeOnboardingState({ completed_at: '2026-01-01', path: 'data' });
    mockStore(buildState());

    render(<Project />);

    expect(renderedMarks()[0].props.from_sample).toBe(false);
  });

  test('from_sample is true for the bundled example — the TTV-5 trap', () => {
    // The cloud/dist viewer has no server to name the samples, so it falls
    // back to the onboarding path.
    writeOnboardingState({ completed_at: '2026-01-01', path: 'sample' });
    mockStore(buildState());

    render(<Project />);

    expect(renderedMarks()[0].props.from_sample).toBe(true);
  });

  test('carries no dashboard name', () => {
    mockStore(buildState());

    render(<Project />);

    expect(JSON.stringify(renderedMarks()[0].props)).not.toContain('revenue');
  });

  test('emits nothing when telemetry is disabled', () => {
    window.__VISIVO_TELEMETRY_DISABLED = true;
    mockStore(buildState());

    render(<Project />);

    expect(getEventBuffer()).toHaveLength(0);
  });
});

describe('from_sample is about the dashboard, not the onboarding branch', () => {
  /* The onboarding `path` is written once at the end of the flow and never
   * updated, so it is wrong in both directions; the server-named samples on
   * the injected journey are a fact about what is being rendered. */

  const injectServerJourney = (sampleDashboards = ['College Football', 'EV Sales']) => {
    window.__VISIVO_FIRST_RUN = {
      journey_id: 'J-1',
      started_at_ms: Date.now() - 60_000,
      install_age_ms: 1000,
      machine_id: 'machine-abc',
      steps: {},
      sample_dashboards: sampleDashboards,
    };
  };

  test('a skipped-onboarding user opening the bundled sample still reports true', () => {
    writeOnboardingState({ completed_at: '2026-01-01', path: 'skipped' });
    injectServerJourney();
    useParams.mockReturnValue({ dashboardName: 'College Football' });
    mockStore(
      buildState({
        dashboards: [
          { name: 'College Football', config: { rows: [{ items: [{ chart: { name: 'c' } }] }] } },
        ],
      })
    );

    render(<Project />);

    expect(renderedMarks()[0].props.from_sample).toBe(true);
  });

  test('a user with no onboarding state at all still reports true for the sample', () => {
    injectServerJourney();
    useParams.mockReturnValue({ dashboardName: 'EV Sales' });
    mockStore(
      buildState({
        dashboards: [
          { name: 'EV Sales', config: { rows: [{ items: [{ chart: { name: 'c' } }] }] } },
        ],
      })
    );

    render(<Project />);

    expect(renderedMarks()[0].props.from_sample).toBe(true);
  });

  test('a sample-path user who then built their own dashboard reports false', () => {
    writeOnboardingState({ completed_at: '2026-01-01', path: 'sample' });
    injectServerJourney();
    mockStore(buildState());

    render(<Project />);

    expect(renderedMarks()[0].props.from_sample).toBe(false);
  });
});
