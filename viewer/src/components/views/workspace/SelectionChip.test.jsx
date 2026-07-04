/**
 * SelectionChip tests (VIS-802 / Track G G-1).
 *
 * Every right-rail Edit form gets this header: rainbow type colour + icon +
 * name + the inline save state. Type colour/icon must come from
 * objectTypeConfigs.js (rainbow) — never mulberry/primary (that's selection).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import SelectionChip from './SelectionChip';
import { getTypeColors } from '../common/objectTypeConfigs';

describe('SelectionChip (VIS-802)', () => {
  test('renders the name + type label and tags the object type', () => {
    render(<SelectionChip type="chart" name="revenue-chart" />);
    const chip = screen.getByTestId('right-rail-selection-chip');
    expect(chip).toHaveAttribute('data-object-type', 'chart');
    expect(chip).toHaveTextContent('revenue-chart');
    expect(chip).toHaveTextContent(/Chart/i);
  });

  test('uses the canonical rainbow type colours from objectTypeConfigs', () => {
    render(<SelectionChip type="chart" name="c1" />);
    const chip = screen.getByTestId('right-rail-selection-chip');
    const { bg } = getTypeColors('chart');
    // The chart icon swatch carries the shared chart bg class.
    expect(chip.innerHTML).toContain(bg);
  });

  test('renders a custom subtitle over the default type label', () => {
    render(<SelectionChip type="dashboard" name="d1" subtitle="3 rows" />);
    const chip = screen.getByTestId('right-rail-selection-chip');
    expect(chip).toHaveTextContent('3 rows');
  });

  test('renders the save-state indicator when a status is provided', () => {
    render(<SelectionChip type="dashboard" name="d1" saveStatus="saving" />);
    expect(screen.getByTestId('right-rail-save-state')).toHaveAttribute(
      'data-status',
      'saving'
    );
  });

  test('omits the save-state indicator when no status is provided', () => {
    render(<SelectionChip type="dashboard" name="d1" />);
    expect(screen.queryByTestId('right-rail-save-state')).not.toBeInTheDocument();
  });
});
