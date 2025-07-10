import { renderHook, act } from '@testing-library/react';
import { useTreeExpansion } from './useTreeExpansion';
import { useTreeContext } from '../TreeContext';

// Mock TreeContext
jest.mock('../TreeContext');

describe('useTreeExpansion', () => {
  let mockTreeContext;

  beforeEach(() => {
    mockTreeContext = {
      sourcesMetadata: {
        sources: [
          { name: 'postgres_source', type: 'postgresql' },
          { name: 'mysql_source', type: 'mysql' }
        ],
        loadedDatabases: {
          'postgres_source': [{ name: 'test_db' }, { name: 'prod_db' }]
        },
        loadedSchemas: {
          'postgres_source.test_db': {
            has_schemas: true,
            schemas: [{ name: 'public' }, { name: 'private' }]
          }
        },
        loadedTables: {
          'postgres_source.test_db.public': [{ name: 'users' }, { name: 'products' }]
        }
      },
      loadDatabases: jest.fn(),
      loadSchemas: jest.fn(),
      loadTables: jest.fn(),
      loadColumns: jest.fn(),
    };

    useTreeContext.mockReturnValue(mockTreeContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize with empty expanded nodes', () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    expect(result.current.expandedNodes).toEqual([]);
  });

  test('should update expanded nodes when toggling', async () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    const nodeIds = ['node1', 'node2'];
    
    await act(async () => {
      await result.current.handleNodeToggle(null, nodeIds);
    });
    
    expect(result.current.expandedNodes).toEqual(nodeIds);
  });

  test('should load databases when expanding source node', async () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    const sourceNodeId = btoa(JSON.stringify({ 
      type: 'source', 
      path: ['postgres_source'] 
    }));
    
    await act(async () => {
      await result.current.handleNodeToggle(null, [sourceNodeId]);
    });
    
    expect(mockTreeContext.loadDatabases).toHaveBeenCalledWith('postgres_source');
  });

  test('should load schemas when expanding database node', async () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    const dbNodeId = btoa(JSON.stringify({ 
      type: 'database', 
      path: ['postgres_source', 'test_db'] 
    }));
    
    await act(async () => {
      await result.current.handleNodeToggle(null, [dbNodeId]);
    });
    
    expect(mockTreeContext.loadSchemas).toHaveBeenCalledWith('postgres_source', 'test_db');
  });

  test('should load tables when expanding schema node', async () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    const schemaNodeId = btoa(JSON.stringify({ 
      type: 'schema', 
      path: ['postgres_source', 'test_db', 'public'] 
    }));
    
    await act(async () => {
      await result.current.handleNodeToggle(null, [schemaNodeId]);
    });
    
    expect(mockTreeContext.loadTables).toHaveBeenCalledWith('postgres_source', 'test_db', 'public');
  });

  test('should load columns when expanding table node with schema', async () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    const tableNodeId = btoa(JSON.stringify({ 
      type: 'table', 
      path: ['postgres_source', 'test_db', 'public', 'users'] 
    }));
    
    await act(async () => {
      await result.current.handleNodeToggle(null, [tableNodeId]);
    });
    
    expect(mockTreeContext.loadColumns).toHaveBeenCalledWith(
      'postgres_source', 
      'test_db', 
      'users', 
      'public'
    );
  });

  test('should load columns when expanding table node without schema', async () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    const tableNodeId = btoa(JSON.stringify({ 
      type: 'table', 
      path: ['duckdb_source', 'main', 'users'] 
    }));
    
    await act(async () => {
      await result.current.handleNodeToggle(null, [tableNodeId]);
    });
    
    expect(mockTreeContext.loadColumns).toHaveBeenCalledWith(
      'duckdb_source', 
      'main', 
      'users'
    );
  });

  test('should only load data for newly expanded nodes', async () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    const sourceNodeId = btoa(JSON.stringify({ 
      type: 'source', 
      path: ['postgres_source'] 
    }));
    
    // First expansion
    await act(async () => {
      await result.current.handleNodeToggle(null, [sourceNodeId]);
    });
    
    expect(mockTreeContext.loadDatabases).toHaveBeenCalledTimes(1);
    
    // Expand again with same node plus another
    const dbNodeId = btoa(JSON.stringify({ 
      type: 'database', 
      path: ['postgres_source', 'test_db'] 
    }));
    
    await act(async () => {
      await result.current.handleNodeToggle(null, [sourceNodeId, dbNodeId]);
    });
    
    // loadDatabases should not be called again for sourceNodeId
    expect(mockTreeContext.loadDatabases).toHaveBeenCalledTimes(1);
    // loadSchemas should be called for the new dbNodeId
    expect(mockTreeContext.loadSchemas).toHaveBeenCalledWith('postgres_source', 'test_db');
  });

  test('should handle invalid node IDs gracefully', async () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    await act(async () => {
      await result.current.handleNodeToggle(null, ['invalid-node-id']);
    });
    
    // Should not call any load functions
    expect(mockTreeContext.loadDatabases).not.toHaveBeenCalled();
    expect(mockTreeContext.loadSchemas).not.toHaveBeenCalled();
    expect(mockTreeContext.loadTables).not.toHaveBeenCalled();
    expect(mockTreeContext.loadColumns).not.toHaveBeenCalled();
  });

  test('should handle multiple node expansions in one call', async () => {
    const { result } = renderHook(() => useTreeExpansion());
    
    const sourceNodeId = btoa(JSON.stringify({ 
      type: 'source', 
      path: ['postgres_source'] 
    }));
    
    const dbNodeId = btoa(JSON.stringify({ 
      type: 'database', 
      path: ['mysql_source', 'main'] 
    }));
    
    await act(async () => {
      await result.current.handleNodeToggle(null, [sourceNodeId, dbNodeId]);
    });
    
    expect(mockTreeContext.loadDatabases).toHaveBeenCalledWith('postgres_source');
    expect(mockTreeContext.loadSchemas).toHaveBeenCalledWith('mysql_source', 'main');
  });
});