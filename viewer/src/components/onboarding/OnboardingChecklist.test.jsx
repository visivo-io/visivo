import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import OnboardingChecklist from './OnboardingChecklist';
import useStore from '../../stores/store';
import { writeOnboardingState, clearOnboardingState } from './onboardingState';
import { clearEventBuffer, getEventBuffer } from './telemetry';

jest.mock('../../stores/store');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

function setStore(project) {
  useStore.mockImplementation(selector => selector({ project }));
}

beforeEach(() => {
  clearOnboardingState();
  clearEventBuffer();
  mockNavigate.mockReset();
  setStore({ project_json: { dashboards: [], sources: [] } });
});

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const renderChecklist = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <OnboardingChecklist />
    </MemoryRouter>
  );

describe('OnboardingChecklist', () => {
  test('renders nothing when onboarding has not completed', () => {
    renderChecklist();
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
  });

  test('renders after onboarding completion with progress', () => {
    writeOnboardingState({ completed_at: '2026-01-01', source_connected: true });
    renderChecklist();
    expect(screen.getByTestId('onboarding-checklist')).toBeInTheDocument();
    expect(screen.getByText(/Get started with Visivo/)).toBeInTheDocument();
    // source_connected signal flips connect_source done
    const item = screen.getByTestId('onb-checklist-connect_source');
    expect(item).toBeDisabled();
  });

  test('clicking an unfinished item navigates and emits event', () => {
    writeOnboardingState({ completed_at: '2026-01-01' });
    renderChecklist();
    fireEvent.click(screen.getByTestId('onb-checklist-build_model'));
    expect(mockNavigate).toHaveBeenCalledWith('/explorer');
    const events = getEventBuffer().map(e => e.event);
    expect(events).toContain('onboarding_checklist_item_clicked');
  });

  test('dismiss persists and removes the widget', () => {
    writeOnboardingState({ completed_at: '2026-01-01' });
    const { rerender } = renderChecklist();
    fireEvent.click(screen.getByText('Dismiss'));
    rerender(
      <MemoryRouter future={ROUTER_FUTURE}>
        <OnboardingChecklist />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
  });
});
