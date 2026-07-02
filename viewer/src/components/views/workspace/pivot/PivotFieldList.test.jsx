/**
 * PivotFieldList (VIS-1008) — the pivot playground's LEFT pane.
 *
 * Each source field renders as a shared FieldPill drag source that registers
 * with the surrounding dnd-kit context carrying the `pivot-field` payload the
 * shared WorkspaceDndContext router dispatches on. The drag itself is driven
 * with real pointer events (dnd-kit's PointerSensor activates in jsdom when the
 * native event carries `isPrimary` + button 0).
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import PivotFieldList from './PivotFieldList';

const FIELDS = [
  { name: 'revenue', label: 'Revenue', source: 'sales-insight' },
  { name: 'region', label: 'Region', source: 'sales-insight' },
];

const pointerEvent = (type, coords = {}) => {
  const evt = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: coords.clientX ?? 0,
    clientY: coords.clientY ?? 0,
    button: 0,
  });
  Object.defineProperty(evt, 'isPrimary', { value: true });
  Object.defineProperty(evt, 'pointerId', { value: 1 });
  return evt;
};

const dragFrom = async el => {
  await act(async () => {
    el.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
  });
  await act(async () => {
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 5 }));
  });
};

const endDrag = async () => {
  await act(async () => {
    document.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 5 }));
  });
};

describe('PivotFieldList (VIS-1008)', () => {
  test('renders one draggable pill per field with its label', () => {
    render(
      <DndContext>
        <PivotFieldList fields={FIELDS} />
      </DndContext>
    );
    expect(screen.getByTestId('pivot-field-list')).toBeInTheDocument();
    const revenue = screen.getByTestId('pivot-field-revenue');
    expect(revenue).toHaveTextContent('Revenue');
    expect(revenue).toHaveAttribute('title', 'Drag "Revenue" onto a shelf');
    expect(screen.getByTestId('pivot-field-region')).toHaveTextContent('Region');
  });

  test('shows the loading hint while fields resolve', () => {
    render(
      <DndContext>
        <PivotFieldList fields={[]} isLoading />
      </DndContext>
    );
    expect(screen.getByText('Loading fields…')).toBeInTheDocument();
  });

  test('shows the empty hint when the table has no fields', () => {
    render(
      <DndContext>
        <PivotFieldList fields={[]} />
      </DndContext>
    );
    expect(screen.getByText('No fields available for this table.')).toBeInTheDocument();
  });

  test('a pointer drag starts a dnd drag carrying the pivot-field payload', async () => {
    const onDragStart = jest.fn();
    render(
      <DndContext onDragStart={onDragStart}>
        <PivotFieldList fields={FIELDS} />
      </DndContext>
    );

    await dragFrom(screen.getByTestId('pivot-field-revenue'));

    // The drag is live with the exact payload the shared router dispatches on.
    expect(onDragStart).toHaveBeenCalledTimes(1);
    const { active } = onDragStart.mock.calls[0][0];
    expect(active.id).toBe('pivot-field:sales-insight:revenue');
    expect(active.data.current).toEqual({
      source: 'pivot-field',
      field: FIELDS[0],
    });
    // The source pill ghosts (opacity) while it is being dragged.
    expect(screen.getByTestId('pivot-field-revenue').className).toContain('opacity-40');

    await endDrag();
    expect(screen.getByTestId('pivot-field-revenue').className).not.toContain('opacity-40');
  });

  test('fields without a source still register a stable drag id', async () => {
    const onDragStart = jest.fn();
    render(
      <DndContext onDragStart={onDragStart}>
        <PivotFieldList fields={[{ name: 'orders', label: 'Orders' }]} />
      </DndContext>
    );
    await dragFrom(screen.getByTestId('pivot-field-orders'));
    expect(onDragStart.mock.calls[0][0].active.id).toBe('pivot-field::orders');
    await endDrag();
  });
});
