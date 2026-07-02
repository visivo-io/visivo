import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import RefDropZone from './RefDropZone';

// Controllable mock of useDroppable so we can exercise drag-over visuals
// (valid ring / invalid red flash) without driving a real pointer drag, which
// jsdom cannot simulate. Tests set `__mockDroppableState` before rendering.
let mockDroppableState = { isOver: false, active: null };
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    useDroppable: jest.fn(args => ({
      setNodeRef: jest.fn(),
      isOver: mockDroppableState.isOver,
      active: mockDroppableState.active,
      // Echo back the registered data so tests can assert on it; the real
      // hook stores `data` and exposes it to the DndContext's collision/drop
      // pipeline rather than the return value, but for unit assertions the
      // call args are the source of truth (see the "drop write path" test).
      node: { current: null },
      rect: { current: null },
      over: null,
      _data: args?.data,
    })),
  };
});

const ALLOWED = ['chart', 'table', 'markdown', 'input'];

const setDroppable = state => {
  mockDroppableState = state;
};

beforeEach(() => {
  mockDroppableState = { isOver: false, active: null };
  const { useDroppable } = require('@dnd-kit/core');
  useDroppable.mockClear();
});

describe('RefDropZone', () => {
  test('empty state renders dashed drop-zone with hint text', () => {
    render(<RefDropZone id="row-0-item-0" allowedTypes={ALLOWED} value={null} hint="Drop here" />);
    const zone = screen.getByTestId('ref-dropzone-row-0-item-0');
    expect(zone).toHaveAttribute('data-filled', 'false');
    expect(zone.className).toContain('border-dashed');
    expect(screen.getByText('Drop here')).toBeInTheDocument();
  });

  test('filled state renders an EmbeddedPill for the ref', () => {
    render(
      <RefDropZone
        id="row-0-item-0"
        allowedTypes={ALLOWED}
        value={{ type: 'chart', name: 'revenue_chart' }}
      />
    );
    const zone = screen.getByTestId('ref-dropzone-row-0-item-0');
    expect(zone).toHaveAttribute('data-filled', 'true');
    expect(screen.getByText('revenue_chart')).toBeInTheDocument();
  });

  test('accepts a bare/string ref value', () => {
    render(
      <RefDropZone id="row-0-item-0" allowedTypes={ALLOWED} value={{ type: 'table', name: 'ref(t1)' }} />
    );
    // parseRefValue strips ref(...) wrapper for display.
    expect(screen.getByText('t1')).toBeInTheDocument();
  });

  test('pill remove (x) calls onClear', () => {
    const onClear = jest.fn();
    render(
      <RefDropZone
        id="row-0-item-0"
        allowedTypes={ALLOWED}
        value={{ type: 'chart', name: 'c1' }}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByTestId('pill-remove'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test('pill click calls onSelectRef with the referenced object', () => {
    const onSelectRef = jest.fn();
    render(
      <RefDropZone
        id="row-0-item-0"
        allowedTypes={ALLOWED}
        value={{ type: 'markdown', name: 'notes' }}
        onSelectRef={onSelectRef}
      />
    );
    fireEvent.click(screen.getByText('notes'));
    expect(onSelectRef).toHaveBeenCalledWith({ type: 'markdown', name: 'notes' });
  });

  test('valid-type dragover shows mulberry ring', () => {
    setDroppable({
      isOver: true,
      active: { data: { current: { source: 'library', type: 'chart', name: 'c1' } } },
    });
    render(<RefDropZone id="row-0-item-0" allowedTypes={ALLOWED} value={null} />);
    const zone = screen.getByTestId('ref-dropzone-row-0-item-0');
    expect(zone).toHaveAttribute('data-valid-drag', 'true');
    expect(zone).toHaveAttribute('data-invalid-drag', 'false');
    expect(zone.className).toContain('ring-2');
  });

  test('invalid-type dragover shows red flash + reject text', () => {
    setDroppable({
      isOver: true,
      active: { data: { current: { source: 'library', type: 'source', name: 's1' } } },
    });
    render(<RefDropZone id="row-0-item-0" allowedTypes={ALLOWED} value={null} />);
    const zone = screen.getByTestId('ref-dropzone-row-0-item-0');
    expect(zone).toHaveAttribute('data-invalid-drag', 'true');
    expect(zone).toHaveAttribute('data-valid-drag', 'false');
    expect(zone.className).toContain('border-red-400');
    expect(zone.className).toContain('animate-pulse');
    expect(screen.getByText('Type not allowed')).toBeInTheDocument();
  });

  test('drop write path: shell onDragEnd reads zone data and invokes onChange', () => {
    // Simulates how Track G G-1's shared DndContext will dispatch a drop: it
    // reads the droppable `data.current` (kind/allowedTypes/refId/onChange) and
    // calls the consumer's onChange with `{ type, name }`. We call the handler
    // directly because there is no shell DndContext yet.
    const onChange = jest.fn();
    const { useDroppable } = require('@dnd-kit/core');
    render(<RefDropZone id="row-0-item-0" allowedTypes={ALLOWED} value={null} onChange={onChange} />);
    const data = useDroppable.mock.calls[0][0].data;
    expect(data.kind).toBe('ref-slot');
    expect(data.allowedTypes).toEqual(ALLOWED);
    expect(data.refId).toBe('row-0-item-0');
    // The dragged library payload type is allowed → write the ref.
    const draggedType = 'chart';
    expect(data.allowedTypes.includes(draggedType)).toBe(true);
    data.onChange({ type: draggedType, name: 'c1' });
    expect(onChange).toHaveBeenCalledWith({ type: 'chart', name: 'c1' });
  });

  test('is render-safe with no active drag (no DndContext ancestor → inert)', () => {
    // G-1 owns the shell DndContext; until then RefDropZone must be inert but
    // render-safe. With no ancestor, useDroppable yields isOver:false/active:null.
    setDroppable({ isOver: false, active: null });
    expect(() =>
      render(<RefDropZone id="x-0" allowedTypes={ALLOWED} value={null} />)
    ).not.toThrow();
    const zone = screen.getByTestId('ref-dropzone-x-0');
    expect(zone).toHaveAttribute('data-over', 'false');
    expect(zone).toHaveAttribute('data-valid-drag', 'false');
    expect(zone).toHaveAttribute('data-invalid-drag', 'false');
  });
});

describe('RefDropZone within a DndContext', () => {
  test('mounts inside a DndContext without error', () => {
    expect(() =>
      render(
        <DndContext>
          <RefDropZone id="ctx-0" allowedTypes={ALLOWED} value={null} />
        </DndContext>
      )
    ).not.toThrow();
  });
});
