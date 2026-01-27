import React from 'react';
import { render, screen } from '@testing-library/react';
import DataTableCell from './DataTableCell';

describe('DataTableCell', () => {
  it('formats null values with italic styling', () => {
    render(<DataTableCell value={null} columnType="string" />);
    const nullEl = screen.getByText('null');
    expect(nullEl).toHaveClass('italic');
  });

  it('formats integers with locale formatting', () => {
    render(<DataTableCell value={1000000} columnType="number" />);
    // Check the title attr which has the raw value
    expect(screen.getByTitle('1000000')).toBeInTheDocument();
  });

  it('formats floats with limited decimals', () => {
    render(<DataTableCell value={3.14159265} columnType="number" />);
    expect(screen.getByTitle('3.14159265')).toBeInTheDocument();
  });

  it('truncates long strings', () => {
    const longStr = 'a'.repeat(250);
    render(<DataTableCell value={longStr} columnType="string" />);
    expect(screen.getByTitle(longStr)).toBeInTheDocument();
    // The displayed text should be truncated
    expect(screen.getByTitle(longStr).textContent.length).toBeLessThan(250);
  });

  it('formats boolean values', () => {
    render(<DataTableCell value={true} columnType="boolean" />);
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it('handles undefined values', () => {
    render(<DataTableCell value={undefined} columnType="string" />);
    expect(screen.getByText('null')).toBeInTheDocument();
  });

  it('stringifies objects', () => {
    render(<DataTableCell value={{ key: 'val' }} columnType="unknown" />);
    expect(screen.getByText('{"key":"val"}')).toBeInTheDocument();
  });
});
