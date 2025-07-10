import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DatabaseNode from './DatabaseNode';
import { TreeProvider } from '../TreeContext';
import useStore from '../../../stores/store';

// Mock the store
jest.mock('../../../stores/store');

// Mock MUI TreeItem
jest.mock('@mui/x-tree-view/TreeItem', () => ({
  TreeItem: ({ children, itemId, label }) => (
    <div data-testid={`tree-item-${itemId}`}>
      <div data-testid={`tree-label-${itemId}`}>{label}</div>
      <div data-testid={`tree-children-${itemId}`}>{children}</div>
    </div>
  ),
}));

describe('DatabaseNode', () => {
  let mockStoreData;

  beforeEach(() => {
    mockStoreData = {
      sourcesMetadata: {
        loadedSchemas: {},
        loadedTables: {},
        loadedColumns: {}, // Add this!
      },
      loadingStates: {
        schemas: {},
        tables: {},
        columns: {}, // Add this!
      },
    };

    useStore.mockImplementation(selector => selector(mockStoreData));
  });

  test('should render database name', () => {
    const database = { name: 'test_db' };
    const sourceName = 'test_source';

    render(
      <TreeProvider>
        <DatabaseNode database={database} sourceName={sourceName} />
      </TreeProvider>
    );

    expect(screen.getByText('test_db')).toBeInTheDocument();
  });

  test('should render placeholder when no schema data is loaded', () => {
    const database = { name: 'test_db' };
    const sourceName = 'test_source';

    render(
      <TreeProvider>
        <DatabaseNode database={database} sourceName={sourceName} />
      </TreeProvider>
    );

    // Should render the placeholder
    expect(screen.getByText('Click to expand')).toBeInTheDocument();
  });

  test('should render loading state when schemas are loading', () => {
    const database = { name: 'test_db' };
    const sourceName = 'test_source';

    // Set loading state
    mockStoreData.loadingStates.schemas['test_source.test_db'] = true;

    render(
      <TreeProvider>
        <DatabaseNode database={database} sourceName={sourceName} />
      </TreeProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('should render schemas when database has schemas', () => {
    const database = { name: 'test_db' };
    const sourceName = 'test_source';

    // Set schema data
    mockStoreData.sourcesMetadata.loadedSchemas['test_source.test_db'] = {
      has_schemas: true,
      schemas: [{ name: 'public' }, { name: 'private' }],
    };

    render(
      <TreeProvider>
        <DatabaseNode database={database} sourceName={sourceName} />
      </TreeProvider>
    );

    // Should render schema nodes
    expect(screen.getByText('public')).toBeInTheDocument();
    expect(screen.getByText('private')).toBeInTheDocument();
  });

  test('should render tables directly when database has no schemas', () => {
    const database = { name: 'test_db' };
    const sourceName = 'test_source';

    // Set schema data indicating no schemas
    mockStoreData.sourcesMetadata.loadedSchemas['test_source.test_db'] = {
      has_schemas: false,
      schemas: null,
    };

    // Set table data
    mockStoreData.sourcesMetadata.loadedTables['test_source.test_db'] = [
      { name: 'users' },
      { name: 'products' },
    ];

    render(
      <TreeProvider>
        <DatabaseNode database={database} sourceName={sourceName} />
      </TreeProvider>
    );

    // Should render table nodes directly
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('products')).toBeInTheDocument();
  });

  test('should render loading state when tables are loading (no schemas)', () => {
    const database = { name: 'test_db' };
    const sourceName = 'test_source';

    // Set schema data indicating no schemas
    mockStoreData.sourcesMetadata.loadedSchemas['test_source.test_db'] = {
      has_schemas: false,
      schemas: null,
    };

    // Set loading state for tables
    mockStoreData.loadingStates.tables['test_source.test_db'] = true;

    render(
      <TreeProvider>
        <DatabaseNode database={database} sourceName={sourceName} />
      </TreeProvider>
    );

    expect(screen.getByText('Loading tables...')).toBeInTheDocument();
  });

  test('should render error state when table loading fails', () => {
    const database = { name: 'test_db' };
    const sourceName = 'test_source';

    // Set schema data indicating no schemas
    mockStoreData.sourcesMetadata.loadedSchemas['test_source.test_db'] = {
      has_schemas: false,
      schemas: null,
    };

    // Set error state for tables
    mockStoreData.sourcesMetadata.loadedTables['test_source.test_db'] = {
      error: 'Connection failed',
    };

    render(
      <TreeProvider>
        <DatabaseNode database={database} sourceName={sourceName} />
      </TreeProvider>
    );

    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  test('should generate correct node ID', () => {
    const database = { name: 'test_db' };
    const sourceName = 'test_source';

    render(
      <TreeProvider>
        <DatabaseNode database={database} sourceName={sourceName} />
      </TreeProvider>
    );

    const expectedNodeId = btoa(
      JSON.stringify({
        type: 'database',
        path: ['test_source', 'test_db'],
      })
    );

    expect(screen.getByTestId(`tree-item-${expectedNodeId}`)).toBeInTheDocument();
  });
});
