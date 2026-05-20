/**
 * LibraryScopeChips behaviour (VIS-773 / Track C C2).
 *
 * The chip row defaults to `All`, disables `Used here` when scope is root,
 * disables `Compatible` when no slot is selected, and forwards onChange
 * when the user picks a different chip.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LibraryScopeChips, { computeDisabled } from './LibraryScopeChips';

describe('LibraryScopeChips', () => {
  test('renders three chips with All active and Used here / Compatible disabled at root scope', () => {
    render(
      <LibraryScopeChips
        sectionKey="charts"
        value="all"
        onChange={jest.fn()}
        scope="root"
        hasSelectedSlot={false}
      />
    );
    const allChip = screen.getByTestId('library-scope-chip-charts-all');
    const usedChip = screen.getByTestId('library-scope-chip-charts-usedHere');
    const compatChip = screen.getByTestId('library-scope-chip-charts-compatible');
    expect(allChip).toHaveAttribute('data-active', 'true');
    expect(usedChip).toHaveAttribute('data-disabled', 'true');
    expect(compatChip).toHaveAttribute('data-disabled', 'true');
  });

  test('enables Used here when scope is a non-root scope', () => {
    render(
      <LibraryScopeChips
        sectionKey="charts"
        value="all"
        onChange={jest.fn()}
        scope="dashboard"
      />
    );
    expect(
      screen.getByTestId('library-scope-chip-charts-usedHere')
    ).toHaveAttribute('data-disabled', 'false');
  });

  test('enables Compatible when hasSelectedSlot is true', () => {
    render(
      <LibraryScopeChips
        sectionKey="charts"
        value="all"
        onChange={jest.fn()}
        scope="item"
        hasSelectedSlot
      />
    );
    expect(
      screen.getByTestId('library-scope-chip-charts-compatible')
    ).toHaveAttribute('data-disabled', 'false');
  });

  test('clicking an enabled chip fires onChange with the chip key', () => {
    const onChange = jest.fn();
    render(
      <LibraryScopeChips
        sectionKey="charts"
        value="all"
        onChange={onChange}
        scope="dashboard"
      />
    );
    fireEvent.click(screen.getByTestId('library-scope-chip-charts-usedHere'));
    expect(onChange).toHaveBeenCalledWith('usedHere');
  });

  test('clicking a disabled chip is a no-op', () => {
    const onChange = jest.fn();
    render(
      <LibraryScopeChips
        sectionKey="charts"
        value="all"
        onChange={onChange}
        scope="root"
      />
    );
    fireEvent.click(screen.getByTestId('library-scope-chip-charts-usedHere'));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('computeDisabled returns the expected matrix', () => {
    expect(computeDisabled({ scope: 'root', hasSelectedSlot: false })).toEqual({
      all: false,
      usedHere: true,
      compatible: true,
    });
    expect(
      computeDisabled({ scope: 'dashboard', hasSelectedSlot: true })
    ).toEqual({
      all: false,
      usedHere: false,
      compatible: false,
    });
  });
});
