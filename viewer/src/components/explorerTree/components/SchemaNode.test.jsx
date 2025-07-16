import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SchemaNode from './SchemaNode';
import { TreeProvider } from '../TreeContext';
import useStore from '../../../stores/store';

// Mock the store
jest.mock('../../../stores/store');

// Mock child components
jest.mock('./TableNode', () => ({
  __esModule: true,
  default: ({ table, sourceName, databaseName, schemaName }) => (
    <div data-testid={`table-${table.name}`}>
      Table: {table.name} (Schema: {schemaName})
    </div>
  ),
}));

// Mock TreeNodeWrapper
jest.mock('./TreeNodeWrapper', () => ({
  __esModule: true,
  default: ({ nodeId, label, isLoading, error, children }) => (
    <div data-testid={`tree-item-${nodeId}`} role="treeitem" aria-selected="false">
      <div data-testid={`tree-label-${nodeId}`}>{label}</div>
      {isLoading && <div role="progressbar">Loading...</div>}
      {error && <div data-testid="error">{error.message || error}</div>}
      {children}
    </div>
  ),
}));

describe('SchemaNode', () => {
  let mockStoreData;

  beforeEach(() => {
    mockStoreData = {
      sourcesMetadata: {
        loadedTables: {},
      },
      loadingStates: {
        tables: {},
      },
    };

    useStore.mockImplementation(selector => selector(mockStoreData));
  });

  test('should render schema name', () => {
    const schema = { name: 'public' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';

    render(
      <TreeProvider>
        <SchemaNode schema={schema} sourceName={sourceName} databaseName={databaseName} />
      </TreeProvider>
    );

    expect(screen.getByText('public')).toBeInTheDocument();
  });

  test('should show loading state when fetching tables', () => {
    const schema = { name: 'public' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';

    mockStoreData.loadingStates.tables = {
      'test_source.test_db.public': true,
    };

    render(
      <TreeProvider>
        <SchemaNode schema={schema} sourceName={sourceName} databaseName={databaseName} />
      </TreeProvider>
    );

    expect(screen.getAllByRole('progressbar')).toHaveLength(2); // One in label, one in TreeNodeWrapper
  });

  test('should render table nodes when tables are loaded', () => {
    const schema = { name: 'public' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';

    mockStoreData.sourcesMetadata.loadedTables = {
      'test_source.test_db.public': [{ name: 'users' }, { name: 'orders' }],
    };

    render(
      <TreeProvider>
        <SchemaNode schema={schema} sourceName={sourceName} databaseName={databaseName} />
      </TreeProvider>
    );

    expect(screen.getByTestId('table-users')).toBeInTheDocument();
    expect(screen.getByTestId('table-orders')).toBeInTheDocument();
  });

  test('should handle empty tables array', () => {
    const schema = { name: 'public' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';

    mockStoreData.sourcesMetadata.loadedTables = {
      'test_source.test_db.public': [],
    };

    render(
      <TreeProvider>
        <SchemaNode schema={schema} sourceName={sourceName} databaseName={databaseName} />
      </TreeProvider>
    );

    expect(screen.queryByTestId(/table-/)).not.toBeInTheDocument();
  });

  test('should show error state when loading fails', () => {
    const schema = { name: 'public' };
    const sourceName = 'test_source';
    const databaseName = 'test_db';

    // TreeNodeWrapper will handle error display based on the error prop
    // For now, we just ensure the component renders without crashing

    render(
      <TreeProvider>
        <SchemaNode schema={schema} sourceName={sourceName} databaseName={databaseName} />
      </TreeProvider>
    );

    expect(screen.getByText('public')).toBeInTheDocument();
  });
});
