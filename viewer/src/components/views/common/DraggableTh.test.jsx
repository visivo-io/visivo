import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DraggableTh from './DraggableTh';

// Capture the config `useDraggable` is called with so we can assert the exact
// drag payload (what the WorkspaceDndContext drop router will read).
let lastConfig = null;
jest.mock('@dnd-kit/core', () => ({
  useDraggable: config => {
    lastConfig = config;
    return {
      attributes: { 'data-draggable-id': config.id },
      listeners: {},
      setNodeRef: jest.fn(),
      isDragging: false,
    };
  },
}));

// A <th> is only valid inside a table row — wrap so React's validateDOMNesting
// (which setupTests escalates to a test failure) stays quiet.
const renderTh = ui =>
  render(
    <table>
      <thead>
        <tr>{ui}</tr>
      </thead>
    </table>
  );

describe('DraggableTh', () => {
  beforeEach(() => {
    lastConfig = null;
  });

  it('emits { name, type: "column", sourceType } — the payload the drop router reads', () => {
    renderTh(
      <DraggableTh name="amount" sourceType="model-preview" dataTestId="th">
        amount
      </DraggableTh>
    );
    // GUARD: every WorkspaceDndContext route keys on `type: 'column'`; drop the
    // type or the sourceType and a dragged column no longer routes onto a
    // property/interaction zone.
    expect(lastConfig.data).toEqual({
      name: 'amount',
      type: 'column',
      sourceType: 'model-preview',
    });
  });

  it('namespaces the dnd id by sourceType so the two grids never collide', () => {
    renderTh(
      <DraggableTh name="amount" sourceType="model-preview" dataTestId="th">
        amount
      </DraggableTh>
    );
    expect(lastConfig.id).toBe('model-preview-column-amount');
  });

  it('renders the element chosen by `as` (th by default, div when asked)', () => {
    renderTh(
      <DraggableTh name="a" sourceType="data-table" dataTestId="x">
        A
      </DraggableTh>
    );
    expect(screen.getByTestId('x').tagName).toBe('TH');

    render(
      <DraggableTh name="a" sourceType="data-table" as="div" dataTestId="y">
        A
      </DraggableTh>
    );
    expect(screen.getByTestId('y').tagName).toBe('DIV');
  });

  it('carries the grab affordance and renders its children', () => {
    renderTh(
      <DraggableTh name="a" sourceType="data-table" dataTestId="x" className="px-3">
        HELLO
      </DraggableTh>
    );
    const el = screen.getByTestId('x');
    expect(el.className).toContain('cursor-grab');
    expect(el.className).toContain('px-3');
    expect(el).toHaveTextContent('HELLO');
  });
});
