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
      projectFileObjects: [],
      projectFilePath: '/project/visivo.yml',
      explorerSql: 'SELECT * FROM orders',
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
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
        filePath: '/project/visivo.yml',
      });
    });
  });

  it('disables save button when names are empty', () => {
    useStore.setState({
      explorerSaveModalOpen: true,
      explorerSql: '',
    });

    render(<SaveToProjectModal />);

    // Clear auto-suggested names
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

  it('shows file path selector when projectFileObjects exist', () => {
    useStore.setState({
      explorerSaveModalOpen: true,
      projectFileObjects: [
        { full_path: '/project/visivo.yml', relative_path: 'visivo.yml' },
        { full_path: '/project/models.yml', relative_path: 'models.yml' },
      ],
    });

    render(<SaveToProjectModal />);

    expect(screen.getByTestId('save-modal-file-path')).toBeInTheDocument();
  });

  it('does not show file path selector when no projectFileObjects', () => {
    useStore.setState({
      explorerSaveModalOpen: true,
      projectFileObjects: [],
    });

    render(<SaveToProjectModal />);

    expect(screen.queryByTestId('save-modal-file-path')).not.toBeInTheDocument();
  });

  it('passes selected file path to save function', async () => {
    useStore.setState({
      explorerSaveModalOpen: true,
      projectFileObjects: [
        { full_path: '/project/models.yml', relative_path: 'models.yml' },
      ],
    });

    render(<SaveToProjectModal />);

    fireEvent.change(screen.getByTestId('save-modal-file-path'), {
      target: { value: '/project/models.yml' },
    });

    fireEvent.click(screen.getByTestId('save-modal-confirm'));

    await waitFor(() => {
      expect(mockSaveToProject).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/project/models.yml',
        })
      );
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
});
