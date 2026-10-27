import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';

import OnboardingCoach from './OnboardingCoach';
import { buildChecklistForRole } from './onboardingManifest';
import { clearOnboardingState, writeOnboardingState } from './onboardingState';
import useStore from '../../stores/store';
import useEscapeToClose from '../../hooks/useEscapeToClose';
import { clearEventBuffer, getEventBuffer } from './telemetry';
import { readOnboardingState } from './onboardingState';

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

const startOn = itemId => {
  const all = buildChecklistForRole('analytics_engineer');
  writeOnboardingState({
    completed_at: '2026-01-01',
    role: 'analytics_engineer',
    path: 'data',
    checklist_checked: all.map(i => i.id).filter(id => id !== itemId),
  });
  return all.find(i => i.id === itemId);
};

const renderCoachAt = (path, routes) =>
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <Routes>{routes}</Routes>
      <OnboardingCoach />
    </MemoryRouter>
  );

const events = () => getEventBuffer().map(e => e.event);

describe('OnboardingCoach', () => {
  beforeEach(() => clearEventBuffer());

  test('renders nothing until onboarding is completed', () => {
    renderCoachAt('/workspace', [
      <Route key="w" path="/workspace" element={<button data-onb-target="source-create-button" />} />,
    ]);
    expect(screen.queryByTestId('onboarding-coach')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-coach-chip')).not.toBeInTheDocument();
  });

  test('Escape dismisses the coach and remembers the dismissal', () => {
    const item = startOn('connect_source');
    renderCoachAt('/workspace', [
      <Route key="w" path="/workspace" element={<button data-onb-target={item.target}>Go</button>} />,
    ]);
    expect(screen.getByTestId('onboarding-coach-connect_source')).toBeInTheDocument();
    expect(events()).toContain('onboarding_coach_shown');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('onboarding-coach')).not.toBeInTheDocument();
    expect(readOnboardingState().coach_dismissed).toEqual(['connect_source']);
    expect(events()).toContain('onboarding_coach_dismissed_per_item');
  });

  test('a layer opened over the coach takes the first Escape', () => {
    const item = startOn('connect_source');
    const onClose = jest.fn();
    const Layer = () => {
      const [open, setOpen] = React.useState(false);
      useEscapeToClose(open, () => {
        onClose();
        setOpen(false);
      });
      return (
        <button data-onb-target={item.target} onClick={() => setOpen(true)}>
          open layer
        </button>
      );
    };
    renderCoachAt('/workspace', [<Route key="w" path="/workspace" element={<Layer />} />]);
    fireEvent.click(screen.getByText('open layer'));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('onboarding-coach')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('onboarding-coach')).not.toBeInTheDocument();
  });

  test('"I\'ve got this" dismisses the coach', () => {
    const item = startOn('connect_source');
    renderCoachAt('/workspace', [
      <Route key="w" path="/workspace" element={<button data-onb-target={item.target}>Go</button>} />,
    ]);
    fireEvent.click(screen.getByRole('button', { name: /Dismiss the onboarding hint/ }));
    expect(screen.queryByTestId('onboarding-coach')).not.toBeInTheDocument();
  });

  test('clicking the highlighted target records the conversion', () => {
    const item = startOn('connect_source');
    renderCoachAt('/workspace', [
      <Route key="w" path="/workspace" element={<button data-onb-target={item.target}>Go</button>} />,
    ]);
    fireEvent.click(screen.getByText('Go'));
    expect(events()).toContain('onboarding_coach_target_clicked');
  });

  test('off route, a chip links back to the item route', () => {
    const item = startOn('connect_source');
    renderCoachAt('/elsewhere', [
      <Route key="e" path="/elsewhere" element={<div />} />,
      <Route key="w" path="/workspace" element={<button data-onb-target={item.target}>Go</button>} />,
    ]);
    fireEvent.click(screen.getByTestId('onboarding-coach-chip'));
    expect(events()).toContain('onboarding_coach_chip_clicked');
    expect(screen.getByTestId('onboarding-coach-connect_source')).toBeInTheDocument();
  });

  test.each([
    ['up', -200],
    ['down', 5000],
  ])('a target scrolled offscreen (%s) shows a chip that scrolls it back', (dir, top) => {
    HTMLElement.prototype.getBoundingClientRect.mockReturnValue({
      top, left: 100, width: 100, height: 30, right: 200, bottom: top + 30,
    });
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const item = startOn('connect_source');
    renderCoachAt('/workspace', [
      <Route key="w" path="/workspace" element={<button data-onb-target={item.target}>Go</button>} />,
    ]);
    const chip = screen.getByTestId('onboarding-coach-scroll-chip');
    expect(chip).toHaveAttribute('data-onb-scroll-dir', dir);
    fireEvent.click(chip);
    expect(scrollIntoView).toHaveBeenCalled();
    delete Element.prototype.scrollIntoView;
  });

  test('places the tooltip above a target near the bottom of the window', () => {
    const top = window.innerHeight - 40;
    HTMLElement.prototype.getBoundingClientRect.mockReturnValue({
      top, left: 100, width: 100, height: 30, right: 200, bottom: top + 30,
    });
    const item = startOn('connect_source');
    renderCoachAt('/workspace', [
      <Route key="w" path="/workspace" element={<button data-onb-target={item.target}>Go</button>} />,
    ]);
    expect(screen.getByTestId('onboarding-coach-connect_source').className).toContain(
      'onb-coach__tooltip--above'
    );
  });

  test('a multi-step item shows which step the user is on', () => {
    const item = startOn('build_model');
    renderCoachAt('/workspace/exploration', [
      <Route
        key="x"
        path="/workspace/exploration"
        element={<button data-onb-target={item.steps[0].target}>Add</button>}
      />,
    ]);
    expect(screen.getByLabelText(`Step 1 of ${item.steps.length}`)).toBeInTheDocument();
  });

  test('warns when the target never mounts', () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    startOn('connect_source');
    renderCoachAt('/workspace', [<Route key="w" path="/workspace" element={<div />} />]);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('connect_source'));
    expect(screen.queryByTestId('onboarding-coach')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  test('picks up a late target and re-measures on resize', async () => {
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb();
      return 1;
    });
    const item = startOn('connect_source');
    const Late = () => {
      const [shown, setShown] = React.useState(false);
      return (
        <>
          <button onClick={() => setShown(true)}>mount target</button>
          {shown && <button data-onb-target={item.target}>Go</button>}
        </>
      );
    };
    renderCoachAt('/workspace', [<Route key="w" path="/workspace" element={<Late />} />]);
    expect(screen.queryByTestId('onboarding-coach')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(readOnboardingState().coach_dismissed).toBeUndefined();

    fireEvent.click(screen.getByText('mount target'));
    expect(await screen.findByTestId('onboarding-coach')).toBeInTheDocument();

    HTMLElement.prototype.getBoundingClientRect.mockReturnValue({
      top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.queryByTestId('onboarding-coach')).not.toBeInTheDocument();
  });
});
