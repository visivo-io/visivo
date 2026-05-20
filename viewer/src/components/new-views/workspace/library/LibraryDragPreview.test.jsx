/**
 * LibraryDragPreview behaviour (VIS-776 / Track C C3).
 *
 * Pure-presentational pill rendered inside `<DragOverlay>` while a Library
 * row is being dragged. Verifies the icon + name + type chip render.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import LibraryDragPreview from './LibraryDragPreview';

describe('LibraryDragPreview', () => {
  test('renders nothing without library-sourced data', () => {
    const { container } = render(<LibraryDragPreview data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing if the drag source is not library', () => {
    const { container } = render(
      <LibraryDragPreview data={{ source: 'outline', type: 'chart', name: 'x' }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders the name + uppercase type chip for a chart', () => {
    render(
      <LibraryDragPreview data={{ source: 'library', type: 'chart', name: 'waterfall' }} />
    );
    const pill = screen.getByTestId('library-drag-preview');
    expect(pill).toHaveTextContent('waterfall');
    expect(pill).toHaveTextContent('Chart');
  });

  test('uses the subtype label for an insert primitive', () => {
    render(
      <LibraryDragPreview
        data={{ source: 'library', type: 'insert', subtype: 'row', name: 'Row' }}
      />
    );
    const pill = screen.getByTestId('library-drag-preview');
    expect(pill).toHaveTextContent('Row');
  });
});
