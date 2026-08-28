/* The terminal mark of the time-to-value ladder on the WORKSPACE canvas
 * (Guided First Run W1, step 6).
 *
 * `/workspace/dashboard/:dashboardName` renders <Workspace> → <ProjectCanvas>,
 * never <Project>. Wiring the mark only to `/project/:dashboardName` left the
 * exact cohort the 2.1 exit gate measures contributing NO data point at all:
 * `OnboardingFlow.completeAndNavigate` sends a user who connected their own
 * source — the non-sample path — into the workspace, and the build-and-view
 * loop for a new dashboard is this canvas.
 *
 * Kept out of ProjectCanvas.test.jsx: that suite mocks Dashboard and drives the
 * broken-ref wiring; these need the real timeToValue module and a clean ledger
 * per test.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectCanvas from './ProjectCanvas';
import useStore from '../../../../stores/store';
import { clearEventBuffer, getEventBuffer } from '../../../onboarding/telemetry';
import { clearTimeToValueLedger } from '../../../onboarding/timeToValue';

jest.mock('../../../project/Dashboard', () => {
  const Mock = () => <div data-testid="dashboard-mock" />;
  Mock.displayName = 'MockDashboard';
  return { __esModule: true, default: Mock };
});

const SALES = {
  name: 'sales',
  config: { rows: [{ items: [{ chart: 'ref(a)' }, { chart: 'ref(b)' }] }] },
};

const renderCanvas = (dashboardName = 'sales') =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProjectCanvas projectId="proj-1" dashboardName={dashboardName} />
    </MemoryRouter>
  );

const renderedMarks = () => getEventBuffer().filter(e => e.event === 'first_dashboard_rendered');

beforeEach(() => {
  clearEventBuffer();
  clearTimeToValueLedger();
  window.localStorage.clear();
  delete window.__VISIVO_FIRST_RUN;
  delete window.__VISIVO_TELEMETRY_DISABLED;
  useStore.setState({ dashboards: [SALES] });
});

describe('first_dashboard_rendered on the workspace canvas', () => {
  test('fires when a dashboard with items mounts on the canvas', () => {
    renderCanvas();

    const [mark] = renderedMarks();
    expect(mark.props.step_index).toBe(6);
    expect(mark.props.item_count).toBe(2);
  });

  test('does not fire for an empty canvas — an empty shell is not value', () => {
    useStore.setState({ dashboards: [{ name: 'sales', config: { rows: [{ items: [] }] } }] });

    renderCanvas();

    expect(renderedMarks()).toHaveLength(0);
  });

  test('does not fire for a dashboard that is not in the project', () => {
    renderCanvas('not-a-dashboard');

    expect(renderedMarks()).toHaveLength(0);
  });

  test('counts once across the canvas and View mode — the journey has one end', () => {
    renderCanvas();
    renderCanvas();

    expect(renderedMarks()).toHaveLength(1);
  });

  test('from_sample comes from the server-named samples here too', () => {
    window.__VISIVO_FIRST_RUN = {
      journey_id: 'J-1',
      started_at_ms: Date.now() - 1000,
      install_age_ms: 1000,
      machine_id: 'm-1',
      steps: {},
      sample_dashboards: ['sales'],
    };

    renderCanvas();

    expect(renderedMarks()[0].props.from_sample).toBe(true);
  });

  test('carries no dashboard name', () => {
    renderCanvas();

    expect(JSON.stringify(renderedMarks()[0].props)).not.toContain('sales');
  });

  test('emits nothing when telemetry is disabled', () => {
    window.__VISIVO_TELEMETRY_DISABLED = true;

    renderCanvas();

    expect(getEventBuffer()).toHaveLength(0);
  });
});
