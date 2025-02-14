import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useLoaderData, BrowserRouter } from 'react-router-dom';
import { WorksheetProvider } from '../contexts/WorksheetContext';
import { QueryProvider } from '../contexts/QueryContext';
import QueryExplorer from './QueryExplorer';
import { executeQuery, fetchTraceQuery } from '../services/queryService';
import { fetchExplorer } from '../api/explorer';
import * as api from '../api/worksheet';

// Mock dependencies
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLoaderData: jest.fn()
}));

jest.mock('../services/queryService', () => ({
  executeQuery: jest.fn(),
  fetchTraceQuery: jest.fn()
}));

jest.mock('../api/explorer', () => ({
  fetchExplorer: jest.fn()
}));

jest.mock('../api/worksheet', () => ({
  listWorksheets: jest.fn(),
  getWorksheet: jest.fn(),
  createWorksheet: jest.fn(),
  updateWorksheet: jest.fn(),
  deleteWorksheet: jest.fn(),
  getSessionState: jest.fn(),
  updateSessionState: jest.fn()
}));

jest.mock('@monaco-editor/react', () => {
  return function MockMonacoEditor({ value, onChange }) {
    return <textarea data-testid="mock-editor" value={value} onChange={e => onChange(e.target.value)} />;
  };
});

// Mock Table component
jest.mock('../components/items/Table', () => {
  return function MockTable({ table }) {
    return (
      <div data-testid="mock-table">
        {table.traces[0].columns.map(col => (
          <div key={col.header}>{col.header}</div>
        ))}
        {table.traces[0].data.map((row, i) => (
          <div key={i}>
            {Object.values(row).map((value, j) => (
              <div key={j}>{value}</div>
            ))}
          </div>
        ))}
      </div>
    );
  };
});

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

const mockProject = {
  id: 'test-project'
};

const mockExplorerData = {
  sources: [
    { name: 'source1', type: 'postgres' },
    { name: 'source2', type: 'duckdb' }
  ],
  models: [
    { name: 'model1', type: 'CsvScriptModel', sql: 'SELECT * FROM table1' }
  ],
  traces: [
    { name: 'trace1' }
  ]
};

const mockWorksheets = [
  {
    worksheet: {
      id: 'ws1',
      name: 'Worksheet 1',
      query: '',
      selected_source: 'source1'
    },
    session_state: {
      worksheet_id: 'ws1',
      is_visible: true,
      tab_order: 1
    }
  }
];

describe('QueryExplorer', () => {
  beforeEach(() => {
    useLoaderData.mockReturnValue(mockProject);
    fetchExplorer.mockResolvedValue(mockExplorerData);
    executeQuery.mockResolvedValue({
      columns: ['col1', 'col2'],
      data: [{ col1: 'value1', col2: 'value2' }]
    });
    api.listWorksheets.mockResolvedValue(mockWorksheets);
    api.getSessionState.mockResolvedValue(mockWorksheets.map(w => w.session_state));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads and displays explorer data', async () => {
    await act(async () => {
      renderWithProviders(<QueryExplorer />);
    });

    expect(fetchExplorer).toHaveBeenCalled();
    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(screen.getByText('Traces')).toBeInTheDocument();
    expect(screen.getByText('source1')).toBeInTheDocument();
    expect(screen.getByText('source2')).toBeInTheDocument();
  });

  it('executes queries and displays results', async () => {
    await act(async () => {
      renderWithProviders(<QueryExplorer />);
    });

    const editor = screen.getByTestId('mock-editor');
    const runButton = screen.getByText('Run Query');

    fireEvent.change(editor, { target: { value: 'SELECT * FROM test' } });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM test',
        'test-project',
        'source1',
        expect.any(String)
      );
    });

    // Check that results are displayed
    await waitFor(() => {
      const table = screen.getByTestId('mock-table');
      expect(table).toBeInTheDocument();
      expect(screen.getByText('col1')).toBeInTheDocument();
      expect(screen.getByText('value1')).toBeInTheDocument();
    });
  });

  it('clears results when switching worksheets', async () => {
    // Mock the createWorksheet response properly
    api.createWorksheet.mockResolvedValue({
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
    });

    await act(async () => {
      renderWithProviders(<QueryExplorer />);
    });

    // Run a query to get results
    const editor = screen.getByTestId('mock-editor');
    const runButton = screen.getByText('Run Query');

    await act(async () => {
      fireEvent.change(editor, { target: { value: 'SELECT * FROM test' } });
      fireEvent.click(runButton);
    });

    // Wait for results to appear
    await waitFor(() => {
      expect(screen.getByTestId('mock-table')).toBeInTheDocument();
      expect(screen.getByText('col1')).toBeInTheDocument();
    });

    // Create a new worksheet (which should clear results)
    const createButton = screen.getByTestId('create-worksheet');
    
    await act(async () => {
      fireEvent.click(createButton);
    });

    // Verify results are cleared
    await waitFor(() => {
      expect(screen.queryByTestId('mock-table')).not.toBeInTheDocument();
      expect(screen.queryByText('col1')).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('displays query stats after execution', async () => {
    await act(async () => {
      renderWithProviders(<QueryExplorer />);
    });

    const editor = screen.getByTestId('mock-editor');
    const runButton = screen.getByText('Run Query');

    fireEvent.change(editor, { target: { value: 'SELECT * FROM test' } });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByText(/Last Run at/)).toBeInTheDocument();
      expect(screen.getByText(/Source: source1/)).toBeInTheDocument();
    });
  });

  it('handles errors during query execution', async () => {
    executeQuery.mockRejectedValueOnce(new Error('Query failed'));

    await act(async () => {
      renderWithProviders(<QueryExplorer />);
    });

    const editor = screen.getByTestId('mock-editor');
    const runButton = screen.getByText('Run Query');

    fireEvent.change(editor, { target: { value: 'SELECT * FROM test' } });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByText('Query failed')).toBeInTheDocument();
    });
  });

  it('loads model queries when clicking on models', async () => {
    await act(async () => {
      renderWithProviders(<QueryExplorer />);
    });

    // Click on the model in the explorer
    const modelButton = screen.getByText('model1');
    fireEvent.click(modelButton);

    // Verify the query is loaded into the editor
    await waitFor(() => {
      const editor = screen.getByTestId('mock-editor');
      expect(editor.value).toContain('WITH model AS (SELECT * FROM table1)');
    });
  });
}); 