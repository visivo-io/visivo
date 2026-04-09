import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerSaveModal from './ExplorerSaveModal';
import useStore from '../../stores/store';

jest.mock('../new-views/lineage/EmbeddedPill', () => {
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

  beforeEach(() => {
    mockOnClose = jest.fn();
    mockSaveExplorerObjects = jest.fn().mockResolvedValue({ success: true, errors: [] });
    useStore.setState({
      ...baseState,
      saveExplorerObjects: mockSaveExplorerObjects,
    });
  });

  it('renders modal with title', () => {
    useStore.setState({ explorerDiffResult: { models: { new_model: 'new' } } });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    expect(screen.getByTestId('explorer-save-modal')).toBeInTheDocument();
    expect(screen.getByText('Save to Project')).toBeInTheDocument();
  });

  it('shows new models with green status dot', () => {
    useStore.setState({ explorerDiffResult: { models: { new_model: 'new' } } });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    const pill = screen.getByTestId('embedded-pill-model-new_model');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'new');
  });

  it('shows modified models with amber status dot', () => {
    useStore.setState({ explorerDiffResult: { models: { existing_model: 'modified' } } });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
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
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    expect(screen.queryByTestId('embedded-pill-model-stable_model')).not.toBeInTheDocument();
    expect(screen.queryByTestId('embedded-pill-insight-stable_insight')).not.toBeInTheDocument();
  });

  it('shows new insights with green status dot', () => {
    useStore.setState({ explorerDiffResult: { insights: { new_insight: 'new' } } });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    const pill = screen.getByTestId('embedded-pill-insight-new_insight');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'new');
  });

  it('shows modified insights with amber status dot', () => {
    useStore.setState({ explorerDiffResult: { insights: { existing_insight: 'modified' } } });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    const pill = screen.getByTestId('embedded-pill-insight-existing_insight');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'modified');
  });

  it('cancel button calls onClose', () => {
    useStore.setState({ explorerDiffResult: { models: { m: 'new' } } });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId('save-modal-cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('save button calls saveExplorerObjects', async () => {
    useStore.setState({ explorerDiffResult: { models: { m: 'new' } } });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
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
    render(<ExplorerSaveModal onClose={mockOnClose} />);
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
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId('save-modal-confirm'));
    await waitFor(() => {
      expect(screen.getByTestId('save-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('calls onClose on successful save', async () => {
    useStore.setState({ explorerDiffResult: { models: { m: 'new' } } });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId('save-modal-confirm'));
    await waitFor(() => { expect(mockOnClose).toHaveBeenCalledTimes(1); });
  });

  it('shows new chart in NEW section', () => {
    useStore.setState({
      explorerChartName: 'my_chart',
      explorerDiffResult: { chart: 'new' },
    });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    const pill = screen.getByTestId('embedded-pill-chart-my_chart');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'new');
  });

  it('shows modified chart in MODIFIED section', () => {
    useStore.setState({
      explorerChartName: 'my_chart',
      explorerDiffResult: { chart: 'modified' },
    });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    const pill = screen.getByTestId('embedded-pill-chart-my_chart');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'modified');
  });

  it('does not show chart when unchanged', () => {
    useStore.setState({
      explorerChartName: 'my_chart',
      explorerDiffResult: { chart: null },
    });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    expect(screen.queryByTestId('embedded-pill-chart-my_chart')).not.toBeInTheDocument();
  });

  it('shows new metrics from diff result', () => {
    useStore.setState({
      explorerDiffResult: { metrics: { total_x: 'new', existing_met: null } },
    });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    expect(screen.getByTestId('embedded-pill-metric-total_x')).toBeInTheDocument();
    expect(screen.queryByTestId('embedded-pill-metric-existing_met')).not.toBeInTheDocument();
  });

  it('save button is disabled when no changes', () => {
    useStore.setState({
      explorerDiffResult: { models: { m: null }, insights: { i: null } },
    });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    expect(screen.getByTestId('save-modal-confirm')).toBeDisabled();
  });

  it('save button is disabled when diff result is null', () => {
    useStore.setState({ explorerDiffResult: null });
    render(<ExplorerSaveModal onClose={mockOnClose} />);
    expect(screen.getByTestId('save-modal-confirm')).toBeDisabled();
  });
});
