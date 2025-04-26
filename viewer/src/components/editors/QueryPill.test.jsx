import { render, screen, fireEvent, within } from '@testing-library/react';
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
  const onChange = jest.fn();
  const { container } = render(
    <QueryPill 
      value="SELECT * FROM table" 
      onChange={onChange}
    />
  );
  
  // Using Testing Library's within to scope our queries
  const pillContainer = within(container).getByText('SELECT * FROM table');
  fireEvent.mouseEnter(pillContainer);
  
  // The delete button should appear after hover
  const deleteButton = await screen.findByRole('button');
  fireEvent.click(deleteButton);
  
  expect(onChange).toHaveBeenCalledWith('none');
}); 