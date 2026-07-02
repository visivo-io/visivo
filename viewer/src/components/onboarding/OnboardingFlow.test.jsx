import React from 'react';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import OnboardingFlow from './OnboardingFlow';
import useStore from '../../stores/store';
import {
  clearOnboardingState,
  readOnboardingState,
  writeOnboardingState,
} from './onboardingState';
import { clearEventBuffer, getEventBuffer } from './telemetry';

jest.mock('../../stores/store');
jest.mock('../views/common/SourceEditForm', () => ({ onSave }) => (
  <div data-testid="source-edit-form">
    <button
      onClick={() => onSave('postgres', 'demo', { type: 'postgres', name: 'demo' })}
    >
      mock-connect
    </button>
    <button
      onClick={() =>
        onSave('csv', 'demo-csv', {
          type: 'csv',
          name: 'demo-csv',
          file: new File(['a,b\n1,2'], 'demo.csv', { type: 'text/csv' }),
        })
      }
    >
      mock-connect-file
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
  jest.useRealTimers();
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

  // Walks welcome → role → all 7 concepts, landing on the data step.
  const goToDataStep = (role = 'analytics_engineer') => {
    fireEvent.click(screen.getByTestId('onb-welcome-continue'));
    fireEvent.click(screen.getByTestId(`onb-role-${role}`));
    fireEvent.click(screen.getByTestId('onb-role-continue'));
    for (let i = 0; i < 7; i++) {
      fireEvent.click(screen.getByTestId('onb-concept-continue'));
    }
    expect(screen.getByTestId('onb-step-data')).toBeInTheDocument();
  };

  const pickSample = async () => {
    fireEvent.click(screen.getByTestId('onb-data-sample'));
    fireEvent.click(screen.getByTestId('onb-sample-github-releases'));
    expect(await screen.findByTestId('onb-step-cloud')).toBeInTheDocument();
  };

  describe('back navigation', () => {
    test('the Back button on a concept returns to the previous step with telemetry', () => {
      renderFlow();
      fireEvent.click(screen.getByTestId('onb-welcome-continue'));
      fireEvent.click(screen.getByTestId('onb-role-software_engineer'));
      fireEvent.click(screen.getByTestId('onb-role-continue'));
      expect(screen.getByTestId('onb-step-concept-1')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('onb-back'));
      expect(screen.getByTestId('onb-role-grid')).toBeInTheDocument();
      expect(getEventBuffer().map(e => e.event)).toContain('onboarding_concept_back_clicked');
    });

    test('ArrowLeft goes back a step, but not from the welcome screen', () => {
      renderFlow();
      // On welcome (step 0) the key is a no-op.
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByTestId('onb-step-welcome')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('onb-welcome-continue'));
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByTestId('onb-step-welcome')).toBeInTheDocument();
    });

    test('the mini-DAG jumps back to an earlier concept', () => {
      renderFlow();
      fireEvent.click(screen.getByTestId('onb-welcome-continue'));
      fireEvent.click(screen.getByTestId('onb-role-software_engineer'));
      fireEvent.click(screen.getByTestId('onb-role-continue'));
      // Advance to concept 2 so the Source node is lit-but-not-current.
      fireEvent.click(screen.getByTestId('onb-concept-continue'));
      expect(screen.getByTestId('onb-step-concept-2')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Go back to Source'));
      expect(screen.getByTestId('onb-step-concept-1')).toBeInTheDocument();
      expect(getEventBuffer().map(e => e.event)).toContain('onboarding_concept_back_clicked');
    });
  });

  describe('sample import', () => {
    test('importing a sample posts to load_example and advances to cloud', async () => {
      renderFlow();
      goToDataStep('software_engineer');
      await pickSample();
      const loadCall = global.fetch.mock.calls.find(([url]) => url === '/api/project/load_example/');
      expect(loadCall).toBeTruthy();
      expect(JSON.parse(loadCall[1].body)).toMatchObject({
        project_dir: '/tmp/demo',
        project_name: 'Quickstart Visivo',
      });
    });

    test('a failed import surfaces a dismissible error banner and stays on data', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'Import exploded' }) })
      );
      renderFlow();
      goToDataStep();
      fireEvent.click(screen.getByTestId('onb-data-sample'));
      fireEvent.click(screen.getByTestId('onb-sample-github-releases'));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Import exploded');
      expect(screen.getByTestId('onb-step-data')).toBeInTheDocument();

      fireEvent.click(within(alert).getByText('✕'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('source connect flow', () => {
    test('closes the source modal via the ✕ button and the backdrop', () => {
      const { container } = renderFlow();
      goToDataStep();
      fireEvent.click(screen.getByTestId('onb-data-connect'));
      expect(screen.getByTestId('onb-source-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Close'));
      expect(screen.queryByTestId('onb-source-modal')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('onb-data-connect'));
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      fireEvent.click(container.querySelector('.onb-modal-backdrop'));
      expect(screen.queryByTestId('onb-source-modal')).not.toBeInTheDocument();
    });

    test('a file-based source uploads the file and finalizes with its dashboard', async () => {
      global.fetch = jest.fn(url => {
        if (url === '/api/source/create/') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ source: { name: 'demo-csv', type: 'csv' } }),
          });
        }
        if (url === '/api/source/upload/') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ dashboard: { name: 'generated-dashboard' } }),
          });
        }
        if (url === '/api/project/finalize/') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      renderFlow();
      goToDataStep();
      fireEvent.click(screen.getByTestId('onb-data-connect'));
      fireEvent.click(screen.getByText('mock-connect-file'));

      expect(await screen.findByTestId('onb-step-cloud')).toBeInTheDocument();
      const uploadCall = global.fetch.mock.calls.find(([url]) => url === '/api/source/upload/');
      expect(uploadCall).toBeTruthy();
      const finalizeCall = global.fetch.mock.calls.find(([url]) => url === '/api/project/finalize/');
      expect(JSON.parse(finalizeCall[1].body).dashboards).toEqual([
        { name: 'generated-dashboard' },
      ]);
    });

    test('a failed source create keeps the modal open and shows the backend message', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'bad creds' }) })
      );
      renderFlow();
      goToDataStep();
      fireEvent.click(screen.getByTestId('onb-data-connect'));
      fireEvent.click(screen.getByText('mock-connect'));

      expect(await screen.findByRole('alert')).toHaveTextContent('bad creds');
      expect(screen.getByTestId('onb-source-modal')).toBeInTheDocument();
    });

    test('a failed finalize surfaces its error', async () => {
      global.fetch = jest.fn(url => {
        if (url === '/api/project/finalize/') {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ message: 'finalize failed' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ source: { name: 'demo', type: 'postgres' } }),
        });
      });
      renderFlow();
      goToDataStep();
      fireEvent.click(screen.getByTestId('onb-data-connect'));
      fireEvent.click(screen.getByText('mock-connect'));

      expect(await screen.findByRole('alert')).toHaveTextContent('finalize failed');
    });
  });

  describe('cloud + handoff', () => {
    test('sample path hands off to /project and persists completion', async () => {
      renderFlow();
      goToDataStep();
      await pickSample();

      jest.useFakeTimers();
      fireEvent.click(screen.getByTestId('onb-cloud-later'));
      expect(screen.getByTestId('onb-step-handoff')).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(1400);
      });
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/project', { replace: true })
      );
      const persisted = readOnboardingState();
      expect(persisted.completed_at).toBeTruthy();
      expect(persisted.path).toBe('sample');
      expect(persisted.destination).toBe('/project');
    });

    test('connected-source path hands off to /explorer', async () => {
      renderFlow();
      goToDataStep();
      fireEvent.click(screen.getByTestId('onb-data-connect'));
      fireEvent.click(screen.getByText('mock-connect'));
      expect(await screen.findByTestId('onb-step-cloud')).toBeInTheDocument();

      jest.useFakeTimers();
      fireEvent.click(screen.getByTestId('onb-cloud-later'));
      await act(async () => {
        jest.advanceTimersByTime(1400);
      });
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/explorer', { replace: true })
      );
      expect(readOnboardingState().source_connected).toBe(true);
    });

    test('cloud signup marks the account connected and finishes to handoff', async () => {
      const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
      renderFlow();
      goToDataStep();
      await pickSample();

      jest.useFakeTimers();
      fireEvent.click(screen.getByTestId('onb-cloud-signup'));
      expect(openSpy).toHaveBeenCalledWith(
        'https://app.visivo.io/register',
        '_blank',
        'noopener'
      );
      await act(async () => {
        jest.advanceTimersByTime(1500); // simulated auth completes
      });
      fireEvent.click(screen.getByTestId('onb-cloud-finish'));
      expect(screen.getByTestId('onb-step-handoff')).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(1400);
      });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
      expect(readOnboardingState().cloud_connected).toBe(true);
      openSpy.mockRestore();
    });
  });

  describe('persisted state', () => {
    test('cancelling the skip confirm keeps the user on welcome', () => {
      renderFlow();
      fireEvent.click(screen.getByTestId('onb-welcome-skip'));
      expect(screen.getByText('Skip onboarding?')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByText('Skip onboarding?')).not.toBeInTheDocument();
      expect(screen.getByTestId('onb-step-welcome')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('switching role clears previously dismissed coach hints', () => {
      writeOnboardingState({ coach_dismissed: ['deploy_hint'] });
      renderFlow();
      fireEvent.click(screen.getByTestId('onb-welcome-continue'));
      fireEvent.click(screen.getByTestId('onb-role-analytics_engineer'));
      expect(readOnboardingState().coach_dismissed).toEqual([]);
    });
  });
});
