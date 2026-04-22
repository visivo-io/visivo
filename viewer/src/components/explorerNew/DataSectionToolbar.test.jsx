import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DataSectionToolbar from './DataSectionToolbar';
import useStore from '../../stores/store';

// Mock EmbeddedPill
jest.mock('../new-views/lineage/EmbeddedPill', () => {
  return function MockEmbeddedPill({ objectType, label, onRemove, onClick, className, tooltip }) {
    return (
      <span
        data-testid={`pill-${objectType}-${label}`}
        data-object-type={objectType}
        className={className || ''}
        onClick={onClick}
        title={tooltip}
      >
        {label}
        {onRemove && (
          <button
            data-testid={`pill-remove-${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            x
          </button>
        )}
      </span>
    );
  };
});

// Mock AddComputedColumnPopover
jest.mock('./AddComputedColumnPopover', () => {
  return function MockAddComputedColumnPopover({ editColumn, onUpdate, onEditClose }) {
    return (
      <div data-testid="add-computed-column-btn">
        +
        {editColumn && (
          <div data-testid="edit-popover">
            <span data-testid="edit-column-name">{editColumn.name}</span>
            <span data-testid="edit-column-expression">{editColumn.expression}</span>
            <button
              data-testid="save-edit-btn"
              onClick={() =>
                onUpdate?.({
                  name: editColumn.name,
                  expression: 'NEW_EXPR',
                  type: editColumn.type,
                })
              }
            >
              Save
            </button>
            <button data-testid="close-edit-btn" onClick={onEditClose}>
              Close
            </button>
          </div>
        )}
      </div>
    );
  };
});

const defaultStoreState = {
  explorerModelTabs: ['model_a'],
  explorerActiveModelName: 'model_a',
  explorerModelStates: {
    model_a: {
      sql: 'SELECT 1',
      sourceName: 'pg',
      queryResult: { columns: ['x', 'y'], rows: [{ x: 1, y: 2 }], row_count: 1 },
      queryError: null,
      computedColumns: [],
      enrichedResult: null,
      isNew: true,
    },
  },
  explorerDuckDBLoading: false,
  explorerDuckDBError: null,
  explorerFailedComputedColumns: {},
  addActiveModelComputedColumn: jest.fn(),
  updateActiveModelComputedColumn: jest.fn(),
  removeActiveModelComputedColumn: jest.fn(),
  validateExplorerExpression: jest.fn(),
};

const setupStore = (overrides = {}) => {
  useStore.setState({ ...defaultStoreState, ...overrides });
};

describe('DataSectionToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  it('renders row count from the active model query result', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          queryResult: { columns: ['x'], rows: Array(42).fill({ x: 1 }), row_count: 42 },
        },
      },
    });
    render(<DataSectionToolbar />);
    expect(screen.getByText('42 rows')).toBeInTheDocument();
  });

  it('renders singular row for count of 1', () => {
    render(<DataSectionToolbar />);
    expect(screen.getByText('1 row')).toBeInTheDocument();
  });

  it('shows truncated indicator when query result is truncated', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          queryResult: { columns: ['x'], rows: [{ x: 1 }], row_count: 1, truncated: true },
        },
      },
    });
    render(<DataSectionToolbar />);
    expect(screen.getByText('(truncated)')).toBeInTheDocument();
  });

  it('does not show truncated indicator when not truncated', () => {
    render(<DataSectionToolbar />);
    expect(screen.queryByText('(truncated)')).not.toBeInTheDocument();
  });

  it('shows execution time when provided', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          queryResult: {
            columns: ['x'],
            rows: [{ x: 1 }],
            row_count: 1,
            execution_time_ms: 150,
          },
        },
      },
    });
    render(<DataSectionToolbar />);
    expect(screen.getByText('150ms')).toBeInTheDocument();
  });

  it('does not show execution time when not provided', () => {
    render(<DataSectionToolbar />);
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
  });

  it('shows DuckDB loading indicator', () => {
    setupStore({ explorerDuckDBLoading: true });
    render(<DataSectionToolbar />);
    expect(screen.getByTestId('duckdb-loading')).toBeInTheDocument();
    expect(screen.getByText('Computing...')).toBeInTheDocument();
  });

  it('shows DuckDB error when present and no per-column errors', () => {
    setupStore({
      explorerDuckDBError: 'Table load failed',
      explorerFailedComputedColumns: {},
    });
    render(<DataSectionToolbar />);
    expect(screen.getByTestId('duckdb-error')).toBeInTheDocument();
  });

  it('hides DuckDB error when per-column errors exist', () => {
    setupStore({
      explorerDuckDBError: 'Could not compute: bad_col',
      explorerFailedComputedColumns: { bad_col: 'Function INVALID does not exist' },
    });
    render(<DataSectionToolbar />);
    expect(screen.queryByTestId('duckdb-error')).not.toBeInTheDocument();
  });

  it('renders a pill for each computed column', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          computedColumns: [
            { name: 'total', expression: 'SUM(value)', type: 'metric' },
            { name: 'category', expression: 'UPPER(cat)', type: 'dimension' },
          ],
        },
      },
    });
    render(<DataSectionToolbar />);
    expect(screen.getByTestId('computed-pill-total')).toBeInTheDocument();
    expect(screen.getByTestId('computed-pill-category')).toBeInTheDocument();
  });

  it('metric pills render with metric objectType', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          computedColumns: [{ name: 'total', expression: 'SUM(value)', type: 'metric' }],
        },
      },
    });
    render(<DataSectionToolbar />);
    const pill = screen.getByTestId('pill-metric-total');
    expect(pill).toBeInTheDocument();
    expect(pill.dataset.objectType).toBe('metric');
  });

  it('dimension pills render with dimension objectType', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          computedColumns: [{ name: 'category', expression: 'UPPER(cat)', type: 'dimension' }],
        },
      },
    });
    render(<DataSectionToolbar />);
    const pill = screen.getByTestId('pill-dimension-category');
    expect(pill).toBeInTheDocument();
    expect(pill.dataset.objectType).toBe('dimension');
  });

  it('failed columns have red styling via className override', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          computedColumns: [{ name: 'bad_col', expression: 'INVALID()', type: 'dimension' }],
        },
      },
      explorerFailedComputedColumns: { bad_col: 'Function INVALID does not exist' },
    });
    render(<DataSectionToolbar />);
    const pill = screen.getByTestId('pill-dimension-bad_col');
    expect(pill.className).toContain('bg-red-50');
    expect(pill.className).toContain('border-red-200');
  });

  it('clicking pill opens edit mode (sets editColumn)', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          computedColumns: [{ name: 'total', expression: 'SUM(value)', type: 'metric' }],
        },
      },
    });
    render(<DataSectionToolbar />);

    fireEvent.click(screen.getByTestId('pill-metric-total'));

    expect(screen.getByTestId('edit-popover')).toBeInTheDocument();
    expect(screen.getByTestId('edit-column-name')).toHaveTextContent('total');
    expect(screen.getByTestId('edit-column-expression')).toHaveTextContent('SUM(value)');
  });

  it('clicking remove button calls removeActiveModelComputedColumn', () => {
    const onRemove = jest.fn();
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          computedColumns: [{ name: 'total', expression: 'SUM(value)', type: 'metric' }],
        },
      },
      removeActiveModelComputedColumn: onRemove,
    });
    render(<DataSectionToolbar />);

    fireEvent.click(screen.getByTestId('pill-remove-total'));
    expect(onRemove).toHaveBeenCalledWith('total');
  });

  it('remove button does not open edit mode (stopPropagation)', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          computedColumns: [{ name: 'total', expression: 'SUM(value)', type: 'metric' }],
        },
      },
    });
    render(<DataSectionToolbar />);

    fireEvent.click(screen.getByTestId('pill-remove-total'));

    expect(screen.queryByTestId('edit-popover')).not.toBeInTheDocument();
  });

  it('uses enrichedResult for row count when available', () => {
    setupStore({
      explorerModelStates: {
        model_a: {
          ...defaultStoreState.explorerModelStates.model_a,
          queryResult: { columns: ['x'], rows: [{ x: 1 }], row_count: 1 },
          enrichedResult: { columns: ['x', 'total'], rows: Array(5).fill({ x: 1 }), row_count: 5 },
        },
      },
    });
    render(<DataSectionToolbar />);
    expect(screen.getByText('5 rows')).toBeInTheDocument();
  });
});
