import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourceBrowser from './SourceBrowser';

jest.mock('../../api/sourceSchemaJobs', () => ({
  fetchSourceSchemaJobs: jest.fn(),
  fetchSourceTables: jest.fn(),
  fetchTableColumns: jest.fn(),
  generateSourceSchema: jest.fn(),
  fetchSchemaGenerationStatus: jest.fn(),
}));

jest.mock('./SchemaBrowser/SchemaTreeNode', () => {
  const MockSchemaTreeNode = ({
    label,
    type,
    badge,
    isExpanded,
    isLoading,
    onClick,
    onDoubleClick,
    onContextMenu,
    children,
    errorMessage,
    errorCollapsed,
    actions,
  }) => {
    return (
      <div
        data-testid={`tree-node-${type}-${label}`}
        data-expanded={isExpanded}
        data-loading={isLoading}
        data-badge={badge}
        data-error={errorMessage}
        data-error-collapsed={errorCollapsed}
        onContextMenu={onContextMenu}
      >
        <button data-testid={`click-${type}-${label}`} onClick={onClick}>
          {label}
        </button>
        {onDoubleClick && (
          <button
            data-testid={`dblclick-${type}-${label}`}
            onDoubleClick={onDoubleClick}
          >
            dbl-{label}
          </button>
        )}
        {actions &&
          actions.map((action, idx) => (
            <button
              key={idx}
              data-testid={`action-${type}-${label}-${action.label}`}
              onClick={() => action.onClick()}
            >
              {action.label}
            </button>
          ))}
        {isExpanded && children}
      </div>
    );
  };
  return MockSchemaTreeNode;
});

// Mock DataPreviewModal so we don't need to mock fetch in SourceBrowser tests.
jest.mock('../sources/DataPreviewModal', () => {
  const MockPreview = ({ source, database, table, schema, onClose }) => (
    <div
      data-testid="mock-data-preview-modal"
      data-source={source}
      data-database={database}
      data-table={table}
      data-schema={schema || ''}
    >
      <button data-testid="mock-preview-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
  return MockPreview;
});

const {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
} = require('../../api/sourceSchemaJobs');

const mockSources = [
  { source_name: 'postgres_db', has_cached_schema: true, total_tables: 5 },
  { source_name: 'mysql_db', has_cached_schema: false, total_tables: null },
];

const mockTables = [
  { name: 'users' },
  { name: 'orders' },
];

const mockColumns = [
  { name: 'id', type: 'integer' },
  { name: 'email', type: 'varchar' },
];

describe('SourceBrowser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchSourceSchemaJobs.mockResolvedValue(mockSources);
    fetchSourceTables.mockResolvedValue(mockTables);
    fetchTableColumns.mockResolvedValue(mockColumns);
  });

  it('renders source tree nodes for provided sources', async () => {
    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('tree-node-source-postgres_db');
    expect(screen.getByTestId('tree-node-source-mysql_db')).toBeInTheDocument();
  });

  it('calls onSourcesLoaded with fetched sources on mount', async () => {
    const onSourcesLoaded = jest.fn();

    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={onSourcesLoaded} />
    );

    await waitFor(() => {
      expect(onSourcesLoaded).toHaveBeenCalledWith(mockSources);
    });
    expect(fetchSourceSchemaJobs).toHaveBeenCalledTimes(1);
  });

  it('clicking a source with cached tables expands the tree', async () => {
    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    // Wait for sources to load
    await screen.findByTestId('click-source-postgres_db');

    // Click the source with cached schema
    fireEvent.click(screen.getByTestId('click-source-postgres_db'));

    // fetchSourceTables should be called for the source
    await waitFor(() => {
      expect(fetchSourceTables).toHaveBeenCalledWith('postgres_db');
    });

    // After loading, tables should appear as children
    await screen.findByTestId('tree-node-table-users');
    expect(screen.getByTestId('tree-node-table-orders')).toBeInTheDocument();
  });

  it('table double-click calls onTableSelect with { sourceName, table }', async () => {
    const onTableSelect = jest.fn();

    render(
      <SourceBrowser searchQuery="" onTableSelect={onTableSelect} onSourcesLoaded={jest.fn()} />
    );

    // Wait for sources to load
    await screen.findByTestId('click-source-postgres_db');

    // Expand postgres_db source to show tables
    fireEvent.click(screen.getByTestId('click-source-postgres_db'));

    await screen.findByTestId('dblclick-table-users');

    // Double-click a table
    fireEvent.doubleClick(screen.getByTestId('dblclick-table-users'));

    expect(onTableSelect).toHaveBeenCalledWith({
      sourceName: 'postgres_db',
      table: 'users',
    });
  });

  it('search query filters sources by name', async () => {
    render(
      <SourceBrowser
        searchQuery="postgres"
        onTableSelect={jest.fn()}
        onSourcesLoaded={jest.fn()}
      />
    );

    await screen.findByTestId('tree-node-source-postgres_db');
    expect(screen.queryByTestId('tree-node-source-mysql_db')).not.toBeInTheDocument();
  });

  it('shows loading state while fetching tables', async () => {
    // Make fetchSourceTables return a promise that we can control
    let resolveTables;
    fetchSourceTables.mockReturnValue(
      new Promise((resolve) => {
        resolveTables = resolve;
      })
    );

    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    // Wait for sources to load
    await screen.findByTestId('click-source-postgres_db');

    // Click the source to trigger table loading
    fireEvent.click(screen.getByTestId('click-source-postgres_db'));

    // The source node should now be in loading state
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-source-postgres_db')).toHaveAttribute(
        'data-loading',
        'true'
      );
    });

    // Resolve the tables fetch
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      resolveTables(mockTables);
    });

    // Loading should be done
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-source-postgres_db')).toHaveAttribute(
        'data-loading',
        'false'
      );
    });
  });

  it('renders nothing while sources are loading', () => {
    // Don't resolve the promise immediately
    fetchSourceSchemaJobs.mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    // Component returns null during loading
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when no sources match search', async () => {
    render(
      <SourceBrowser
        searchQuery="nonexistent"
        onTableSelect={jest.fn()}
        onSourcesLoaded={jest.fn()}
      />
    );

    // Wait for the async fetch to complete
    await waitFor(() => {
      expect(fetchSourceSchemaJobs).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('source-browser')).not.toBeInTheDocument();
  });

  it('clicking a source without cached schema triggers schema generation', async () => {
    generateSourceSchema.mockResolvedValue({ run_instance_id: 'job-123' });
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'completed' });
    // After generation completes, fetchSourceSchemaJobs is called again
    fetchSourceSchemaJobs
      .mockResolvedValueOnce(mockSources)
      .mockResolvedValueOnce(mockSources);

    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    // Wait for sources to load
    await screen.findByTestId('click-source-mysql_db');

    // Click mysql_db which has no cached schema
    fireEvent.click(screen.getByTestId('click-source-mysql_db'));

    await waitFor(() => {
      expect(generateSourceSchema).toHaveBeenCalledWith('mysql_db');
    });
  });

  it('does not display table count badge for sources', async () => {
    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('tree-node-source-postgres_db');

    const sourceNode = screen.getByTestId('tree-node-source-postgres_db');
    expect(sourceNode).not.toHaveAttribute('data-badge');
  });

  it('shows refresh action for sources with cached schema', async () => {
    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('tree-node-source-postgres_db');

    expect(
      screen.getByTestId('action-source-postgres_db-Refresh Schema')
    ).toBeInTheDocument();
    // No refresh action for source without cached schema
    expect(
      screen.queryByTestId('action-source-mysql_db-Refresh Schema')
    ).not.toBeInTheDocument();
  });

  it('refresh action triggers schema generation and clears spinner on completion', async () => {
    generateSourceSchema.mockResolvedValue({ run_instance_id: 'job-456' });
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'completed' });
    fetchSourceSchemaJobs
      .mockResolvedValueOnce(mockSources)
      .mockResolvedValueOnce(mockSources);

    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('action-source-postgres_db-Refresh Schema');

    // Click the refresh action
    fireEvent.click(screen.getByTestId('action-source-postgres_db-Refresh Schema'));

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-source-postgres_db')).toHaveAttribute(
        'data-loading',
        'true'
      );
    });

    // Should show Connecting... badge
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-source-postgres_db')).toHaveAttribute(
        'data-badge',
        'Connecting...'
      );
    });

    // After completion, loading should clear
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-source-postgres_db')).toHaveAttribute(
        'data-loading',
        'false'
      );
    });

    // Badge should be cleared
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-source-postgres_db')).not.toHaveAttribute(
        'data-badge'
      );
    });

    expect(generateSourceSchema).toHaveBeenCalledWith('postgres_db');
  });

  it('error messages are collapsed by default', async () => {
    // Production code logs to console.error on schema-generation failure (SourceBrowser.jsx).
    // Suppress the expected log to keep test output clean.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sourcesWithError = [
      { source_name: 'broken_db', has_cached_schema: false, total_tables: null },
    ];
    fetchSourceSchemaJobs.mockResolvedValue(sourcesWithError);
    generateSourceSchema.mockResolvedValue({ run_instance_id: 'job-err' });
    fetchSchemaGenerationStatus.mockResolvedValue({
      status: 'failed',
      error: 'Connection refused',
    });

    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('click-source-broken_db');

    // Click to trigger schema generation which will fail
    fireEvent.click(screen.getByTestId('click-source-broken_db'));

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-source-broken_db')).toHaveAttribute('data-error');
    });

    // Error should be collapsed by default
    expect(screen.getByTestId('tree-node-source-broken_db')).toHaveAttribute(
      'data-error-collapsed',
      'true'
    );
    errorSpy.mockRestore();
  });

  it('right-click on a table opens the context menu', async () => {
    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('click-source-postgres_db');

    // Expand to show tables
    fireEvent.click(screen.getByTestId('click-source-postgres_db'));
    await screen.findByTestId('tree-node-table-users');

    // Right-click the table tree node (the outer element on the mock node)
    fireEvent.contextMenu(screen.getByTestId('tree-node-table-users'));

    // Context menu should appear
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-preview')).toHaveTextContent(/Preview 100 rows/);
  });

  it('selecting "Preview 100 rows" opens DataPreviewModal with the right props', async () => {
    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('click-source-postgres_db');

    fireEvent.click(screen.getByTestId('click-source-postgres_db'));
    await screen.findByTestId('tree-node-table-users');

    fireEvent.contextMenu(screen.getByTestId('tree-node-table-users'));
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('context-menu-preview'));

    // The modal mock should be visible with the source/table set
    const modal = await screen.findByTestId('mock-data-preview-modal');
    expect(modal).toHaveAttribute('data-source', 'postgres_db');
    expect(modal).toHaveAttribute('data-table', 'users');
    // Default databaseName fallback
    expect(modal).toHaveAttribute('data-database', 'main');

    // Context menu should be closed after action
    expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
  });

  it('closing the preview modal removes it from the DOM', async () => {
    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('click-source-postgres_db');

    fireEvent.click(screen.getByTestId('click-source-postgres_db'));
    await screen.findByTestId('tree-node-table-users');

    fireEvent.contextMenu(screen.getByTestId('tree-node-table-users'));
    fireEvent.click(screen.getByTestId('context-menu-preview'));

    await screen.findByTestId('mock-data-preview-modal');

    fireEvent.click(screen.getByTestId('mock-preview-close'));
    expect(screen.queryByTestId('mock-data-preview-modal')).not.toBeInTheDocument();
  });

  it('clicking an errored source toggles error visibility', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sourcesWithError = [
      { source_name: 'broken_db', has_cached_schema: false, total_tables: null },
    ];
    fetchSourceSchemaJobs.mockResolvedValue(sourcesWithError);
    generateSourceSchema.mockResolvedValue({ run_instance_id: 'job-err' });
    fetchSchemaGenerationStatus.mockResolvedValue({
      status: 'failed',
      error: 'Connection refused',
    });

    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('click-source-broken_db');

    // Trigger schema generation (fails)
    fireEvent.click(screen.getByTestId('click-source-broken_db'));

    await waitFor(() => {
      expect(screen.getByTestId('tree-node-source-broken_db')).toHaveAttribute('data-error');
    });
    errorSpy.mockRestore();

    // Error collapsed by default
    expect(screen.getByTestId('tree-node-source-broken_db')).toHaveAttribute(
      'data-error-collapsed',
      'true'
    );

    // Click again to expand error
    fireEvent.click(screen.getByTestId('click-source-broken_db'));

    expect(screen.getByTestId('tree-node-source-broken_db')).toHaveAttribute(
      'data-error-collapsed',
      'false'
    );

    // Click again to collapse error
    fireEvent.click(screen.getByTestId('click-source-broken_db'));

    expect(screen.getByTestId('tree-node-source-broken_db')).toHaveAttribute(
      'data-error-collapsed',
      'true'
    );
  });
});
