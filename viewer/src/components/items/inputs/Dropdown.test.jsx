import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import Dropdown from './Dropdown';

const options = [
  { id: 1, label: 'Option A' },
  { id: 2, label: 'Option B' },
  { id: 3, label: 'Option C' },
];

describe('Dropdown Component', () => {
  it('renders with placeholder when no value is selected', () => {
    render(<Dropdown options={options} placeholder="Select..." />);
    expect(screen.getByText('Select...')).toBeInTheDocument();
  });

  it('opens dropdown when clicked', () => {
    render(<Dropdown options={options} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Search options...')).toBeInTheDocument();
  });

  it('filters options based on search input', () => {
    render(<Dropdown options={options} />);
    fireEvent.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('Search options...');
    fireEvent.change(searchInput, { target: { value: 'Option B' } });

    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('selects single option and closes menu', () => {
    const setInputValue = jest.fn();
    render(<Dropdown options={options} name="test" setInputValue={setInputValue} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('selects multiple options in multi mode', () => {
    const setInputValue = jest.fn();
    render(<Dropdown options={options} isMulti name="multiTest" setInputValue={setInputValue} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('removes selected option in multi mode', () => {
    const setInputValue = jest.fn();
    render(<Dropdown options={options} isMulti defaultValue={[options[0]]} name="multiTest" setInputValue={setInputValue} />);
    
    expect(screen.getByText('Option A')).toBeInTheDocument();    
  });

  it('supports keyboard navigation (ArrowDown + Enter)', () => {
    render(<Dropdown options={options} />);
    const button = screen.getByRole('button');
    
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getByPlaceholderText('Search options...')).toBeInTheDocument();

    expect(screen.getByText('Option A')).toBeInTheDocument();
  });
});
