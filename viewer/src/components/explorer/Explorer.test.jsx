import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
  initializeWorksheets: jest.fn(),
  worksheets: [],
  activeWorksheetId: null,
  worksheetsLoading: false,
  worksheetsError: null,
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

const mockWorksheetContextValue = {
  worksheets: [
    {
      id: 'ws1',
      name: 'Worksheet 1',
      query: '',
      selected_source: 'source1',
      is_visible: true,
      tab_order: 1,
    },
  ],
  allWorksheets: [],
  activeWorksheetId: 'ws1',
  isLoading: false,
  error: null,
  worksheetResults: {},
  actions: {
    createWorksheet: mockCreateWorksheet,
    updateWorksheet: mockUpdateWorksheet,
    deleteWorksheet: jest.fn(),
    setActiveWorksheetId: mockSetActiveWorksheetId,
    loadWorksheetResults: mockLoadWorksheetResults,
    reorderWorksheets: jest.fn(),
    clearError: jest.fn(),
  },
};

jest.mock('../../contexts/WorksheetContext', () => ({
  WorksheetProvider: ({ children }) => children,
  useWorksheets: () => mockWorksheetContextValue,
}));

// Wrap component with necessary providers
const renderWithProviders = ui => {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <URLProvider environment="server">
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

  it('renders without crashing with notebook interface', async () => {
    renderWithProviders(<Explorer />);

    await waitFor(() => {
      // Check that the new notebook interface is rendered
      expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();
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

  describe('Worksheet Initialization', () => {
    it('calls initializeWorksheets on mount', async () => {
      const mockStore = useStore();
      mockStore.initializeWorksheets = jest.fn();

      renderWithProviders(<Explorer />);

      await waitFor(() => {
        expect(mockStore.initializeWorksheets).toHaveBeenCalledTimes(1);
      });
    });

    it('loads explorer data on mount', async () => {
      renderWithProviders(<Explorer />);

      await waitFor(() => {
        expect(fetchExplorer).toHaveBeenCalled();
      });
    });

    it('sets default source when namedChildren has sources', async () => {
      const mockStore = useStore();
      mockStore.namedChildren = {
        source1: {
          type_key: 'sources',
          config: { name: 'source1', type: 'postgres' },
        },
      };
      mockStore.selectedSource = null;
      mockStore.setSelectedSource = jest.fn();

      renderWithProviders(<Explorer />);

      await waitFor(() => {
        expect(mockStore.setSelectedSource).toHaveBeenCalledWith({
          name: 'source1',
          type: 'postgres',
        });
      });
    });

    it('uses default source from explorerData if available', async () => {
      const mockStore = useStore();
      mockStore.namedChildren = {
        source1: {
          type_key: 'sources',
          config: { name: 'source1', type: 'postgres' },
        },
        source2: {
          type_key: 'sources',
          config: { name: 'source2', type: 'duckdb' },
        },
      };
      mockStore.selectedSource = null;
      mockStore.explorerData = {
        ...mockExplorerData,
        default_source: 'source2',
      };
      mockStore.setSelectedSource = jest.fn();

      renderWithProviders(<Explorer />);

      await waitFor(() => {
        expect(mockStore.setSelectedSource).toHaveBeenCalledWith({
          name: 'source2',
          type: 'duckdb',
        });
      });
    });

    it('does not set source if one is already selected', async () => {
      const mockStore = useStore();
      mockStore.namedChildren = {
        source1: {
          type_key: 'sources',
          config: { name: 'source1', type: 'postgres' },
        },
      };
      mockStore.selectedSource = { name: 'existing-source' };
      mockStore.setSelectedSource = jest.fn();

      renderWithProviders(<Explorer />);

      // Wait a bit to ensure the effect doesn't run
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockStore.setSelectedSource).not.toHaveBeenCalled();
    });
  });
});
