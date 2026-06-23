import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RefSlotField } from './RefSlotField';

describe('RefSlotField', () => {
  test('renders without crashing', () => {
    render(
      <RefSlotField value="" onChange={() => {}} label="Source" description="Pick a source" />
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  test('displays the current value', () => {
    render(<RefSlotField value="ref(source.my_source)" onChange={() => {}} label="Source" />);
    expect(screen.getByRole('textbox')).toHaveValue('ref(source.my_source)');
  });

  test('calls onChange with undefined when cleared', () => {
    const onChange = jest.fn();
    render(<RefSlotField value="some-value" onChange={onChange} label="Source" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test('calls onChange with the typed value', () => {
    const onChange = jest.fn();
    render(<RefSlotField value="" onChange={onChange} label="Source" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ref(source.my_db)' } });
    expect(onChange).toHaveBeenCalledWith('ref(source.my_db)');
  });

  test('shows placeholder text', () => {
    render(<RefSlotField value="" onChange={() => {}} label="Source" />);
    expect(screen.getByPlaceholderText('ref(type.name)')).toBeInTheDocument();
  });

  test('is disabled when disabled prop is true', () => {
    render(<RefSlotField value="" onChange={() => {}} label="Source" disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  test('treats undefined value as empty string', () => {
    render(<RefSlotField value={undefined} onChange={() => {}} label="Source" />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
