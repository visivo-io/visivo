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
  
  return (
    <div>
      {context.worksheets.map(worksheet => (
        <div key={worksheet.id}>{worksheet.name}</div>
      ))}
      <button 
        data-testid="create-button"
        onClick={() => context.actions.createWorksheet()}
      >
        Create Worksheet
      </button>
    </div>
  );
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
      }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    worksheetApi.listWorksheets.mockResolvedValue(mockWorksheets);
    worksheetApi.getSessionState.mockResolvedValue(mockWorksheets.map(w => w.session_state));
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
    worksheetApi.createWorksheet.mockResolvedValue(newWorksheet);

    renderWithProviders(<TestComponent />);

    const createButton = screen.getByTestId('create-button');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(worksheetApi.createWorksheet).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Worksheet 2')).toBeInTheDocument();
    });
  });

  
}); 