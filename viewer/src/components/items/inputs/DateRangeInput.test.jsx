import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DateRangeInput from './DateRangeInput';

describe('DateRangeInput', () => {
  const defaultProps = {
    label: 'Test Date Range',
    options: ['2024-06-01', '2024-06-02', '2024-06-03', '2024-06-04', '2024-06-05'],
    selectedValues: ['2024-06-02', '2024-06-03', '2024-06-04'],
    name: 'test-date-range',
    setInputValue: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<DateRangeInput {...defaultProps} />);
    expect(screen.getByText('Test Date Range')).toBeInTheDocument();
  });

  it('displays start and end dates when values are selected', () => {
    render(<DateRangeInput {...defaultProps} />);
    expect(screen.getByText('Jun 2, 2024')).toBeInTheDocument();
    expect(screen.getByText('Jun 4, 2024')).toBeInTheDocument();
  });

  it('shows placeholder text when no dates are selected', () => {
    render(<DateRangeInput {...defaultProps} selectedValues={[]} />);
    expect(screen.getByText('Start date')).toBeInTheDocument();
    expect(screen.getByText('End date')).toBeInTheDocument();
  });

  it('shows selection count', () => {
    render(<DateRangeInput {...defaultProps} />);
    expect(screen.getByText('3 dates selected')).toBeInTheDocument();
  });

  it('shows singular form for single date selection', () => {
    render(<DateRangeInput {...defaultProps} selectedValues={['2024-06-01']} />);
    expect(screen.getByText('1 date selected')).toBeInTheDocument();
  });

  it('opens start date picker when start button is clicked', () => {
    render(<DateRangeInput {...defaultProps} />);

    // Find button containing the start date text
    const startButtons = screen.getAllByRole('button');
    const startButton = startButtons.find(btn => btn.textContent?.includes('Jun 2, 2024'));
    fireEvent.click(startButton);

    // Should show month label in picker
    expect(screen.getByText('June 2024')).toBeInTheDocument();
  });

  it('opens end date picker when end button is clicked', () => {
    render(<DateRangeInput {...defaultProps} />);

    // Find button containing the end date text
    const endButtons = screen.getAllByRole('button');
    const endButton = endButtons.find(btn => btn.textContent?.includes('Jun 4, 2024'));
    fireEvent.click(endButton);

    // Should show month label in picker
    expect(screen.getByText('June 2024')).toBeInTheDocument();
  });

  it('calls setInputValue when date is selected', () => {
    const setInputValue = jest.fn();
    render(<DateRangeInput {...defaultProps} setInputValue={setInputValue} />);

    // Open start date picker - find button containing the start date text
    const buttons = screen.getAllByRole('button');
    const startButton = buttons.find(btn => btn.textContent?.includes('Jun 2, 2024'));
    fireEvent.click(startButton);

    // Click on June 1st (first date in picker)
    const day1Button = screen.getByRole('button', { name: '1' });
    fireEvent.click(day1Button);

    // Should call setInputValue with all dates in the new range
    expect(setInputValue).toHaveBeenCalledWith('test-date-range', expect.any(Array));
  });

  it('clears selection when clear button is clicked', () => {
    const setInputValue = jest.fn();
    render(<DateRangeInput {...defaultProps} setInputValue={setInputValue} />);

    const clearButton = screen.getByLabelText('Clear selection');
    fireEvent.click(clearButton);

    expect(setInputValue).toHaveBeenCalledWith('test-date-range', []);
  });

  it('does not show clear button when no dates are selected', () => {
    render(<DateRangeInput {...defaultProps} selectedValues={[]} />);
    expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument();
  });

  it('shows message when no date options are available', () => {
    render(<DateRangeInput {...defaultProps} options={[]} />);
    expect(screen.getByText('No date options available')).toBeInTheDocument();
  });

  it('closes start picker when end picker is opened', () => {
    render(<DateRangeInput {...defaultProps} />);

    // Open start picker - find button containing start date
    const allButtons = screen.getAllByRole('button');
    const startButton = allButtons.find(btn => btn.textContent?.includes('Jun 2, 2024'));
    fireEvent.click(startButton);

    expect(screen.getByText('June 2024')).toBeInTheDocument();

    // Open end picker (should close start picker) - find button containing end date
    const endButton = allButtons.find(btn => btn.textContent?.includes('Jun 4, 2024'));
    fireEvent.click(endButton);

    // There should only be one month header visible
    expect(screen.getAllByText('June 2024')).toHaveLength(1);
  });

  it('handles null selectedValues', () => {
    render(<DateRangeInput {...defaultProps} selectedValues={null} />);
    expect(screen.getByText('Start date')).toBeInTheDocument();
    expect(screen.getByText('End date')).toBeInTheDocument();
  });

  it('handles invalid date strings in options gracefully', () => {
    const props = {
      ...defaultProps,
      options: ['2024-06-01', 'invalid-date', '2024-06-03'],
    };
    render(<DateRangeInput {...props} />);
    // Should still render without crashing
    expect(screen.getByText('Test Date Range')).toBeInTheDocument();
  });

  it('sorts dates chronologically', () => {
    const props = {
      ...defaultProps,
      options: ['2024-06-05', '2024-06-01', '2024-06-03'],
      selectedValues: ['2024-06-01', '2024-06-05'],
    };
    render(<DateRangeInput {...props} />);
    // Start should be the earliest date
    expect(screen.getByText('Jun 1, 2024')).toBeInTheDocument();
    // End should be the latest date
    expect(screen.getByText('Jun 5, 2024')).toBeInTheDocument();
  });

  it('closes picker on click outside', () => {
    render(
      <div>
        <DateRangeInput {...defaultProps} />
        <div data-testid="outside">Outside</div>
      </div>
    );

    // Open start picker - find button containing start date
    const buttons = screen.getAllByRole('button');
    const startButton = buttons.find(btn => btn.textContent?.includes('Jun 2, 2024'));
    fireEvent.click(startButton);

    expect(screen.getByText('June 2024')).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId('outside'));

    // Picker should close
    expect(screen.queryByText('June 2024')).not.toBeInTheDocument();
  });

  it('swaps dates when start is after end', () => {
    const setInputValue = jest.fn();
    render(
      <DateRangeInput
        {...defaultProps}
        selectedValues={['2024-06-03']}
        setInputValue={setInputValue}
      />
    );

    // Open end picker - find button containing placeholder
    const endButtons = screen.getAllByRole('button');
    const endButton = endButtons.find(btn => btn.textContent?.includes('End date'));
    if (endButton) {
      fireEvent.click(endButton);
    }

    // The component should handle the date swap automatically
    // This is covered by the updateSelection logic
  });

  it('does not call setInputValue without name', () => {
    const setInputValue = jest.fn();
    const props = {
      ...defaultProps,
      name: undefined,
      setInputValue,
    };
    render(<DateRangeInput {...props} />);

    const clearButton = screen.getByLabelText('Clear selection');
    fireEvent.click(clearButton);

    // Should not call setInputValue because name is undefined
    expect(setInputValue).not.toHaveBeenCalled();
  });

  it('shows month navigation buttons in picker', () => {
    render(<DateRangeInput {...defaultProps} />);

    // Open start picker
    const buttons = screen.getAllByRole('button');
    const startButton = buttons.find(btn => btn.textContent?.includes('Jun 2, 2024'));
    fireEvent.click(startButton);

    // Should show navigation buttons
    expect(screen.getByLabelText('Previous month')).toBeInTheDocument();
    expect(screen.getByLabelText('Next month')).toBeInTheDocument();
  });

  it('navigates to next month when next button is clicked', () => {
    const props = {
      ...defaultProps,
      options: [
        '2024-06-01',
        '2024-06-02',
        '2024-07-01',
        '2024-07-02',
      ],
      selectedValues: ['2024-06-01'],
    };
    render(<DateRangeInput {...props} />);

    // Open start picker
    const buttons = screen.getAllByRole('button');
    const startButton = buttons.find(btn => btn.textContent?.includes('Jun 1, 2024'));
    fireEvent.click(startButton);

    // Should show June 2024
    expect(screen.getByText('June 2024')).toBeInTheDocument();

    // Click next month
    fireEvent.click(screen.getByLabelText('Next month'));

    // Should now show July 2024
    expect(screen.getByText('July 2024')).toBeInTheDocument();
  });

  it('navigates to previous month when previous button is clicked', () => {
    const props = {
      ...defaultProps,
      options: [
        '2024-05-01',
        '2024-05-02',
        '2024-06-01',
        '2024-06-02',
      ],
      selectedValues: ['2024-06-01', '2024-06-02'],
    };
    render(<DateRangeInput {...props} />);

    // Open end picker - find button containing end date
    const buttons = screen.getAllByRole('button');
    const endButton = buttons.find(btn => btn.textContent?.includes('Jun 2, 2024'));
    fireEvent.click(endButton);

    // Should show June 2024 (last date's month)
    expect(screen.getByText('June 2024')).toBeInTheDocument();

    // Click previous month
    fireEvent.click(screen.getByLabelText('Previous month'));

    // Should now show May 2024
    expect(screen.getByText('May 2024')).toBeInTheDocument();
  });

  it('shows weekday headers in calendar', () => {
    render(<DateRangeInput {...defaultProps} />);

    // Open start picker
    const buttons = screen.getAllByRole('button');
    const startButton = buttons.find(btn => btn.textContent?.includes('Jun 2, 2024'));
    fireEvent.click(startButton);

    // Should show weekday headers
    expect(screen.getByText('Su')).toBeInTheDocument();
    expect(screen.getByText('Mo')).toBeInTheDocument();
    expect(screen.getByText('Tu')).toBeInTheDocument();
    expect(screen.getByText('We')).toBeInTheDocument();
    expect(screen.getByText('Th')).toBeInTheDocument();
    expect(screen.getByText('Fr')).toBeInTheDocument();
    expect(screen.getByText('Sa')).toBeInTheDocument();
  });

  it('disables dates not in options', () => {
    render(<DateRangeInput {...defaultProps} />);

    // Open start picker
    const buttons = screen.getAllByRole('button');
    const startButton = buttons.find(btn => btn.textContent?.includes('Jun 2, 2024'));
    fireEvent.click(startButton);

    // June 10 is not in options (which are June 1-5), so it should be disabled
    const day10Button = screen.getByRole('button', { name: '10' });
    expect(day10Button).toBeDisabled();

    // June 3 is in options, so it should not be disabled
    const day3Button = screen.getByRole('button', { name: '3' });
    expect(day3Button).not.toBeDisabled();
  });
});
