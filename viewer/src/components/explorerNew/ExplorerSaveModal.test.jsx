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
};

const stateWithNewModel = {
  ...baseState,
  explorerModelStates: {
    new_model: {
      sql: 'SELECT 1',
      sourceName: 'src',
      computedColumns: [],
      isNew: true,
    },
  },
};

const stateWithModifiedModel = {
  ...baseState,
  explorerModelStates: {
    existing_model: {
      sql: 'SELECT * FROM orders',
      sourceName: 'src',
      computedColumns: [],
      isNew: false,
      _originalSql: 'SELECT 1',
      _originalSourceName: 'src',
      _originalComputedColumns: [],
    },
  },
};

const stateWithNewInsight = {
  ...baseState,
  explorerInsightStates: {
    new_insight: {
      type: 'scatter',
      props: {},
      interactions: [],
      isNew: true,
    },
  },
};

const stateWithModifiedInsight = {
  ...baseState,
  explorerInsightStates: {
    existing_insight: {
      type: 'bar',
      props: { x: 'col_a' },
      interactions: [],
      isNew: false,
      _originalType: 'scatter',
      _originalProps: {},
    },
  },
};

const stateUnchanged = {
  ...baseState,
  explorerModelStates: {
    stable_model: {
      sql: 'SELECT 1',
      sourceName: 'src',
      computedColumns: [],
      isNew: false,
      _originalSql: 'SELECT 1',
      _originalSourceName: 'src',
      _originalComputedColumns: [],
    },
  },
  explorerInsightStates: {
    stable_insight: {
      type: 'scatter',
      props: {},
      interactions: [],
      isNew: false,
      _originalType: 'scatter',
      _originalProps: {},
    },
  },
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
    useStore.setState(stateWithNewModel);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    expect(screen.getByTestId('explorer-save-modal')).toBeInTheDocument();
    expect(screen.getByText('Save to Project')).toBeInTheDocument();
  });

  it('shows new models with green status dot', () => {
    useStore.setState(stateWithNewModel);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    const pill = screen.getByTestId('embedded-pill-model-new_model');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'new');
  });

  it('shows modified models with amber status dot', () => {
    useStore.setState(stateWithModifiedModel);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    const pill = screen.getByTestId('embedded-pill-model-existing_model');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'modified');
  });

  it('does not show unchanged models', () => {
    useStore.setState(stateUnchanged);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    expect(screen.queryByTestId('embedded-pill-model-stable_model')).not.toBeInTheDocument();
    expect(screen.queryByTestId('embedded-pill-insight-stable_insight')).not.toBeInTheDocument();
  });

  it('shows new insights with green status dot', () => {
    useStore.setState(stateWithNewInsight);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    const pill = screen.getByTestId('embedded-pill-insight-new_insight');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'new');
  });

  it('shows modified insights with amber status dot', () => {
    useStore.setState(stateWithModifiedInsight);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    const pill = screen.getByTestId('embedded-pill-insight-existing_insight');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'modified');
  });

  it('cancel button calls onClose', () => {
    useStore.setState(stateWithNewModel);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId('save-modal-cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('save button calls saveExplorerObjects', async () => {
    useStore.setState(stateWithNewModel);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId('save-modal-confirm'));

    await waitFor(() => {
      expect(mockSaveExplorerObjects).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state during save', async () => {
    let resolvePromise;
    const slowSave = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockSaveExplorerObjects.mockReturnValue(slowSave);
    useStore.setState(stateWithNewModel);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId('save-modal-confirm'));

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
    expect(screen.getByTestId('save-modal-confirm')).toBeDisabled();

    resolvePromise({ success: true, errors: [] });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('shows error message on save failure', async () => {
    mockSaveExplorerObjects.mockResolvedValue({
      success: false,
      errors: [{ name: 'my_model', type: 'model', error: 'Network error' }],
    });
    useStore.setState(stateWithNewModel);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId('save-modal-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('save-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('calls onClose on successful save', async () => {
    useStore.setState(stateWithNewModel);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId('save-modal-confirm'));

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('shows chart section when chart name exists', () => {
    useStore.setState({
      ...stateWithNewModel,
      explorerChartName: 'my_chart',
      explorerChartInsightNames: ['insight_1'],
    });
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    expect(screen.getByTestId('embedded-pill-chart-my_chart')).toBeInTheDocument();
  });

  it('save button is disabled when no changes exist', () => {
    useStore.setState(stateUnchanged);
    render(<ExplorerSaveModal onClose={mockOnClose} />);

    expect(screen.getByTestId('save-modal-confirm')).toBeDisabled();
  });
});
