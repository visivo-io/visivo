import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SchemaBrowser from './SchemaBrowser';
import {
  fetchAllSources,
  fetchDatabases,
  fetchSchemas,
  fetchTables,
  fetchColumns,
} from '../../../api/sources';

jest.mock('../../../api/sources');

describe('SchemaBrowser', () => {
  const mockSources = {
    sources: [
      { name: 'postgres_db', status: 'PUBLISHED', config: {} },
      { name: 'snowflake_wh', status: 'NEW', config: {} },
    ],
  };

  const mockDatabases = {
    databases: [{ name: 'analytics' }],
    status: 'connected',
  };

  const mockSchemasWithSchemas = {
    schemas: [{ name: 'public' }, { name: 'staging' }],
    has_schemas: true,
  };

  const mockSchemasNoSchemas = {
    schemas: [],
    has_schemas: false,
  };

  const mockTables = {
    tables: [{ name: 'users' }, { name: 'orders' }],
  };

  const mockColumns = {
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'email', type: 'VARCHAR' },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fetchAllSources.mockResolvedValue(mockSources);
    fetchDatabases.mockResolvedValue(mockDatabases);
    fetchSchemas.mockResolvedValue(mockSchemasWithSchemas);
    fetchTables.mockResolvedValue(mockTables);
    fetchColumns.mockResolvedValue(mockColumns);
  });

  test('calls fetchAllSources on mount and renders source list', async () => {
    render(<SchemaBrowser />);

    expect(fetchAllSources).toHaveBeenCalledTimes(1);
    await screen.findByText('postgres_db');
    expect(screen.getByText('snowflake_wh')).toBeInTheDocument();
  });

  test('shows loading state while sources are being fetched', async () => {
    let resolvePromise;
    fetchAllSources.mockReturnValue(
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
    fetchAllSources.mockResolvedValue({ sources: [] });

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

  test('clicking source expands it and calls fetchDatabases', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));

    expect(fetchDatabases).toHaveBeenCalledWith('postgres_db');

    await screen.findByText('analytics');
  });

  test('expanding database calls fetchSchemas', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('analytics');

    fireEvent.click(screen.getByTestId('tree-node-database-analytics'));

    expect(fetchSchemas).toHaveBeenCalledWith('postgres_db', 'analytics');
  });

  test('schema-less databases (has_schemas=false) show tables directly', async () => {
    fetchSchemas.mockResolvedValue(mockSchemasNoSchemas);

    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('analytics');

    fireEvent.click(screen.getByTestId('tree-node-database-analytics'));

    await screen.findByText('users');
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(fetchTables).toHaveBeenCalledWith('postgres_db', 'analytics', null);
  });

  test('expanding schema calls fetchTables', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('analytics');

    fireEvent.click(screen.getByTestId('tree-node-database-analytics'));
    await screen.findByText('public');

    fireEvent.click(screen.getByTestId('tree-node-schema-public'));

    await screen.findByText('users');
    expect(fetchTables).toHaveBeenCalledWith('postgres_db', 'analytics', 'public');
  });

  test('table nodes show "Create Model" action button', async () => {
    const onCreateModel = jest.fn();

    render(<SchemaBrowser onCreateModel={onCreateModel} />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('analytics');

    fireEvent.click(screen.getByTestId('tree-node-database-analytics'));
    await screen.findByText('public');

    fireEvent.click(screen.getByTestId('tree-node-schema-public'));
    await screen.findByText('users');

    const createModelButtons = screen.getAllByTestId('action-Create Model');
    expect(createModelButtons.length).toBeGreaterThan(0);

    fireEvent.click(createModelButtons[0]);
    expect(onCreateModel).toHaveBeenCalledWith({
      sourceName: 'postgres_db',
      database: 'analytics',
      schema: 'public',
      table: 'users',
    });
  });

  test('double-clicking table calls onTableSelect', async () => {
    const onTableSelect = jest.fn();

    render(<SchemaBrowser onTableSelect={onTableSelect} />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('analytics');

    fireEvent.click(screen.getByTestId('tree-node-database-analytics'));
    await screen.findByText('public');

    fireEvent.click(screen.getByTestId('tree-node-schema-public'));
    await screen.findByText('users');

    fireEvent.doubleClick(screen.getByTestId('tree-node-table-users'));
    expect(onTableSelect).toHaveBeenCalledWith({
      sourceName: 'postgres_db',
      database: 'analytics',
      schema: 'public',
      table: 'users',
    });
  });

  test('expanding table calls fetchColumns', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('analytics');

    fireEvent.click(screen.getByTestId('tree-node-database-analytics'));
    await screen.findByText('public');

    fireEvent.click(screen.getByTestId('tree-node-schema-public'));
    await screen.findByText('users');

    fireEvent.click(screen.getByTestId('tree-node-table-users'));

    expect(fetchColumns).toHaveBeenCalledWith('postgres_db', 'analytics', 'users', 'public');
  });

  test('columns display name and type badge', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('analytics');

    fireEvent.click(screen.getByTestId('tree-node-database-analytics'));
    await screen.findByText('public');

    fireEvent.click(screen.getByTestId('tree-node-schema-public'));
    await screen.findByText('users');

    fireEvent.click(screen.getByTestId('tree-node-table-users'));

    await screen.findByText('id');
    expect(screen.getByText('INTEGER')).toBeInTheDocument();
    await screen.findByText('email');
    expect(screen.getByText('VARCHAR')).toBeInTheDocument();
  });

  test('loading states show spinner on the loading node', async () => {
    let resolveDatabases;
    fetchDatabases.mockReturnValue(
      new Promise(resolve => {
        resolveDatabases = resolve;
      })
    );

    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));

    await screen.findByTestId('loading-spinner');

    await act(async () => {
      resolveDatabases(mockDatabases);
    });
  });

  test('does not re-fetch data for already-loaded nodes', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));
    await screen.findByText('analytics');
    expect(fetchDatabases).toHaveBeenCalledTimes(1);

    // Collapse
    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));

    // Expand again - should NOT re-fetch
    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));

    expect(fetchDatabases).toHaveBeenCalledTimes(1);
  });

  test('displays NEW status badge on non-published sources', async () => {
    render(<SchemaBrowser />);

    await screen.findByText('NEW');
  });

  test('shows error icon when source connection fails', async () => {
    fetchDatabases.mockResolvedValue({
      databases: [],
      status: 'connection_failed',
      error: 'Connection refused',
    });

    render(<SchemaBrowser />);

    await screen.findByText('postgres_db');

    fireEvent.click(screen.getByTestId('tree-node-source-postgres_db'));

    await screen.findByTestId('error-icon');
    expect(screen.getByTestId('tree-node-source-postgres_db')).toHaveAttribute(
      'title',
      'Connection refused'
    );
  });
});
