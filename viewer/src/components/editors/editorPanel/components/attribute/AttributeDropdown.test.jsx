import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AttributeDropdown from './AttributeDropdown';

test('renders dropdown with filtered children', () => {
  const mockAnchorRef = { current: document.createElement('div') };
  const mockDropdownRef = { current: null };
  
  render(
    <AttributeDropdown
      showDropdown={true}
      anchorRef={mockAnchorRef}
      dropdownRef={mockDropdownRef}
      filteredChildren={['child1', 'child2']}
      selectedIndex={0}
      onSelect={() => {}}
    />
  );

  expect(screen.getByText('child1')).toBeInTheDocument();
  expect(screen.getByText('child2')).toBeInTheDocument();
});

test('applies selected style to selected item', () => {
  const mockAnchorRef = { current: document.createElement('div') };
  const mockDropdownRef = { current: null };
  
  render(
    <AttributeDropdown
      showDropdown={true}
      anchorRef={mockAnchorRef}
      dropdownRef={mockDropdownRef}
      filteredChildren={['child1', 'child2']}
      selectedIndex={1}
      onSelect={() => {}}
    />
  );

  const selectedItem = screen.getByTestId('dropdown-item-child2');
  expect(selectedItem).toHaveClass('bg-primary-100');
});

test('calls onSelect when item is clicked', () => {
  const mockAnchorRef = { current: document.createElement('div') };
  const mockDropdownRef = { current: null };
  const mockOnSelect = jest.fn();
  
  render(
    <AttributeDropdown
      showDropdown={true}
      anchorRef={mockAnchorRef}
      dropdownRef={mockDropdownRef}
      filteredChildren={['child1', 'child2']}
      selectedIndex={0}
      onSelect={mockOnSelect}
    />
  );

  fireEvent.click(screen.getByTestId('dropdown-item-child1'));
  expect(mockOnSelect).toHaveBeenCalledWith('child1');
});
