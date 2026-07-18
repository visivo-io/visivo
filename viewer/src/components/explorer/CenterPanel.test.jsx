import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import CenterPanel from './CenterPanel';
import useStore from '../../stores/store';

// Mock DraggableColumnHeader (requires @dnd-kit/core)
jest.mock('./DraggableColumnHeader', () => {
  return function MockDraggableColumnHeader(props) {
    return <th data-testid={`col-header-${props.column?.name || 'unknown'}`}>{props.column?.name}</th>;
  };
});

// Mock SQLEditor — mirrors the real editor's run-context snapshot: the
// "capture" button records queryContext (as handleRun does at execute time)
// and the completion buttons deliver results with that captured context.
jest.mock('./SQLEditor', () => {
  let capturedContext;
  return function MockSQLEditor({
    sourceName,
    initialValue,
    onSave,
    onQueryComplete,
    hideResults,
    queryContext,
    toolbarExtra,
    toolbarRight,
    dropInsertEnabled,
  }) {
    return (
      <div data-testid="sql-editor" data-drop-insert-enabled={String(!!dropInsertEnabled)}>
        <span data-testid="editor-source">{sourceName || 'no-source'}</span>
        <span data-testid="editor-value">{initialValue}</span>
        <span data-testid="editor-hide-results">{String(hideResults)}</span>
        <span data-testid="editor-query-context">{queryContext || 'no-context'}</span>
        {toolbarExtra}
        {toolbarRight}
        <button
          data-testid="trigger-run-capture"
          onClick={() => {
            capturedContext = queryContext;
          }}
        >
          Run (capture context)
        </button>
        <button
          data-testid="trigger-query-complete"
          onClick={() =>
            onQueryComplete?.({
              result: { columns: ['id'], rows: [{ id: 1 }], row_count: 1 },
              error: null,
              context: capturedContext,
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
              context: capturedContext,
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

// Mock ModelTabBar
jest.mock('./ModelTabBar', () => {
  return function MockModelTabBar() {
    return <div data-testid="model-tab-bar">ModelTabBar</div>;
  };
});

// Mock VerticalDivider and Divider
jest.mock('../common/VerticalDivider', () => {
  return function MockVerticalDivider({ handleMouseDown }) {
    return <div data-testid="vertical-divider" onMouseDown={handleMouseDown}>VD</div>;
  };
});

jest.mock('../common/Divider', () => {
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
  default: () => ({ addComputedFromDefinition: jest.fn(), db: null, currentTable: null }),
}));

// Mock DataSectionToolbar — reads from store internally, no props from CenterPanel
jest.mock('./DataSectionToolbar', () => {
  return function MockDataSectionToolbar() {
    return <div data-testid="data-section-toolbar" />;
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

const makeModelState = (overrides = {}) => ({
  sql: '',
  sourceName: null,
  queryResult: null,
  queryError: null,
  computedColumns: [],
  enrichedResult: null,
  isNew: true,
  ...overrides,
});

describe('CenterPanel', () => {
  beforeEach(() => {
    useStore.setState({
      explorerSources: [{ source_name: 'test_source', source_type: 'postgresql' }],
      explorerIsEditorCollapsed: false,
      explorerProfileColumn: null,
      explorerActiveModelName: 'test_model',
      explorerModelStates: {
        test_model: makeModelState({ sql: 'SELECT 1', sourceName: 'test_source' }),
      },
      explorerModelTabs: ['test_model'],
      models: [],
      explorerInsightStates: {},
      explorerActiveInsightName: null,
      explorerChartInsightNames: [],
      explorerChartLayout: {},
      explorerCenterMode: 'split',
      explorerDuckDBLoading: false,
      explorerDuckDBError: null,
      explorerFailedComputedColumns: {},
    });
  });

  it('renders ModelTabBar at the top', () => {
    render(<CenterPanel />);

    expect(screen.getByTestId('model-tab-bar')).toBeInTheDocument();
  });

  // Explore 2.0 Phase 3a: CenterPanel is shared between the standalone
  // `/explorer` route (ExplorerPage, no props — keeps ModelTabBar
  // untouched) and the new exploration surface (ExplorationWorkbench, which
  // passes its own query chips + opts into the Library SQL-editor drop
  // target). Both branches must coexist behind these opt-in props.
  it('renders a custom modelTabBar when provided, instead of ModelTabBar', () => {
    render(<CenterPanel modelTabBar={<div data-testid="custom-tab-bar">chips</div>} />);

    expect(screen.getByTestId('custom-tab-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('model-tab-bar')).not.toBeInTheDocument();
  });

  it('defaults enableLibraryDrop to false — the SQL editor is not a drop target unless opted in', () => {
    render(<CenterPanel />);
    expect(screen.getByTestId('sql-editor')).toHaveAttribute('data-drop-insert-enabled', 'false');
  });

  it('forwards enableLibraryDrop to the SQL editor as dropInsertEnabled', () => {
    render(<CenterPanel enableLibraryDrop />);
    expect(screen.getByTestId('sql-editor')).toHaveAttribute('data-drop-insert-enabled', 'true');
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
      explorerModelStates: {
        test_model: makeModelState({
          sql: 'SELECT 1',
          sourceName: 'test_source',
          queryResult: {
            columns: ['id', 'name'],
            rows: [{ id: 1, name: 'Test' }],
            row_count: 1,
          },
        }),
      },
    });

    render(<CenterPanel />);

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('dt-row-count')).toHaveTextContent('1');
  });

  it('shows error state when query error exists', () => {
    useStore.setState({
      explorerModelStates: {
        test_model: makeModelState({
          sql: 'SELECT 1',
          sourceName: 'test_source',
          queryError: 'SQL syntax error near SELECT',
        }),
      },
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
    expect(state.explorerModelStates.test_model.queryResult).toEqual({
      columns: ['id'],
      rows: [{ id: 1 }],
      row_count: 1,
    });
  });

  it('handles query error from SQLEditor', () => {
    render(<CenterPanel />);

    fireEvent.click(screen.getByTestId('trigger-query-error'));

    expect(useStore.getState().explorerModelStates.test_model.queryError).toBe('SQL error');
  });

  describe('results routing when switching tabs mid-run', () => {
    beforeEach(() => {
      useStore.setState({
        explorerModelTabs: ['test_model', 'other_model'],
        explorerModelStates: {
          test_model: makeModelState({ sql: 'SELECT 1', sourceName: 'test_source' }),
          other_model: makeModelState({ sql: 'SELECT 2', sourceName: 'test_source' }),
        },
      });
    });

    it('delivers the result to the tab that started the run, not the active tab', () => {
      render(<CenterPanel />);

      // Start the run on test_model, then switch to other_model mid-flight.
      fireEvent.click(screen.getByTestId('trigger-run-capture'));
      act(() => {
        useStore.setState({ explorerActiveModelName: 'other_model' });
      });
      fireEvent.click(screen.getByTestId('trigger-query-complete'));

      const state = useStore.getState();
      expect(state.explorerModelStates.test_model.queryResult).toEqual({
        columns: ['id'],
        rows: [{ id: 1 }],
        row_count: 1,
      });
      expect(state.explorerModelStates.other_model.queryResult).toBeNull();
    });

    it('delivers a failure to the tab that started the run, not the active tab', () => {
      render(<CenterPanel />);

      fireEvent.click(screen.getByTestId('trigger-run-capture'));
      act(() => {
        useStore.setState({ explorerActiveModelName: 'other_model' });
      });
      fireEvent.click(screen.getByTestId('trigger-query-error'));

      const state = useStore.getState();
      expect(state.explorerModelStates.test_model.queryError).toBe('SQL error');
      expect(state.explorerModelStates.other_model.queryError).toBeNull();
    });
  });

  it('renders DataSectionToolbar when query result exists', () => {
    useStore.setState({
      explorerModelStates: {
        test_model: makeModelState({
          sql: 'SELECT 1',
          sourceName: 'test_source',
          queryResult: {
            columns: ['id'],
            rows: [{ id: 1 }, { id: 2 }],
            row_count: 2,
          },
        }),
      },
    });

    render(<CenterPanel />);

    // DataSectionToolbar reads from the store directly — CenterPanel just mounts it
    expect(screen.getByTestId('data-section-toolbar')).toBeInTheDocument();
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

  describe('DataSectionToolbar integration', () => {
    it('renders DataSectionToolbar when query result with computed columns exists', () => {
      useStore.setState({
        explorerModelStates: {
          test_model: makeModelState({
            sql: 'SELECT 1',
            sourceName: 'test_source',
            queryResult: {
              columns: ['id', 'value'],
              rows: [{ id: 1, value: 10 }],
              row_count: 1,
            },
            computedColumns: [
              { name: 'total', expression: 'SUM(value)', type: 'metric' },
            ],
          }),
        },
      });

      render(<CenterPanel />);

      expect(screen.getByTestId('data-section-toolbar')).toBeInTheDocument();
    });

    it('does not render DataSectionToolbar when no query result', () => {
      render(<CenterPanel />);

      expect(screen.queryByTestId('data-section-toolbar')).not.toBeInTheDocument();
    });
  });
});
