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

  test('renders the per-type header, count and rows', () => {
    render(withDnd(<LibrarySubsection typeKey="chart" rows={CHART_ROWS} />));
    expect(screen.getByTestId('library-subsection-chart-header')).toHaveTextContent('Charts');
    expect(screen.getByTestId('library-subsection-chart-count')).toHaveTextContent('(2)');
    expect(screen.getByTestId('library-row-chart-waterfall')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-chart-fibonacci_growth')).toBeInTheDocument();
  });

  test('renders the empty placeholder when the subsection has no rows', () => {
    render(withDnd(<LibrarySubsection typeKey="model" rows={[]} />));
    expect(screen.getByTestId('library-subsection-model-empty')).toHaveTextContent(
      'No models yet'
    );
  });

  test('shows "+ New X" for a droppable Layout type', () => {
    render(withDnd(<LibrarySubsection typeKey="chart" rows={CHART_ROWS} />));
    expect(screen.getByTestId('library-subsection-chart-create')).toHaveTextContent('New Chart');
  });

  test('hides "+ New X" for a non-droppable Data-layer type', () => {
    render(
      withDnd(
        <LibrarySubsection
          typeKey="source"
          rows={[{ id: 'source:duck', type: 'source', name: 'duck' }]}
        />
      )
    );
    expect(screen.queryByTestId('library-subsection-source-create')).not.toBeInTheDocument();
  });

  test('"+ New X" delegates to onCreate with the type key', () => {
    const onCreate = jest.fn();
    render(withDnd(<LibrarySubsection typeKey="table" rows={[]} onCreate={onCreate} />));
    fireEvent.click(screen.getByTestId('library-subsection-table-create'));
    expect(onCreate).toHaveBeenCalledWith('table');
  });

  test('toggles collapse on header click and writes to the persisted store slice', () => {
    render(withDnd(<LibrarySubsection typeKey="chart" rows={CHART_ROWS} />));
    const header = screen.getByTestId('library-subsection-chart-header');
    const subsection = screen.getByTestId('library-subsection-chart');
    expect(subsection).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('library-subsection-chart-body')).toBeInTheDocument();

    fireEvent.click(header);
    expect(subsection).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('library-subsection-chart-body')).not.toBeInTheDocument();
    expect(useStore.getState().libraryCollapsedSubsections.chart).toBe(true);

    fireEvent.click(header);
    expect(subsection).toHaveAttribute('data-collapsed', 'false');
    expect(useStore.getState().libraryCollapsedSubsections.chart).toBe(false);
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
