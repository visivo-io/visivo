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
import { isAvailable } from '../../../../contexts/URLContext';

// A jest.fn() (not a bare arrow function) so one test can override its
// return value for that render only — `useSourceOutline`'s `available` is
// computed via `useMemo(() => isAvailable(...), [])` at mount, so the
// override must be in place BEFORE that component renders.
// `jest.clearAllMocks()` below resets call history, not this implementation.
jest.mock('../../../../contexts/URLContext', () => ({
  isAvailable: jest.fn(() => true),
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

  test('hovering reveals the Open button and drag handle; unhovering hides them again', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    const row = screen.getByTestId('library-row-source-warehouse');
    // React's synthetic mouseenter/mouseleave simulate proper enter/leave
    // semantics for the whole subtree regardless of native (non-bubbling)
    // behavior, so firing on this inner row still reaches the outer
    // wrapper's onMouseEnter/onMouseLeave handlers.
    fireEvent.mouseEnter(row);
    expect(screen.getByTestId('library-row-source-warehouse-open')).toHaveClass('opacity-100');
    fireEvent.mouseLeave(row);
    expect(screen.getByTestId('library-row-source-warehouse-open')).toHaveClass('opacity-0');
  });

  test('right-clicking the row suppresses the native context menu (no custom menu of its own)', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    const row = screen.getByTestId('library-row-source-warehouse');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    row.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  // Phase 6c-T5 (ux-audit.md "Clicking a source name in the Library hijacks
  // navigation to a read-only ERD tab", ⚠ conflicts-with-e2e): row click now
  // expands in place — the natural gesture for hunting a column to drag —
  // instead of navigating away from whatever exploration the user is mid-edit
  // on. Navigation moved to an explicit, hover-revealed "Open" icon button.
  test('clicking the row body expands in place — it no longer navigates via onClick', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceTables.mockResolvedValue([{ name: 'orders', column_count: 4 }]);
    const onClick = jest.fn();
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={onClick} />));

    fireEvent.click(screen.getByTestId('library-row-source-warehouse'));

    await waitFor(() => expect(fetchSourceSchemaJobs).toHaveBeenCalledTimes(1));
    await screen.findByTestId('library-source-table-warehouse-orders');
    expect(onClick).not.toHaveBeenCalled();

    // Clicking the row body again collapses it (same toggle as the caret).
    fireEvent.click(screen.getByTestId('library-row-source-warehouse'));
    expect(screen.queryByTestId('library-source-table-warehouse-orders')).not.toBeInTheDocument();
  });

  test('the explicit "Open" button still navigates via onClick, without expanding', () => {
    const onClick = jest.fn();
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={onClick} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-open'));
    expect(onClick).toHaveBeenCalledWith(SOURCE, expect.anything());
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();
    expect(screen.queryByTestId('library-source-table-warehouse-orders')).not.toBeInTheDocument();
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
      { name: 'is_active', type: 'BOOLEAN' },
      { name: 'created_at', type: 'TIMESTAMP' },
      { name: 'untyped', type: null },
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
    expect(
      screen.getByTestId('library-source-column-warehouse-orders-is_active')
    ).toHaveTextContent('B');
    // date/time and no-type both render an icon-only glyph (no letter label).
    expect(
      screen.getByTestId('library-source-column-warehouse-orders-created_at')
    ).not.toHaveTextContent(/[A-Z]/);
    expect(
      screen.getByTestId('library-source-column-warehouse-orders-untyped')
    ).not.toHaveTextContent(/[A-Z]/);
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

  test('a failed table fetch shows the error state with a working Retry', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceTables.mockRejectedValueOnce(new Error('backend unreachable'));

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));

    await screen.findByTestId('library-source-warehouse-retry');
    expect(screen.getByText('backend unreachable')).toBeInTheDocument();

    fetchSourceTables.mockResolvedValueOnce([{ name: 'orders', column_count: 2 }]);
    fireEvent.click(screen.getByTestId('library-source-warehouse-retry'));

    await screen.findByTestId('library-source-table-warehouse-orders');
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

  test('schema browsing disabled (isAvailable false, e.g. dist/cloud) shows the degraded message instead of a tree', () => {
    isAvailable.mockReturnValueOnce(false);

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));

    expect(screen.getByTestId('library-source-warehouse-unavailable')).toBeInTheDocument();
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();
  });

  test('a selected row gets the selected chrome (data-selected + highlighted text)', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} selected onClick={jest.fn()} />));
    const row = screen.getByTestId('library-row-source-warehouse');
    expect(row).toHaveAttribute('data-selected', 'true');
  });

  test('a click never fires onClick while a drag is in progress (isDragging)', () => {
    useDraggable.mockReturnValueOnce({
      transform: null,
      setNodeRef: jest.fn(),
      listeners: {},
      attributes: {},
      isDragging: true,
    });
    const onClick = jest.fn();
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={onClick} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
