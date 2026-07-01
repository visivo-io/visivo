/**
 * LibraryFilterChips behaviour (VIS-773 / Track C C2).
 *
 * The type-filter chip row renders one chip per type in the section, marks
 * the active chip, forwards onChange when the user picks a type, and clears
 * the filter when the active chip is clicked again.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LibraryFilterChips from './LibraryFilterChips';

const LAYOUT_TYPES = ['chart', 'table', 'markdown', 'input'];

describe('LibraryFilterChips', () => {
  test('renders one chip per type, labelled with the type plural', () => {
    render(
      <LibraryFilterChips
        sectionKey="layout"
        types={LAYOUT_TYPES}
        value={null}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('library-filter-chip-layout-chart')).toHaveTextContent('Charts');
    expect(screen.getByTestId('library-filter-chip-layout-table')).toHaveTextContent('Tables');
    expect(screen.getByTestId('library-filter-chip-layout-markdown')).toHaveTextContent(
      'Markdowns'
    );
    expect(screen.getByTestId('library-filter-chip-layout-input')).toHaveTextContent('Inputs');
  });

  test('marks the active chip and leaves the others inactive', () => {
    render(
      <LibraryFilterChips
        sectionKey="layout"
        types={LAYOUT_TYPES}
        value="table"
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('library-filter-chip-layout-table')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByTestId('library-filter-chip-layout-chart')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  test('clicking an inactive chip fires onChange with its type key', () => {
    const onChange = jest.fn();
    render(
      <LibraryFilterChips
        sectionKey="layout"
        types={LAYOUT_TYPES}
        value={null}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('library-filter-chip-layout-chart'));
    expect(onChange).toHaveBeenCalledWith('chart');
  });

  test('clicking the active chip again clears the filter (onChange null)', () => {
    const onChange = jest.fn();
    render(
      <LibraryFilterChips
        sectionKey="layout"
        types={LAYOUT_TYPES}
        value="chart"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('library-filter-chip-layout-chart'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('renders the six data-layer chips for the Data Layer section', () => {
    render(
      <LibraryFilterChips
        sectionKey="data"
        types={['source', 'model', 'dimension', 'metric', 'relation', 'insight']}
        value={null}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('library-filter-chip-data-source')).toHaveTextContent('Sources');
    expect(screen.getByTestId('library-filter-chip-data-metric')).toHaveTextContent('Metrics');
    expect(screen.getByTestId('library-filter-chip-data-insight')).toHaveTextContent('Insights');
  });
});
