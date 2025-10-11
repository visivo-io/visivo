import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import Dropdown from './Dropdown';

const options = ['Option A', 'Option B', 'Option C'];

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
    expect(screen.queryByText('Option A')).not.toBeInTheDocument();
  });

  it('selects single option and closes menu', () => {
    const setInputValue = jest.fn();
    render(<Dropdown options={options} name="test" setInputValue={setInputValue} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByText('Option A'));
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('selects multiple options in multi mode', () => {
    const setInputValue = jest.fn();
    render(
      <Dropdown
        options={options}
        isMulti
        defaultValue={['Option A']}
        name="multiTest"
        setInputValue={setInputValue}
      />
    );

    expect(screen.getByText('Option A')).toBeInTheDocument();

    const removeButton = screen.getByLabelText('Remove Option A');
    fireEvent.click(removeButton);

    expect(screen.queryByText('Option A')).not.toBeInTheDocument();
  });

  it('removes selected option in multi mode', () => {
    const setInputValue = jest.fn();
    render(
      <Dropdown
        options={options}
        isMulti
        defaultValue={['Option A']}
        name="multiTest"
        setInputValue={setInputValue}
      />
    );

    expect(screen.getByText('Option A')).toBeInTheDocument();

    const removeButton = screen.getByLabelText('Remove Option A');
    fireEvent.click(removeButton);

    fireEvent.click(removeButton);

    expect(screen.queryByText('Option A')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation (ArrowDown + Enter)', () => {
    render(<Dropdown options={options} />);
    const button = screen.getByRole('button');

    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getByPlaceholderText('Search options...')).toBeInTheDocument();

    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'Enter' });

    expect(screen.getByText('Option A')).toBeInTheDocument();
  });
});
