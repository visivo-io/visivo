import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SliceBadge } from './SliceBadge';

describe('SliceBadge — labelling', () => {
  it.each([
    ['[0]', /First \(0\)/],
    ['[-1]', /Last \(-1\)/],
    ['[3]', /Row 3/],
    ['[1:5]', /Rows 1-5/],
    [null, /All values/],
    ['', /All values/],
  ])('renders %j as %s', (slice, label) => {
    render(<SliceBadge slice={slice} onChange={() => {}} slotShape="mixed" />);
    expect(screen.getByTestId('slice-badge')).toHaveTextContent(label);
  });
});

describe('SliceBadge — menu integration', () => {
  it('opens the menu on click', () => {
    render(<SliceBadge slice="[0]" onChange={() => {}} slotShape="mixed" />);
    expect(screen.queryByTestId('slice-menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('slice-badge'));
    expect(screen.getByTestId('slice-menu')).toBeInTheDocument();
  });

  it('forwards slotShape to the menu — scalar-only disables Range/All', () => {
    render(<SliceBadge slice="[0]" onChange={() => {}} slotShape="scalar-only" />);
    fireEvent.click(screen.getByTestId('slice-badge'));
    expect(screen.getByTestId('slice-option-range')).toBeDisabled();
    expect(screen.getByTestId('slice-option-all')).toBeDisabled();
  });

  it('selecting an option fires onChange with the new slice', () => {
    const onChange = jest.fn();
    render(<SliceBadge slice="[0]" onChange={onChange} slotShape="mixed" />);
    fireEvent.click(screen.getByTestId('slice-badge'));
    fireEvent.click(screen.getByTestId('slice-option-last'));
    expect(onChange).toHaveBeenCalledWith('[-1]');
  });

  it('aria-expanded reflects open/closed state', () => {
    render(<SliceBadge slice="[0]" onChange={() => {}} slotShape="mixed" />);
    const badge = screen.getByTestId('slice-badge');
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
  });
});
