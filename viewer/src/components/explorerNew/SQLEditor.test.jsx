import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SQLEditor from './SQLEditor';

// Mock Monaco editor
const mockEditor = {
  getSelection: () => ({ isEmpty: () => true }),
  getModel: () => ({
    getValueInRange: () => '',
  }),
  addCommand: jest.fn(),
  focus: jest.fn(),
};

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
    default: ({ columns, rows, totalRowCount }) => (
      <div data-testid="data-table">
        <span data-testid="row-count">{totalRowCount}</span>
        <span data-testid="column-count">{columns.length}</span>
        {rows.map((row, i) => (
          <div key={i} data-testid="table-row">
            {JSON.stringify(row)}
          </div>
        ))}
      </div>
    ),
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

  it('shows progress message when running', () => {
    mockQueryJobState.isRunning = true;
    mockQueryJobState.progressMessage = 'Executing query...';

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByText('Executing query...')).toBeInTheDocument();
  });

  it('shows progress percentage when available', () => {
    mockQueryJobState.isRunning = true;
    mockQueryJobState.progress = 0.5;

    render(<SQLEditor sourceName="test_source" />);

    expect(screen.getByText(/50%/)).toBeInTheDocument();
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
});
