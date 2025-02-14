import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { WorksheetProvider, useWorksheets } from './WorksheetContext';
import { QueryProvider } from '../contexts/QueryContext';
import * as api from '../api/worksheet';

// Mock the API calls
jest.mock('../api/worksheet', () => ({
  listWorksheets: jest.fn(),
  getWorksheet: jest.fn(),
  createWorksheet: jest.fn(),
  updateWorksheet: jest.fn(),
  deleteWorksheet: jest.fn(),
  getSessionState: jest.fn(),
  updateSessionState: jest.fn()
}));

// Mock fetch for network requests
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);

// Mock useQuery hook
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn().mockReturnValue({
    data: null,
    isLoading: false
  })
}));

// Test component that uses the context
const TestComponent = ({ onLoad }) => {
  const context = useWorksheets();
  React.useEffect(() => {
    if (context && onLoad) {
      onLoad(context);
    }
  }, [context, onLoad]);
  return null;
};

// Wrap component with necessary providers
const renderWithProviders = (ui) => {
  const mockQueryContext = {
    fetchTracesQuery: jest.fn(),
    fetchDashboardQuery: jest.fn()
  };

  return render(
    <BrowserRouter>
      <QueryProvider value={mockQueryContext}>
        <WorksheetProvider>
          {ui}
        </WorksheetProvider>
      </QueryProvider>
    </BrowserRouter>
  );
};

describe('WorksheetContext', () => {
  const mockWorksheets = [
    {
      worksheet: {
        id: 'ws1',
        name: 'Worksheet 1',
        query: 'SELECT * FROM test1',
        selected_source: 'source1'
      },
      session_state: {
        worksheet_id: 'ws1',
        is_visible: true,
        tab_order: 1
      },
      results: {
        results_json: JSON.stringify({
          columns: ['col1'],
          rows: [{ col1: 'value1' }]
        }),
        query_stats_json: JSON.stringify({
          timestamp: '2024-02-14T12:00:00',
          source: 'source1',
          executionTime: '1.23'
        })
      }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    api.listWorksheets.mockResolvedValue(mockWorksheets);
    api.getSessionState.mockResolvedValue(mockWorksheets.map(w => w.session_state));
  });

  it('loads initial worksheet state', async () => {
    let contextValue;
    await act(async () => {
      renderWithProviders(
        <TestComponent onLoad={(context) => { contextValue = context; }} />
      );
    });

    await waitFor(() => {
      expect(api.listWorksheets).toHaveBeenCalled();
      expect(contextValue.worksheets).toBeDefined();
      expect(contextValue.worksheets).toHaveLength(1);
      expect(contextValue.worksheets[0].id).toBe('ws1');
    });
  });

  it('creates new worksheet', async () => {
    const newWorksheet = {
      worksheet: {
        id: 'ws2',
        name: 'Worksheet 2',
        query: ''
      },
      session_state: {
        worksheet_id: 'ws2',
        is_visible: true,
        tab_order: 2
      }
    };
    api.createWorksheet.mockResolvedValue(newWorksheet);

    let contextValue;
    await act(async () => {
      renderWithProviders(
        <TestComponent onLoad={(context) => { contextValue = context; }} />
      );
    });

    await waitFor(() => {
      expect(contextValue.worksheets).toBeDefined();
      expect(contextValue.worksheets).toHaveLength(1);
    });

    await act(async () => {
      await contextValue.actions.createWorksheet();
    });

    await waitFor(() => {
      expect(api.createWorksheet).toHaveBeenCalled();
      expect(contextValue.worksheets).toHaveLength(2);
    });
  });

  it('loads worksheet results', async () => {
    const mockResults = {
      results_json: JSON.stringify({
        columns: ['col1'],
        rows: [{ col1: 'value1' }]
      }),
      query_stats_json: JSON.stringify({
        timestamp: '2024-02-14T12:00:00',
        source: 'source1',
        executionTime: '1.23'
      })
    };

    api.getWorksheet.mockResolvedValue({
      ...mockWorksheets[0],
      results: mockResults
    });

    let contextValue;
    await act(async () => {
      renderWithProviders(
        <TestComponent onLoad={(context) => { contextValue = context; }} />
      );
    });

    let results;
    await act(async () => {
      results = await contextValue.actions.loadWorksheetResults('ws1');
    });

    expect(api.getWorksheet).toHaveBeenCalledWith('ws1');
    expect(results.results).toBeDefined();
    expect(results.queryStats).toBeDefined();
  });

  it('clears results when switching worksheets', async () => {
    let contextValue;
    await act(async () => {
      renderWithProviders(
        <TestComponent onLoad={(context) => { contextValue = context; }} />
      );
    });

    // Set initial active worksheet
    await act(async () => {
      contextValue.actions.setActiveWorksheetId('ws1');
    });

    // Create new worksheet
    const newWorksheet = {
      worksheet: {
        id: 'ws2',
        name: 'Worksheet 2',
        query: ''
      },
      session_state: {
        worksheet_id: 'ws2',
        is_visible: true,
        tab_order: 2
      }
    };
    api.createWorksheet.mockResolvedValue(newWorksheet);

    await act(async () => {
      await contextValue.actions.createWorksheet();
      contextValue.actions.setActiveWorksheetId('ws2');
    });

    // Verify worksheetResults for ws2 is null
    expect(contextValue.worksheetResults['ws2']).toBeUndefined();
  });

  it('updates worksheet with new results', async () => {
    const mockUpdate = {
      query: 'SELECT * FROM new_table',
      selected_source: 'source2'
    };

    api.updateWorksheet.mockResolvedValue({
      message: 'Worksheet updated successfully'
    });

    let contextValue;
    await act(async () => {
      renderWithProviders(
        <TestComponent onLoad={(context) => { contextValue = context; }} />
      );
    });

    await act(async () => {
      await contextValue.actions.updateWorksheet('ws1', mockUpdate);
    });

    expect(api.updateWorksheet).toHaveBeenCalledWith('ws1', mockUpdate);
  });

  it('handles errors during worksheet operations', async () => {
    api.createWorksheet.mockRejectedValue(new Error('Failed to create worksheet'));

    let contextValue;
    await act(async () => {
      renderWithProviders(
        <TestComponent onLoad={(context) => { contextValue = context; }} />
      );
    });

    await act(async () => {
      try {
        await contextValue.actions.createWorksheet();
      } catch (err) {
        expect(err.message).toBe('Failed to create worksheet');
      }
    });

    expect(contextValue.error).toBeDefined();
  });
}); 