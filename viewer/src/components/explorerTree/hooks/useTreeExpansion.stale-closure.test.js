import { renderHook, act } from '@testing-library/react';
import { useTreeExpansion } from './useTreeExpansion';
import { useTreeContext } from '../TreeContext';

// Mock TreeContext
jest.mock('../TreeContext');

describe('useTreeExpansion - Stale Closure Issue', () => {
  let mockTreeContext;

  beforeEach(() => {
    mockTreeContext = {
      sourcesMetadata: {},
      loadDatabases: jest.fn(),
      loadSchemas: jest.fn(),
      loadTables: jest.fn(),
      loadColumns: jest.fn(),
    };

    useTreeContext.mockReturnValue(mockTreeContext);
  });

  test('should detect stale closure in handleNodeToggle', async () => {
    const { result } = renderHook(() => useTreeExpansion());

    const sourceNodeId = btoa(
      JSON.stringify({
        type: 'source',
        path: ['test_source'],
      })
    );

    const dbNodeId = btoa(
      JSON.stringify({
        type: 'database',
        path: ['test_source', 'test_db'],
      })
    );

    // First expansion - expand source
    await act(async () => {
      await result.current.handleNodeToggle(null, [sourceNodeId]);
    });

    expect(result.current.expandedNodes).toEqual([sourceNodeId]);

    // Second expansion - try to expand both source and database
    // This should work if closure is not stale
    await act(async () => {
      await result.current.handleNodeToggle(null, [sourceNodeId, dbNodeId]);
    });

    // Check if expandedNodes includes both
    expect(result.current.expandedNodes).toEqual([sourceNodeId, dbNodeId]);

    // Check that only the database load was called (source already expanded)
    expect(mockTreeContext.loadDatabases).toHaveBeenCalledTimes(1);
    expect(mockTreeContext.loadSchemas).toHaveBeenCalledTimes(1);
  });

  test('should properly track expansion state across multiple toggles', async () => {
    const { result } = renderHook(() => useTreeExpansion());

    const node1 = btoa(JSON.stringify({ type: 'source', path: ['source1'] }));
    const node2 = btoa(JSON.stringify({ type: 'source', path: ['source2'] }));
    const node3 = btoa(JSON.stringify({ type: 'source', path: ['source3'] }));

    // Expand node1
    await act(async () => {
      await result.current.handleNodeToggle(null, [node1]);
    });
    expect(result.current.expandedNodes).toEqual([node1]);

    // Expand node1 and node2
    await act(async () => {
      await result.current.handleNodeToggle(null, [node1, node2]);
    });
    expect(result.current.expandedNodes).toEqual([node1, node2]);

    // Expand all three
    await act(async () => {
      await result.current.handleNodeToggle(null, [node1, node2, node3]);
    });
    expect(result.current.expandedNodes).toEqual([node1, node2, node3]);

    // Collapse node2 (only node1 and node3 remain)
    await act(async () => {
      await result.current.handleNodeToggle(null, [node1, node3]);
    });
    expect(result.current.expandedNodes).toEqual([node1, node3]);

    // Check that load functions were called only for new expansions
    expect(mockTreeContext.loadDatabases).toHaveBeenCalledTimes(3); // Once for each source
  });
});
