import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DataSectionToolbar from './DataSectionToolbar';

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

const defaultProps = {
  totalRowCount: 0,
  truncated: false,
  executionTimeMs: null,
  duckDBLoading: false,
  duckDBError: null,
  failedComputedColumns: {},
  computedColumns: [],
  onAddComputedColumn: jest.fn(),
  onUpdateComputedColumn: jest.fn(),
  onRemoveComputedColumn: jest.fn(),
  onValidateExpression: jest.fn(),
  allColumnNames: new Set(),
};

const renderToolbar = (overrides = {}) => {
  const props = { ...defaultProps, ...overrides };
  return render(<DataSectionToolbar {...props} />);
};

describe('DataSectionToolbar', () => {
  it('renders row count', () => {
    renderToolbar({ totalRowCount: 42 });
    expect(screen.getByText('42 rows')).toBeInTheDocument();
  });

  it('renders singular row for count of 1', () => {
    renderToolbar({ totalRowCount: 1 });
    expect(screen.getByText('1 row')).toBeInTheDocument();
  });

  it('shows truncated indicator when truncated is true', () => {
    renderToolbar({ truncated: true, totalRowCount: 5 });
    expect(screen.getByText('(truncated)')).toBeInTheDocument();
  });

  it('does not show truncated indicator when truncated is false', () => {
    renderToolbar({ truncated: false, totalRowCount: 5 });
    expect(screen.queryByText('(truncated)')).not.toBeInTheDocument();
  });

  it('shows execution time when provided', () => {
    renderToolbar({ totalRowCount: 10, executionTimeMs: 150 });
    expect(screen.getByText('150ms')).toBeInTheDocument();
  });

  it('does not show execution time when not provided', () => {
    renderToolbar({ totalRowCount: 10, executionTimeMs: null });
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
  });

  it('shows DuckDB loading indicator', () => {
    renderToolbar({ totalRowCount: 10, duckDBLoading: true });
    expect(screen.getByTestId('duckdb-loading')).toBeInTheDocument();
    expect(screen.getByText('Computing...')).toBeInTheDocument();
  });

  it('shows DuckDB error when present and no per-column errors', () => {
    renderToolbar({
      totalRowCount: 10,
      duckDBError: 'Table load failed',
      failedComputedColumns: {},
    });
    expect(screen.getByTestId('duckdb-error')).toBeInTheDocument();
  });

  it('hides DuckDB error when per-column errors exist', () => {
    renderToolbar({
      totalRowCount: 10,
      duckDBError: 'Could not compute: bad_col',
      failedComputedColumns: { bad_col: 'Function INVALID does not exist' },
    });
    expect(screen.queryByTestId('duckdb-error')).not.toBeInTheDocument();
  });

  it('renders a pill for each computed column', () => {
    renderToolbar({
      totalRowCount: 5,
      computedColumns: [
        { name: 'total', expression: 'SUM(value)', type: 'metric' },
        { name: 'category', expression: 'UPPER(cat)', type: 'dimension' },
      ],
    });
    expect(screen.getByTestId('computed-pill-total')).toBeInTheDocument();
    expect(screen.getByTestId('computed-pill-category')).toBeInTheDocument();
  });

  it('metric pills render with metric objectType', () => {
    renderToolbar({
      totalRowCount: 5,
      computedColumns: [{ name: 'total', expression: 'SUM(value)', type: 'metric' }],
    });
    const pill = screen.getByTestId('pill-metric-total');
    expect(pill).toBeInTheDocument();
    expect(pill.dataset.objectType).toBe('metric');
  });

  it('dimension pills render with dimension objectType', () => {
    renderToolbar({
      totalRowCount: 5,
      computedColumns: [{ name: 'category', expression: 'UPPER(cat)', type: 'dimension' }],
    });
    const pill = screen.getByTestId('pill-dimension-category');
    expect(pill).toBeInTheDocument();
    expect(pill.dataset.objectType).toBe('dimension');
  });

  it('failed columns have red styling via className override', () => {
    renderToolbar({
      totalRowCount: 5,
      computedColumns: [{ name: 'bad_col', expression: 'INVALID()', type: 'dimension' }],
      failedComputedColumns: { bad_col: 'Function INVALID does not exist' },
    });
    const pill = screen.getByTestId('pill-dimension-bad_col');
    expect(pill.className).toContain('bg-red-50');
    expect(pill.className).toContain('border-red-200');
  });

  it('clicking pill opens edit mode (sets editColumn)', () => {
    renderToolbar({
      totalRowCount: 5,
      computedColumns: [{ name: 'total', expression: 'SUM(value)', type: 'metric' }],
    });

    const pill = screen.getByTestId('pill-metric-total');
    fireEvent.click(pill);

    expect(screen.getByTestId('edit-popover')).toBeInTheDocument();
    expect(screen.getByTestId('edit-column-name')).toHaveTextContent('total');
    expect(screen.getByTestId('edit-column-expression')).toHaveTextContent('SUM(value)');
  });

  it('clicking remove button calls onRemoveComputedColumn', () => {
    const onRemove = jest.fn();
    renderToolbar({
      totalRowCount: 5,
      computedColumns: [{ name: 'total', expression: 'SUM(value)', type: 'metric' }],
      onRemoveComputedColumn: onRemove,
    });

    fireEvent.click(screen.getByTestId('pill-remove-total'));
    expect(onRemove).toHaveBeenCalledWith('total');
  });

  it('remove button does not open edit mode (stopPropagation)', () => {
    renderToolbar({
      totalRowCount: 5,
      computedColumns: [{ name: 'total', expression: 'SUM(value)', type: 'metric' }],
    });

    fireEvent.click(screen.getByTestId('pill-remove-total'));

    // Edit popover should NOT appear because stopPropagation prevents click on parent pill
    expect(screen.queryByTestId('edit-popover')).not.toBeInTheDocument();
  });
});
