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
    children,
    errorMessage,
  }) => {
    return (
      <div
        data-testid={`tree-node-${type}-${label}`}
        data-expanded={isExpanded}
        data-loading={isLoading}
        data-badge={badge}
        data-error={errorMessage}
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
        {isExpanded && children}
      </div>
    );
  };
  return MockSchemaTreeNode;
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

  it('displays badge with table count for sources', async () => {
    render(
      <SourceBrowser searchQuery="" onTableSelect={jest.fn()} onSourcesLoaded={jest.fn()} />
    );

    await screen.findByTestId('tree-node-source-postgres_db');

    const sourceNode = screen.getByTestId('tree-node-source-postgres_db');
    expect(sourceNode).toHaveAttribute('data-badge', '5 tables');
  });
});
