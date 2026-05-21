/**
 * LibrarySection behaviour (VIS-769 + VIS-773 / Track C C1 + C2).
 *
 * Covers:
 *   - section header (UPPERCASE title + total count across all types)
 *   - per-type subsections rendering in order
 *   - search filters rows and hides empty subsections
 *   - type-filter chip hides non-matching subsections
 *   - section-level collapse toggle + localStorage persistence
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import LibrarySection, { STORAGE_PREFIX } from './LibrarySection';

const withDnd = ui => <DndContext>{ui}</DndContext>;

const LAYOUT_TYPES = ['chart', 'table', 'markdown', 'input'];

const ROWS_BY_TYPE = {
  chart: [
    { id: 'chart:waterfall', type: 'chart', name: 'waterfall' },
    { id: 'chart:fib', type: 'chart', name: 'fibonacci_growth' },
  ],
  table: [{ id: 'table:revenue', type: 'table', name: 'revenue_rows' }],
  markdown: [{ id: 'markdown:notes', type: 'markdown', name: 'project_notes' }],
  input: [],
};

const renderSection = (props = {}) =>
  render(
    withDnd(
      <LibrarySection
        sectionKey="layout"
        title="Layout Items"
        subtitle="Drag onto the canvas"
        types={LAYOUT_TYPES}
        rowsByType={ROWS_BY_TYPE}
        {...props}
      />
    )
  );

describe('LibrarySection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('renders the section header with the total count across every type', () => {
    renderSection();
    expect(screen.getByTestId('library-section-layout')).toBeInTheDocument();
    // 2 charts + 1 table + 1 markdown + 0 inputs = 4.
    expect(screen.getByTestId('library-section-layout-count')).toHaveTextContent('(4)');
    expect(screen.getByTestId('library-section-layout-header')).toHaveTextContent(
      'Layout Items'
    );
  });

  test('renders one subsection per type in declaration order', () => {
    renderSection();
    expect(screen.getByTestId('library-subsection-chart')).toBeInTheDocument();
    expect(screen.getByTestId('library-subsection-table')).toBeInTheDocument();
    expect(screen.getByTestId('library-subsection-markdown')).toBeInTheDocument();
    expect(screen.getByTestId('library-subsection-input')).toBeInTheDocument();
  });

  test('renders the search input and the type-filter chip row', () => {
    renderSection();
    expect(screen.getByTestId('library-search-layout')).toBeInTheDocument();
    expect(screen.getByTestId('library-filter-chips-layout')).toBeInTheDocument();
  });

  test('an active type-filter chip hides every non-matching subsection', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('library-filter-chip-layout-chart'));
    expect(screen.getByTestId('library-subsection-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('library-subsection-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-subsection-markdown')).not.toBeInTheDocument();
  });

  test('search filters rows and hides subsections with no matches', () => {
    jest.useFakeTimers();
    try {
      renderSection();
      fireEvent.change(screen.getByTestId('library-search-layout'), {
        target: { value: 'fib' },
      });
      act(() => {
        jest.advanceTimersByTime(200);
      });
      // The chart subsection keeps the matching row.
      expect(screen.getByTestId('library-row-chart-fibonacci_growth')).toBeInTheDocument();
      expect(screen.queryByTestId('library-row-chart-waterfall')).not.toBeInTheDocument();
      // Subsections with no match drop out entirely.
      expect(screen.queryByTestId('library-subsection-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('library-subsection-markdown')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('toggles collapse on header click and persists to localStorage', () => {
    renderSection();
    const header = screen.getByTestId('library-section-layout-header');
    const section = screen.getByTestId('library-section-layout');
    expect(section).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('library-section-layout-body')).toBeInTheDocument();

    fireEvent.click(header);
    expect(section).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('library-section-layout-body')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}layout`)).toBe('1');

    fireEvent.click(header);
    expect(section).toHaveAttribute('data-collapsed', 'false');
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}layout`)).toBeNull();
  });

  test('reads persisted collapse state on mount', () => {
    window.localStorage.setItem(`${STORAGE_PREFIX}layout`, '1');
    renderSection();
    expect(screen.getByTestId('library-section-layout')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
  });
});
