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

  test('renders the type label for each Layout-Items type', () => {
    const { rerender } = render(
      <LibraryDragPreview data={{ source: 'library', type: 'markdown', name: 'notes' }} />
    );
    expect(screen.getByTestId('library-drag-preview')).toHaveTextContent('Markdown');

    rerender(
      <LibraryDragPreview data={{ source: 'library', type: 'input', name: 'date_range' }} />
    );
    expect(screen.getByTestId('library-drag-preview')).toHaveTextContent('Input');
  });
});
