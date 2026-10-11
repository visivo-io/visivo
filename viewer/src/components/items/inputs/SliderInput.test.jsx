import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SliderInput from './SliderInput';

const tickLabels = () =>
  screen.getAllByText(/./, { selector: 'span.text-xs' }).map(n => n.textContent);

describe('SliderInput', () => {
  const defaultProps = {
    label: 'Test Slider',
    options: ['0', '25', '50', '75', '100'],
    selectedValue: '50',
    name: 'test-slider',
    setInputJobValue: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<SliderInput {...defaultProps} />);
    expect(screen.getByText('Test Slider')).toBeInTheDocument();
  });

  it('displays current value prominently', () => {
    render(<SliderInput {...defaultProps} />);
    // The value appears in the large prominent display (text-lg font-semibold)
    const prominentValue = screen.getByText('50', { selector: '.text-lg' });
    expect(prominentValue).toBeInTheDocument();
  });

  it('converts string options to numbers and sorts them', () => {
    const props = {
      ...defaultProps,
      options: ['100', '25', '75', '0', '50'],
    };
    render(<SliderInput {...props} />);
    // Should display current value in the prominent display
    expect(screen.getByText('50', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('handles numeric options', () => {
    const props = {
      ...defaultProps,
      options: [0, 25, 50, 75, 100],
      selectedValue: 75,
    };
    render(<SliderInput {...props} />);
    expect(screen.getByText('75', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('calls setInputJobValue when slider is changed', () => {
    const setInputJobValue = jest.fn();
    render(<SliderInput {...defaultProps} setInputJobValue={setInputJobValue} />);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '3' } }); // Index 3 = 75

    expect(setInputJobValue).toHaveBeenCalledWith('test-slider', 75);
  });

  it('shows error message with fewer than 2 options', () => {
    const props = {
      ...defaultProps,
      options: ['50'],
    };
    render(<SliderInput {...props} />);
    expect(screen.getByText('Slider requires at least 2 options')).toBeInTheDocument();
  });

  it('shows tick labels when 10 or fewer options', () => {
    render(<SliderInput {...defaultProps} />);
    // All 5 option values should be visible as tick labels
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('100').length).toBeGreaterThanOrEqual(1);
  });

  it('shows only end labels when more than 10 options', () => {
    const props = {
      ...defaultProps,
      options: ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'],
      selectedValue: '50',
    };
    render(<SliderInput {...props} />);
    // Should still show min and max labels
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('finds closest value when selected value is not an exact match', () => {
    const props = {
      ...defaultProps,
      options: ['0', '50', '100'],
      selectedValue: '45', // Not in options
    };
    render(<SliderInput {...props} />);
    // Should snap to closest value (50) - check prominent display
    expect(screen.getByText('50', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('defaults to first option when selectedValue is null', () => {
    const props = {
      ...defaultProps,
      selectedValue: null,
    };
    render(<SliderInput {...props} />);
    // Should show first option value in prominent display
    expect(screen.getByText('0', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('keeps list order and shows text labels for string options', () => {
    render(<SliderInput {...defaultProps} options={['low', 'mid', 'high']} selectedValue="mid" />);
    const ticks = tickLabels();
    expect(ticks).toEqual(['low', 'mid', 'high']);
    expect(screen.getByText('mid', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('sends the option value (not the index) for string options', () => {
    const setInputJobValue = jest.fn();
    render(
      <SliderInput
        {...defaultProps}
        options={['low', 'mid', 'high']}
        selectedValue="low"
        setInputJobValue={setInputJobValue}
      />
    );
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });
    expect(setInputJobValue).toHaveBeenCalledWith('test-slider', 'high');
  });

  it('keeps list order for mixed numeric and text options', () => {
    render(<SliderInput {...defaultProps} options={['10', 'invalid', '2']} selectedValue="2" />);
    const ticks = tickLabels();
    expect(ticks).toEqual(['10', 'invalid', '2']);
    expect(screen.getByText('2', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('sorts numerically only when every option is numeric', () => {
    render(<SliderInput {...defaultProps} options={['100', '2', '30']} selectedValue="2" />);
    const ticks = tickLabels();
    expect(ticks).toEqual(['2', '30', '100']);
  });

  it('falls back to the first option when a text selection is unknown', () => {
    render(<SliderInput {...defaultProps} options={['low', 'mid']} selectedValue="zzz" />);
    expect(screen.getByText('low', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('ignores non-scalar and empty options', () => {
    render(
      <SliderInput {...defaultProps} options={['a', null, { x: 1 }, 'b']} selectedValue="b" />
    );
    const ticks = tickLabels();
    expect(ticks).toEqual(['a', 'b']);
  });

  it('renders the error state when options is not an array', () => {
    render(<SliderInput {...defaultProps} options={undefined} />);
    expect(screen.getByText('Slider requires at least 2 options')).toBeInTheDocument();
  });

  it('does not call setInputJobValue without name', () => {
    const setInputJobValue = jest.fn();
    const props = {
      ...defaultProps,
      name: undefined,
      setInputJobValue,
    };
    render(<SliderInput {...props} />);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '2' } });

    expect(setInputJobValue).not.toHaveBeenCalled();
  });
});
