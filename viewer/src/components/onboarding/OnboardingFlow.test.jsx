import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import OnboardingFlow from './OnboardingFlow';
import useStore from '../../stores/store';
import { clearOnboardingState } from './onboardingState';
import { clearEventBuffer, getEventBuffer } from './telemetry';

jest.mock('../../stores/store');
jest.mock('../new-views/common/SourceEditForm', () => ({ onSave }) => (
  <div data-testid="source-edit-form">
    <button
      onClick={() => onSave('postgres', 'demo', { type: 'postgres', name: 'demo' })}
    >
      mock-connect
    </button>
  </div>
));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  clearOnboardingState();
  clearEventBuffer();
  mockNavigate.mockReset();
  global.fetch = jest.fn(url =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          source: { name: 'demo', type: 'postgres' },
          message: 'ok',
        }),
    })
  );

  useStore.mockImplementation(selector =>
    selector({
      project: { project_json: { project_dir: '/tmp/demo', name: 'Quickstart Visivo' } },
      fetchProject: jest.fn().mockResolvedValue(undefined),
    })
  );
});

afterEach(() => {
  delete global.fetch;
});

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const renderFlow = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <OnboardingFlow />
    </MemoryRouter>
  );

describe('OnboardingFlow', () => {
  test('renders welcome and progresses to role on continue', () => {
    renderFlow();
    expect(screen.getByTestId('onb-step-welcome')).toBeInTheDocument();
    expect(screen.getByText(/Welcome to Visivo/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('onb-welcome-continue'));
    expect(screen.getByTestId('onb-role-grid')).toBeInTheDocument();
  });

  test('skip-confirm flow navigates to /editor with telemetry', () => {
    renderFlow();
    fireEvent.click(screen.getByTestId('onb-welcome-skip'));
    expect(screen.getByText('Skip onboarding?')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('onb-skip-confirm'));
    expect(mockNavigate).toHaveBeenCalledWith('/editor', { replace: true });
    const events = getEventBuffer().map(e => e.event);
    expect(events).toContain('onboarding_opt_out_clicked');
  });

  test('role tile selection unlocks continue and stores role', () => {
    renderFlow();
    fireEvent.click(screen.getByTestId('onb-welcome-continue'));
    const continueBtn = screen.getByTestId('onb-role-continue');
    expect(continueBtn).toBeDisabled();
    fireEvent.click(screen.getByTestId('onb-role-analytics_engineer'));
    expect(continueBtn).not.toBeDisabled();
    fireEvent.click(continueBtn);
    expect(screen.getByTestId('onb-step-concept-1')).toBeInTheDocument();
    const events = getEventBuffer().map(e => e.event);
    expect(events).toContain('onboarding_role_chosen');
  });

  test('walks through all 7 concept screens then lands on data step', () => {
    renderFlow();
    fireEvent.click(screen.getByTestId('onb-welcome-continue'));
    fireEvent.click(screen.getByTestId('onb-role-software_engineer'));
    fireEvent.click(screen.getByTestId('onb-role-continue'));
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByTestId(`onb-step-concept-${i}`)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('onb-concept-continue'));
    }
    expect(screen.getByTestId('onb-step-data')).toBeInTheDocument();
  });

  test('software engineer sees github-releases sample marked as Suggested', () => {
    renderFlow();
    fireEvent.click(screen.getByTestId('onb-welcome-continue'));
    fireEvent.click(screen.getByTestId('onb-role-software_engineer'));
    fireEvent.click(screen.getByTestId('onb-role-continue'));
    for (let i = 0; i < 7; i++) {
      fireEvent.click(screen.getByTestId('onb-concept-continue'));
    }
    fireEvent.click(screen.getByTestId('onb-data-sample'));
    const tile = screen.getByTestId('onb-sample-github-releases');
    expect(within(tile).getByText('Suggested')).toBeInTheDocument();
  });

  test('connect-data path opens modal and proceeds to cloud step on success', async () => {
    renderFlow();
    fireEvent.click(screen.getByTestId('onb-welcome-continue'));
    fireEvent.click(screen.getByTestId('onb-role-analytics_engineer'));
    fireEvent.click(screen.getByTestId('onb-role-continue'));
    for (let i = 0; i < 7; i++) {
      fireEvent.click(screen.getByTestId('onb-concept-continue'));
    }
    fireEvent.click(screen.getByTestId('onb-data-connect'));
    expect(screen.getByTestId('onb-source-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('mock-connect'));
    expect(await screen.findByTestId('onb-step-cloud')).toBeInTheDocument();
    const events = getEventBuffer().map(e => e.event);
    expect(events).toContain('onboarding_data_connect_succeeded');
  });

  test('cloud "maybe later" advances to handoff', () => {
    renderFlow();
    fireEvent.click(screen.getByTestId('onb-welcome-continue'));
    fireEvent.click(screen.getByTestId('onb-role-other'));
    fireEvent.click(screen.getByTestId('onb-role-continue'));
    for (let i = 0; i < 7; i++) {
      fireEvent.click(screen.getByTestId('onb-concept-continue'));
    }
    fireEvent.click(screen.getByTestId('onb-data-sample'));
    // "Pick a sample" sub-screen visible
    expect(screen.getByText(/Pick a sample to start with/)).toBeInTheDocument();
  });
});
