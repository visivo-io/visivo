/**
 * LibrarySourceRow — Explore 2.0 Phase 3a (D9 / VIS-1052) source drill-down.
 *
 * Covers: lazy expansion (useSourceOutline only fetches once expanded),
 * source -> table -> column levels rendering from the cached feed, type
 * glyphs, drag handles + payload shape, and per-session collapse memory via
 * the store (not re-fetching on re-render once cached).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DndContext, useDraggable } from '@dnd-kit/core';
import useStore from '../../../../stores/store';
import LibrarySourceRow from './LibrarySourceRow';
import {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
} from '../../../../api/sourceSchemaJobs';

jest.mock('../../../../contexts/URLContext', () => ({
  isAvailable: () => true,
}));
jest.mock('../../../../api/sourceSchemaJobs', () => ({
  fetchSourceSchemaJobs: jest.fn(),
  generateSourceSchema: jest.fn(),
  fetchSchemaGenerationStatus: jest.fn(),
  fetchSourceTables: jest.fn(),
  fetchTableColumns: jest.fn(),
}));

jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return { __esModule: true, ...actual, useDraggable: jest.fn(actual.useDraggable) };
});

const withDnd = ui => <DndContext>{ui}</DndContext>;

const SOURCE = { id: 'source:warehouse', type: 'source', name: 'warehouse', subtype: 'postgresql' };

describe('LibrarySourceRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDraggable.mockClear();
    act(() => {
      useStore.setState({
        librarySourceRowExpanded: {},
        workspaceSourceOutlineExpanded: {},
        workspaceSourceOutlineDataCache: {},
      });
    });
  });

  test('renders the source row collapsed by default, no schema fetch', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    expect(screen.getByTestId('library-row-source-warehouse')).toHaveTextContent('warehouse');
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();
  });

  test('clicking the row delegates to onClick (does not expand)', () => {
    const onClick = jest.fn();
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={onClick} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse'));
    expect(onClick).toHaveBeenCalledWith(SOURCE, expect.anything());
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();
  });

  test('expanding the caret lazily loads the cached schema feed (source -> table)', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceTables.mockResolvedValue([{ name: 'orders', column_count: 4 }]);

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));

    await waitFor(() => expect(fetchSourceSchemaJobs).toHaveBeenCalledTimes(1));
    await screen.findByTestId('library-source-table-warehouse-orders');
    expect(screen.getByTestId('library-source-table-warehouse-orders')).toHaveTextContent('orders');
    // Column count shown as a meta badge before columns are even expanded.
    expect(screen.getByTestId('library-source-table-warehouse-orders')).toHaveTextContent('4');
  });

  test('collapsing and re-expanding does not re-fetch (session cache)', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceTables.mockResolvedValue([{ name: 'orders', column_count: 4 }]);

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));
    await waitFor(() => expect(fetchSourceSchemaJobs).toHaveBeenCalledTimes(1));

    // Collapse.
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));
    expect(screen.queryByTestId('library-source-table-warehouse-orders')).not.toBeInTheDocument();

    // Re-expand — reads the per-session cache, no second fetch.
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));
    await screen.findByTestId('library-source-table-warehouse-orders');
    expect(fetchSourceSchemaJobs).toHaveBeenCalledTimes(1);
  });

  test('expanding a table lazily loads its columns, with type glyphs', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceTables.mockResolvedValue([{ name: 'orders', column_count: 2 }]);
    fetchTableColumns.mockResolvedValue([
      { name: 'id', type: 'INTEGER' },
      { name: 'region', type: 'VARCHAR' },
    ]);

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));
    await screen.findByTestId('library-source-table-warehouse-orders');

    expect(fetchTableColumns).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('library-source-table-warehouse-orders-toggle'));

    await waitFor(() => expect(fetchTableColumns).toHaveBeenCalledWith('warehouse', 'orders'));
    await screen.findByTestId('library-source-column-warehouse-orders-id');
    expect(screen.getByTestId('library-source-column-warehouse-orders-id')).toHaveTextContent('#');
    expect(
      screen.getByTestId('library-source-column-warehouse-orders-region')
    ).toHaveTextContent('T');
  });

  test('table row drag payload carries type sourceTable + sourceName', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceTables.mockResolvedValue([{ name: 'orders', column_count: 1 }]);

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));
    await screen.findByTestId('library-source-table-warehouse-orders');

    const call = useDraggable.mock.calls.find(
      ([opts]) => opts.id === 'library:sourceTable:warehouse:orders'
    );
    expect(call[0].data).toEqual(
      expect.objectContaining({ source: 'library', type: 'sourceTable', name: 'orders', sourceName: 'warehouse' })
    );
  });

  test('column row drag payload carries type sourceColumn + tableName + columnType', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceTables.mockResolvedValue([{ name: 'orders', column_count: 1 }]);
    fetchTableColumns.mockResolvedValue([{ name: 'amount', type: 'DOUBLE' }]);

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));
    await screen.findByTestId('library-source-table-warehouse-orders');
    fireEvent.click(screen.getByTestId('library-source-table-warehouse-orders-toggle'));
    await screen.findByTestId('library-source-column-warehouse-orders-amount');

    const call = useDraggable.mock.calls.find(
      ([opts]) => opts.id === 'library:sourceColumn:warehouse:orders:amount'
    );
    expect(call[0].data).toEqual(
      expect.objectContaining({
        source: 'library',
        type: 'sourceColumn',
        name: 'amount',
        sourceName: 'warehouse',
        tableName: 'orders',
        columnType: 'DOUBLE',
      })
    );
  });

  test('cold source (no cached schema) shows a Generate prompt instead of a tree', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: false },
    ]);

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));

    await screen.findByTestId('library-source-warehouse-generate');
    expect(fetchSourceTables).not.toHaveBeenCalled();
  });

  test('source row itself is a drag source (type source, unchanged payload shape)', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    const call = useDraggable.mock.calls.find(([opts]) => opts.id === 'library:source:warehouse');
    expect(call[0].data).toEqual(
      expect.objectContaining({ source: 'library', type: 'source', name: 'warehouse', subtype: 'postgresql' })
    );
  });

  test('renders the drag handle on the source row', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    expect(screen.getByTestId('library-row-source-warehouse-drag-handle')).toBeInTheDocument();
  });
});
