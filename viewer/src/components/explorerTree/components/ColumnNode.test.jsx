import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ColumnNode from './ColumnNode';

// Mock MUI components
jest.mock('@mui/x-tree-view/TreeItem', () => ({
  TreeItem: ({ itemId, label }) => (
    <div data-testid={`tree-item-${itemId}`} role="treeitem" id={itemId} aria-selected="false">
      <div data-testid={`tree-label-${itemId}`}>{label}</div>
    </div>
  ),
}));

// Mock styled components
jest.mock('../styles/TreeStyles', () => ({
  ColumnInfo: ({ children }) => <div data-testid="column-info">{children}</div>,
  ItemIcon: ({ children }) => <span data-testid="item-icon">{children}</span>,
  ColumnName: ({ children }) => <span data-testid="column-name">{children}</span>,
  ColumnType: ({ children }) => <span data-testid="column-type">{children}</span>,
}));

describe('ColumnNode', () => {
  const defaultProps = {
    column: {
      name: 'id',
      type: 'INTEGER',
    },
    sourceName: 'test_source',
    databaseName: 'test_db',
    schemaName: 'public',
    tableName: 'users',
  };

  test('should render column name and type', () => {
    render(<ColumnNode {...defaultProps} />);

    expect(screen.getByTestId('column-name')).toHaveTextContent('id');
    expect(screen.getByTestId('column-type')).toHaveTextContent('INTEGER');
  });

  test('should render column info container', () => {
    render(<ColumnNode {...defaultProps} />);

    expect(screen.getByTestId('column-info')).toBeInTheDocument();
  });

  test('should handle special characters in column name', () => {
    const props = {
      ...defaultProps,
      column: {
        name: 'column_with_@special#chars',
        type: 'TEXT',
      },
    };

    render(<ColumnNode {...props} />);

    expect(screen.getByTestId('column-name')).toHaveTextContent('column_with_@special#chars');
  });

  test('should handle empty column name', () => {
    const props = {
      ...defaultProps,
      column: {
        name: '',
        type: 'VARCHAR',
      },
    };

    render(<ColumnNode {...props} />);

    expect(screen.getByTestId('column-name')).toBeInTheDocument();
    expect(screen.getByTestId('column-name')).toHaveTextContent('');
  });

  test('should handle empty column type', () => {
    const props = {
      ...defaultProps,
      column: {
        name: 'my_column',
        type: '',
      },
    };

    render(<ColumnNode {...props} />);

    expect(screen.getByTestId('column-type')).toBeInTheDocument();
    expect(screen.getByTestId('column-type')).toHaveTextContent('');
  });

  test('should handle complex type definitions', () => {
    const props = {
      ...defaultProps,
      column: {
        name: 'complex_column',
        type: 'NUMERIC(38,10) CHECK (value > 0) NOT NULL',
      },
    };

    render(<ColumnNode {...props} />);

    expect(screen.getByTestId('column-type')).toHaveTextContent(
      'NUMERIC(38,10) CHECK (value > 0) NOT NULL'
    );
  });

  test('should handle columns with various data types', () => {
    const columnTypes = [
      { name: 'id', type: 'SERIAL PRIMARY KEY' },
      { name: 'data', type: 'JSONB' },
      { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'amount', type: 'DECIMAL(10,2)' },
    ];

    columnTypes.forEach(column => {
      const { unmount } = render(<ColumnNode {...defaultProps} column={column} />);

      expect(screen.getByTestId('column-name')).toHaveTextContent(column.name);
      expect(screen.getByTestId('column-type')).toHaveTextContent(column.type);

      unmount();
    });
  });

  test('should work without schema (MySQL style)', () => {
    const props = {
      ...defaultProps,
      schemaName: null,
    };

    render(<ColumnNode {...props} />);

    expect(screen.getByTestId('column-name')).toHaveTextContent('id');
    expect(screen.getByTestId('column-type')).toHaveTextContent('INTEGER');
  });

  test('should be a leaf node (no expandable behavior)', () => {
    render(<ColumnNode {...defaultProps} />);

    // Leaf nodes should not have any child tree items inside
    const childTreeItems = screen.queryAllByRole('treeitem');
    expect(childTreeItems).toHaveLength(1); // Only the node itself, no children
  });
});
