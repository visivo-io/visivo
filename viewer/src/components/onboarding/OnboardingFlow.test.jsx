import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import OnboardingFlow, { sampleDestination } from './OnboardingFlow';
import useStore from '../../stores/store';
import { clearOnboardingState, readOnboardingState, writeOnboardingState } from './onboardingState';
import { clearEventBuffer, getEventBuffer } from './telemetry';
import { importProjectFile, listProjectFiles, uploadProjectFile } from '../../api/projectFiles';

const CSV_FORMAT = {
  format: 'csv',
  label: 'CSV',
  extensions: ['.csv', '.tsv'],
  source_type: 'csv',
  options: ['header', 'delimiter', 'encoding'],
};
const VERSION = { path: 'files/Sales_Q3.csv', filename: 'Sales_Q3.csv', version_id: 'fv_1' };
let storeState;

jest.mock('../../stores/store');
jest.mock('../../api/projectFiles');
jest.mock('../views/common/SourceEditForm', () => ({ onSave }) => {
  const [error, setError] = require('react').useState(null);
  return (
    <div data-testid="source-edit-form">
      <button
        onClick={async () => {
          const result = await onSave('source', 'demo', { type: 'postgresql', name: 'demo' });
          setError(result?.success ? null : result?.error);
        }}
      >
        mock-connect
      </button>
      {error && <p data-testid="form-error">{error}</p>}
    </div>
  );
});

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  jest.clearAllMocks();
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

  storeState = {
    project: { project_dir: '/tmp/demo', name: 'Quickstart Visivo' },
    fetchProject: jest.fn().mockResolvedValue(undefined),
    saveSource: jest.fn().mockResolvedValue({ success: true }),
    fetchSources: jest.fn().mockResolvedValue(undefined),
    sources: [{ name: 'sales_q3' }],
  };
  useStore.mockImplementation(selector => selector(storeState));
  useStore.getState = () => storeState;

  listProjectFiles.mockResolvedValue({ files: [], formats: [CSV_FORMAT], max_bytes: 104857600 });
  uploadProjectFile.mockResolvedValue(VERSION);
  importProjectFile.mockResolvedValue({
    ok: true,
    result: { file: VERSION, source: { name: 'sales_q3_2', config: { type: 'csv' } }, tables: [] },
  });
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

const startTour = (role = 'analytics_engineer') => {
  fireEvent.click(screen.getByTestId('onb-start-tour'));
  fireEvent.click(screen.getByTestId(`onb-role-${role}`));
  fireEvent.click(screen.getByTestId('onb-role-continue'));
};

const openExample = () => fireEvent.click(screen.getByTestId('onb-path-example'));

const pickSample = name => {
  openExample();
  fireEvent.click(screen.getByTestId(`onb-sample-${name}`));
};

const openUpload = () => {
  fireEvent.click(screen.getByTestId('onb-path-data'));
  fireEvent.click(screen.getByTestId('onb-data-upload'));
};

const dropFile = file =>
  fireEvent.change(screen.getByTestId('onb-upload-input'), { target: { files: [file] } });

const salesFile = () => new File(['region,units\nWest,12\n'], 'Sales Q3.csv', { type: 'text/csv' });

const connectDatabase = () => {
  fireEvent.click(screen.getByTestId('onb-path-data'));
  fireEvent.click(screen.getByTestId('onb-data-connect'));
};

describe('OnboardingFlow', () => {
  test('opens on Example and Your data, with neither chosen and no progress bar', () => {
    renderFlow();
    expect(screen.getByTestId('onb-step-start')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Start with something to explore.' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('onb-path-example')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('onb-path-data')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('onb-sample-ev-sales')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onb-data-connect')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-progress')).not.toBeInTheDocument();
    expect(getEventBuffer().map(e => e.event)).toContain('onboarding_data_seen');
  });

  test('Example opens every sample and moves focus to its heading', () => {
    renderFlow();
    openExample();
    expect(screen.getByTestId('onb-path-example')).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['ev-sales', 'github-releases', 'college-football']) {
      expect(screen.getByTestId(`onb-sample-${name}`)).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Pick an example' })).toHaveFocus();
    expect(screen.getByTestId('onb-sample-ev-sales')).toHaveTextContent('Suggested');
    expect(screen.getByTestId('onb-sample-github-releases')).not.toHaveTextContent('Suggested');
  });

  test('Your data offers a database connection, and Example stays one click away', () => {
    renderFlow();
    fireEvent.click(screen.getByTestId('onb-path-data'));
    expect(screen.getByTestId('onb-data-connect')).toHaveTextContent('Connect a data source');
    expect(screen.getByRole('heading', { name: 'How would you like to add data?' })).toHaveFocus();
    expect(screen.queryByTestId('onb-sample-ev-sales')).not.toBeInTheDocument();

    openExample();
    expect(screen.getByTestId('onb-path-data')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('onb-sample-ev-sales')).toBeInTheDocument();
  });

  describe('upload a data file', () => {
    test('Your data offers an upload, and Back returns to the two choices', async () => {
      renderFlow();
      openUpload();
      expect(screen.getByRole('heading', { name: 'Upload a data file' })).toBeInTheDocument();
      expect(await screen.findByText('CSV files up to 100 MB')).toBeInTheDocument();
      expect(screen.getByTestId('onb-upload-input')).toHaveAttribute('accept', '.csv,.tsv');

      fireEvent.click(screen.getByTestId('onb-upload-back'));
      expect(screen.getByTestId('onb-data-connect')).toBeInTheDocument();
    });

    test('a dropped file imports at once and opens the explorer on the new source', async () => {
      renderFlow();
      openUpload();
      await screen.findByText('CSV files up to 100 MB');
      dropFile(salesFile());

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/workspace/exploration', { replace: true })
      );
      expect(uploadProjectFile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sales Q3.csv' }),
        expect.objectContaining({ projectId: null })
      );
      expect(importProjectFile).toHaveBeenCalledWith({
        path: 'files/Sales_Q3.csv',
        versionId: 'fv_1',
        sourceName: 'sales_q3_2',
        projectId: null,
      });
      expect(storeState.fetchSources).toHaveBeenCalled();
      expect(readOnboardingState()).toMatchObject({ path: 'data', source_connected: true });
      const succeeded = getEventBuffer().find(e => e.event === 'onboarding_data_connect_succeeded');
      expect(succeeded.props).toMatchObject({ source_type: 'csv' });
    });

    test('shows where the file is going while it imports', async () => {
      importProjectFile.mockReturnValue(new Promise(() => {}));
      renderFlow();
      openUpload();
      await screen.findByText('CSV files up to 100 MB');
      dropFile(salesFile());

      expect(await screen.findByText('Saved as files/Sales_Q3.csv')).toBeInTheDocument();
      expect(screen.getByText('Creating a source you can query')).toBeInTheDocument();
    });

    test('a file of an unlisted type is refused before upload', async () => {
      renderFlow();
      openUpload();
      await screen.findByText('CSV files up to 100 MB');
      dropFile(new File(['x'], 'budget.xlsx'));

      expect(await screen.findByTestId('onb-upload-error')).toHaveTextContent(
        "Visivo can't import budget.xlsx yet. Use a CSV file."
      );
      expect(uploadProjectFile).not.toHaveBeenCalled();
    });

    test('a failed import shows the reason and stays on the upload step', async () => {
      importProjectFile.mockResolvedValue({ ok: false, error: 'Could not read files/x.csv' });
      renderFlow();
      openUpload();
      await screen.findByText('CSV files up to 100 MB');
      dropFile(salesFile());

      expect(await screen.findByTestId('onb-upload-error')).toHaveTextContent(
        'Could not read files/x.csv'
      );
      expect(screen.getByTestId('onb-upload-drop')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('Cancel stops waiting and adds nothing to the flow', async () => {
      uploadProjectFile.mockReturnValue(new Promise(() => {}));
      renderFlow();
      openUpload();
      await screen.findByText('CSV files up to 100 MB');
      dropFile(salesFile());

      fireEvent.click(await screen.findByText('Cancel'));
      expect(screen.getByTestId('onb-upload-drop')).toBeInTheDocument();
      expect(importProjectFile).not.toHaveBeenCalled();
    });
  });

  test('never claims more source types than the source picker offers', () => {
    renderFlow();
    expect(screen.queryByText(/\+ ?\d+ more/)).not.toBeInTheDocument();
  });

  test('start empty navigates to /editor with telemetry and dismisses the checklist', () => {
    renderFlow();
    fireEvent.click(screen.getByTestId('onb-start-empty'));
    expect(mockNavigate).toHaveBeenCalledWith('/editor', { replace: true });
    expect(getEventBuffer().map(e => e.event)).toContain('onboarding_opt_out_clicked');
    expect(readOnboardingState()).toMatchObject({
      path: 'skipped',
      checklist_dismissed: true,
    });
  });

  test('ev-sales is the suggested sample when no role is chosen', () => {
    renderFlow();
    openExample();
    expect(
      within(screen.getByTestId('onb-sample-ev-sales')).getByText('Suggested')
    ).toBeInTheDocument();
  });

  test('a stale step index from an older flow still opens on the start screen', () => {
    writeOnboardingState({ last_step_idx: 11 });
    renderFlow();
    expect(screen.getByTestId('onb-step-start')).toBeInTheDocument();
  });

  describe('concept tour', () => {
    test('role selection unlocks continue and stores role', () => {
      renderFlow();
      fireEvent.click(screen.getByTestId('onb-start-tour'));
      const continueBtn = screen.getByTestId('onb-role-continue');
      expect(continueBtn).toBeDisabled();
      fireEvent.click(screen.getByTestId('onb-role-analytics_engineer'));
      expect(continueBtn).not.toBeDisabled();
      fireEvent.click(continueBtn);
      expect(screen.getByTestId('onb-step-concept-1')).toBeInTheDocument();
      expect(getEventBuffer().map(e => e.event)).toContain('onboarding_role_chosen');
    });

    test('walks all 7 concepts and returns to the start screen', () => {
      renderFlow();
      startTour('software_engineer');
      for (let i = 1; i <= 7; i++) {
        expect(screen.getByTestId(`onb-step-concept-${i}`)).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('onb-concept-continue'));
      }
      expect(screen.getByTestId('onb-step-start')).toBeInTheDocument();
    });

    test('the last concept offers to pick a sample', () => {
      renderFlow();
      startTour();
      for (let i = 1; i < 7; i++) fireEvent.click(screen.getByTestId('onb-concept-continue'));
      expect(screen.getByTestId('onb-concept-continue')).toHaveTextContent('Pick a sample');
    });

    test('the chosen role picks the suggested sample', () => {
      renderFlow();
      startTour('software_engineer');
      for (let i = 0; i < 7; i++) fireEvent.click(screen.getByTestId('onb-concept-continue'));
      openExample();
      const tile = screen.getByTestId('onb-sample-github-releases');
      expect(within(tile).getByText('Suggested')).toBeInTheDocument();
    });

    test('the Back button on a concept returns to the previous step with telemetry', () => {
      renderFlow();
      startTour('software_engineer');
      expect(screen.getByTestId('onb-step-concept-1')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('onb-back'));
      expect(screen.getByTestId('onb-role-grid')).toBeInTheDocument();
      expect(getEventBuffer().map(e => e.event)).toContain('onboarding_concept_back_clicked');
    });

    test('ArrowLeft goes back a step, but not from the start screen', () => {
      renderFlow();
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByTestId('onb-step-start')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('onb-start-tour'));
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByTestId('onb-step-start')).toBeInTheDocument();
    });

    test('the mini-DAG jumps back to an earlier concept', () => {
      renderFlow();
      startTour('software_engineer');
      fireEvent.click(screen.getByTestId('onb-concept-continue'));
      expect(screen.getByTestId('onb-step-concept-2')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Go back to Source'));
      expect(screen.getByTestId('onb-step-concept-1')).toBeInTheDocument();
    });

    test('switching role clears previously dismissed coach hints', () => {
      writeOnboardingState({ coach_dismissed: ['deploy_hint'] });
      renderFlow();
      fireEvent.click(screen.getByTestId('onb-start-tour'));
      fireEvent.click(screen.getByTestId('onb-role-analytics_engineer'));
      expect(readOnboardingState().coach_dismissed).toEqual([]);
    });
  });

  describe('sample import', () => {
    test('one click loads the sample and opens its dashboard', async () => {
      renderFlow();
      pickSample('ev-sales');
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/project/EV%20Sales%20Overview', {
          replace: true,
        })
      );
      const loadCall = global.fetch.mock.calls.find(
        ([url]) => url === '/api/project/load_example/'
      );
      expect(JSON.parse(loadCall[1].body)).toMatchObject({
        project_dir: '/tmp/demo',
        project_name: 'Quickstart Visivo',
        example_type: 'ev-sales',
      });
      const persisted = readOnboardingState();
      expect(persisted).toMatchObject({
        path: 'sample',
        sample: 'ev-sales',
        destination: '/project/EV%20Sales%20Overview',
      });
      expect(persisted.completed_at).toBeTruthy();
      const events = getEventBuffer().map(e => e.event);
      expect(events).toEqual(
        expect.arrayContaining(['onboarding_sample_picked', 'onboarding_completed'])
      );
    });

    test('shows a building status and disables every choice while the sample loads', async () => {
      global.fetch = jest.fn(() => new Promise(() => {}));
      renderFlow();
      pickSample('college-football');
      expect(await screen.findByTestId('onb-sample-loading')).toHaveTextContent(
        'Building College Football'
      );
      expect(screen.getByTestId('onb-sample-ev-sales')).toBeDisabled();
      expect(screen.getByTestId('onb-path-data')).toBeDisabled();
      expect(screen.getByTestId('onb-start-empty')).toBeDisabled();
    });

    test('a failed import surfaces a dismissible error banner and stays on start', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'Import exploded' }) })
      );
      renderFlow();
      pickSample('github-releases');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Import exploded');
      expect(screen.getByTestId('onb-step-start')).toBeInTheDocument();
      expect(screen.getByTestId('onb-sample-github-releases')).not.toBeDisabled();
      expect(mockNavigate).not.toHaveBeenCalled();

      fireEvent.click(within(alert).getByText('✕'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('suppresses the hard page reload while mounted and restores it after', () => {
      window.__VISIVO_SOFT_RELOAD__ = undefined;
      const { unmount } = renderFlow();
      expect(window.__VISIVO_SOFT_RELOAD__).toBe(true);
      unmount();
      expect(window.__VISIVO_SOFT_RELOAD__).toBeUndefined();
    });

    test('sampleDestination falls back to the dashboard list', () => {
      expect(sampleDestination({ dashboard: 'A/B Test' })).toBe('/project/A%2FB%20Test');
      expect(sampleDestination({})).toBe('/project');
    });
  });

  describe('source connect flow', () => {
    test('closes the source modal via the ✕ button and the backdrop', () => {
      const { container } = renderFlow();
      connectDatabase();
      expect(screen.getByTestId('onb-source-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Close'));
      expect(screen.queryByTestId('onb-source-modal')).not.toBeInTheDocument();

      connectDatabase();
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      fireEvent.click(container.querySelector('.onb-modal-backdrop'));
      expect(screen.queryByTestId('onb-source-modal')).not.toBeInTheDocument();
    });

    test('Escape closes the source modal, but not while a save is in flight', async () => {
      renderFlow();
      connectDatabase();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('onb-source-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('onb-step-start')).toBeInTheDocument();

      storeState.saveSource.mockReturnValue(new Promise(() => {}));
      connectDatabase();
      fireEvent.click(screen.getByText('mock-connect'));
      await waitFor(() => expect(storeState.saveSource).toHaveBeenCalled());
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByTestId('onb-source-modal')).toBeInTheDocument();
    });

    test('a connected source is saved as a draft and goes straight to the explorer', async () => {
      renderFlow();
      connectDatabase();
      fireEvent.click(screen.getByText('mock-connect'));
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/workspace/exploration', { replace: true })
      );
      expect(storeState.saveSource).toHaveBeenCalledWith('demo', {
        type: 'postgresql',
        name: 'demo',
      });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(readOnboardingState()).toMatchObject({ path: 'data', source_connected: true });
      expect(getEventBuffer().map(e => e.event)).toEqual(
        expect.arrayContaining(['onboarding_data_connect_succeeded', 'onboarding_completed'])
      );
    });

    test('a failed save keeps the modal open and shows the reason in the form', async () => {
      storeState.saveSource.mockResolvedValue({ success: false, error: 'bad creds' });
      renderFlow();
      connectDatabase();
      fireEvent.click(screen.getByText('mock-connect'));

      expect(await screen.findByTestId('form-error')).toHaveTextContent('bad creds');
      expect(screen.getByTestId('onb-source-modal')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
