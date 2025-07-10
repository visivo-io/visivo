import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourcesTree from './SourcesTree';
import * as explorerApi from '../../api/explorer';
import useStore from '../../stores/store';

// Mock the API
jest.mock('../../api/explorer');

// Mock the store
jest.mock('../../stores/store');

// Mock MUI TreeView components
let mockExpandHandler = null;
let mockExpandedItems = [];

jest.mock('@mui/x-tree-view/SimpleTreeView', () => ({
  SimpleTreeView: ({ children, onExpandedItemsChange, expandedItems }) => {
    // Store the expansion handler in module scope
    mockExpandHandler = onExpandedItemsChange;
    mockExpandedItems = expandedItems || [];
    return <div data-testid="tree-view">{children}</div>;
  },
}));

jest.mock('@mui/x-tree-view/TreeItem', () => ({
  TreeItem: ({ children, itemId, label, ...props }) => {
    const handleClick = () => {
      // Simulate expansion
      if (mockExpandHandler) {
        const currentExpanded = mockExpandedItems;
        if (currentExpanded.includes(itemId)) {
          mockExpandHandler(
            null,
            currentExpanded.filter(id => id !== itemId)
          );
        } else {
          mockExpandHandler(null, [...currentExpanded, itemId]);
        }
      }
    };

    return (
      <div data-testid={`tree-item-${itemId}`} onClick={handleClick}>
        <div data-testid={`tree-label-${itemId}`}>{label}</div>
        {children}
      </div>
    );
  },
}));

describe('SourcesTree Drilling Tests', () => {
  let mockStoreData;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Initialize mock store data
    mockStoreData = {
      sourcesMetadata: {
        sources: [],
        loadedDatabases: {},
        loadedSchemas: {},
        loadedTables: {},
        loadedColumns: {},
      },
      loadingStates: {
        sources: false,
        databases: {},
        schemas: {},
        tables: {},
        columns: {},
        connections: {},
      },
      loadSources: jest.fn(),
      loadDatabases: jest.fn(),
      loadSchemas: jest.fn(),
      loadTables: jest.fn(),
      loadColumns: jest.fn(),
      setInfo: jest.fn(),
    };

    useStore.mockImplementation(selector => selector(mockStoreData));
  });

  test('should drill from source to database to schema to table to column', async () => {
    // Mock API responses
    explorerApi.fetchSources.mockResolvedValue({
      sources: [{ name: 'postgres_source', type: 'postgresql', status: 'connected' }],
    });

    explorerApi.fetchDatabases.mockResolvedValue({
      source: 'postgres_source',
      databases: [{ name: 'test_db' }],
      status: 'connected',
    });

    explorerApi.fetchSchemas.mockResolvedValue({
      source: 'postgres_source',
      database: 'test_db',
      schemas: [{ name: 'public' }],
      has_schemas: true,
    });

    explorerApi.fetchTables.mockResolvedValue({
      source: 'postgres_source',
      database: 'test_db',
      schema: 'public',
      tables: [{ name: 'users' }],
    });

    explorerApi.fetchColumns.mockResolvedValue({
      source: 'postgres_source',
      database: 'test_db',
      schema: 'public',
      table: 'users',
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'varchar' },
      ],
    });

    // Mock loadSources to update the store
    mockStoreData.loadSources.mockImplementation(() => {
      mockStoreData.sourcesMetadata.sources = [
        { name: 'postgres_source', type: 'postgresql', status: 'connected' },
      ];
    });

    // Mock loadDatabases
    mockStoreData.loadDatabases.mockImplementation(sourceName => {
      mockStoreData.sourcesMetadata.loadedDatabases[sourceName] = [{ name: 'test_db' }];
    });

    // Mock loadSchemas
    mockStoreData.loadSchemas.mockImplementation((sourceName, dbName) => {
      const key = `${sourceName}.${dbName}`;
      mockStoreData.sourcesMetadata.loadedSchemas[key] = {
        schemas: [{ name: 'public' }],
        has_schemas: true,
      };
    });

    // Mock loadTables
    mockStoreData.loadTables.mockImplementation((sourceName, dbName, schemaName) => {
      const key = `${sourceName}.${dbName}.${schemaName}`;
      mockStoreData.sourcesMetadata.loadedTables[key] = [{ name: 'users' }];
    });

    // Mock loadColumns
    mockStoreData.loadColumns.mockImplementation((sourceName, dbName, tableName, schemaName) => {
      const key = `${sourceName}.${dbName}.${schemaName}.${tableName}`;
      mockStoreData.sourcesMetadata.loadedColumns[key] = [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'varchar' },
      ];
    });

    const { rerender } = render(<SourcesTree />);

    // Wait for sources to load
    await waitFor(() => {
      expect(mockStoreData.loadSources).toHaveBeenCalled();
    });

    // Force rerender with loaded sources
    rerender(<SourcesTree />);

    // Verify source is rendered
    const sourceNodeId = btoa(JSON.stringify({ type: 'source', path: ['postgres_source'] }));
    await waitFor(() => {
      expect(screen.getByTestId(`tree-item-${sourceNodeId}`)).toBeInTheDocument();
    });

    // Click on source to expand
    fireEvent.click(screen.getByTestId(`tree-item-${sourceNodeId}`));

    await waitFor(() => {
      expect(mockStoreData.loadDatabases).toHaveBeenCalledWith('postgres_source');
    });

    // Force rerender with loaded databases
    rerender(<SourcesTree />);

    // Verify database is rendered
    const dbNodeId = btoa(
      JSON.stringify({ type: 'database', path: ['postgres_source', 'test_db'] })
    );
    await waitFor(() => {
      expect(screen.getByTestId(`tree-item-${dbNodeId}`)).toBeInTheDocument();
    });

    // Click on database to expand
    fireEvent.click(screen.getByTestId(`tree-item-${dbNodeId}`));

    await waitFor(() => {
      expect(mockStoreData.loadSchemas).toHaveBeenCalledWith('postgres_source', 'test_db');
    });

    // Force rerender with loaded schemas
    rerender(<SourcesTree />);

    // Verify schema is rendered
    const schemaNodeId = btoa(
      JSON.stringify({ type: 'schema', path: ['postgres_source', 'test_db', 'public'] })
    );
    await waitFor(() => {
      expect(screen.getByTestId(`tree-item-${schemaNodeId}`)).toBeInTheDocument();
    });

    // Click on schema to expand
    fireEvent.click(screen.getByTestId(`tree-item-${schemaNodeId}`));

    await waitFor(() => {
      expect(mockStoreData.loadTables).toHaveBeenCalledWith('postgres_source', 'test_db', 'public');
    });

    // Force rerender with loaded tables
    rerender(<SourcesTree />);

    // Verify table is rendered
    const tableNodeId = btoa(
      JSON.stringify({ type: 'table', path: ['postgres_source', 'test_db', 'public', 'users'] })
    );
    await waitFor(() => {
      expect(screen.getByTestId(`tree-item-${tableNodeId}`)).toBeInTheDocument();
    });

    // Click on table to expand
    fireEvent.click(screen.getByTestId(`tree-item-${tableNodeId}`));

    await waitFor(() => {
      expect(mockStoreData.loadColumns).toHaveBeenCalledWith(
        'postgres_source',
        'test_db',
        'users',
        'public'
      );
    });

    // Force rerender with loaded columns
    rerender(<SourcesTree />);

    // Verify columns are rendered
    const columnNodeId1 = btoa(
      JSON.stringify({
        type: 'column',
        path: ['postgres_source', 'test_db', 'public', 'users', 'id'],
      })
    );
    const columnNodeId2 = btoa(
      JSON.stringify({
        type: 'column',
        path: ['postgres_source', 'test_db', 'public', 'users', 'name'],
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId(`tree-item-${columnNodeId1}`)).toBeInTheDocument();
    });
    expect(screen.getByTestId(`tree-item-${columnNodeId2}`)).toBeInTheDocument();
  });

  test('should handle databases without schemas (DuckDB/SQLite)', async () => {
    // Mock API responses
    explorerApi.fetchSources.mockResolvedValue({
      sources: [{ name: 'duckdb_source', type: 'duckdb', status: 'connected' }],
    });

    explorerApi.fetchDatabases.mockResolvedValue({
      source: 'duckdb_source',
      databases: [{ name: 'main' }],
      status: 'connected',
    });

    explorerApi.fetchSchemas.mockResolvedValue({
      source: 'duckdb_source',
      database: 'main',
      schemas: null,
      has_schemas: false,
    });

    explorerApi.fetchTables.mockResolvedValue({
      source: 'duckdb_source',
      database: 'main',
      schema: null,
      tables: [{ name: 'products' }],
    });

    explorerApi.fetchColumns.mockResolvedValue({
      source: 'duckdb_source',
      database: 'main',
      schema: null,
      table: 'products',
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'varchar' },
      ],
    });

    // Mock store updates
    mockStoreData.loadSources.mockImplementation(() => {
      mockStoreData.sourcesMetadata.sources = [
        { name: 'duckdb_source', type: 'duckdb', status: 'connected' },
      ];
    });

    mockStoreData.loadDatabases.mockImplementation(sourceName => {
      mockStoreData.sourcesMetadata.loadedDatabases[sourceName] = [{ name: 'main' }];
    });

    mockStoreData.loadSchemas.mockImplementation(async (sourceName, dbName) => {
      const key = `${sourceName}.${dbName}`;
      mockStoreData.sourcesMetadata.loadedSchemas[key] = {
        schemas: null,
        has_schemas: false,
      };
      // Should automatically load tables when no schemas
      await mockStoreData.loadTables(sourceName, dbName);
    });

    mockStoreData.loadTables.mockImplementation((sourceName, dbName, schemaName) => {
      const key = schemaName ? `${sourceName}.${dbName}.${schemaName}` : `${sourceName}.${dbName}`;
      mockStoreData.sourcesMetadata.loadedTables[key] = [{ name: 'products' }];
    });

    mockStoreData.loadColumns.mockImplementation((sourceName, dbName, tableName, schemaName) => {
      const key = schemaName
        ? `${sourceName}.${dbName}.${schemaName}.${tableName}`
        : `${sourceName}.${dbName}.${tableName}`;
      mockStoreData.sourcesMetadata.loadedColumns[key] = [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'varchar' },
      ];
    });

    const { rerender } = render(<SourcesTree />);

    // Wait for sources to load
    await waitFor(() => {
      expect(mockStoreData.loadSources).toHaveBeenCalled();
    });

    rerender(<SourcesTree />);

    // Click on source
    const sourceNodeId = btoa(JSON.stringify({ type: 'source', path: ['duckdb_source'] }));
    fireEvent.click(screen.getByTestId(`tree-item-${sourceNodeId}`));

    await waitFor(() => {
      expect(mockStoreData.loadDatabases).toHaveBeenCalledWith('duckdb_source');
    });

    rerender(<SourcesTree />);

    // Click on database - should load schemas then auto-load tables
    const dbNodeId = btoa(JSON.stringify({ type: 'database', path: ['duckdb_source', 'main'] }));
    fireEvent.click(screen.getByTestId(`tree-item-${dbNodeId}`));

    await waitFor(() => {
      expect(mockStoreData.loadSchemas).toHaveBeenCalledWith('duckdb_source', 'main');
    });
    expect(mockStoreData.loadTables).toHaveBeenCalledWith('duckdb_source', 'main');

    rerender(<SourcesTree />);

    // Verify table is rendered directly under database (no schema)
    const tableNodeId = btoa(
      JSON.stringify({ type: 'table', path: ['duckdb_source', 'main', 'products'] })
    );
    await waitFor(() => {
      expect(screen.getByTestId(`tree-item-${tableNodeId}`)).toBeInTheDocument();
    });

    // Click on table to expand
    fireEvent.click(screen.getByTestId(`tree-item-${tableNodeId}`));

    await waitFor(() => {
      expect(mockStoreData.loadColumns).toHaveBeenCalledWith(
        'duckdb_source',
        'main',
        'products'
      );
    });

    rerender(<SourcesTree />);

    // Verify columns are rendered
    const columnNodeId1 = btoa(
      JSON.stringify({ type: 'column', path: ['duckdb_source', 'main', 'products', 'id'] })
    );
    await waitFor(() => {
      expect(screen.getByTestId(`tree-item-${columnNodeId1}`)).toBeInTheDocument();
    });
  });
});
