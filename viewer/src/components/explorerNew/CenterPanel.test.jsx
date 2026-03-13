import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CenterPanel from './CenterPanel';
import useStore from '../../stores/store';

// Mock SQLEditor
jest.mock('./SQLEditor', () => {
  return function MockSQLEditor({ sourceName, initialValue, onSave, onQueryComplete, hideResults, toolbarExtra, toolbarRight }) {
    return (
      <div data-testid="sql-editor">
        <span data-testid="editor-source">{sourceName || 'no-source'}</span>
        <span data-testid="editor-value">{initialValue}</span>
        <span data-testid="editor-hide-results">{String(hideResults)}</span>
        {toolbarExtra}
        {toolbarRight}
        <button
          data-testid="trigger-query-complete"
          onClick={() =>
            onQueryComplete?.({
              result: { columns: ['id'], rows: [{ id: 1 }], row_count: 1 },
              error: null,
            })
          }
        >
          Complete Query
        </button>
        <button
          data-testid="trigger-query-error"
          onClick={() =>
            onQueryComplete?.({
              result: null,
              error: 'SQL error',
            })
          }
        >
          Error Query
        </button>
      </div>
    );
  };
});

// Mock DataTable
jest.mock('../common/DataTable', () => {
  return {
    __esModule: true,
    default: ({ columns, rows, totalRowCount }) => (
      <div data-testid="data-table">
        <span data-testid="dt-row-count">{totalRowCount}</span>
        <span data-testid="dt-col-count">{columns.length}</span>
      </div>
    ),
  };
});

// Mock ColumnProfilePanel
jest.mock('./ColumnProfilePanel', () => {
  return function MockColumnProfilePanel({ isOpen, column }) {
    if (!isOpen) return null;
    return <div data-testid="column-profile-panel">{column}</div>;
  };
});

// Mock ExplorerChartPreview
jest.mock('./ExplorerChartPreview', () => {
  return function MockExplorerChartPreview() {
    return <div data-testid="chart-preview">ChartPreview</div>;
  };
});

// Mock VerticalDivider and Divider
jest.mock('../explorer/VerticalDivider', () => {
  return function MockVerticalDivider({ handleMouseDown }) {
    return <div data-testid="vertical-divider" onMouseDown={handleMouseDown}>VD</div>;
  };
});

jest.mock('../explorer/Divider', () => {
  return function MockDivider({ handleMouseDown }) {
    return <div data-testid="horizontal-divider" onMouseDown={handleMouseDown}>HD</div>;
  };
});

// Mock usePanelResize
jest.mock('../../hooks/usePanelResize', () => ({
  usePanelResize: () => ({
    ratio: 0.5,
    isResizing: false,
    handleMouseDown: jest.fn(),
  }),
}));

// Mock useExplorerDuckDB
jest.mock('../../hooks/useExplorerDuckDB', () => ({
  __esModule: true,
  default: () => {},
}));

// Mock AddComputedColumnPopover
jest.mock('./AddComputedColumnPopover', () => {
  return function MockAddComputedColumnPopover() {
    return <button data-testid="add-computed-column-btn">+</button>;
  };
});

// Mock utilities
jest.mock('../../utils/inferColumnTypes', () => ({
  inferColumnTypes: (columns, rows) =>
    columns.map((c) => ({ name: typeof c === 'string' ? c : c.name, type: 'string' })),
}));

jest.mock('../../utils/computeColumnProfile', () => ({
  computeColumnProfile: (col, colDef, rows) => ({
    name: col,
    type: colDef.type,
    null_count: 0,
    null_percentage: 0,
    distinct: rows.length,
  }),
}));

// Mock ResizeObserver
class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(el) {
    // Simulate a wide container
    this.callback([{ contentRect: { width: 800 } }]);
  }
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver;

describe('CenterPanel', () => {
  beforeEach(() => {
    useStore.setState({
      explorerSourceName: 'test_source',
      explorerSources: [{ source_name: 'test_source', source_type: 'postgresql' }],
      explorerSql: 'SELECT 1',
      explorerQueryResult: null,
      explorerQueryError: null,
      explorerIsEditorCollapsed: false,
      explorerProfileColumn: null,
      explorerActiveModelName: null,
      explorerModelEditMode: null,
      explorerEditStack: [],
      models: [],
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerChartLayout: {},
      explorerCenterMode: 'split',
      explorerComputedColumns: [],
      explorerEnrichedResult: null,
      explorerDuckDBLoading: false,
      explorerDuckDBError: null,
    });
  });

  it('renders SQL Editor and chart preview in wide mode', () => {
    render(<CenterPanel />);

    expect(screen.getByTestId('sql-editor')).toBeInTheDocument();
    expect(screen.getByTestId('chart-preview')).toBeInTheDocument();
  });

  it('renders horizontal divider between top and bottom', () => {
    render(<CenterPanel />);
    expect(screen.getByTestId('horizontal-divider')).toBeInTheDocument();
  });

  it('renders vertical divider between editor and chart in wide mode', () => {
    render(<CenterPanel />);
    expect(screen.getByTestId('vertical-divider')).toBeInTheDocument();
  });

  it('passes hideResults=true to SQLEditor', () => {
    render(<CenterPanel />);
    expect(screen.getByTestId('editor-hide-results')).toHaveTextContent('true');
  });

  it('shows empty state when no query result', () => {
    render(<CenterPanel />);
    expect(screen.getByTestId('empty-results')).toBeInTheDocument();
    expect(screen.getByText('Run a query to see results')).toBeInTheDocument();
  });

  it('renders DataTable when query result exists', () => {
    useStore.setState({
      explorerQueryResult: {
        columns: ['id', 'name'],
        rows: [{ id: 1, name: 'Test' }],
        row_count: 1,
      },
    });

    render(<CenterPanel />);

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('dt-row-count')).toHaveTextContent('1');
  });

  it('shows error state when query error exists', () => {
    useStore.setState({
      explorerQueryError: 'SQL syntax error near SELECT',
    });

    render(<CenterPanel />);

    expect(screen.getByTestId('query-error')).toBeInTheDocument();
    expect(screen.getByText('SQL syntax error near SELECT')).toBeInTheDocument();
  });

  it('toggles editor collapsed/expanded', () => {
    render(<CenterPanel />);

    expect(screen.getByTestId('sql-editor')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggle-editor'));

    expect(screen.queryByTestId('sql-editor')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggle-editor'));

    expect(screen.getByTestId('sql-editor')).toBeInTheDocument();
  });

  it('handles query completion from SQLEditor', () => {
    render(<CenterPanel />);

    fireEvent.click(screen.getByTestId('trigger-query-complete'));

    const state = useStore.getState();
    expect(state.explorerQueryResult).toEqual({
      columns: ['id'],
      rows: [{ id: 1 }],
      row_count: 1,
    });
  });

  it('handles query error from SQLEditor', () => {
    render(<CenterPanel />);

    fireEvent.click(screen.getByTestId('trigger-query-error'));

    expect(useStore.getState().explorerQueryError).toBe('SQL error');
  });

  it('shows row count and execution time in results header', () => {
    useStore.setState({
      explorerQueryResult: {
        columns: ['id'],
        rows: [{ id: 1 }, { id: 2 }],
        row_count: 2,
        execution_time_ms: 150,
      },
    });

    render(<CenterPanel />);

    expect(screen.getByText('2 rows')).toBeInTheDocument();
    expect(screen.getByText('150ms')).toBeInTheDocument();
  });

  it('shows truncated indicator', () => {
    useStore.setState({
      explorerQueryResult: {
        columns: ['id'],
        rows: [{ id: 1 }],
        row_count: 1,
        truncated: true,
      },
    });

    render(<CenterPanel />);

    expect(screen.getByText('(truncated)')).toBeInTheDocument();
  });

  describe('Model Context Banner (removed)', () => {
    it('does not show banner even when model is active', () => {
      useStore.setState({
        explorerActiveModelName: 'my_model',
      });

      render(<CenterPanel />);

      expect(screen.queryByTestId('model-context-banner')).not.toBeInTheDocument();
    });
  });

  describe('Narrow mode', () => {
    beforeEach(() => {
      // Override ResizeObserver to simulate narrow
      global.ResizeObserver = class {
        constructor(callback) {
          this.callback = callback;
        }
        observe() {
          this.callback([{ contentRect: { width: 400 } }]);
        }
        disconnect() {}
      };
    });

    afterEach(() => {
      global.ResizeObserver = MockResizeObserver;
    });

    it('shows toggle buttons in narrow mode', () => {
      render(<CenterPanel />);

      expect(screen.getByTestId('toggle-sql')).toBeInTheDocument();
      expect(screen.getByTestId('toggle-chart')).toBeInTheDocument();
    });

    it('switches between editor and chart in narrow mode', () => {
      render(<CenterPanel />);

      // Default shows editor
      expect(screen.getByTestId('editor-section')).toBeInTheDocument();

      // Click chart toggle
      fireEvent.click(screen.getByTestId('toggle-chart'));

      expect(screen.getByTestId('chart-section')).toBeInTheDocument();
    });
  });
});
