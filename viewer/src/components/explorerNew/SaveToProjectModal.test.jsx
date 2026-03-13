import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SaveToProjectModal from './SaveToProjectModal';
import useStore from '../../stores/store';

describe('SaveToProjectModal', () => {
  const mockSaveToProject = jest.fn().mockResolvedValue({ success: true });
  const mockSetOpen = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useStore.setState({
      explorerSaveModalOpen: false,
      setExplorerSaveModalOpen: mockSetOpen,
      saveExplorerToProject: mockSaveToProject,
      explorerSql: 'SELECT * FROM orders',
      explorerSourceName: 'local-duckdb',
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerComputedColumns: [],
    });
  });

  it('does not render when closed', () => {
    render(<SaveToProjectModal />);

    expect(screen.queryByTestId('save-modal')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    expect(screen.getByTestId('save-modal')).toBeInTheDocument();
    expect(screen.getByTestId('save-modal-model-name')).toBeInTheDocument();
    expect(screen.getByTestId('save-modal-insight-name')).toBeInTheDocument();
    expect(screen.getByTestId('save-modal-chart-name')).toBeInTheDocument();
  });

  it('auto-suggests names from SQL table name', () => {
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    expect(screen.getByTestId('save-modal-model-name')).toHaveValue('orders_model');
    expect(screen.getByTestId('save-modal-insight-name')).toHaveValue('orders_scatter');
    expect(screen.getByTestId('save-modal-chart-name')).toHaveValue('orders_chart');
  });

  it('closes modal when cancel is clicked', () => {
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    fireEvent.click(screen.getByTestId('save-modal-cancel'));

    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  it('closes modal when X button is clicked', () => {
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    fireEvent.click(screen.getByTestId('save-modal-close'));

    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  it('calls saveExplorerToProject with entered names', async () => {
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    fireEvent.change(screen.getByTestId('save-modal-model-name'), {
      target: { value: 'my_model' },
    });
    fireEvent.change(screen.getByTestId('save-modal-insight-name'), {
      target: { value: 'my_insight' },
    });
    fireEvent.change(screen.getByTestId('save-modal-chart-name'), {
      target: { value: 'my_chart' },
    });

    fireEvent.click(screen.getByTestId('save-modal-confirm'));

    await waitFor(() => {
      expect(mockSaveToProject).toHaveBeenCalledWith({
        modelName: 'my_model',
        insightName: 'my_insight',
        chartName: 'my_chart',
        computedNames: {},
      });
    });
  });

  it('disables save button when names are empty', () => {
    useStore.setState({
      explorerSaveModalOpen: true,
      explorerSql: '',
    });

    render(<SaveToProjectModal />);

    fireEvent.change(screen.getByTestId('save-modal-model-name'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('save-modal-insight-name'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('save-modal-chart-name'), { target: { value: '' } });

    expect(screen.getByTestId('save-modal-confirm')).toBeDisabled();
  });

  it('shows error when save fails', async () => {
    mockSaveToProject.mockResolvedValueOnce({
      success: false,
      error: 'Model name already exists',
    });
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    fireEvent.click(screen.getByTestId('save-modal-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('save-modal-error')).toHaveTextContent('Model name already exists');
    });
  });

  it('shows saving state on confirm button', async () => {
    let resolvePromise;
    mockSaveToProject.mockReturnValueOnce(
      new Promise((resolve) => { resolvePromise = resolve; })
    );
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    fireEvent.click(screen.getByTestId('save-modal-confirm'));

    expect(screen.getByTestId('save-modal-confirm')).toHaveTextContent('Saving...');

    resolvePromise({ success: true });

    await waitFor(() => {
      expect(screen.getByTestId('save-modal-confirm')).toHaveTextContent('Save');
    });
  });

  it('uses insight type in suggested insight name', () => {
    useStore.setState({
      explorerSaveModalOpen: true,
      explorerInsightConfig: { name: '', props: { type: 'bar' } },
    });

    render(<SaveToProjectModal />);

    expect(screen.getByTestId('save-modal-insight-name')).toHaveValue('orders_bar');
  });

  it('shows type-colored sections for model, insight, chart', () => {
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    expect(screen.getByTestId('save-section-model')).toBeInTheDocument();
    expect(screen.getByTestId('save-section-insight')).toBeInTheDocument();
    expect(screen.getByTestId('save-section-chart')).toBeInTheDocument();
  });

  it('shows computed metrics with editable names', () => {
    useStore.setState({
      explorerSaveModalOpen: true,
      explorerComputedColumns: [
        { name: 'sum_value', expression: 'SUM(value)', type: 'metric' },
      ],
    });

    render(<SaveToProjectModal />);

    expect(screen.getByTestId('save-section-metric')).toBeInTheDocument();
    expect(screen.getByTestId('save-modal-metric-sum_value')).toHaveValue('sum_value');
  });

  it('shows computed dimensions with editable names', () => {
    useStore.setState({
      explorerSaveModalOpen: true,
      explorerComputedColumns: [
        { name: 'order_month', expression: "DATE_TRUNC('month', date)", type: 'dimension' },
      ],
    });

    render(<SaveToProjectModal />);

    expect(screen.getByTestId('save-section-dimension')).toBeInTheDocument();
    expect(screen.getByTestId('save-modal-dimension-order_month')).toHaveValue('order_month');
  });

  it('passes computed names to save function', async () => {
    useStore.setState({
      explorerSaveModalOpen: true,
      explorerComputedColumns: [
        { name: 'sum_value', expression: 'SUM(value)', type: 'metric' },
      ],
    });

    render(<SaveToProjectModal />);

    fireEvent.change(screen.getByTestId('save-modal-metric-sum_value'), {
      target: { value: 'total_value' },
    });

    fireEvent.click(screen.getByTestId('save-modal-confirm'));

    await waitFor(() => {
      expect(mockSaveToProject).toHaveBeenCalledWith(
        expect.objectContaining({
          computedNames: { sum_value: 'total_value' },
        })
      );
    });
  });

  it('shows source name in model section', () => {
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    expect(screen.getByText('Source: local-duckdb')).toBeInTheDocument();
  });

  it('does not show metrics section when no computed metrics', () => {
    useStore.setState({ explorerSaveModalOpen: true });

    render(<SaveToProjectModal />);

    expect(screen.queryByTestId('save-section-metric')).not.toBeInTheDocument();
  });
});
