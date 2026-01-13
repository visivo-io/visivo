import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertySearch } from './PropertySearch';

describe('PropertySearch', () => {
  const mockProperties = [
    { path: 'x', description: 'X axis data', supportsQueryString: true, isObject: false },
    { path: 'y', description: 'Y axis data', supportsQueryString: true, isObject: false },
    { path: 'mode', description: 'Drawing mode', supportsQueryString: false, isObject: false },
    { path: 'marker', description: 'Marker settings', supportsQueryString: false, isObject: true },
    { path: 'marker.color', description: 'Marker color', supportsQueryString: true, isObject: false },
    { path: 'marker.size', description: 'Marker size', supportsQueryString: true, isObject: false },
  ];

  const defaultProps = {
    properties: mockProperties,
    selectedPaths: new Set(),
    onToggle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders search input', () => {
    render(<PropertySearch {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search properties...')).toBeInTheDocument();
  });

  it('renders all top-level properties', () => {
    render(<PropertySearch {...defaultProps} />);
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(screen.getByText('y')).toBeInTheDocument();
    expect(screen.getByText('mode')).toBeInTheDocument();
    // marker appears both as a property and as a group header
    expect(screen.getAllByText('marker').length).toBeGreaterThan(0);
  });

  it('shows property descriptions', () => {
    render(<PropertySearch {...defaultProps} />);
    expect(screen.getByText('X axis data')).toBeInTheDocument();
    expect(screen.getByText('Drawing mode')).toBeInTheDocument();
  });

  it('shows query chip for properties that support query-string', () => {
    render(<PropertySearch {...defaultProps} />);
    // x and y support query-string
    const queryChips = screen.getAllByText('query');
    expect(queryChips.length).toBeGreaterThan(0);
  });

  it('filters properties based on search query', () => {
    render(<PropertySearch {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText('Search properties...'), {
      target: { value: 'marker' },
    });

    // Should show marker-related properties
    expect(screen.getAllByText(/marker/).length).toBeGreaterThan(0);
    // Should not show x (which doesn't match "marker")
    expect(screen.queryByText('X axis data')).not.toBeInTheDocument();
  });

  it('filters properties by description', () => {
    render(<PropertySearch {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText('Search properties...'), {
      target: { value: 'axis' },
    });

    // Should show x and y (description contains "axis")
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(screen.getByText('y')).toBeInTheDocument();
  });

  it('shows empty state when no matches', () => {
    render(<PropertySearch {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText('Search properties...'), {
      target: { value: 'nonexistent' },
    });

    expect(screen.getByText('No matching properties found')).toBeInTheDocument();
  });

  it('shows empty state when no properties', () => {
    render(<PropertySearch {...defaultProps} properties={[]} />);
    expect(screen.getByText('No properties available')).toBeInTheDocument();
  });

  it('calls onToggle when property clicked', () => {
    const onToggle = jest.fn();
    render(<PropertySearch {...defaultProps} onToggle={onToggle} />);

    fireEvent.click(screen.getByText('x'));
    expect(onToggle).toHaveBeenCalledWith('x');
  });

  it('shows checkbox as checked for selected properties', () => {
    render(<PropertySearch {...defaultProps} selectedPaths={new Set(['x', 'y'])} />);

    const checkboxes = screen.getAllByRole('checkbox');
    // Find checkboxes that are checked
    const checkedCount = checkboxes.filter(cb => cb.checked).length;
    expect(checkedCount).toBe(2);
  });

  it('shows selection count in footer', () => {
    render(<PropertySearch {...defaultProps} selectedPaths={new Set(['x', 'y'])} />);
    expect(screen.getByText(/2 of 6 properties selected/)).toBeInTheDocument();
  });

  it('can be disabled', () => {
    render(<PropertySearch {...defaultProps} disabled={true} />);
    expect(screen.getByPlaceholderText('Search properties...')).toBeDisabled();
  });

  it('groups nested properties under parent', () => {
    render(<PropertySearch {...defaultProps} />);
    // marker.color and marker.size should appear (in the collapsed group content)
    // We check for the 'color' and 'size' display names
    expect(screen.getByText('color')).toBeInTheDocument();
    expect(screen.getByText('size')).toBeInTheDocument();
  });

  it('shows object icon for object properties', () => {
    render(<PropertySearch {...defaultProps} />);
    // marker is an object, it should render with the data object icon
    // Check that DataObjectIcon is rendered somewhere in the document
    expect(screen.getByTestId('DataObjectIcon')).toBeInTheDocument();
  });
});
