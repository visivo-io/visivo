import React from 'react';
import { render, screen } from '@testing-library/react';
import Input, { DROPDOWN } from './Input';

jest.mock('./inputs/Dropdown', () => ({ label }) => (
  <div data-testid="dropdown">{label}</div>
));

const mockSetInputValue = jest.fn();
const mockSetDefaultInputValue = jest.fn();
jest.mock('../../stores/store', () => ({
  __esModule: true,
  default: (fn) =>
    fn({
      setInputValue: mockSetInputValue,
      setDefaultInputValue: mockSetDefaultInputValue,
    }),
}));

describe('Input component', () => {
  it('renders null if no input provided', () => {
    const { container } = render(<Input />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders container but no Dropdown if input.type is not dropdown', () => {
    render(<Input input={{ type: 'text' }} itemWidth={2} />);
    expect(screen.queryByTestId('dropdown')).toBeNull();
  });

  it('renders Dropdown if input.type is dropdown', () => {
    const input = {
      type: DROPDOWN,
      label: 'Choose option',
      options: ['One', 'Two'],
      multi: true,
      default: 'One',
      name: 'testDropdown',
      is_query: false,
    };

    render(<Input input={input} itemWidth={3} />);

    const dropdown = screen.getByTestId('dropdown');
    expect(dropdown).toBeInTheDocument();
    expect(dropdown).toHaveTextContent('Choose option');
  });
});
