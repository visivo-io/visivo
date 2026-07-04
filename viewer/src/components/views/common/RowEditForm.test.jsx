import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import selectEvent from 'react-select-event';
import { DndContext } from '@dnd-kit/core';
import RowEditForm, { getItemRef } from './RowEditForm';

const baseRow = {
  height: 'medium',
  items: [
    { width: 1, chart: 'ref(rev_chart)', table: '', markdown: '', selector: '', input: '' },
    { width: 2, chart: '', table: '', markdown: '', selector: '', input: '' },
  ],
};

const renderRow = (props = {}) =>
  render(
    <DndContext>
      <RowEditForm
        row={baseRow}
        rowId={0}
        rowIndex={0}
        onRemoveRow={() => {}}
        onHeightChange={() => {}}
        onAddItem={() => {}}
        onRemoveItem={() => {}}
        onItemWidthChange={() => {}}
        onItemRefChange={() => {}}
        onSelectRef={() => {}}
        {...props}
      />
    </DndContext>
  );

describe('getItemRef', () => {
  test('resolves a chart ref to { type, name }', () => {
    expect(getItemRef({ chart: 'ref(c1)' })).toEqual({ type: 'chart', name: 'c1', inline: false });
  });
  test('resolves a table ref', () => {
    expect(getItemRef({ table: 'ref(t1)' })).toEqual({ type: 'table', name: 't1', inline: false });
  });
  test('returns null for an empty item', () => {
    expect(getItemRef({ chart: '', table: '' })).toBeNull();
    expect(getItemRef(null)).toBeNull();
  });
});

describe('RowEditForm — standalone render', () => {
  test('renders the row header, height select, and one slot per item', () => {
    renderRow();
    expect(screen.getByText('Row 1')).toBeInTheDocument();
    // The brand <Select> shows the current height as its selected value.
    expect(screen.getByTestId('row-0-height-select')).toHaveTextContent('medium');
    // Each item slot is a RefDropZone with the id row-<rowId>-item-<idx>.
    expect(screen.getByTestId('ref-dropzone-row-0-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('ref-dropzone-row-0-item-1')).toBeInTheDocument();
  });

  test('a filled item slot renders the EmbeddedPill for the ref', () => {
    renderRow();
    const slot0 = screen.getByTestId('ref-dropzone-row-0-item-0');
    expect(slot0).toHaveAttribute('data-filled', 'true');
    expect(screen.getByText('rev_chart')).toBeInTheDocument();
  });

  test('an empty item slot renders the empty drop-zone visual', () => {
    renderRow();
    const slot1 = screen.getByTestId('ref-dropzone-row-0-item-1');
    expect(slot1).toHaveAttribute('data-filled', 'false');
  });

  test('removing a pill calls onItemRefChange(itemIndex, null)', () => {
    const onItemRefChange = jest.fn();
    renderRow({ onItemRefChange });
    fireEvent.click(screen.getByTestId('pill-remove'));
    expect(onItemRefChange).toHaveBeenCalledWith(0, null);
  });

  test('clicking a pill calls onSelectRef with the referenced object', () => {
    const onSelectRef = jest.fn();
    renderRow({ onSelectRef });
    fireEvent.click(screen.getByText('rev_chart'));
    expect(onSelectRef).toHaveBeenCalledWith({ type: 'chart', name: 'rev_chart' });
  });

  test('height change, width change, add/remove item, remove row all fire callbacks', async () => {
    const onHeightChange = jest.fn();
    const onItemWidthChange = jest.fn();
    const onAddItem = jest.fn();
    const onRemoveItem = jest.fn();
    const onRemoveRow = jest.fn();
    renderRow({ onHeightChange, onItemWidthChange, onAddItem, onRemoveItem, onRemoveRow });

    await selectEvent.select(
      within(screen.getByTestId('row-0-height-select')).getByRole('combobox'),
      'large',
      { container: document.body }
    );
    expect(onHeightChange).toHaveBeenCalledWith('large');

    fireEvent.change(screen.getByLabelText('Item 1 width'), { target: { value: '3' } });
    expect(onItemWidthChange).toHaveBeenCalledWith(0, '3');

    fireEvent.click(screen.getByText('Add Item'));
    expect(onAddItem).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Remove item 2'));
    expect(onRemoveItem).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByLabelText('Remove row 1'));
    expect(onRemoveRow).toHaveBeenCalled();
  });
});

describe('RowEditForm — standalone (no DndContext ancestor)', () => {
  test('renders without crashing when mounted with no DndContext', () => {
    expect(() =>
      render(
        <RowEditForm
          row={baseRow}
          rowId={5}
          rowIndex={2}
          onRemoveRow={() => {}}
          onHeightChange={() => {}}
          onAddItem={() => {}}
          onRemoveItem={() => {}}
          onItemWidthChange={() => {}}
          onItemRefChange={() => {}}
          onSelectRef={() => {}}
        />
      )
    ).not.toThrow();
    expect(screen.getByText('Row 3')).toBeInTheDocument();
  });
});
