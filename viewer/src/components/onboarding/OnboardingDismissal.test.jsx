import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Onboarding from './Onboarding';
import OnboardingChecklist from './OnboardingChecklist';
import OnboardingCoach from './OnboardingCoach';
import { buildChecklistForRole } from './onboardingManifest';
import { clearOnboardingState, readOnboardingState, writeOnboardingState } from './onboardingState';
import useStore from '../../stores/store';

jest.mock('../../stores/store');
jest.mock('./OnboardingFlow', () => () => <div data-testid="onboarding-flow" />);

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };
function expectNoPrompts() {
  for (const id of [
    'onboarding-checklist',
    'onboarding-coach',
    'onboarding-coach-chip',
    'onboarding-coach-scroll-chip',
  ]) {
    expect(screen.queryByTestId(id)).not.toBeInTheDocument();
  }
}

function seedState(extra = {}) {
  writeOnboardingState({
    completed_at: '2026-01-01',
    role: 'analytics_engineer',
    path: 'data',
    checklist_checked: buildChecklistForRole('analytics_engineer')
      .map(item => item.id)
      .filter(id => id !== 'define_metric'),
    ...extra,
  });
}

function renderPrompts(route = '/runs') {
  return render(
    <MemoryRouter initialEntries={[route]} future={ROUTER_FUTURE}>
      <button data-onb-target="metric-add-button">Add metric</button>
      <OnboardingChecklist />
      <OnboardingCoach />
    </MemoryRouter>
  );
}

beforeEach(() => {
  clearOnboardingState();
  const store = {
    project: { project_json: { sources: [], dashboards: [] } },
    isNewProject: false,
    isOnBoardingLoading: false,
  };
  useStore.mockImplementation(selector => selector(store));
});

afterEach(() => jest.restoreAllMocks());

describe('dismissing onboarding hides every prompt', () => {
  test.each([
    ['/runs', 'onboarding-coach-chip', 100],
    ['/workspace/exploration', 'onboarding-coach', 100],
    ['/workspace/exploration', 'onboarding-coach-scroll-chip', 10000],
  ])('dismiss hides prompts on %s (%s, target top=%s)', (route, coachId, top) => {
    seedState();
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top, left: 100, width: 100, height: 30, right: 200, bottom: top + 30,
    });
    const view = renderPrompts(route);
    expect(screen.getByTestId(coachId)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Dismiss'));
    expectNoPrompts();

    // Reload/remount on another route must keep the user's global dismissal.
    view.unmount();
    renderPrompts('/workspace/exploration/saved-model');
    expectNoPrompts();
  });

  test.each([{ checklist_dismissed: true }, { path: 'skipped' }])(
    'honors previously saved dismissal %j without showing a prompt', extra => {
      seedState(extra);
      renderPrompts();
      expectNoPrompts();
    }
  );

  test('persisted dismissal updates mounted prompts immediately', () => {
    seedState();
    renderPrompts();
    expect(screen.getByTestId('onboarding-coach-chip')).toBeInTheDocument();
    act(() => writeOnboardingState({ ...readOnboardingState(), checklist_dismissed: true }));
    expectNoPrompts();
  });

  test.each([{ checklist_dismissed: true }, { path: 'skipped' }])(
    'a fresh project does not clear a saved opt-out %j', extra => {
      seedState(extra);
      const before = readOnboardingState();
      useStore.mockImplementation(selector => selector({ isNewProject: true }));
      render(
        <MemoryRouter future={ROUTER_FUTURE}>
          <Onboarding />
        </MemoryRouter>
      );
      expect(screen.queryByTestId('onboarding-flow')).not.toBeInTheDocument();
      expect(readOnboardingState()).toEqual(before);
    }
  );
});
