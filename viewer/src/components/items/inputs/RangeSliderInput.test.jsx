import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RangeSliderInput from './RangeSliderInput';

/**
 * RangeSliderInput is display-only: the thumbs sit wherever the store's
 * selectedValues say (VIS-1460 I3 — defaults must land on the YAML values, and
 * numeric matching must not depend on string formatting).
 */
describe('RangeSliderInput', () => {
  const options = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const baseProps = {
    label: 'X Value Range',
    options,
    name: 'x_value_range',
    setInputJobValue: jest.fn(),
  };

  const sliders = () => screen.getAllByRole('slider');
  // Thumb geometry lives in inline styles on presentational divs (no role).
  const thumbs = container =>
    // eslint-disable-next-line testing-library/no-node-access
    [...container.querySelectorAll('div.rounded-full.border-2')].map(el => el.style.left);

  beforeEach(() => jest.clearAllMocks());

  it('places both thumbs at the selected default range', () => {
    const { container } = render(
      <RangeSliderInput {...baseProps} selectedValues={['3', '4', '5', '6', '7']} />
    );
    const [minSlider, maxSlider] = sliders();
    expect(minSlider).toHaveValue('3');
    expect(maxSlider).toHaveValue('7');
    // Thumb geometry: (3-1)/(10-1) and (7-1)/(10-1) of the track.
    const [minLeft, maxLeft] = thumbs(container);
    // Serialised to 4dp, which is what a browser reports too.
    expect(minLeft).toBe('calc(22.2222% - 10px)');
    expect(maxLeft).toBe('calc(66.6667% - 10px)');
    expect(screen.getByText('3', { selector: '.text-lg' })).toBeInTheDocument();
    expect(screen.getByText('7', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('matches selected values numerically regardless of string formatting', () => {
    render(
      <RangeSliderInput
        {...baseProps}
        options={['10.0', '20', '30.00', '40']}
        selectedValues={['10', '20.0']}
      />
    );
    const [minSlider, maxSlider] = sliders();
    expect(minSlider).toHaveValue('10');
    expect(maxSlider).toHaveValue('20');
  });

  it('spans the full range when nothing is selected or nothing parses', () => {
    const { rerender } = render(<RangeSliderInput {...baseProps} selectedValues={null} />);
    expect(sliders()[0]).toHaveValue('1');
    expect(sliders()[1]).toHaveValue('10');

    rerender(<RangeSliderInput {...baseProps} selectedValues={['abc']} />);
    expect(sliders()[0]).toHaveValue('1');
    expect(sliders()[1]).toHaveValue('10');
  });

  it('sorts unsorted numeric options and drops non-numeric ones', () => {
    render(<RangeSliderInput {...baseProps} options={['9', 'n/a', '2', 5]} selectedValues={[]} />);
    expect(sliders()[0]).toHaveValue('2');
    expect(sliders()[1]).toHaveValue('9');
  });

  it('emits every option inside the new range on a min thumb move (clamped to max)', () => {
    render(<RangeSliderInput {...baseProps} selectedValues={['3', '4', '5', '6', '7']} />);
    fireEvent.change(sliders()[0], { target: { value: '5' } });
    expect(baseProps.setInputJobValue).toHaveBeenCalledWith('x_value_range', [5, 6, 7]);

    fireEvent.change(sliders()[0], { target: { value: '9' } });
    expect(baseProps.setInputJobValue).toHaveBeenLastCalledWith('x_value_range', [7]);
  });

  it('emits every option inside the new range on a max thumb move (clamped to min)', () => {
    render(<RangeSliderInput {...baseProps} selectedValues={['3', '4', '5', '6', '7']} />);
    fireEvent.change(sliders()[1], { target: { value: '4' } });
    expect(baseProps.setInputJobValue).toHaveBeenCalledWith('x_value_range', [3, 4]);

    fireEvent.change(sliders()[1], { target: { value: '1' } });
    expect(baseProps.setInputJobValue).toHaveBeenLastCalledWith('x_value_range', [3]);
  });

  it('does not throw when no setter is provided', () => {
    render(<RangeSliderInput {...baseProps} setInputJobValue={undefined} selectedValues={['3']} />);
    expect(() => fireEvent.change(sliders()[0], { target: { value: '2' } })).not.toThrow();
  });

  it('shows a message when fewer than two numeric options exist', () => {
    render(<RangeSliderInput {...baseProps} options={['1']} selectedValues={['1']} />);
    expect(screen.getByText(/requires at least 2 numeric options/)).toBeInTheDocument();
    expect(screen.getByText('X Value Range')).toBeInTheDocument();
  });

  it('renders without a label', () => {
    render(<RangeSliderInput {...baseProps} label="" selectedValues={['2']} />);
    expect(screen.queryByText('X Value Range')).not.toBeInTheDocument();
  });
});
