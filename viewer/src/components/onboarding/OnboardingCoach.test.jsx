import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';

import OnboardingCoach from './OnboardingCoach';
import { buildChecklistForRole } from './onboardingManifest';
import { clearOnboardingState, writeOnboardingState } from './onboardingState';
import useStore from '../../stores/store';

jest.mock('../../stores/store');

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

beforeEach(() => {
  clearOnboardingState();
  const store = { project: { project_json: { sources: [], dashboards: [] } } };
  useStore.mockImplementation(selector => selector(store));
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 100, left: 100, width: 100, height: 30, right: 200, bottom: 130,
  });
});

afterEach(() => jest.restoreAllMocks());

test.each(['deploy', 'connect_source'])(
  'following /editor lands on the Workspace, where the coach anchors %s',
  itemId => {
    const item = buildChecklistForRole('analytics_engineer').find(i => i.id === itemId);
    writeOnboardingState({
      completed_at: '2026-01-01',
      role: 'analytics_engineer',
      path: 'data',
      checklist_checked: buildChecklistForRole('analytics_engineer')
        .map(i => i.id)
        .filter(id => id !== itemId),
    });
    render(
      <MemoryRouter initialEntries={['/editor']} future={ROUTER_FUTURE}>
        <Routes>
          <Route path="/editor" element={<Navigate to="/workspace?view=project" replace />} />
          <Route path="/workspace" element={<button data-onb-target={item.target}>Go</button>} />
        </Routes>
        <OnboardingCoach />
      </MemoryRouter>
    );
    expect(screen.getByTestId('onboarding-coach')).toBeInTheDocument();
    expect(screen.getByTestId(`onboarding-coach-${itemId}`)).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-coach-chip')).not.toBeInTheDocument();
  }
);
