import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import { WorksheetProvider, useWorksheets } from './WorksheetContext';
import { QueryProvider } from '../contexts/QueryContext';
import * as worksheetApi from '../api/worksheet';

// Mock the API calls
jest.mock('../api/worksheet', () => ({
  listWorksheets: jest.fn(),
  getWorksheet: jest.fn(),
  createWorksheet: jest.fn(),
  updateWorksheet: jest.fn(),
  deleteWorksheet: jest.fn(),
  getSessionState: jest.fn(),
  updateSessionState: jest.fn(),
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
    isLoading: false,
  }),
}));

// Test component that uses the context
const TestComponent = () => {
  const context = useWorksheets();

  // Expose context through data-testid attributes for testing
  return (
    <div data-testid="worksheet-context">
      <div data-testid="worksheets">
        {context.worksheets.map(worksheet => (
          <div key={worksheet.id} data-testid={`worksheet-${worksheet.id}`}>
            {worksheet.name}
          </div>
        ))}
      </div>
      <button data-testid="create-button" onClick={() => context.actions.createWorksheet()}>
        Create Worksheet
      </button>
      <button
        data-testid="update-button"
        onClick={() =>
          context.actions.updateWorksheet('ws1', {
            name: 'Updated Name',
            query: 'SELECT * FROM updated',
          })
        }
      >
        Update Worksheet
      </button>
      <button data-testid="delete-button" onClick={() => context.actions.deleteWorksheet('ws1')}>
        Delete Worksheet
      </button>
      <button
        data-testid="toggle-visibility-button"
        onClick={() => context.actions.updateWorksheet('ws1', { is_visible: false })}
      >
        Toggle Visibility
      </button>
      <button
        data-testid="reorder-button"
        onClick={() => context.actions.reorderWorksheets(['ws2', 'ws1'])}
      >
        Reorder Worksheets
      </button>
      <button
        data-testid="load-results-button"
        onClick={() => context.actions.loadWorksheetResults('ws1')}
      >
        Load Results
      </button>
    </div>
  );
};

// Wrap component with necessary providers
const renderWithProviders = ui => {
  const mockQueryContext = {
    fetchTracesQuery: jest.fn(),
    fetchDashboardQuery: jest.fn(),
  };

  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryProvider value={mockQueryContext}>
        <WorksheetProvider>{ui}</WorksheetProvider>
      </QueryProvider>
    </BrowserRouter>
  );
};

describe('WorksheetContext', () => {
  // Define all mock worksheets at the top for consistency
  const mockWorksheet1 = {
    worksheet: {
      id: 'ws1',
      name: 'Worksheet 1',
      query: 'SELECT * FROM test1',
      selected_source: 'source1',
    },
    session_state: {
      worksheet_id: 'ws1',
      is_visible: true,
      tab_order: 1,
    },
  };

  const mockWorksheet2 = {
    worksheet: {
      id: 'ws2',
      name: 'Worksheet 2',
      query: '',
      selected_source: 'source1',
    },
    session_state: {
      worksheet_id: 'ws2',
      is_visible: true,
      tab_order: 2,
    },
  };

  const mockWorksheets = [mockWorksheet1];

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to initial state with just one worksheet
    worksheetApi.listWorksheets.mockResolvedValue([mockWorksheet1]);
    worksheetApi.getSessionState.mockResolvedValue([mockWorksheet1.session_state]);
    worksheetApi.updateSessionState.mockImplementation(async newState => newState);
    worksheetApi.updateWorksheet.mockImplementation(async (id, updates) => {
      const baseWorksheet = id === 'ws1' ? mockWorksheet1 : mockWorksheet2;
      return {
        worksheet: { ...baseWorksheet.worksheet, ...updates },
        session_state: baseWorksheet.session_state,
      };
    });
  });

  afterEach(() => {
    // Clean up any mounted components
    jest.clearAllMocks();
  });

  it('loads initial worksheet state', async () => {
    renderWithProviders(<TestComponent />);

    await waitFor(() => {
      expect(worksheetApi.listWorksheets).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Worksheet 1')).toBeInTheDocument();
    });
  });

  it('creates new worksheet', async () => {
    const { unmount } = renderWithProviders(<TestComponent />);

    // Wait for initial render with just the first worksheet
    await waitFor(() => {
      expect(screen.getByText('Worksheet 1')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText('Worksheet 2')).not.toBeInTheDocument();
    });

    // Setup the creation response
    worksheetApi.createWorksheet.mockResolvedValue(mockWorksheet2);

    // Prepare the new state after creation
    const updatedWorksheets = [mockWorksheet1, mockWorksheet2];
    worksheetApi.listWorksheets.mockResolvedValue(updatedWorksheets);

    // Trigger creation
    const createButton = screen.getByTestId('create-button');
    fireEvent.click(createButton);

    // Verify the API call
    await waitFor(() => {
      expect(worksheetApi.createWorksheet).toHaveBeenCalled();
    });

    // Verify the new worksheet appears
    await waitFor(() => {
      expect(screen.getByText('Worksheet 2')).toBeInTheDocument();
    });

    // Clean up
    unmount();
  });

  it('updates worksheet name and query', async () => {
    const updatedWorksheet = {
      worksheet: {
        id: 'ws1',
        name: 'Updated Name',
        query: 'SELECT * FROM updated',
      },
      session_state: {
        worksheet_id: 'ws1',
        is_visible: true,
        tab_order: 1,
      },
    };

    // Start with original worksheet
    worksheetApi.listWorksheets.mockResolvedValue(mockWorksheets);

    renderWithProviders(<TestComponent />);

    // Wait for initial render with original name
    await waitFor(() => {
      expect(screen.getByText('Worksheet 1')).toBeInTheDocument();
    });

    // Setup mocks for the update
    worksheetApi.updateWorksheet.mockResolvedValue(updatedWorksheet);
    worksheetApi.listWorksheets.mockImplementation(async () => [updatedWorksheet]);

    const updateButton = screen.getByTestId('update-button');
    fireEvent.click(updateButton);

    // Verify the update API was called
    await waitFor(() => {
      expect(worksheetApi.updateWorksheet).toHaveBeenCalledWith('ws1', {
        name: 'Updated Name',
        query: 'SELECT * FROM updated',
      });
    });

    // Verify old name is gone
    await waitFor(() => {
      expect(screen.queryByText('Worksheet 1')).not.toBeInTheDocument();
    });

    // Verify new name appears
    await waitFor(() => {
      expect(screen.getByText('Updated Name')).toBeInTheDocument();
    });
  });

  it('deletes a worksheet', async () => {
    renderWithProviders(<TestComponent />);

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Worksheet 1')).toBeInTheDocument();
    });

    worksheetApi.deleteWorksheet.mockResolvedValue({});
    worksheetApi.listWorksheets.mockImplementation(async () => []);
    worksheetApi.updateSessionState.mockResolvedValue([]);

    const deleteButton = screen.getByTestId('delete-button');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(worksheetApi.deleteWorksheet).toHaveBeenCalledWith('ws1');
    });

    await waitFor(() => {
      expect(screen.queryByText('Worksheet 1')).not.toBeInTheDocument();
    });
  });

  it('reorders worksheets', async () => {
    // Start with both worksheets in initial order
    const initialWorksheets = [mockWorksheet1, mockWorksheet2];
    worksheetApi.listWorksheets.mockResolvedValue(initialWorksheets);

    const { unmount } = renderWithProviders(<TestComponent />);

    // Wait for initial render of both worksheets
    await waitFor(() => {
      const worksheet1 = screen.getByText('Worksheet 1');
      expect(worksheet1).toBeInTheDocument();
    });

    await waitFor(() => {
      const worksheet2 = screen.getByText('Worksheet 2');
      expect(worksheet2).toBeInTheDocument();
    });

    // Prepare the reordered state
    const reorderedWorksheets = [mockWorksheet2, mockWorksheet1];
    worksheetApi.listWorksheets.mockResolvedValue(reorderedWorksheets);

    const reorderedSessionState = [
      { ...mockWorksheet2.session_state, tab_order: 1 },
      { ...mockWorksheet1.session_state, tab_order: 2 },
    ];
    worksheetApi.updateSessionState.mockResolvedValue(reorderedSessionState);

    // Trigger reorder
    const reorderButton = screen.getByTestId('reorder-button');
    fireEvent.click(reorderButton);

    // Verify the API call
    await waitFor(() => {
      expect(worksheetApi.updateSessionState).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ worksheet_id: 'ws2', tab_order: 1 }),
          expect.objectContaining({ worksheet_id: 'ws1', tab_order: 2 }),
        ])
      );
    });

    // Clean up
    unmount();
  });

  it('manages worksheet visibility', async () => {
    renderWithProviders(<TestComponent />);

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Worksheet 1')).toBeInTheDocument();
    });

    const updatedSessionState = [
      {
        worksheet_id: 'ws1',
        is_visible: false,
        tab_order: 1,
      },
    ];

    worksheetApi.updateSessionState.mockResolvedValue(updatedSessionState);
    worksheetApi.listWorksheets.mockImplementation(async () => [
      {
        ...mockWorksheets[0],
        session_state: updatedSessionState[0],
      },
    ]);

    const toggleButton = screen.getByTestId('toggle-visibility-button');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(worksheetApi.updateSessionState).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            worksheet_id: 'ws1',
            is_visible: false,
          }),
        ])
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('Worksheet 1')).not.toBeInTheDocument();
    });
  });

  it('loads worksheet results', async () => {
    const mockResults = {
      results: {
        results_json: JSON.stringify({
          columns: ['col1', 'col2'],
          rows: [{ col1: 'value1', col2: 'value2' }],
        }),
        query_stats_json: JSON.stringify({
          timestamp: '2024-03-20T10:00:00',
          source: 'test',
          executionTime: '1.23',
        }),
      },
    };

    worksheetApi.getWorksheet.mockResolvedValue(mockResults);

    renderWithProviders(<TestComponent />);

    const loadResultsButton = screen.getByTestId('load-results-button');
    fireEvent.click(loadResultsButton);

    await waitFor(() => {
      expect(worksheetApi.getWorksheet).toHaveBeenCalledWith('ws1');
    });
  });
});
