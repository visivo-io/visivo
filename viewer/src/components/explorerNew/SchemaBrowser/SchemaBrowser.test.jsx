import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SchemaBrowser from './SchemaBrowser';
import {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
} from '../../../api/sourceSchemaJobs';

jest.mock('../../../api/sourceSchemaJobs');

describe('SchemaBrowser', () => {
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

  const mockTables = [
    { name: 'users', column_count: 8, metadata: {} },
    { name: 'orders', column_count: 5, metadata: {} },
  ];

  const mockColumns = [
    { name: 'id', type: 'INTEGER', nullable: false },
    { name: 'email', type: 'VARCHAR', nullable: true },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSourceSchemaJobs.mockResolvedValue(mockSources);
    fetchSourceTables.mockResolvedValue(mockTables);
    fetchTableColumns.mockResolvedValue(mockColumns);
    generateSourceSchema.mockResolvedValue({ run_instance_id: 'job-123' });
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'completed', progress: 1.0 });
  });

  test('calls fetchSourceSchemaJobs on mount and renders source list', async () => {
    render(<SchemaBrowser />);

    expect(fetchSourceSchemaJobs).toHaveBeenCalledTimes(1);
    await screen.findByText('postgres_db');
    expect(screen.getByText('snowflake_wh')).toBeInTheDocument();
  });

  test('shows loading state while sources are being fetched', async () => {
    let resolvePromise;
    fetchSourceSchemaJobs.mockReturnValue(
      new Promise(resolve => {
        resolvePromise = resolve;
      })
    );

    render(<SchemaBrowser />);
    expect(screen.getByTestId('sources-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading sources...')).toBeInTheDocument();

    await act(async () => {
      resolvePromise(mockSources);
    });

    expect(screen.queryByTestId('sources-loading')).not.toBeInTheDocument();
  });

  test('shows "No sources configured" when sources array is empty', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([]);

    render(<SchemaBrowser />);

    await screen.findByText('No sources configured');
  });

  test('search filters sources by name (case-insensitive)', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    const searchInput = screen.getByTestId('schema-search');
    fireEvent.change(searchInput, { target: { value: 'POSTGRES' } });

    expect(screen.getByText('postgres_db')).toBeInTheDocument();
    expect(screen.queryByText('snowflake_wh')).not.toBeInTheDocument();
  });

  test('search for table name keeps parent source visible', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('users');

    const searchInput = screen.getByTestId('schema-search');
    fireEvent.change(searchInput, { target: { value: 'users' } });

    expect(screen.getByText('postgres_db')).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.queryByText('orders')).not.toBeInTheDocument();
  });

  test('clicking source with cached schema expands it and calls fetchSourceTables', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));

    expect(fetchSourceTables).toHaveBeenCalledWith('postgres_db');

    await screen.findByText('users');
    expect(screen.getByText('orders')).toBeInTheDocument();
  });

  test('clicking source without cached schema triggers generation instead of fetching tables directly', async () => {
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'running', progress: 0.5 });

    render(<SchemaBrowser />);

    await screen.findByText('snowflake_wh');

    fireEvent.click(screen.getByTestId('tree-node-source-snowflake_wh'));

    await waitFor(() => {
      expect(generateSourceSchema).toHaveBeenCalledWith('snowflake_wh');
    });
    expect(fetchSourceTables).not.toHaveBeenCalled();
  });

  test('table nodes show "Create Model" action button', async () => {
    const onCreateModel = jest.fn();

    render(<SchemaBrowser onCreateModel={onCreateModel} />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('users');

    const createModelButtons = screen.getAllByTestId('action-Create Model');
    expect(createModelButtons.length).toBeGreaterThan(0);

    fireEvent.click(createModelButtons[0]);
    expect(onCreateModel).toHaveBeenCalledWith({
      sourceName: 'postgres_db',
      table: 'users',
    });
  });

  test('double-clicking table calls onTableSelect', async () => {
    const onTableSelect = jest.fn();

    render(<SchemaBrowser onTableSelect={onTableSelect} />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('users');

    fireEvent.doubleClick(screen.getByTestId('tree-node-table-users'));
    expect(onTableSelect).toHaveBeenCalledWith({
      sourceName: 'postgres_db',
      table: 'users',
    });
  });

  test('expanding table calls fetchTableColumns', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('users');

    fireEvent.click(screen.getByTestId('tree-node-table-users'));

    expect(fetchTableColumns).toHaveBeenCalledWith('postgres_db', 'users');
  });

  test('columns display name and type badge', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('users');

    fireEvent.click(screen.getByTestId('tree-node-table-users'));

    await screen.findByText('id');
    expect(screen.getByText('INTEGER')).toBeInTheDocument();
    await screen.findByText('email');
    expect(screen.getByText('VARCHAR')).toBeInTheDocument();
  });

  test('loading states show spinner on the loading node', async () => {
    let resolveTables;
    fetchSourceTables.mockReturnValue(
      new Promise(resolve => {
        resolveTables = resolve;
      })
    );

    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));

    await screen.findByTestId('loading-spinner');

    await act(async () => {
      resolveTables(mockTables);
    });
  });

  test('does not re-fetch data for already-loaded nodes', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('users');
    expect(fetchSourceTables).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));

    expect(fetchSourceTables).toHaveBeenCalledTimes(1);
  });

  test('displays table count badge on sources with cached schema', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('5 tables');
  });

  test('shows Refresh Schema action for sources with cached schema', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    const refreshButtons = screen.getAllByTestId('action-Refresh Schema');
    expect(refreshButtons.length).toBeGreaterThan(0);
  });

  test('clicking source without cached schema triggers schema generation', async () => {
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'completed', progress: 1.0 });

    render(<SchemaBrowser />);

    await screen.findByText('snowflake_wh');

    fireEvent.click(screen.getByTestId('tree-node-source-snowflake_wh'));

    await waitFor(() => {
      expect(generateSourceSchema).toHaveBeenCalledWith('snowflake_wh');
    });
  });

  test('shows generating status while schema is being generated', async () => {
    let resolveStatus;
    fetchSchemaGenerationStatus.mockReturnValue(
      new Promise(resolve => {
        resolveStatus = resolve;
      })
    );

    render(<SchemaBrowser />);

    await screen.findByText('snowflake_wh');

    fireEvent.click(screen.getByTestId('tree-node-source-snowflake_wh'));

    await waitFor(() => {
      expect(screen.getByText('Generating...')).toBeInTheDocument();
    });

    await act(async () => {
      resolveStatus({ status: 'completed', progress: 1.0 });
    });
  });

  test('shows error when schema generation fails', async () => {
    generateSourceSchema.mockRejectedValue(new Error('Connection failed'));

    render(<SchemaBrowser />);

    await screen.findByText('snowflake_wh');

    fireEvent.click(screen.getByTestId('tree-node-source-snowflake_wh'));

    await waitFor(() => {
      expect(screen.getByTestId('error-icon')).toBeInTheDocument();
    });
  });

  test('expands source and shows tables after schema generation completes', async () => {
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'completed', progress: 1.0 });

    render(<SchemaBrowser />);

    await screen.findByText('snowflake_wh');

    fireEvent.click(screen.getByTestId('tree-node-source-snowflake_wh'));

    await waitFor(() => {
      expect(fetchSourceTables).toHaveBeenCalledWith('snowflake_wh');
    });

    await screen.findByText('users');
    expect(screen.getByText('orders')).toBeInTheDocument();
  });
});
