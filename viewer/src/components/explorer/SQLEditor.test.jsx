import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useDroppable } from '@dnd-kit/core';
import SQLEditor from './SQLEditor';

// Mock Monaco editor — selection state is configurable per-test
let mockSelectionIsEmpty = true;
let mockSelectedText = '';

const mockEditor = {
  getSelection: () => ({ isEmpty: () => mockSelectionIsEmpty }),
  getModel: () => ({
    getValueInRange: () => mockSelectedText,
  }),
  addCommand: jest.fn(),
  focus: jest.fn(),
  trigger: jest.fn(),
};

// Explore 2.0 Phase 3a (D9): wrap the real dnd-kit so the drop-zone tests can
// inspect the `useDroppable` call (id/data/disabled) without simulating a
// real dnd-kit pointer drag (jsdom can't do that — Playwright covers it).
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return { __esModule: true, ...actual, useDroppable: jest.fn(actual.useDroppable) };
});

const mockMonaco = {
  KeyMod: { CtrlCmd: 2048 },
  KeyCode: { Enter: 3, Escape: 9 },
  languages: {
    registerCompletionItemProvider: jest.fn(() => ({ dispose: jest.fn() })),
    CompletionItemKind: { Keyword: 14, Class: 5, Field: 4 },
  },
};

jest.mock('@monaco-editor/react', () => {
  const MockedEditor = ({ value, onChange, onMount, options }) => {
    // Call onMount synchronously to simulate editor mounting
    if (onMount) {
      setTimeout(() => onMount(mockEditor, mockMonaco), 0);
    }

    return (
      <textarea
        data-testid="monaco-editor"
        value={value}
        onChange={e => onChange?.(e.target.value)}
        readOnly={options?.readOnly}
      />
    );
  };

  return {
    __esModule: true,
    default: MockedEditor,
  };
});

// Mock useModelQueryJob hook
const mockExecuteQuery = jest.fn();
const mockCancel = jest.fn();
const mockReset = jest.fn();

let mockQueryJobState = {
  result: null,
  error: null,
  isRunning: false,
  progress: 0,
  progressMessage: '',
};

jest.mock('../../hooks/useModelQueryJob', () => ({
  useModelQueryJob: () => ({
    ...mockQueryJobState,
    executeQuery: mockExecuteQuery,
    cancel: mockCancel,
    reset: mockReset,
  }),
}));

// Mock useSourceSchema hook
let mockSchemaState = {
  tables: [],
  tableColumns: {},
  isLoading: false,
  error: null,
};

jest.mock('../../hooks/useSourceSchema', () => ({
  useSourceSchema: () => mockSchemaState,
}));

// Mock DataTable component
jest.mock('../common/DataTable', () => {
  return {
    __esModule: true,
    default: ({
      columns,
      rows,
      totalRowCount,
      page,
      pageSize,
      onPageChange,
      onPageSizeChange,
      onColumnProfileRequest,
    }) => (
      <div data-testid="data-table">
        <span data-testid="row-count">{totalRowCount}</span>
        <span data-testid="column-count">{columns.length}</span>
        <span data-testid="current-page">{page}</span>
        <span data-testid="current-page-size">{pageSize}</span>
        <button data-testid="next-page" onClick={() => onPageChange(page + 1)}>
          next
        </button>
        <button data-testid="set-page-size" onClick={() => onPageSizeChange(1)}>
          resize
        </button>
        <button
          data-testid="profile-first-column"
          onClick={() => onColumnProfileRequest(columns[0]?.name)}
        >
          profile
        </button>
        <button
          data-testid="profile-unknown-column"
          onClick={() => onColumnProfileRequest('__no_such_column__')}
        >
          profile-unknown
        </button>
        {rows.map((row, i) => (
          <div key={i} data-testid="table-row">
            {JSON.stringify(row)}
          </div>
        ))}
      </div>
    ),
  };
});

// Mock ColumnProfilePanel — it has its own dedicated tests
jest.mock('./ColumnProfilePanel', () => {
  return {
    __esModule: true,
    default: ({ column, profile, isOpen, onClose }) =>
      isOpen ? (
        <div data-testid="column-profile-panel" data-column={column}>
          <span data-testid="profile-distinct">{profile?.distinct}</span>
          <button data-testid="close-profile" onClick={onClose}>
            close
          </button>
        </div>
      ) : null,
  };
});

// Mock @tanstack/react-virtual (needed by DataTable if not mocked)
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 36,
        size: 36,
        key: i,
      })),
  }),
}));

describe('SQLEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock states
    mockQueryJobState = {
      result: null,
      error: null,
      isRunning: false,
      progress: 0,
      progressMessage: '',
    };

    mockSchemaState = {
      tables: [],
      tableColumns: {},
      isLoading: false,
      error: null,
    };

    mockSelectionIsEmpty = true;
    mockSelectedText = '';
  });

  it('renders with initial value', () => {
    render(<SQLEditor initialValue="SELECT * FROM users" sourceName="test_source" />);

    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toHaveValue('SELECT * FROM users');
  });

  it('renders Run button when not running', () => {
    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  it('Run button is disabled when no source is selected', () => {
    render(<SQLEditor />);

    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
  });

  it('calls executeQuery when Run button is clicked', async () => {
    render(<SQLEditor initialValue="SELECT 1" sourceName="test_source" />);

    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalledWith('test_source', 'SELECT 1');
    });
  });

  it('shows Cancel button when query is running', () => {
    mockQueryJobState.isRunning = true;

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run/i })).not.toBeInTheDocument();
  });

  it('calls cancel when Cancel button is clicked', () => {
    mockQueryJobState.isRunning = true;

    render(<SQLEditor sourceName="test_source" />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockCancel).toHaveBeenCalled();
  });

  it('shows elapsed timer when running', () => {
    mockQueryJobState.isRunning = true;

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByText(/Running\.\.\. 0\.0s/)).toBeInTheDocument();
  });

  it('displays error with dismiss button', () => {
    mockQueryJobState.error = 'SQL syntax error';

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByText('SQL syntax error')).toBeInTheDocument();
    expect(screen.getByTitle('Dismiss error')).toBeInTheDocument();
  });

  it('hides error when dismiss button clicked', () => {
    mockQueryJobState.error = 'SQL syntax error';

    render(<SQLEditor sourceName="test_source" />);

    fireEvent.click(screen.getByTitle('Dismiss error'));

    expect(screen.queryByText('SQL syntax error')).not.toBeInTheDocument();
  });

  it('displays results in DataTable after completion', () => {
    mockQueryJobState.result = {
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Test' }],
      row_count: 1,
    };

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('row-count')).toHaveTextContent('1');
    expect(screen.getByTestId('column-count')).toHaveTextContent('2');
  });

  it('shows row count in results header', () => {
    mockQueryJobState.result = {
      columns: ['id'],
      rows: [{ id: 1 }, { id: 2 }],
      row_count: 2,
    };

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByText('2 rows')).toBeInTheDocument();
  });

  it('shows execution time when available', () => {
    mockQueryJobState.result = {
      columns: ['id'],
      rows: [{ id: 1 }],
      row_count: 1,
      execution_time_ms: 150,
    };

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByText('150ms')).toBeInTheDocument();
  });

  it('shows truncated indicator when result is truncated', () => {
    mockQueryJobState.result = {
      columns: ['id'],
      rows: [{ id: 1 }],
      row_count: 1,
      truncated: true,
    };

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByText('(truncated)')).toBeInTheDocument();
  });

  it('shows loading schema message', () => {
    mockSchemaState.isLoading = true;

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByText('Loading schema...')).toBeInTheDocument();
  });

  it('updates SQL when value changes in editor', () => {
    const onSave = jest.fn();
    render(<SQLEditor sourceName="test_source" onSave={onSave} />);

    const editor = screen.getByTestId('monaco-editor');
    fireEvent.change(editor, { target: { value: 'SELECT * FROM orders' } });

    expect(onSave).toHaveBeenCalledWith('SELECT * FROM orders');
  });

  it('disables Run button when readOnly is true', () => {
    render(<SQLEditor sourceName="test_source" readOnly />);

    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
  });

  it('does not call executeQuery with empty SQL', async () => {
    render(<SQLEditor initialValue="   " sourceName="test_source" />);

    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => {
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });
  });

  describe('query completion callbacks', () => {
    it('calls onQueryComplete with the result and the run-time query context', async () => {
      const onQueryComplete = jest.fn();
      const { rerender } = render(
        <SQLEditor
          initialValue="SELECT 1"
          sourceName="test_source"
          queryContext={{ modelName: 'model_a' }}
          onQueryComplete={onQueryComplete}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /run/i }));
      await waitFor(() => expect(mockExecuteQuery).toHaveBeenCalled());

      mockQueryJobState = { ...mockQueryJobState, result: { columns: ['id'], rows: [{ id: 1 }], row_count: 1 } };
      rerender(
        <SQLEditor
          initialValue="SELECT 1"
          sourceName="test_source"
          queryContext={{ modelName: 'model_a' }}
          onQueryComplete={onQueryComplete}
        />
      );

      await waitFor(() => {
        expect(onQueryComplete).toHaveBeenCalledWith({
          result: { columns: ['id'], rows: [{ id: 1 }], row_count: 1 },
          error: null,
          context: { modelName: 'model_a' },
        });
      });
    });

    it('routes results to the context that started the run even if context changed mid-flight', async () => {
      const onQueryComplete = jest.fn();
      const { rerender } = render(
        <SQLEditor
          initialValue="SELECT 1"
          sourceName="test_source"
          queryContext={{ modelName: 'model_a' }}
          onQueryComplete={onQueryComplete}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /run/i }));
      await waitFor(() => expect(mockExecuteQuery).toHaveBeenCalled());

      // Context changes while the job is in flight
      mockQueryJobState = { ...mockQueryJobState, result: { columns: [], rows: [], row_count: 0 } };
      rerender(
        <SQLEditor
          initialValue="SELECT 1"
          sourceName="test_source"
          queryContext={{ modelName: 'model_b' }}
          onQueryComplete={onQueryComplete}
        />
      );

      await waitFor(() => {
        expect(onQueryComplete).toHaveBeenCalledWith(
          expect.objectContaining({ context: { modelName: 'model_a' } })
        );
      });
    });

    it('calls onQueryComplete with the error and null result on failure', async () => {
      const onQueryComplete = jest.fn();
      mockQueryJobState = { ...mockQueryJobState, error: 'boom' };

      render(
        <SQLEditor initialValue="SELECT 1" sourceName="test_source" onQueryComplete={onQueryComplete} />
      );

      await waitFor(() => {
        expect(onQueryComplete).toHaveBeenCalledWith({
          result: null,
          error: 'boom',
          context: null,
        });
      });
    });

    it('passes context null when no queryContext prop is provided', async () => {
      const onQueryComplete = jest.fn();
      const { rerender } = render(
        <SQLEditor initialValue="SELECT 1" sourceName="test_source" onQueryComplete={onQueryComplete} />
      );

      fireEvent.click(screen.getByRole('button', { name: /run/i }));
      await waitFor(() => expect(mockExecuteQuery).toHaveBeenCalled());

      mockQueryJobState = { ...mockQueryJobState, result: { columns: [], rows: [], row_count: 0 } };
      rerender(
        <SQLEditor initialValue="SELECT 1" sourceName="test_source" onQueryComplete={onQueryComplete} />
      );

      await waitFor(() => {
        expect(onQueryComplete).toHaveBeenCalledWith(
          expect.objectContaining({ context: null })
        );
      });
    });
  });

  describe('elapsed timer', () => {
    it('ticks the elapsed time while running', () => {
      jest.useFakeTimers();
      mockQueryJobState.isRunning = true;

      render(<SQLEditor sourceName="test_source" />);

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(screen.getByText(/Running\.\.\. 0\.3s/)).toBeInTheDocument();
      jest.useRealTimers();
    });
  });

  describe('selection execution', () => {
    it('runs only the selected text when the editor has a selection', async () => {
      mockSelectionIsEmpty = false;
      mockSelectedText = 'SELECT 2';

      render(<SQLEditor initialValue="SELECT 1; SELECT 2" sourceName="test_source" />);

      // Wait for editor mount so editorRef is populated
      await waitFor(() => expect(mockEditor.addCommand).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => {
        expect(mockExecuteQuery).toHaveBeenCalledWith('test_source', 'SELECT 2');
      });
    });
  });

  describe('keyboard shortcuts', () => {
    const getRunCommand = () =>
      mockEditor.addCommand.mock.calls[0][1];
    const getEscapeCommand = () =>
      mockEditor.addCommand.mock.calls[1][1];

    it('Cmd+Enter runs the query when idle', async () => {
      render(<SQLEditor initialValue="SELECT 1" sourceName="test_source" />);
      await waitFor(() => expect(mockEditor.addCommand).toHaveBeenCalledTimes(2));

      act(() => {
        getRunCommand()();
      });

      expect(mockExecuteQuery).toHaveBeenCalledWith('test_source', 'SELECT 1');
    });

    it('Cmd+Enter is ignored while a query is running', async () => {
      mockQueryJobState.isRunning = true;

      render(<SQLEditor initialValue="SELECT 1" sourceName="test_source" />);
      await waitFor(() => expect(mockEditor.addCommand).toHaveBeenCalledTimes(2));

      act(() => {
        getRunCommand()();
      });

      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });

    it('Cmd+Enter does nothing when no source is selected', async () => {
      render(<SQLEditor initialValue="SELECT 1" />);
      await waitFor(() => expect(mockEditor.addCommand).toHaveBeenCalledTimes(2));

      act(() => {
        getRunCommand()();
      });

      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });

    it('Escape cancels a running query', async () => {
      mockQueryJobState.isRunning = true;

      render(<SQLEditor initialValue="SELECT 1" sourceName="test_source" />);
      await waitFor(() => expect(mockEditor.addCommand).toHaveBeenCalledTimes(2));

      act(() => {
        getEscapeCommand()();
      });

      expect(mockCancel).toHaveBeenCalled();
    });

    it('Escape is a no-op when idle', async () => {
      render(<SQLEditor initialValue="SELECT 1" sourceName="test_source" />);
      await waitFor(() => expect(mockEditor.addCommand).toHaveBeenCalledTimes(2));

      act(() => {
        getEscapeCommand()();
      });

      expect(mockCancel).not.toHaveBeenCalled();
    });
  });

  describe('autocomplete schema wiring', () => {
    it('registers the completion provider at mount when schema data exists', async () => {
      mockSchemaState = {
        tables: ['users'],
        tableColumns: { users: ['id', 'name'] },
        isLoading: false,
        error: null,
      };

      render(<SQLEditor sourceName="test_source" />);

      await waitFor(() => {
        expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
          'sql',
          expect.anything()
        );
      });
    });

    it('re-registers the provider when the schema changes after mount', async () => {
      mockSchemaState = {
        tables: ['users'],
        tableColumns: { users: ['id'] },
        isLoading: false,
        error: null,
      };

      const { rerender } = render(<SQLEditor sourceName="test_source" />);
      await waitFor(() =>
        expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalled()
      );
      const callsAfterMount =
        mockMonaco.languages.registerCompletionItemProvider.mock.calls.length;

      mockSchemaState = {
        tables: ['users', 'orders'],
        tableColumns: { users: ['id'], orders: ['id', 'total'] },
        isLoading: false,
        error: null,
      };
      rerender(<SQLEditor sourceName="test_source" />);

      await waitFor(() => {
        expect(
          mockMonaco.languages.registerCompletionItemProvider.mock.calls.length
        ).toBeGreaterThan(callsAfterMount);
      });
    });
  });

  describe('results pagination', () => {
    beforeEach(() => {
      mockQueryJobState.result = {
        columns: ['id'],
        rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
        row_count: 3,
      };
    });

    it('advances the page via the DataTable page callback', () => {
      render(<SQLEditor sourceName="test_source" />);

      expect(screen.getByTestId('current-page')).toHaveTextContent('0');
      fireEvent.click(screen.getByTestId('next-page'));
      expect(screen.getByTestId('current-page')).toHaveTextContent('1');
    });

    it('changes the page size via the DataTable page-size callback', () => {
      render(<SQLEditor sourceName="test_source" />);

      expect(screen.getByTestId('current-page-size')).toHaveTextContent('1000');
      fireEvent.click(screen.getByTestId('set-page-size'));
      expect(screen.getByTestId('current-page-size')).toHaveTextContent('1');
    });
  });

  describe('column profiling', () => {
    beforeEach(() => {
      mockQueryJobState.result = {
        columns: ['id'],
        rows: [{ id: 1 }, { id: 2 }, { id: 2 }],
        row_count: 3,
      };
    });

    it('opens the profile panel with a computed profile for the selected column', () => {
      render(<SQLEditor sourceName="test_source" />);

      expect(screen.queryByTestId('column-profile-panel')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('profile-first-column'));

      const panel = screen.getByTestId('column-profile-panel');
      expect(panel).toHaveAttribute('data-column', 'id');
      // Profile is computed from the result rows: values 1, 2, 2 → 2 distinct
      expect(screen.getByTestId('profile-distinct')).toHaveTextContent('2');
    });

    it('does not open the panel for a column missing from the results', () => {
      render(<SQLEditor sourceName="test_source" />);

      fireEvent.click(screen.getByTestId('profile-unknown-column'));

      expect(screen.queryByTestId('column-profile-panel')).not.toBeInTheDocument();
    });

    it('closes the profile panel via its close callback', () => {
      render(<SQLEditor sourceName="test_source" />);

      fireEvent.click(screen.getByTestId('profile-first-column'));
      expect(screen.getByTestId('column-profile-panel')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('close-profile'));
      expect(screen.queryByTestId('column-profile-panel')).not.toBeInTheDocument();
    });
  });

  // Integration-gate fix (Explore 2.0 Phase 3b): Monaco's mount is async
  // (a chunk-load + `onMount` callback), so it can settle a beat after a
  // fresh exploration's Build rail has already focused something else (e.g.
  // a RefTextArea property field mid-keystroke). An unconditional
  // `editor.focus()` in `handleEditorDidMount` would yank keystrokes away
  // from whatever the user is already typing into.
  describe('mount focus guard', () => {
    it('focuses the editor on mount when nothing else is focused', async () => {
      render(<SQLEditor sourceName="test_source" />);
      await screen.findByTestId('monaco-editor');
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(mockEditor.focus).toHaveBeenCalled();
    });

    it('does NOT steal focus on mount from an already-focused text input', async () => {
      render(
        <div>
          <input data-testid="other-input" />
          <SQLEditor sourceName="test_source" />
        </div>
      );
      const input = screen.getByTestId('other-input');
      act(() => {
        input.focus();
      });
      expect(input).toHaveFocus();

      await screen.findByTestId('monaco-editor');
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(mockEditor.focus).not.toHaveBeenCalled();
      expect(input).toHaveFocus();
    });

    it('does NOT steal focus on mount from an already-focused contentEditable (e.g. RefTextArea)', async () => {
      render(
        <div>
          <div data-testid="other-editable" contentEditable="true" suppressContentEditableWarning />
          <SQLEditor sourceName="test_source" />
        </div>
      );
      const editable = screen.getByTestId('other-editable');
      act(() => {
        editable.focus();
      });
      expect(editable).toHaveFocus();

      await screen.findByTestId('monaco-editor');
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(mockEditor.focus).not.toHaveBeenCalled();
    });
  });

  // Explore 2.0 Phase 3a (D9, 02-architecture.md §4): Library column drag →
  // SQL editor cursor insert. The actual drag/drop can't run in jsdom, so
  // these tests capture the `useDroppable` call the router
  // (`WorkspaceDndContext.routeExplorationDragEnd`) would invoke and drive
  // it directly.
  describe('library drop target (D9)', () => {
    beforeEach(() => {
      useDroppable.mockClear();
      mockEditor.trigger.mockClear();
    });

    it('registers the sql-editor-drop zone DISABLED by default (dropInsertEnabled not passed)', () => {
      render(<SQLEditor sourceName="test_source" />);
      const call = useDroppable.mock.calls.find(([opts]) => opts.id === 'sql-editor-drop');
      expect(call[0].disabled).toBe(true);
      // Still renders the container — ModelPreview's plain usage is simply
      // inert, not absent.
      expect(screen.getByTestId('sql-editor-drop-zone')).toBeInTheDocument();
    });

    it('enables the drop zone when dropInsertEnabled is true', () => {
      render(<SQLEditor sourceName="test_source" dropInsertEnabled />);
      const call = useDroppable.mock.calls.find(([opts]) => opts.id === 'sql-editor-drop');
      expect(call[0].disabled).toBe(false);
    });

    it('the droppable data carries an onInsertText callback that types at the Monaco cursor', async () => {
      render(<SQLEditor sourceName="test_source" dropInsertEnabled />);
      // Wait for the mocked Editor's onMount (fired via setTimeout) so
      // editorRef.current is populated.
      await screen.findByTestId('monaco-editor');
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const call = useDroppable.mock.calls.find(([opts]) => opts.id === 'sql-editor-drop');
      act(() => call[0].data.onInsertText('region'));

      expect(mockEditor.focus).toHaveBeenCalled();
      expect(mockEditor.trigger).toHaveBeenCalledWith('library-drop', 'type', { text: 'region' });
    });
  });
});
