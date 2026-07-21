import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import selectEvent from 'react-select-event';
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

// Mock DataTable — additionally exposes onColumnProfileRequest via a button
// so tests can drive CenterPanel's own profileColumn/selectedColumnProfile
// computation through the real callback wiring, not just assert props.
jest.mock('../common/DataTable', () => {
  return {
    __esModule: true,
    default: ({ columns, rows, totalRowCount, onColumnProfileRequest }) => (
      <div data-testid="data-table">
        <span data-testid="dt-row-count">{totalRowCount}</span>
        <span data-testid="dt-col-count">{columns.length}</span>
        <button
          data-testid="dt-request-profile"
          onClick={() => onColumnProfileRequest?.(columns[0]?.name)}
        >
          profile
        </button>
      </div>
    ),
  };
});

// Mock ColumnProfilePanel — exposes onClose via a button so the real
// setProfileColumn(null) wiring is exercised, not just the isOpen prop.
jest.mock('./ColumnProfilePanel', () => {
  return function MockColumnProfilePanel({ isOpen, column, onClose }) {
    if (!isOpen) return null;
    return (
      <div data-testid="column-profile-panel">
        {column}
        <button data-testid="column-profile-close" onClick={onClose}>
          close
        </button>
      </div>
    );
  };
});

// Mock ExplorerChartPreview
jest.mock('./ExplorerChartPreview', () => {
  return function MockExplorerChartPreview() {
    return <div data-testid="chart-preview">ChartPreview</div>;
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

  // Explore 2.0 Phase 3b cutover: the standalone `/explorer` route (and its
  // horizontal ModelTabBar) is retired — CenterPanel's only remaining
  // consumer is the exploration surface (ExplorationWorkbench), which always
  // passes its own query chips. `modelTabBar` defaults to null (renders
  // nothing) rather than a hardcoded fallback component.
  it('renders nothing where the tab bar goes when modelTabBar is omitted', () => {
    render(<CenterPanel />);
    expect(screen.queryByTestId('model-tab-bar')).not.toBeInTheDocument();
  });

  it('renders the modelTabBar node when provided (ExplorationQueryChips)', () => {
    render(<CenterPanel modelTabBar={<div data-testid="custom-tab-bar">chips</div>} />);
    expect(screen.getByTestId('custom-tab-bar')).toBeInTheDocument();
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

  it('tolerates a malformed query result missing columns/rows (defensive fallback, no crash)', () => {
    useStore.setState({
      explorerModelStates: {
        // `row_count` present (queryResult is truthy → DataTable renders) but
        // `columns`/`rows` themselves are omitted.
        test_model: makeModelState({ sql: 'SELECT 1', sourceName: 'test_source', queryResult: { row_count: 0 } }),
      },
    });
    render(<CenterPanel />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('dt-col-count')).toHaveTextContent('0');
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

  // 6c-T2 (audit cold-start #7 / shell-ia — "editor consumes ~440px of dark
  // dead space for a one-line query"). The default beforeEach fixture is
  // already a ONE-LINE query ('SELECT 1') in wide mode (width 800 from
  // MockResizeObserver) — exactly the reported scenario.
  describe('SQL editor auto-height (6c-T2)', () => {
    it('a one-line query gets the wide-mode floor (chart stays usable), NOT a fixed 65% ratio', () => {
      render(<CenterPanel />);
      const topRow = screen.getByTestId('center-panel-top-row');
      expect(topRow).toHaveAttribute('data-auto-height', 'true');
      // floor = CHART_MIN_HEIGHT (260) in wide mode; (1 + 2) * 19 = 57 loses.
      expect(topRow.style.flex).toBe('0 0 260px');
    });

    it('a moderately long query still sits at the wide-mode floor', () => {
      useStore.setState({
        explorerModelStates: {
          test_model: makeModelState({
            sql: Array(10).fill('select 1').join('\n'),
            sourceName: 'test_source',
          }),
        },
      });
      render(<CenterPanel />);
      // (10 + 2) * 19 = 228, still under the 260 wide-mode floor.
      expect(screen.getByTestId('center-panel-top-row').style.flex).toBe('0 0 260px');
    });

    it('a long query grows the row height, capped at the sensible max', () => {
      useStore.setState({
        explorerModelStates: {
          test_model: makeModelState({
            sql: Array(30).fill('select 1').join('\n'),
            sourceName: 'test_source',
          }),
        },
      });
      render(<CenterPanel />);
      // (30 + 2) * 19 = 608, clamped to the 420 ceiling.
      expect(screen.getByTestId('center-panel-top-row').style.flex).toBe('0 0 420px');
    });

    it('an editor the user has collapsed falls back to the ratio-based split (nothing to auto-size)', () => {
      useStore.setState({ explorerIsEditorCollapsed: true });
      render(<CenterPanel />);
      const topRow = screen.getByTestId('center-panel-top-row');
      expect(topRow).toHaveAttribute('data-auto-height', 'false');
      expect(topRow.style.flex).toBe('0.5'); // the mocked usePanelResize ratio
    });

    it('dragging the vertical divider hands control to the manual ratio from then on', () => {
      render(<CenterPanel />);
      expect(screen.getByTestId('center-panel-top-row')).toHaveAttribute('data-auto-height', 'true');
      fireEvent.mouseDown(screen.getByTestId('horizontal-divider'));
      expect(screen.getByTestId('center-panel-top-row')).toHaveAttribute('data-auto-height', 'false');
      expect(screen.getByTestId('center-panel-top-row').style.flex).toBe('0.5');
    });

    it('narrow mode on the Chart tab (no editor in the row) uses the ratio split, not line-count', () => {
      global.ResizeObserver = class {
        constructor(callback) {
          this.callback = callback;
        }
        observe() {
          this.callback([{ contentRect: { width: 400 } }]);
        }
        disconnect() {}
      };
      try {
        render(<CenterPanel />);
        fireEvent.click(screen.getByTestId('toggle-chart'));
        const topRow = screen.getByTestId('center-panel-top-row');
        expect(topRow).toHaveAttribute('data-auto-height', 'false');
        expect(topRow.style.flex).toBe('0.5');
      } finally {
        global.ResizeObserver = MockResizeObserver;
      }
    });

    it('results get the reclaimed space — the bottom row is flex: 1 1 auto while auto-height is active', () => {
      render(<CenterPanel />);
      const bottomRow = screen.getByTestId('data-section');
      expect(bottomRow.style.flex).toBe('1 1 auto');
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

  describe('column profile panel', () => {
    const withQueryResult = () => {
      useStore.setState({
        explorerModelStates: {
          test_model: makeModelState({
            sql: 'SELECT 1',
            sourceName: 'test_source',
            queryResult: {
              columns: ['id', 'value'],
              rows: [{ id: 1, value: 10 }, { id: 2, value: 20 }],
              row_count: 2,
            },
          }),
        },
      });
    };

    it('requesting a column profile computes it and opens the panel', () => {
      withQueryResult();
      render(<CenterPanel />);
      expect(screen.queryByTestId('column-profile-panel')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('dt-request-profile'));

      expect(useStore.getState().explorerProfileColumn).toBe('id');
      const panel = screen.getByTestId('column-profile-panel');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveTextContent('id');
    });

    it('closing the column profile panel clears explorerProfileColumn', () => {
      withQueryResult();
      render(<CenterPanel />);
      fireEvent.click(screen.getByTestId('dt-request-profile'));
      expect(screen.getByTestId('column-profile-panel')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('column-profile-close'));

      expect(useStore.getState().explorerProfileColumn).toBeNull();
      expect(screen.queryByTestId('column-profile-panel')).not.toBeInTheDocument();
    });

    it('a stale profileColumn that no longer matches any column never opens the panel', () => {
      withQueryResult();
      useStore.setState({ explorerProfileColumn: 'a_column_that_does_not_exist' });
      render(<CenterPanel />);
      expect(screen.queryByTestId('column-profile-panel')).not.toBeInTheDocument();
    });

    it('a profile request against an empty result set never opens the panel (no crash)', () => {
      // A real queryResult with zero ROWS — displayResult is truthy but
      // `displayResult.rows.length` is falsy, so selectedColumnProfile still
      // short-circuits at that check without ever calling computeColumnProfile.
      useStore.setState({
        explorerModelStates: {
          test_model: makeModelState({
            sql: 'SELECT 1',
            sourceName: 'test_source',
            queryResult: { columns: ['id'], rows: [], row_count: 0 },
          }),
        },
      });
      render(<CenterPanel />);
      fireEvent.click(screen.getByTestId('dt-request-profile'));
      expect(useStore.getState().explorerProfileColumn).toBe('id');
      expect(screen.queryByTestId('column-profile-panel')).not.toBeInTheDocument();
    });
  });

  describe('source selector', () => {
    it('choosing a different source calls setActiveModelSource with the picked value', async () => {
      useStore.setState({
        explorerSources: [
          { source_name: 'test_source', source_type: 'postgresql' },
          { source_name: 'other_source', source_type: 'postgresql' },
        ],
      });
      render(<CenterPanel />);
      // The Select renders its menu through a `menuPortalTarget={document.body}`
      // portal (screen-share/clipping fix, Select.jsx's own docstring) — the
      // option text lives outside react-select-event's default ancestor-based
      // container, so it must be told to search `document.body` instead.
      await selectEvent.select(screen.getByLabelText('Select source'), 'other_source', {
        container: document.body,
      });
      expect(useStore.getState().explorerModelStates.test_model.sourceName).toBe('other_source');
    });
  });

  describe('narrow-mode SQL toggle round trip', () => {
    beforeEach(() => {
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

    it('switching to Chart and back to SQL shows the editor section again', () => {
      render(<CenterPanel />);
      expect(screen.getByTestId('editor-section')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('toggle-chart'));
      expect(screen.getByTestId('chart-section')).toBeInTheDocument();
      expect(screen.queryByTestId('editor-section')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('toggle-sql'));
      expect(screen.getByTestId('editor-section')).toBeInTheDocument();
      expect(screen.queryByTestId('chart-section')).not.toBeInTheDocument();
    });
  });

  describe('Plotly resize dispatch on layout change (6c-T2)', () => {
    it('dispatches a window resize event on the next animation frame when the divider ratio changes', () => {
      const rafSpy = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation(cb => {
          cb();
          return 1;
        });
      const dispatchSpy = jest.spyOn(window, 'dispatchEvent');
      try {
        render(<CenterPanel />);
        fireEvent.mouseDown(screen.getByTestId('horizontal-divider'));
        expect(
          dispatchSpy.mock.calls.some(([evt]) => evt instanceof Event && evt.type === 'resize')
        ).toBe(true);
      } finally {
        rafSpy.mockRestore();
        dispatchSpy.mockRestore();
      }
    });
  });
});
