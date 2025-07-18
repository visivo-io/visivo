import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useLoaderData, BrowserRouter } from 'react-router-dom';
import { WorksheetProvider } from '../../contexts/WorksheetContext';
import { URLProvider } from '../../contexts/URLContext';
import Explorer from './Explorer';
import * as queryService from '../../services/queryService';
import { fetchExplorer } from '../../api/explorer';
import * as api from '../../api/worksheet';
import useStore from '../../stores/store';

let mockDefaultStore = {
  // State values
  isDragging: false,
  explorerData: null,
  selectedType: 'models',
  treeData: [{ id: 'model1', name: 'model1', type: 'model' }],
  selectedSource: null,
  query: '',
  isLoading: false,
  results: null,
  queryStats: null,
  splitRatio: 0.5,
  error: null,
  project: {
    id: 'test-project',
  },
  namedChildren: {
    model1: {
      id: 'model1',
      name: 'model1',
      type: 'model',
    },
  },
  // State setters
  setQuery: jest.fn(),
  setError: jest.fn(),
  setResults: jest.fn(),
  setIsLoading: jest.fn(),
  setTreeData: jest.fn(),
  setSelectedType: jest.fn(),
  setExplorerData: jest.fn(),
  setSelectedSource: jest.fn(),
  setQueryStats: jest.fn(),
  setSplitRatio: jest.fn(),
  setIsDragging: jest.fn(),
  setProject: jest.fn(),
  setActiveWorksheetId: jest.fn(),
  handleRunQuery: jest.fn(),
};
// Mock Zustand store
jest.mock('../../stores/store', () => ({
  __esModule: true,
  default: jest.fn(passedFunction => {
    if (passedFunction) {
      return passedFunction(mockDefaultStore);
    }
    return mockDefaultStore;
  }),
}));

// Mock dependencies
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLoaderData: jest.fn(),
}));

jest.mock('../../services/queryService', () => ({
  executeQuery: jest.fn(),
  fetchTraceQuery: jest.fn(),
}));

jest.mock('../../api/explorer', () => ({
  fetchExplorer: jest.fn(),
}));

jest.mock('../../api/worksheet', () => ({
  listWorksheets: jest.fn(),
  getWorksheet: jest.fn(),
  createWorksheet: jest.fn(),
  updateWorksheet: jest.fn(),
  deleteWorksheet: jest.fn(),
  getSessionState: jest.fn(),
  updateSessionState: jest.fn(),
}));

jest.mock('@monaco-editor/react', () => {
  const Editor = function MockMonacoEditor({ value, onChange }) {
    return (
      <div data-testid="mock-editor-container">
        <textarea
          data-testid="mock-editor"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    );
  };

  return {
    __esModule: true,
    default: Editor,
    Editor,
  };
});

// Mock Table component
jest.mock('../../components/items/Table', () => {
  return function MockTable({ table }) {
    if (!table || !table.traces || !table.traces[0]) return null;
    return (
      <div data-testid="mock-table">
        {table.traces[0].columns.map(col => (
          <div key={col.header} data-testid={`column-${col.header}`}>
            {col.header}
          </div>
        ))}
        {table.traces[0].data.map((row, i) => (
          <div key={i}>
            {Object.values(row).map((value, j) => (
              <div key={j} data-testid={`cell-${i}-${j}`}>
                {value}
              </div>
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
    isLoading: false,
  }),
}));

// Mock the worksheet context with proper async behavior
const mockLoadWorksheetResults = jest.fn().mockResolvedValue({ results: null, queryStats: null });
const mockUpdateWorksheet = jest.fn().mockResolvedValue({});
const mockCreateWorksheet = jest.fn().mockResolvedValue({});
const mockSetActiveWorksheetId = jest.fn();

jest.mock('../../contexts/WorksheetContext', () => ({
  ...jest.requireActual('../../contexts/WorksheetContext'),
  useWorksheets: () => ({
    worksheets: [
      {
        worksheet: {
          id: 'ws1',
          name: 'Worksheet 1',
          query: '',
          selected_source: 'source1',
        },
        session_state: {
          worksheet_id: 'ws1',
          is_visible: true,
          tab_order: 1,
        },
      },
    ],
    activeWorksheetId: 'ws1',
    isLoading: false,
    error: null,
    actions: {
      createWorksheet: mockCreateWorksheet,
      updateWorksheet: mockUpdateWorksheet,
      deleteWorksheet: jest.fn(),
      setActiveWorksheetId: mockSetActiveWorksheetId,
      loadWorksheetResults: mockLoadWorksheetResults,
      clearError: jest.fn(),
    },
  }),
}));

// Wrap component with necessary providers
const renderWithProviders = ui => {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <URLProvider environment="local">
        <WorksheetProvider>{ui}</WorksheetProvider>
      </URLProvider>
    </BrowserRouter>
  );
};

const mockProject = {
  id: 'test-project',
};

const mockExplorerData = {
  sources: [
    { name: 'source1', type: 'postgres' },
    { name: 'source2', type: 'duckdb' },
  ],
  models: [
    {
      name: 'model1',
      type: 'CsvScriptModel',
      sql: 'SELECT * FROM table1',
      displayName: 'model1',
    },
  ],
  traces: [{ name: 'trace1' }],
};

const mockWorksheets = [
  {
    worksheet: {
      id: 'ws1',
      name: 'Worksheet 1',
      query: '',
      selected_source: 'source1',
    },
    session_state: {
      worksheet_id: 'ws1',
      is_visible: true,
      tab_order: 1,
    },
  },
];

describe('Explorer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLoaderData.mockReturnValue(mockProject);
    fetchExplorer.mockResolvedValue(mockExplorerData);

    api.listWorksheets.mockResolvedValue(mockWorksheets);
    api.getSessionState.mockResolvedValue(mockWorksheets.map(w => w.session_state));
    mockLoadWorksheetResults.mockImplementation(() =>
      Promise.resolve({ results: null, queryStats: null })
    );
    mockUpdateWorksheet.mockResolvedValue({});
    mockCreateWorksheet.mockResolvedValue({
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
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('handles errors during query execution', async () => {
    mockDefaultStore.error = 'Query failed';

    renderWithProviders(<Explorer />);

    const editor = screen.getByTestId('mock-editor');
    const runButton = screen.getByText('Run Query');

    fireEvent.change(editor, { target: { value: 'SELECT * FROM test' } });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByText('Query failed')).toBeInTheDocument();
    });
  });

  it('loads model queries when clicking on models', async () => {
    const mockStore = useStore();
    mockStore.explorerData = mockExplorerData;

    queryService.executeQuery.mockResolvedValue({
      traces: [
        {
          columns: [{ header: 'col1' }, { header: 'col2' }],
          data: [{ col1: 0, col2: 'value1' }],
        },
      ],
    });

    renderWithProviders(<Explorer />);

    await waitFor(() => {
      expect(fetchExplorer).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('model1')).toBeInTheDocument();
    });
  });
});
