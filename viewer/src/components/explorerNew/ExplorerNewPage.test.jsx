import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerNewPage from './ExplorerNewPage';
import { fetchSourceSchemaJobs } from '../../api/sourceSchemaJobs';

jest.mock('../../api/sourceSchemaJobs');

jest.mock('./SchemaBrowser/SchemaBrowser', () => {
  return function MockSchemaBrowser({ onTableSelect, onCreateModel }) {
    return (
      <div data-testid="schema-browser">
        <button
          data-testid="table-select-btn"
          onClick={() => onTableSelect?.({ sourceName: 'snowflake_wh', table: 'users' })}
        >
          Select Table
        </button>
        <button
          data-testid="create-model-btn"
          onClick={() => onCreateModel?.({ sourceName: 'snowflake_wh', table: 'users' })}
        >
          Create Model
        </button>
      </div>
    );
  };
});

jest.mock('./SQLEditor', () => {
  return function MockSQLEditor({ sourceName, initialValue, onSave }) {
    return (
      <div data-testid="sql-editor">
        <span data-testid="editor-source">{sourceName || 'no-source'}</span>
        <span data-testid="editor-value">{initialValue}</span>
        <input
          data-testid="editor-input"
          value={initialValue}
          onChange={e => onSave?.(e.target.value)}
        />
      </div>
    );
  };
});

jest.mock('./ColumnProfilePanel', () => {
  return function MockColumnProfilePanel({ column, isOpen, onClose }) {
    if (!isOpen) return null;
    return (
      <div data-testid="column-profile-panel">
        <span data-testid="profile-column">{column}</span>
        <button data-testid="close-profile" onClick={onClose}>
          Close
        </button>
      </div>
    );
  };
});

describe('ExplorerNewPage', () => {
  const mockSources = [
    {
      source_name: 'postgres_db',
      source_type: 'postgresql',
      has_cached_schema: true,
      total_tables: 5,
    },
    {
      source_name: 'snowflake_wh',
      source_type: 'snowflake',
      has_cached_schema: false,
      total_tables: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSourceSchemaJobs.mockResolvedValue(mockSources);
  });

  test('renders the explorer page with all components', async () => {
    render(<ExplorerNewPage />);

    await waitFor(() => {
      expect(screen.getByTestId('explorer-new-page')).toBeInTheDocument();
    });

    expect(screen.getByTestId('schema-browser')).toBeInTheDocument();
    expect(screen.getByTestId('sql-editor')).toBeInTheDocument();
  });

  test('loads and displays sources in the selector', async () => {
    render(<ExplorerNewPage />);

    await screen.findByTestId('source-selector');

    const selector = screen.getByTestId('source-selector');
    expect(selector).toHaveValue('postgres_db');

    // Check sources are in the selector options
    const options = selector.querySelectorAll('option');
    const optionValues = Array.from(options).map(opt => opt.value);
    expect(optionValues).toContain('postgres_db');
    expect(optionValues).toContain('snowflake_wh');
  });

  test('shows loading state while sources are being fetched', async () => {
    let resolvePromise;
    fetchSourceSchemaJobs.mockReturnValue(
      new Promise(resolve => {
        resolvePromise = resolve;
      })
    );

    render(<ExplorerNewPage />);

    expect(screen.getByText('Loading sources...')).toBeInTheDocument();

    await act(async () => {
      resolvePromise(mockSources);
    });

    expect(screen.queryByText('Loading sources...')).not.toBeInTheDocument();
  });

  test('shows "No sources configured" when sources array is empty', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([]);

    render(<ExplorerNewPage />);

    await screen.findByText('No sources configured');
  });

  test('auto-selects first source on load', async () => {
    render(<ExplorerNewPage />);

    await waitFor(() => {
      expect(screen.getByTestId('source-selector')).toHaveValue('postgres_db');
    });

    expect(screen.getByTestId('editor-source')).toHaveTextContent('postgres_db');
  });

  test('changing source updates the SQL editor source', async () => {
    render(<ExplorerNewPage />);

    await screen.findByTestId('source-selector');

    const selector = screen.getByTestId('source-selector');
    fireEvent.change(selector, { target: { value: 'snowflake_wh' } });

    expect(screen.getByTestId('editor-source')).toHaveTextContent('snowflake_wh');
  });

  test('selecting table from SchemaBrowser inserts SQL and updates source', async () => {
    render(<ExplorerNewPage />);

    await screen.findByTestId('source-selector');

    // Initially SQL is empty
    expect(screen.getByTestId('editor-value')).toHaveTextContent('');

    // Click table select button in mocked SchemaBrowser
    fireEvent.click(screen.getByTestId('table-select-btn'));

    // SQL should now contain the SELECT statement
    await waitFor(() => {
      expect(screen.getByTestId('editor-value')).toHaveTextContent('SELECT * FROM users');
    });

    // Source should be updated to match the table's source (snowflake_wh)
    expect(screen.getByTestId('source-selector')).toHaveValue('snowflake_wh');
  });

  test('selecting "Select a source" option clears the selection', async () => {
    render(<ExplorerNewPage />);

    await screen.findByTestId('source-selector');

    const selector = screen.getByTestId('source-selector');
    fireEvent.change(selector, { target: { value: '' } });

    expect(screen.getByTestId('editor-source')).toHaveTextContent('no-source');
  });

  test('source selector has proper label for accessibility', async () => {
    render(<ExplorerNewPage />);

    await screen.findByTestId('source-selector');

    expect(screen.getByLabelText('Source:')).toBeInTheDocument();
  });
});
