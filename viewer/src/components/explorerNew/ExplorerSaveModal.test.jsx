import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import selectEvent from 'react-select-event';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ExplorerSaveModal from './ExplorerSaveModal';
import useStore from '../../stores/store';
import { futureFlags } from '../../router-config';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Wrap render so every test has Router context (useNavigate).
const renderModal = (props) =>
  render(
    <MemoryRouter future={futureFlags}>
      <ExplorerSaveModal {...props} />
    </MemoryRouter>
  );

jest.mock('../views/lineage/EmbeddedPill', () => {
  return function MockEmbeddedPill({ objectType, label, statusDot }) {
    return (
      <span
        data-testid={`embedded-pill-${objectType}-${label}`}
        data-status={statusDot}
      >
        {label}
      </span>
    );
  };
});

const baseState = {
  explorerModelStates: {},
  explorerInsightStates: {},
  explorerChartName: null,
  explorerChartLayout: {},
  explorerChartInsightNames: [],
  explorerDiffResult: null,
};

describe('ExplorerSaveModal', () => {
  let mockOnClose;
  let mockSaveExplorerObjects;
  let mockPlaceChart;

  beforeEach(() => {
    mockOnClose = jest.fn();
    mockNavigate.mockClear();
    sessionStorage.clear();
    mockSaveExplorerObjects = jest.fn().mockResolvedValue({ success: true, errors: [] });
    mockPlaceChart = jest.fn().mockResolvedValue({ success: true });
    useStore.setState({
      ...baseState,
      dashboards: [],
      // Stub so the modal's on-mount dashboards fetch doesn't hit the network.
      fetchDashboards: jest.fn().mockResolvedValue(undefined),
      saveExplorerObjects: mockSaveExplorerObjects,
      placeChartInDashboardSlot: mockPlaceChart,
    });
  });

  it('renders modal with title', () => {
    useStore.setState({ explorerDiffResult: { models: { new_model: 'new' } } });
    renderModal({ onClose: mockOnClose });
    expect(screen.getByTestId('explorer-save-modal')).toBeInTheDocument();
    expect(screen.getByText('Save to Project')).toBeInTheDocument();
  });

  it('shows new models with green status dot', () => {
    useStore.setState({ explorerDiffResult: { models: { new_model: 'new' } } });
    renderModal({ onClose: mockOnClose });
    const pill = screen.getByTestId('embedded-pill-model-new_model');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'new');
  });

  it('shows modified models with amber status dot', () => {
    useStore.setState({ explorerDiffResult: { models: { existing_model: 'modified' } } });
    renderModal({ onClose: mockOnClose });
    const pill = screen.getByTestId('embedded-pill-model-existing_model');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'modified');
  });

  it('does not show unchanged objects', () => {
    useStore.setState({
      explorerDiffResult: {
        models: { stable_model: null },
        insights: { stable_insight: null },
      },
    });
    renderModal({ onClose: mockOnClose });
    expect(screen.queryByTestId('embedded-pill-model-stable_model')).not.toBeInTheDocument();
    expect(screen.queryByTestId('embedded-pill-insight-stable_insight')).not.toBeInTheDocument();
  });

  it('shows new insights with green status dot', () => {
    useStore.setState({ explorerDiffResult: { insights: { new_insight: 'new' } } });
    renderModal({ onClose: mockOnClose });
    const pill = screen.getByTestId('embedded-pill-insight-new_insight');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'new');
  });

  it('shows modified insights with amber status dot', () => {
    useStore.setState({ explorerDiffResult: { insights: { existing_insight: 'modified' } } });
    renderModal({ onClose: mockOnClose });
    const pill = screen.getByTestId('embedded-pill-insight-existing_insight');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'modified');
  });

  it('cancel button calls onClose', () => {
    useStore.setState({ explorerDiffResult: { models: { m: 'new' } } });
    renderModal({ onClose: mockOnClose });
    fireEvent.click(screen.getByTestId('save-modal-cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('save button calls saveExplorerObjects', async () => {
    useStore.setState({ explorerDiffResult: { models: { m: 'new' } } });
    renderModal({ onClose: mockOnClose });
    fireEvent.click(screen.getByTestId('save-modal-confirm'));
    await waitFor(() => {
      expect(mockSaveExplorerObjects).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state during save', async () => {
    let resolvePromise;
    const slowSave = new Promise((resolve) => { resolvePromise = resolve; });
    mockSaveExplorerObjects.mockReturnValue(slowSave);
    useStore.setState({ explorerDiffResult: { models: { m: 'new' } } });
    renderModal({ onClose: mockOnClose });
    fireEvent.click(screen.getByTestId('save-modal-confirm'));
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
    expect(screen.getByTestId('save-modal-confirm')).toBeDisabled();
    resolvePromise({ success: true, errors: [] });
    await waitFor(() => { expect(mockOnClose).toHaveBeenCalled(); });
  });

  it('shows error message on save failure', async () => {
    mockSaveExplorerObjects.mockResolvedValue({
      success: false,
      errors: [{ name: 'my_model', type: 'model', error: 'Network error' }],
    });
    useStore.setState({ explorerDiffResult: { models: { my_model: 'new' } } });
    renderModal({ onClose: mockOnClose });
    fireEvent.click(screen.getByTestId('save-modal-confirm'));
    await waitFor(() => {
      expect(screen.getByTestId('save-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('calls onClose on successful save', async () => {
    useStore.setState({ explorerDiffResult: { models: { m: 'new' } } });
    renderModal({ onClose: mockOnClose });
    fireEvent.click(screen.getByTestId('save-modal-confirm'));
    await waitFor(() => { expect(mockOnClose).toHaveBeenCalledTimes(1); });
  });

  it('shows new chart in NEW section', () => {
    useStore.setState({
      explorerChartName: 'my_chart',
      explorerDiffResult: { chart: 'new' },
    });
    renderModal({ onClose: mockOnClose });
    const pill = screen.getByTestId('embedded-pill-chart-my_chart');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'new');
  });

  it('shows modified chart in MODIFIED section', () => {
    useStore.setState({
      explorerChartName: 'my_chart',
      explorerDiffResult: { chart: 'modified' },
    });
    renderModal({ onClose: mockOnClose });
    const pill = screen.getByTestId('embedded-pill-chart-my_chart');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'modified');
  });

  it('does not show chart when unchanged', () => {
    useStore.setState({
      explorerChartName: 'my_chart',
      explorerDiffResult: { chart: null },
    });
    renderModal({ onClose: mockOnClose });
    expect(screen.queryByTestId('embedded-pill-chart-my_chart')).not.toBeInTheDocument();
  });

  it('shows new metrics from diff result', () => {
    useStore.setState({
      explorerDiffResult: { metrics: { total_x: 'new', existing_met: null } },
    });
    renderModal({ onClose: mockOnClose });
    expect(screen.getByTestId('embedded-pill-metric-total_x')).toBeInTheDocument();
    expect(screen.queryByTestId('embedded-pill-metric-existing_met')).not.toBeInTheDocument();
  });

  it('enables Save for a brand-new LOCAL model absent from the backend diff', () => {
    // Mirrors selectHasModifications: a fresh model (isNew + sql) exists only
    // locally and is not yet in explorerDiffResult. The modal must still treat
    // it as a change (no "No changes to save" dead end).
    useStore.setState({
      explorerDiffResult: {},
      explorerModelStates: { model_2: { isNew: true, sql: 'SELECT 1' } },
    });
    renderModal({ onClose: mockOnClose });
    expect(screen.getByTestId('save-modal-confirm')).not.toBeDisabled();
    expect(screen.getByTestId('embedded-pill-model-model_2')).toBeInTheDocument();
    expect(screen.queryByText('No changes to save.')).not.toBeInTheDocument();
  });

  it('enables Save for a brand-new LOCAL insight absent from the backend diff', () => {
    useStore.setState({
      explorerDiffResult: null,
      explorerInsightStates: { my_insight: { isNew: true, type: 'bar', props: {} } },
    });
    renderModal({ onClose: mockOnClose });
    expect(screen.getByTestId('save-modal-confirm')).not.toBeDisabled();
    expect(screen.getByTestId('embedded-pill-insight-my_insight')).toBeInTheDocument();
  });

  it('does not double-count a local new model that is also in the diff', () => {
    useStore.setState({
      explorerDiffResult: { models: { model_2: 'new' } },
      explorerModelStates: { model_2: { isNew: true, sql: 'SELECT 1' } },
    });
    renderModal({ onClose: mockOnClose });
    // Exactly one pill for model_2.
    expect(screen.getAllByTestId('embedded-pill-model-model_2')).toHaveLength(1);
  });

  it('save button is disabled when no changes', () => {
    useStore.setState({
      explorerDiffResult: { models: { m: null }, insights: { i: null } },
    });
    renderModal({ onClose: mockOnClose });
    expect(screen.getByTestId('save-modal-confirm')).toBeDisabled();
  });

  it('save button is disabled when diff result is null', () => {
    useStore.setState({ explorerDiffResult: null });
    renderModal({ onClose: mockOnClose });
    expect(screen.getByTestId('save-modal-confirm')).toBeDisabled();
  });

  // ------------------------------------------------------------------
  // J-1 / VIS-774 — "After save" section
  // ------------------------------------------------------------------
  describe('After save section (J-1)', () => {
    const withDashboards = (extra = {}) => {
      useStore.setState({
        explorerChartName: 'revenue_chart',
        explorerDiffResult: { chart: 'new' },
        dashboards: [
          { name: 'sales', config: { rows: [{ items: [] }, { items: [] }] } },
          { name: 'ops', config: { rows: [{ items: [] }] } },
        ],
        ...extra,
      });
    };

    it('renders the After save section with three radios, Stay default', () => {
      withDashboards();
      renderModal({ onClose: mockOnClose });
      expect(screen.getByTestId('after-save-section')).toBeInTheDocument();
      expect(screen.getByTestId('after-save-stay')).toBeChecked();
      expect(screen.getByTestId('after-save-workspace')).toBeInTheDocument();
      expect(screen.getByTestId('after-save-dashboard')).toBeInTheDocument();
    });

    it('disables option 3 when no dashboards exist', () => {
      useStore.setState({
        explorerChartName: 'revenue_chart',
        explorerDiffResult: { chart: 'new' },
        dashboards: [],
      });
      renderModal({ onClose: mockOnClose });
      expect(screen.getByTestId('after-save-dashboard')).toBeDisabled();
      expect(
        within(screen.getByTestId('after-save-dashboard-select')).getByRole('combobox')
      ).toBeDisabled();
    });

    it('navigates to /workspace when "Open in Workspace" is chosen', async () => {
      withDashboards();
      renderModal({ onClose: mockOnClose });
      fireEvent.click(screen.getByTestId('after-save-workspace'));
      fireEvent.click(screen.getByTestId('save-modal-confirm'));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/workspace');
      });
    });

    it('places the chart in the chosen slot AND navigates with slot + newItem params on option 3', async () => {
      withDashboards();
      renderModal({ onClose: mockOnClose });
      fireEvent.click(screen.getByTestId('after-save-dashboard'));
      await selectEvent.select(
        within(screen.getByTestId('after-save-dashboard-select')).getByRole('combobox'),
        'ops',
        { container: document.body }
      );
      await selectEvent.select(
        within(screen.getByTestId('after-save-slot-select')).getByRole('combobox'),
        'At end of row 1',
        { container: document.body }
      );
      fireEvent.click(screen.getByTestId('save-modal-confirm'));
      await waitFor(() => {
        expect(mockPlaceChart).toHaveBeenCalledWith('ops', 'revenue_chart', '0:end');
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/workspace/dashboard/ops?slot=0%3Aend&newItem=revenue_chart'
        );
      });
    });

    it('surfaces an error and does NOT navigate when placement fails on option 3', async () => {
      mockPlaceChart.mockResolvedValue({ success: false, error: 'slot is gone' });
      withDashboards();
      renderModal({ onClose: mockOnClose });
      fireEvent.click(screen.getByTestId('after-save-dashboard'));
      fireEvent.click(screen.getByTestId('save-modal-confirm'));
      await waitFor(() => {
        expect(screen.getByTestId('save-error')).toBeInTheDocument();
      });
      expect(screen.getByText(/slot is gone/)).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('slot picker lists one option per row plus a new-row option', () => {
      withDashboards();
      renderModal({ onClose: mockOnClose });
      // Enable the dashboard branch so the slot select isn't disabled.
      fireEvent.click(screen.getByTestId('after-save-dashboard'));
      // 'sales' has 2 rows → 2 "at end of" + 1 "new row" (options render when open).
      const slotSelect = screen.getByTestId('after-save-slot-select');
      selectEvent.openMenu(within(slotSelect).getByRole('combobox'));
      const optionText = screen.getAllByRole('option').map((o) => o.textContent);
      expect(optionText).toEqual(
        expect.arrayContaining([
          'At end of row 1',
          'At end of row 2',
          'In a new row at the end',
        ])
      );
    });

    it('does not navigate when staying in Explorer (default)', async () => {
      withDashboards();
      renderModal({ onClose: mockOnClose });
      fireEvent.click(screen.getByTestId('save-modal-confirm'));
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('persists the choice across modal opens within a session', async () => {
      withDashboards();
      const { unmount } = renderModal({ onClose: mockOnClose });
      fireEvent.click(screen.getByTestId('after-save-workspace'));
      unmount();
      renderModal({ onClose: mockOnClose });
      expect(screen.getByTestId('after-save-workspace')).toBeChecked();
    });
  });
});
