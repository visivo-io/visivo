import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourcesTree from './SourcesTree';
import useStore from '../../stores/store';

// Mock the store
jest.mock('../../stores/store');

// Track expansion state
let mockExpandedItems = [];
let mockOnExpandedItemsChange = null;

// Mock MUI components to make testing easier
jest.mock('@mui/x-tree-view/SimpleTreeView', () => ({
  SimpleTreeView: ({ children, onExpandedItemsChange, expandedItems }) => {
    // Store these for use in TreeItem
    mockOnExpandedItemsChange = onExpandedItemsChange;
    mockExpandedItems = expandedItems || [];
    return <div data-testid="tree-view">{children}</div>;
  }
}));

jest.mock('@mui/x-tree-view/TreeItem', () => ({
  TreeItem: ({ children, itemId, label }) => {
    const React = require('react');
    const handleClick = React.useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Simulate tree expansion
      const isExpanded = mockExpandedItems.includes(itemId);
      
      let newExpanded;
      if (isExpanded) {
        // Collapse
        newExpanded = mockExpandedItems.filter(id => id !== itemId);
      } else {
        // Expand
        newExpanded = [...mockExpandedItems, itemId];
      }
      
      if (mockOnExpandedItemsChange) {
        mockOnExpandedItemsChange(null, newExpanded);
      }
    }, [itemId]);
    
    return (
      <div 
        data-testid={`tree-item-${itemId}`} 
        onClick={handleClick}
        style={{ cursor: 'pointer' }}
      >
        <div data-testid={`tree-label-${itemId}`}>{label}</div>
        <div data-testid={`tree-children-${itemId}`}>{children}</div>
      </div>
    );
  }
}));

describe('SourcesTree Integration - Drilling Issue', () => {
  let mockStoreData;
  let loadSourcesCalled = false;
  let loadDatabasesCalled = false;
  let loadSchemasCalled = false;

  beforeEach(() => {
    // Reset call flags
    loadSourcesCalled = false;
    loadDatabasesCalled = false;
    loadSchemasCalled = false;

    // Initialize store with empty state
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
      loadSources: jest.fn(() => {
        loadSourcesCalled = true;
        // Simulate loading sources
        mockStoreData.sourcesMetadata.sources = [
          { name: 'postgres_db', type: 'postgresql', status: 'connected' }
        ];
      }),
      loadDatabases: jest.fn((sourceName) => {
        loadDatabasesCalled = true;
        // Simulate loading databases
        mockStoreData.sourcesMetadata.loadedDatabases[sourceName] = [
          { name: 'production' },
          { name: 'staging' }
        ];
      }),
      loadSchemas: jest.fn((sourceName, dbName) => {
        loadSchemasCalled = true;
        // Simulate loading schemas
        const key = `${sourceName}.${dbName}`;
        mockStoreData.sourcesMetadata.loadedSchemas[key] = {
          has_schemas: true,
          schemas: [{ name: 'public' }, { name: 'private' }]
        };
      }),
      loadTables: jest.fn(),
      loadColumns: jest.fn(),
      setInfo: jest.fn(),
    };

    useStore.mockImplementation((selector) => selector(mockStoreData));
  });

  test('should be able to drill from source to database to schema', async () => {
    const { rerender } = render(<SourcesTree />);

    // Wait for sources to load
    await waitFor(() => {
      expect(mockStoreData.loadSources).toHaveBeenCalled();
    });

    // Force rerender to see loaded sources
    rerender(<SourcesTree />);

    // Find and click on source
    const sourceNodeId = btoa(JSON.stringify({ type: 'source', path: ['postgres_db'] }));
    const sourceItem = screen.getByTestId(`tree-item-${sourceNodeId}`);
    
    expect(sourceItem).toBeInTheDocument();
    
    // Click to expand source
    fireEvent.click(sourceItem);
    
    await waitFor(() => {
      expect(mockStoreData.loadDatabases).toHaveBeenCalledWith('postgres_db');
    });

    // Force rerender to see loaded databases
    rerender(<SourcesTree />);

    // Verify databases are rendered
    const dbNodeId = btoa(JSON.stringify({ type: 'database', path: ['postgres_db', 'production'] }));
    
    await waitFor(() => {
      const dbItem = screen.queryByTestId(`tree-item-${dbNodeId}`);
      expect(dbItem).toBeInTheDocument();
    });

    // Click to expand database
    const dbItem = screen.getByTestId(`tree-item-${dbNodeId}`);
    fireEvent.click(dbItem);
    
    await waitFor(() => {
      expect(mockStoreData.loadSchemas).toHaveBeenCalledWith('postgres_db', 'production');
    });

    // Force rerender to see loaded schemas
    rerender(<SourcesTree />);

    // Verify schemas are rendered
    const schemaNodeId = btoa(JSON.stringify({ type: 'schema', path: ['postgres_db', 'production', 'public'] }));
    
    await waitFor(() => {
      const schemaItem = screen.queryByTestId(`tree-item-${schemaNodeId}`);
      expect(schemaItem).toBeInTheDocument();
    });
    
    // Verify the drilling worked
    expect(loadSourcesCalled).toBe(true);
    expect(loadDatabasesCalled).toBe(true);
    expect(loadSchemasCalled).toBe(true);
  });

  test('should render placeholder when database has no loaded schema data', async () => {
    const { rerender } = render(<SourcesTree />);

    // Set up sources and databases
    mockStoreData.sourcesMetadata.sources = [
      { name: 'test_source', type: 'postgresql', status: 'connected' }
    ];
    mockStoreData.sourcesMetadata.loadedDatabases['test_source'] = [
      { name: 'test_db' }
    ];

    rerender(<SourcesTree />);

    // The database should be rendered
    const dbNodeId = btoa(JSON.stringify({ type: 'database', path: ['test_source', 'test_db'] }));
    const dbItem = screen.getByTestId(`tree-item-${dbNodeId}`);
    expect(dbItem).toBeInTheDocument();

    // Should show placeholder since no schema data is loaded
    expect(screen.getByText('Click to expand')).toBeInTheDocument();
  });

  test('should handle expansion state correctly across multiple nodes', async () => {
    const { rerender } = render(<SourcesTree />);

    // Set up multiple sources
    mockStoreData.sourcesMetadata.sources = [
      { name: 'source1', type: 'postgresql', status: 'connected' },
      { name: 'source2', type: 'mysql', status: 'connected' }
    ];

    rerender(<SourcesTree />);

    const source1Id = btoa(JSON.stringify({ type: 'source', path: ['source1'] }));
    const source2Id = btoa(JSON.stringify({ type: 'source', path: ['source2'] }));

    // Expand first source
    fireEvent.click(screen.getByTestId(`tree-item-${source1Id}`));
    
    await waitFor(() => {
      expect(mockStoreData.loadDatabases).toHaveBeenCalledWith('source1');
    });

    // Expand second source
    fireEvent.click(screen.getByTestId(`tree-item-${source2Id}`));
    
    await waitFor(() => {
      expect(mockStoreData.loadDatabases).toHaveBeenCalledWith('source2');
    });

    // Both should have been called
    expect(mockStoreData.loadDatabases).toHaveBeenCalledTimes(2);
  });
});