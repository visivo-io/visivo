import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PropertyFilter from './PropertyFilter';

describe('PropertyFilter', () => {
  const defaults = {
    totalCount: 286,
    essentialCount: 8,
    mode: 'essentials',
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders essential count when mode="essentials"', () => {
    render(<PropertyFilter {...defaults} />);
    expect(screen.getByTestId('property-filter')).toHaveTextContent('8');
    expect(screen.getByTestId('property-filter')).toHaveTextContent('essential properties');
  });

  it('renders total count when mode="all"', () => {
    render(<PropertyFilter {...defaults} mode="all" />);
    expect(screen.getByTestId('property-filter')).toHaveTextContent('286');
    expect(screen.getByTestId('property-filter')).toHaveTextContent('total properties');
  });

  it('uses singular "property" when essentialCount is 1', () => {
    render(<PropertyFilter {...defaults} essentialCount={1} />);
    const filter = screen.getByTestId('property-filter');
    expect(filter).toHaveTextContent('1');
    expect(filter).toHaveTextContent('essential property');
    expect(filter.textContent).not.toContain('properties');
  });

  it('shows "Show all (N)" button text when in essentials mode', () => {
    render(<PropertyFilter {...defaults} />);
    const button = screen.getByTestId('property-filter-toggle');
    expect(button).toHaveTextContent('Show all (286)');
  });

  it('shows "Show essentials only" button text when in all mode', () => {
    render(<PropertyFilter {...defaults} mode="all" />);
    const button = screen.getByTestId('property-filter-toggle');
    expect(button).toHaveTextContent('Show essentials only');
  });

  it('calls onChange with "all" when toggling from essentials', () => {
    const onChange = jest.fn();
    render(<PropertyFilter {...defaults} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('property-filter-toggle'));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('calls onChange with "essentials" when toggling from all', () => {
    const onChange = jest.fn();
    render(<PropertyFilter {...defaults} mode="all" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('property-filter-toggle'));
    expect(onChange).toHaveBeenCalledWith('essentials');
  });
});
