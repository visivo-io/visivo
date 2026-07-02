import React from 'react';
import { render, screen } from '@testing-library/react';
import DataTableGroupHeader from './DataTableGroupHeader';

describe('DataTableGroupHeader', () => {
  it('renders the group label text', () => {
    render(<DataTableGroupHeader label="Revenue by Region" />);
    expect(screen.getByText('Revenue by Region')).toBeInTheDocument();
  });

  it('styles the label as a centered brand-primary group band', () => {
    render(<DataTableGroupHeader label="Group" />);
    const el = screen.getByText('Group');
    expect(el.className).toMatch(/\btext-primary-700\b/);
    expect(el.className).toMatch(/\bjustify-center\b/);
    expect(el.className).toMatch(/\bfont-semibold\b/);
  });

  it('re-renders with an updated label (memo does not freeze content)', () => {
    const { rerender } = render(<DataTableGroupHeader label="First" />);
    expect(screen.getByText('First')).toBeInTheDocument();
    rerender(<DataTableGroupHeader label="Second" />);
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });
});
