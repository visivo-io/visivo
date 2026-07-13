/**
 * LibraryFilter — the Library's filter dropdown + selected-chip row.
 *
 * Pins: the menu opens/closes; options cover the two groups + every type;
 * selection is ADDITIVE (multi-select, menu stays open); selected filters show
 * as removable chips; the chip "×" and "Clear" drop filters.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LibraryFilter from './LibraryFilter';
import { LAYOUT_TYPES, DATA_TYPES } from './LibraryRow';

const ALL_TYPES = [...DATA_TYPES, ...LAYOUT_TYPES];

const renderFilter = (props = {}) =>
  render(
    <LibraryFilter
      groups={[{ key: 'data' }, { key: 'layout' }]}
      types={ALL_TYPES}
      groupCounts={{ layout: 6, data: 4 }}
      typeCounts={{ chart: 2, source: 1 }}
      value={[]}
      onToggle={jest.fn()}
      onClear={jest.fn()}
      {...props}
    />
  );

describe('LibraryFilter', () => {
  test('shows only the Filter button until opened (no inline pills)', () => {
    renderFilter();
    expect(screen.getByTestId('library-filter-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('library-filter-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-filter-option-group-data')).not.toBeInTheDocument();
  });

  test('opening the dropdown lists both group options and every type option', () => {
    renderFilter();
    fireEvent.click(screen.getByTestId('library-filter-toggle'));
    expect(screen.getByTestId('library-filter-menu')).toBeInTheDocument();
    expect(screen.getByTestId('library-filter-option-group-data')).toHaveTextContent('Data Layer');
    expect(screen.getByTestId('library-filter-option-group-layout')).toHaveTextContent(
      'Layout Items'
    );
    ALL_TYPES.forEach(t =>
      expect(screen.getByTestId(`library-filter-option-type-${t}`)).toBeInTheDocument()
    );
  });

  test('picking an option toggles it and keeps the menu open (additive)', () => {
    const onToggle = jest.fn();
    renderFilter({ onToggle });
    fireEvent.click(screen.getByTestId('library-filter-toggle'));
    fireEvent.click(screen.getByTestId('library-filter-option-group-data'));
    expect(onToggle).toHaveBeenCalledWith({ kind: 'group', value: 'data' });
    // Menu stays open so a second pick is possible.
    expect(screen.getByTestId('library-filter-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('library-filter-option-type-chart'));
    expect(onToggle).toHaveBeenCalledWith({ kind: 'type', value: 'chart' });
  });

  test('active options are checked (aria-checked + data-active)', () => {
    renderFilter({ value: [{ kind: 'group', value: 'data' }] });
    fireEvent.click(screen.getByTestId('library-filter-toggle'));
    const active = screen.getByTestId('library-filter-option-group-data');
    expect(active).toHaveAttribute('aria-checked', 'true');
    expect(active).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('library-filter-option-group-layout')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  test('selected filters render as chips with a count badge on the button', () => {
    renderFilter({
      value: [
        { kind: 'group', value: 'data' },
        { kind: 'type', value: 'chart' },
      ],
    });
    expect(screen.getByTestId('library-filter-active-count')).toHaveTextContent('2');
    expect(screen.getByTestId('library-filter-chip-group-data')).toHaveTextContent('Data Layer');
    expect(screen.getByTestId('library-filter-chip-type-chart')).toHaveTextContent('Charts');
  });

  test("a chip's × removes just that filter", () => {
    const onToggle = jest.fn();
    renderFilter({ value: [{ kind: 'type', value: 'chart' }], onToggle });
    fireEvent.click(screen.getByTestId('library-filter-chip-remove-type-chart'));
    expect(onToggle).toHaveBeenCalledWith({ kind: 'type', value: 'chart' });
  });

  test('Clear drops all filters', () => {
    const onClear = jest.fn();
    renderFilter({ value: [{ kind: 'type', value: 'chart' }], onClear });
    fireEvent.click(screen.getByTestId('library-filter-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test('no chips or Clear when nothing is selected', () => {
    renderFilter({ value: [] });
    expect(screen.queryByTestId('library-filter-clear')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-filter-active-count')).not.toBeInTheDocument();
  });
});
