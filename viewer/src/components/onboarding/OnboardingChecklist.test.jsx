import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    // source_connected signal flips connect_source done; the row is no
    // longer keyboard-actionable and shows aria-disabled.
    const item = screen.getByTestId('onb-checklist-connect_source');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveClass('onb-checklist__item--done');
  });

  test('clicking an unfinished item navigates and emits event', () => {
    writeOnboardingState({ completed_at: '2026-01-01' });
    renderChecklist();
    fireEvent.click(screen.getByTestId('onb-checklist-build_model'));
    expect(mockNavigate).toHaveBeenCalledWith('/workspace/exploration');
    const events = getEventBuffer().map(e => e.event);
    expect(events).toContain('onboarding_checklist_item_clicked');
  });

  // D8 (e2e-gap-review.md delta pass): `build_model`'s first coach-mark
  // target (`query-chip-add`) only exists inside an open exploration tab,
  // never on the bare `/workspace/exploration` gallery route. These tests
  // lock in the mint-then-navigate fix on `handleItemClick`.
  describe('mintsExploration items (D8 fix)', () => {
    test('clicking build_model mints a fresh exploration and navigates straight to its own route', async () => {
      writeOnboardingState({ completed_at: '2026-01-01' });
      const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_abc123' });
      useStore.mockImplementation(selector =>
        selector({
          project: { project_json: { dashboards: [], sources: [] } },
          createExploration,
        })
      );
      renderChecklist();
      fireEvent.click(screen.getByTestId('onb-checklist-build_model'));
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/workspace/exploration/exp_abc123')
      );
      expect(createExploration).toHaveBeenCalled();
      // Never navigated to the bare gallery route in this success path.
      expect(mockNavigate).not.toHaveBeenCalledWith('/workspace/exploration');
    });

    test('clicking build_model fails open to the bare gallery route when minting fails', async () => {
      writeOnboardingState({ completed_at: '2026-01-01' });
      const createExploration = jest.fn().mockResolvedValue({ success: false, error: 'boom' });
      useStore.mockImplementation(selector =>
        selector({
          project: { project_json: { dashboards: [], sources: [] } },
          createExploration,
        })
      );
      renderChecklist();
      fireEvent.click(screen.getByTestId('onb-checklist-build_model'));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workspace/exploration'));
    });

    test('clicking a non-mintsExploration item (connect_source) never calls createExploration', () => {
      writeOnboardingState({ completed_at: '2026-01-01' });
      const createExploration = jest.fn();
      useStore.mockImplementation(selector =>
        selector({
          project: { project_json: { dashboards: [], sources: [] } },
          createExploration,
        })
      );
      renderChecklist();
      fireEvent.click(screen.getByTestId('onb-checklist-connect_source'));
      expect(mockNavigate).toHaveBeenCalledWith('/editor');
      expect(createExploration).not.toHaveBeenCalled();
    });
  });

  test('clicking the empty circle manually marks the row done', () => {
    writeOnboardingState({ completed_at: '2026-01-01' });
    renderChecklist();
    // build_model is not auto-complete in this state.
    const row = screen.getByTestId('onb-checklist-build_model');
    expect(row).not.toHaveAttribute('aria-disabled', 'true');
    const check = screen.getByTestId('onb-row-check-build_model');
    fireEvent.click(check);
    // Row should flip to done after the manual check.
    expect(screen.getByTestId('onb-checklist-build_model')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    // Click did not propagate to the row click handler (no navigate).
    expect(mockNavigate).not.toHaveBeenCalled();
    const events = getEventBuffer().map(e => e.event);
    expect(events).toContain('onboarding_checklist_item_manually_checked');
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
