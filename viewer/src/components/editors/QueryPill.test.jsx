import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QueryPill from './QueryPill';

test('renders QueryPill with SQL label and initial value', () => {
  const value = '?{SELECT * FROM table}';
  render(<QueryPill value={value} onChange={() => {}} />);
  
  expect(screen.getByText('SQL')).toBeInTheDocument();
  expect(screen.getByText('SELECT * FROM table')).toBeInTheDocument();
});

test('handles editing mode when clicked', async () => {
  const value = '?{SELECT * FROM table}';
  render(<QueryPill value={value} onChange={() => {}} />);
  
  const pillContainer = screen.getByText('SELECT * FROM table');
  await userEvent.click(pillContainer);
  
  const textarea = screen.getByRole('textbox');
  expect(textarea).toBeInTheDocument();
  expect(textarea).toHaveValue('SELECT * FROM table');
});

test('calls onChange with proper formatting when editing is complete', async () => {
  const mockOnChange = jest.fn();
  const value = '?{SELECT * FROM table}';
  render(<QueryPill value={value} onChange={mockOnChange} />);
  
  const pillContainer = screen.getByText('SELECT * FROM table');
  await userEvent.click(pillContainer);
  
  const textarea = screen.getByRole('textbox');
  await userEvent.type(textarea, ' WHERE id = 1');
  fireEvent.blur(textarea);
  
  expect(mockOnChange).toHaveBeenCalledWith('?{SELECT * FROM table WHERE id = 1}');
});

test('handles query function format when isQueryFunction prop is true', () => {
  const value = 'query(SELECT * FROM table)';
  render(<QueryPill value={value} onChange={() => {}} isQueryFunction={true} />);
  
  expect(screen.getByText('SELECT * FROM table')).toBeInTheDocument();
});

test('deletes pill when delete button is clicked', async () => {
  const mockOnChange = jest.fn();
  const value = '?{SELECT * FROM table}';
  render(<QueryPill value={value} onChange={mockOnChange} />);
  
  // Trigger hover to show delete button
  const pillContainer = screen.getByText('SELECT * FROM table').parentElement;
  fireEvent.mouseEnter(pillContainer);
  
  const deleteButton = screen.getByRole('button');
  await userEvent.click(deleteButton);
  
  expect(mockOnChange).toHaveBeenCalledWith('none');
}); 