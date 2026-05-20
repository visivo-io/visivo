/**
 * LibrarySection behaviour (VIS-769 + VIS-773 / Track C C1 + C2).
 *
 * Covers:
 *   - 5-section / row rendering
 *   - count badge
 *   - empty-state placeholder
 *   - collapse toggle + localStorage persistence
 *   - "+ New X" CTA delegates onCreate
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import LibrarySection from './LibrarySection';
import { STORAGE_PREFIX } from './LibrarySection';

const withDnd = (ui) => <DndContext>{ui}</DndContext>;

const ROWS = [
  { id: 'chart:waterfall', type: 'chart', name: 'waterfall' },
  { id: 'chart:fib', type: 'chart', name: 'fibonacci_growth' },
];

describe('LibrarySection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('renders header + rows + count', () => {
    render(
      withDnd(
        <LibrarySection
          sectionKey="charts"
          label="Charts"
          rows={ROWS}
          draggable
          showCreate
          createLabel="Chart"
        />
      )
    );
    expect(screen.getByTestId('library-section-charts')).toBeInTheDocument();
    expect(screen.getByTestId('library-section-charts-count')).toHaveTextContent('(2)');
    expect(screen.getByTestId('library-row-chart-waterfall')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-chart-fibonacci_growth')).toBeInTheDocument();
    expect(screen.getByTestId('library-section-charts-create')).toHaveTextContent('New Chart');
  });

  test('renders the empty placeholder when no rows present', () => {
    render(
      withDnd(
        <LibrarySection
          sectionKey="models"
          label="Models"
          rows={[]}
          emptyText="No models yet"
        />
      )
    );
    expect(screen.getByTestId('library-section-models-empty')).toHaveTextContent(
      'No models yet'
    );
  });

  test('toggles collapsed state on header click and persists to localStorage', () => {
    render(
      withDnd(<LibrarySection sectionKey="charts" label="Charts" rows={ROWS} />)
    );
    const header = screen.getByTestId('library-section-charts-header');
    const section = screen.getByTestId('library-section-charts');
    expect(section).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('library-section-charts-body')).toBeInTheDocument();

    fireEvent.click(header);
    expect(section).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('library-section-charts-body')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}charts`)).toBe('1');

    fireEvent.click(header);
    expect(section).toHaveAttribute('data-collapsed', 'false');
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}charts`)).toBeNull();
  });

  test('reads persisted collapse state on mount', () => {
    window.localStorage.setItem(`${STORAGE_PREFIX}charts`, '1');
    render(
      withDnd(<LibrarySection sectionKey="charts" label="Charts" rows={ROWS} />)
    );
    expect(screen.getByTestId('library-section-charts')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
  });

  test('"+ New X" button fires onCreate', () => {
    const onCreate = jest.fn();
    render(
      withDnd(
        <LibrarySection
          sectionKey="charts"
          label="Charts"
          rows={ROWS}
          showCreate
          createLabel="Chart"
          onCreate={onCreate}
        />
      )
    );
    fireEvent.click(screen.getByTestId('library-section-charts-create'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  test('filters rows via the search input', () => {
    jest.useFakeTimers();
    try {
      render(
        withDnd(
          <LibrarySection
            sectionKey="charts"
            label="Charts"
            rows={ROWS}
            draggable
          />
        )
      );
      const input = screen.getByTestId('library-search-charts');
      fireEvent.change(input, { target: { value: 'fib' } });
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('library-row-chart-waterfall')).not.toBeInTheDocument();
      expect(screen.getByTestId('library-row-chart-fibonacci_growth')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
