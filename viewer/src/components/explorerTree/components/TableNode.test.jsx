import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TableNode from './TableNode';
import { TreeProvider } from '../TreeContext';
import useStore from '../../../stores/store';

// Mock the store
jest.mock('../../../stores/store');

// Mock MUI components
jest.mock('@mui/x-tree-view/TreeItem', () => ({
  TreeItem: ({ children, itemId, label }) => (
    <div data-testid={`tree-item-${itemId}`} role="treeitem" aria-selected="false">
      <div data-testid={`tree-label-${itemId}`}>{label}</div>
      <div data-testid={`tree-children-${itemId}`}>{children}</div>
    </div>
  ),
}));

// Mock child components
jest.mock('./ColumnNode', () => ({
  __esModule: true,
  default: ({ column, sourceName, databaseName, schemaName, tableName }) => (
    <div data-testid={`column-${column.name}`}>
      Column: {column.name} ({column.type}) - Table: {tableName}
    </div>
  ),
}));

describe('TableNode', () => {
  let mockStoreData;

  beforeEach(() => {
    mockStoreData = {
      sourcesMetadata: {
        loadedColumns: {},
      },
      loadingStates: {
        columns: {},
      },
    };

    useStore.mockImplementation(selector => selector(mockStoreData));
  });

  test('should render table name', () => {
    const table = { name: 'users' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';
    const schemaName = 'public';

    render(
      <TreeProvider>
        <TableNode 
          table={table} 
          sourceName={sourceName} 
          databaseName={databaseName}
          schemaName={schemaName}
        />
      </TreeProvider>
    );

    expect(screen.getByText('users')).toBeInTheDocument();
  });

  test('should show loading state when fetching columns', () => {
    const table = { name: 'users' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';
    const schemaName = 'public';
    
    mockStoreData.loadingStates.columns = {
      'test_source.test_db.public.users': true,
    };

    render(
      <TreeProvider>
        <TableNode 
          table={table} 
          sourceName={sourceName} 
          databaseName={databaseName}
          schemaName={schemaName}
        />
      </TreeProvider>
    );

    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Loading columns...')).toBeInTheDocument();
  });

  test('should render column nodes when columns are loaded', () => {
    const table = { name: 'users' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';
    const schemaName = 'public';
    
    mockStoreData.sourcesMetadata.loadedColumns = {
      'test_source.test_db.public.users': [
        { name: 'id', type: 'INTEGER' },
        { name: 'name', type: 'VARCHAR(255)' },
      ],
    };

    render(
      <TreeProvider>
        <TableNode 
          table={table} 
          sourceName={sourceName} 
          databaseName={databaseName}
          schemaName={schemaName}
        />
      </TreeProvider>
    );

    expect(screen.getByTestId('column-id')).toBeInTheDocument();
    expect(screen.getByTestId('column-name')).toBeInTheDocument();
  });

  test('should handle table without schema', () => {
    const table = { name: 'users' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';
    
    mockStoreData.sourcesMetadata.loadedColumns = {
      'test_source.test_db.users': [
        { name: 'id', type: 'BIGINT' },
      ],
    };

    render(
      <TreeProvider>
        <TableNode 
          table={table} 
          sourceName={sourceName} 
          databaseName={databaseName}
          schemaName={null}
        />
      </TreeProvider>
    );

    expect(screen.getByTestId('column-id')).toBeInTheDocument();
  });

  test('should show placeholder when no columns loaded', () => {
    const table = { name: 'users' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';
    const schemaName = 'public';

    render(
      <TreeProvider>
        <TableNode 
          table={table} 
          sourceName={sourceName} 
          databaseName={databaseName}
          schemaName={schemaName}
        />
      </TreeProvider>
    );

    expect(screen.getByText('Click to expand')).toBeInTheDocument();
  });

  test('should handle empty columns array', () => {
    const table = { name: 'users' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';
    const schemaName = 'public';
    
    mockStoreData.sourcesMetadata.loadedColumns = {
      'test_source.test_db.public.users': [],
    };

    render(
      <TreeProvider>
        <TableNode 
          table={table} 
          sourceName={sourceName} 
          databaseName={databaseName}
          schemaName={schemaName}
        />
      </TreeProvider>
    );

    // TableNode still shows placeholder for empty columns array
    expect(screen.getByText('Click to expand')).toBeInTheDocument();
    expect(screen.queryByTestId(/column-/)).not.toBeInTheDocument();
  });
});