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
  fetchSourceSchema,
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
jest.mock('../../../../api/sourceSchemaJobs', () => {
  // Keep the real envelope slicers — they are pure functions over the
  // fetched record, and mocking them would hide the derivation.
  const actual = jest.requireActual('../../../../api/sourceSchemaJobs');
  return {
    ...actual,
    fetchSourceSchemaJobs: jest.fn(),
    generateSourceSchema: jest.fn(),
    fetchSchemaGenerationStatus: jest.fn(),
    fetchSourceSchema: jest.fn(),
  };
});

jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return { __esModule: true, ...actual, useDraggable: jest.fn(actual.useDraggable) };
});

const withDnd = ui => <DndContext>{ui}</DndContext>;

/** The stored schema envelope: tables -> columns -> {type, nullable}. */
const envelope = tables => ({ source_name: 'warehouse', tables });
/** Four columns, matching the `column_count: 4` these tests used to mock. */
const ORDERS_4 = envelope({
  orders: {
    columns: {
      id: { type: 'INTEGER' },
      region: { type: 'VARCHAR' },
      amount: { type: 'DOUBLE' },
      created_at: { type: 'TIMESTAMP' },
    },
  },
});

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

  test('hovering reveals the standard action cluster and the drag handle', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    const row = screen.getByTestId('library-row-source-warehouse');
    fireEvent.mouseEnter(row);
    // The hover-only "Open" icon button is gone — the row body opens now. What
    // hover reveals is the same cluster every other row type has.
    expect(screen.queryByTestId('library-row-source-warehouse-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-row-source-warehouse-explore')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-source-warehouse-flip')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-source-warehouse-kebab')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-source-warehouse-drag-handle')).toBeInTheDocument();
  });

  // Inverted: the source row used to preventDefault right-click and render
  // nothing, so all seven context-menu actions were unreachable for sources.
  test('right-clicking the row opens the standard context menu', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.contextMenu(screen.getByTestId('library-row-source-warehouse'));
    expect(
      screen.getByTestId('library-row-source-warehouse-context-menu')
    ).toBeInTheDocument();
  });

  test('a source row forwards context-menu actions, which it used to drop entirely', () => {
    // `LibrarySubsection` always passed `onContextAction`; the old component's
    // signature never accepted it, so every action silently went nowhere.
    const onContextAction = jest.fn();
    render(
      withDnd(
        <LibrarySourceRow obj={SOURCE} onClick={jest.fn()} onContextAction={onContextAction} />
      )
    );
    fireEvent.contextMenu(screen.getByTestId('library-row-source-warehouse'));
    fireEvent.click(screen.getByText('Open in new tab'));
    expect(onContextAction).toHaveBeenCalledWith('openInNewTab', SOURCE);
  });

  test('Enter on the focused row opens it — sources had no keyboard activation at all', async () => {
    // Enter routes through the same handler as a body click, so it also
    // expands — mock the feed and let the drill-down settle.
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceSchema.mockResolvedValue(ORDERS_4);
    const onClick = jest.fn();
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={onClick} />));

    fireEvent.keyDown(screen.getByTestId('library-row-source-warehouse'), { key: 'Enter' });

    expect(onClick).toHaveBeenCalledWith(SOURCE, expect.anything());
    await screen.findByTestId('library-source-table-warehouse-orders');
  });

  // VIS-1134, inverting Phase 6c-T5. Consistency won — every other row type
  // opens on click — but the complaint that drove 6c-T5 (clicking the name
  // yanked you out of your exploration while hunting for a column) is
  // answered, not ignored: the click opens AND reveals the schema.
  test('clicking the row body opens the source AND reveals its schema', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceSchema.mockResolvedValue(ORDERS_4);
    const onClick = jest.fn();
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={onClick} />));

    fireEvent.click(screen.getByTestId('library-row-source-warehouse'));

    expect(onClick).toHaveBeenCalledWith(SOURCE, expect.anything());
    await screen.findByTestId('library-source-table-warehouse-orders');
  });

  test('a second body click does not collapse — the columns cannot be taken away', async () => {
    // The mitigation for the 6c-T5 regression: only the caret collapses, so a
    // user clicking the name twice never loses the columns they were reaching
    // for.
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceSchema.mockResolvedValue(ORDERS_4);
    const onClick = jest.fn();
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={onClick} />));

    fireEvent.click(screen.getByTestId('library-row-source-warehouse'));
    await screen.findByTestId('library-source-table-warehouse-orders');

    fireEvent.click(screen.getByTestId('library-row-source-warehouse'));

    expect(screen.getByTestId('library-source-table-warehouse-orders')).toBeInTheDocument();
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test('the caret still collapses, and toggling it never opens the source', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceSchema.mockResolvedValue(ORDERS_4);
    const onClick = jest.fn();
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={onClick} />));

    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));
    await screen.findByTestId('library-source-table-warehouse-orders');
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));
    expect(screen.queryByTestId('library-source-table-warehouse-orders')).not.toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  test('expanding the caret lazily loads the cached schema feed (source -> table)', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceSchema.mockResolvedValue(ORDERS_4);

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
    fetchSourceSchema.mockResolvedValue(ORDERS_4);

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

  test('expanding a table shows its columns, with type glyphs', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceSchema.mockResolvedValue(
      envelope({
        orders: {
          columns: {
            id: { type: 'INTEGER' },
            region: { type: 'VARCHAR' },
            is_active: { type: 'BOOLEAN' },
            created_at: { type: 'TIMESTAMP' },
            untyped: { type: null },
          },
        },
      })
    );

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));
    await screen.findByTestId('library-source-table-warehouse-orders');

    // The columns arrived with the table list; expanding costs no request.
    expect(fetchSourceSchema).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('library-source-table-warehouse-orders-toggle'));
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
    fetchSourceSchema.mockResolvedValue(
      envelope({ orders: { columns: { amount: { type: 'DOUBLE' } } } })
    );

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
    fetchSourceSchema.mockResolvedValue(
      envelope({ orders: { columns: { amount: { type: 'DOUBLE' } } } })
    );

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
    fetchSourceSchema.mockRejectedValueOnce(new Error('backend unreachable'));

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));

    await screen.findByTestId('library-source-warehouse-retry');
    expect(screen.getByText('backend unreachable')).toBeInTheDocument();

    fetchSourceSchema.mockResolvedValueOnce(
      envelope({ orders: { columns: { id: { type: 'INTEGER' }, amount: { type: 'DOUBLE' } } } })
    );
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
    expect(fetchSourceSchema).not.toHaveBeenCalled();
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

  // VIS-1135. This row was the reported bug: its icon was painted
  // `sourceColors.text` when UNSELECTED and mulberry when selected — the exact
  // inverse of the rule, and the only always-coloured icon in the nav.
  test('an unselected source icon is gray, not orange', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    const icon = screen.getByTestId('library-row-source-warehouse-icon');
    expect(icon).toHaveClass('text-gray-500');
    expect(icon).not.toHaveClass('text-orange-800');
  });

  test('a selected source icon carries the source type colour', () => {
    render(withDnd(<LibrarySourceRow obj={SOURCE} selected onClick={jest.fn()} />));
    expect(screen.getByTestId('library-row-source-warehouse-icon')).toHaveClass('text-orange-800');
  });

  test('a drill-down table glyph is gray — these are database tables, not Table objects', async () => {
    // It used to wear the `table` widget type's fuchsia, which claimed a
    // kinship that does not exist: dragging one yields `type:'sourceTable'`.
    // It was also the only coloured glyph in a tree whose column rows
    // (ColumnRow) are already gray.
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'warehouse', has_cached_schema: true },
    ]);
    fetchSourceSchema.mockResolvedValue(ORDERS_4);

    render(withDnd(<LibrarySourceRow obj={SOURCE} onClick={jest.fn()} />));
    fireEvent.click(screen.getByTestId('library-row-source-warehouse-toggle'));

    const glyph = await screen.findByTestId('library-source-table-warehouse-orders-icon');
    expect(glyph).toHaveClass('text-gray-400');
    expect(glyph).not.toHaveClass('text-fuchsia-800');
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
