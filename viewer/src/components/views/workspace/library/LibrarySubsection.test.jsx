/**
 * LibrarySubsection behaviour (VIS-769 / Track C C1).
 *
 * Covers:
 *   - per-type header (caret + type icon + UPPERCASE plural + count)
 *   - row rendering + empty-state placeholder
 *   - "+ New X" present for droppable Layout types, absent for Data types
 *   - collapse toggle + persisted Zustand slice
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import LibrarySubsection from './LibrarySubsection';
import useStore from '../../../../stores/store';

const withDnd = ui => <DndContext>{ui}</DndContext>;

const CHART_ROWS = [
  { id: 'chart:waterfall', type: 'chart', name: 'waterfall' },
  { id: 'chart:fib', type: 'chart', name: 'fibonacci_growth' },
];

describe('LibrarySubsection', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({
        libraryCollapsedSections: {},
        libraryCollapsedSubsections: {},
      });
    });
  });

  // Subsections default to COLLAPSED (VIS-828). To exercise the header/row/
  // create affordances below we explicitly expand the subsection first.
  const expand = typeKey => {
    act(() => {
      useStore.setState(s => ({
        libraryCollapsedSubsections: { ...s.libraryCollapsedSubsections, [typeKey]: false },
      }));
    });
  };

  test('renders the per-type header, count and rows when expanded', () => {
    expand('chart');
    render(withDnd(<LibrarySubsection typeKey="chart" rows={CHART_ROWS} />));
    expect(screen.getByTestId('library-subsection-chart-header')).toHaveTextContent('Charts');
    expect(screen.getByTestId('library-subsection-chart-count')).toHaveTextContent('(2)');
    expect(screen.getByTestId('library-row-chart-waterfall')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-chart-fibonacci_growth')).toBeInTheDocument();
  });

  test('renders the empty placeholder when the subsection has no rows', () => {
    expand('model');
    render(withDnd(<LibrarySubsection typeKey="model" rows={[]} />));
    expect(screen.getByTestId('library-subsection-model-empty')).toHaveTextContent(
      'No models yet'
    );
  });

  test('renders no inline "+ New X" CTA — creation is via the Library "+ New" menu', () => {
    // The per-subsection inline create buttons were removed as redundant with
    // the Library header's single "+ New" menu.
    expand('chart');
    render(withDnd(<LibrarySubsection typeKey="chart" rows={CHART_ROWS} />));
    expect(screen.queryByTestId('library-subsection-chart-create')).not.toBeInTheDocument();
    expect(screen.queryByText('New Chart')).not.toBeInTheDocument();
  });

  test('defaults to collapsed with no saved preference (VIS-828)', () => {
    render(withDnd(<LibrarySubsection typeKey="chart" rows={CHART_ROWS} />));
    const subsection = screen.getByTestId('library-subsection-chart');
    // Header + count stay visible, the row list stays hidden.
    expect(subsection).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByTestId('library-subsection-chart-header')).toBeInTheDocument();
    expect(screen.getByTestId('library-subsection-chart-count')).toHaveTextContent('(2)');
    expect(screen.queryByTestId('library-subsection-chart-body')).not.toBeInTheDocument();
  });

  test('an explicitly-expanded subsection stays expanded (persisted false)', () => {
    act(() => {
      useStore.setState({ libraryCollapsedSubsections: { chart: false } });
    });
    render(withDnd(<LibrarySubsection typeKey="chart" rows={CHART_ROWS} />));
    expect(screen.getByTestId('library-subsection-chart')).toHaveAttribute(
      'data-collapsed',
      'false'
    );
    expect(screen.getByTestId('library-subsection-chart-body')).toBeInTheDocument();
  });

  test('toggles from the collapsed default to expanded and back, persisting each step', () => {
    render(withDnd(<LibrarySubsection typeKey="chart" rows={CHART_ROWS} />));
    const header = screen.getByTestId('library-subsection-chart-header');
    const subsection = screen.getByTestId('library-subsection-chart');
    // Starts collapsed by default (no saved pref).
    expect(subsection).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('library-subsection-chart-body')).not.toBeInTheDocument();

    // First click expands it and persists an explicit `false`.
    fireEvent.click(header);
    expect(subsection).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('library-subsection-chart-body')).toBeInTheDocument();
    expect(useStore.getState().libraryCollapsedSubsections.chart).toBe(false);

    // Second click collapses it again, persisting `true`.
    fireEvent.click(header);
    expect(subsection).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('library-subsection-chart-body')).not.toBeInTheDocument();
    expect(useStore.getState().libraryCollapsedSubsections.chart).toBe(true);
  });

  test('reads persisted collapse state from the store on mount', () => {
    act(() => {
      useStore.setState({ libraryCollapsedSubsections: { chart: true } });
    });
    render(withDnd(<LibrarySubsection typeKey="chart" rows={CHART_ROWS} />));
    expect(screen.getByTestId('library-subsection-chart')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
  });
});
