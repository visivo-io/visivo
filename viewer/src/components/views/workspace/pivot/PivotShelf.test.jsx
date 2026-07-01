/**
 * PivotShelf (VIS-1008).
 *
 * The three pivot drop shelves. jsdom can't simulate a real dnd-kit pointer
 * drag, so we mock `useDroppable` to (a) capture the droppable `data` payload —
 * proving the shelf wires `{ kind:'pivot-field', shelf, onDropField }` the shared
 * router needs — and (b) drive the `onDropField` callback directly to exercise
 * the drop path. Chip removal + the Values aggregation picker (brand Select) are real DOM
 * interactions.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import selectEvent from 'react-select-event';
import PivotShelf, { AGGREGATIONS } from './PivotShelf';

// Capture the data passed to each useDroppable call so we can assert + invoke it.
const droppableData = {};
jest.mock('@dnd-kit/core', () => ({
  useDroppable: ({ id, data }) => {
    droppableData[id] = data;
    return { setNodeRef: () => {}, isOver: false };
  },
}));

beforeEach(() => {
  for (const k of Object.keys(droppableData)) delete droppableData[k];
});

describe('PivotShelf', () => {
  test('registers a pivot-field droppable carrying the shelf + onDropField', () => {
    const onDropField = jest.fn();
    render(<PivotShelf shelf="columns" chips={[]} onDropField={onDropField} />);

    expect(screen.getByTestId('pivot-shelf-columns')).toBeInTheDocument();
    const data = droppableData['pivot-shelf-columns'];
    expect(data.kind).toBe('pivot-field');
    expect(data.shelf).toBe('columns');
    expect(data.onDropField).toBe(onDropField);
  });

  test('an empty shelf shows the drop hint', () => {
    render(<PivotShelf shelf="rows" chips={[]} onDropField={jest.fn()} />);
    expect(screen.getByText(/Drop a field here/i)).toBeInTheDocument();
  });

  test('the router invoking onDropField (the drop path) reaches the playground callback', () => {
    const onDropField = jest.fn();
    render(<PivotShelf shelf="rows" chips={[]} onDropField={onDropField} />);
    const field = { name: 'region', source: 's', label: 'Region' };

    // Simulate the WorkspaceDndContext router calling the droppable's onDropField
    // when a pivot-field pill lands on this shelf.
    droppableData['pivot-shelf-rows'].onDropField(field);
    expect(onDropField).toHaveBeenCalledWith(field);
  });

  test('renders chips and removes one on the chip remove button', () => {
    const onRemoveChip = jest.fn();
    render(
      <PivotShelf
        shelf="columns"
        chips={[{ field: 'region', source: 's', label: 'Region' }]}
        onDropField={jest.fn()}
        onRemoveChip={onRemoveChip}
      />
    );
    expect(screen.getByTestId('pivot-chip-columns-0')).toHaveTextContent('Region');
    fireEvent.click(screen.getByTestId('pivot-chip-columns-0-remove'));
    expect(onRemoveChip).toHaveBeenCalledWith(0);
  });

  test('a Values chip exposes an aggregation select and reports changes', async () => {
    const onAggChange = jest.fn();
    render(
      <PivotShelf
        shelf="values"
        chips={[{ field: 'revenue', source: 's', label: 'Revenue', agg: 'sum' }]}
        onDropField={jest.fn()}
        onAggChange={onAggChange}
      />
    );
    const select = screen.getByTestId('pivot-chip-values-0-agg');
    const combo = within(select).getByRole('combobox');
    // The current aggregation shows as the selected value.
    expect(select).toHaveTextContent('Sum');
    // All supported aggregations are offered when the menu opens.
    selectEvent.openMenu(combo);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(AGGREGATIONS.length);

    // Pick "Average" from the open (portaled) menu.
    fireEvent.click(options.find(o => o.textContent === 'Average'));
    expect(onAggChange).toHaveBeenCalledWith(0, 'avg');
  });

  test('non-Values shelves render no aggregation select on their chips', () => {
    render(
      <PivotShelf
        shelf="columns"
        chips={[{ field: 'region', source: 's', label: 'Region' }]}
        onDropField={jest.fn()}
      />
    );
    expect(screen.queryByTestId('pivot-chip-columns-0-agg')).not.toBeInTheDocument();
  });
});
