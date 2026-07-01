import React, { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SliceMenu } from './SliceMenu';

// SliceMenu uses createPortal and reads getBoundingClientRect on the
// anchor element. We render a small harness that gives it a real
// anchor.
const Harness = ({ slice = null, slotShape = 'mixed', onChange = () => {}, onClose = () => {} }) => {
  const anchorRef = useRef(null);
  // jsdom returns 0 for getBoundingClientRect — that's fine, the menu
  // will render at 0,0 but that doesn't affect logic.
  return (
    <>
      <button ref={anchorRef} data-testid="harness-anchor">anchor</button>
      <SliceMenu
        anchorEl={anchorRef.current}
        open={true}
        onClose={onClose}
        slice={slice}
        onChange={onChange}
        slotShape={slotShape}
      />
    </>
  );
};

const renderHarness = props => {
  // First render captures the ref to null. Re-render once to make
  // anchorEl available to SliceMenu.
  const utils = render(<Harness {...props} />);
  utils.rerender(<Harness {...props} />);
  return utils;
};

describe('SliceMenu — slot-shape policy', () => {
  it('scalar-only enables First/Last/At row, disables Range/All', () => {
    renderHarness({ slotShape: 'scalar-only' });
    expect(screen.getByTestId('slice-option-first')).not.toBeDisabled();
    expect(screen.getByTestId('slice-option-last')).not.toBeDisabled();
    expect(screen.getByTestId('slice-option-at-row')).not.toBeDisabled();
    expect(screen.getByTestId('slice-option-range')).toBeDisabled();
    expect(screen.getByTestId('slice-option-all')).toBeDisabled();
  });

  it('array-only enables Range/All, disables First/Last/At row', () => {
    renderHarness({ slotShape: 'array-only' });
    expect(screen.getByTestId('slice-option-first')).toBeDisabled();
    expect(screen.getByTestId('slice-option-last')).toBeDisabled();
    expect(screen.getByTestId('slice-option-at-row')).toBeDisabled();
    expect(screen.getByTestId('slice-option-range')).not.toBeDisabled();
    expect(screen.getByTestId('slice-option-all')).not.toBeDisabled();
  });

  it('mixed enables every option', () => {
    renderHarness({ slotShape: 'mixed' });
    expect(screen.getByTestId('slice-option-first')).not.toBeDisabled();
    expect(screen.getByTestId('slice-option-last')).not.toBeDisabled();
    expect(screen.getByTestId('slice-option-at-row')).not.toBeDisabled();
    expect(screen.getByTestId('slice-option-range')).not.toBeDisabled();
    expect(screen.getByTestId('slice-option-all')).not.toBeDisabled();
  });

  it('attaches a tooltip explaining why disabled options are off', () => {
    renderHarness({ slotShape: 'scalar-only' });
    const range = screen.getByTestId('slice-option-range');
    expect(range).toHaveAttribute('title', expect.stringMatching(/single value/i));
    const all = screen.getByTestId('slice-option-all');
    expect(all).toHaveAttribute('title', expect.stringMatching(/single value/i));
  });
});

describe('SliceMenu — selection callbacks', () => {
  it('First option emits "[0]"', () => {
    const onChange = jest.fn();
    const onClose = jest.fn();
    renderHarness({ slotShape: 'mixed', onChange, onClose });
    fireEvent.click(screen.getByTestId('slice-option-first'));
    expect(onChange).toHaveBeenCalledWith('[0]');
    expect(onClose).toHaveBeenCalled();
  });

  it('Last option emits "[-1]"', () => {
    const onChange = jest.fn();
    renderHarness({ slotShape: 'mixed', onChange });
    fireEvent.click(screen.getByTestId('slice-option-last'));
    expect(onChange).toHaveBeenCalledWith('[-1]');
  });

  it('All values emits null', () => {
    const onChange = jest.fn();
    renderHarness({ slotShape: 'mixed', onChange });
    fireEvent.click(screen.getByTestId('slice-option-all'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('SliceMenu — At row inline input', () => {
  it('reveals the input on click and emits "[N]" on apply', () => {
    const onChange = jest.fn();
    renderHarness({ slotShape: 'mixed', onChange });
    fireEvent.click(screen.getByTestId('slice-option-at-row'));
    const input = screen.getByTestId('slice-at-row-input');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('slice-at-row-apply'));
    expect(onChange).toHaveBeenCalledWith('[4]');
  });

  it('Enter key applies the input', () => {
    const onChange = jest.fn();
    renderHarness({ slotShape: 'mixed', onChange });
    fireEvent.click(screen.getByTestId('slice-option-at-row'));
    const input = screen.getByTestId('slice-at-row-input');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('[7]');
  });

  it('does not emit on apply when input is empty/non-numeric', () => {
    const onChange = jest.fn();
    renderHarness({ slotShape: 'mixed', onChange });
    fireEvent.click(screen.getByTestId('slice-option-at-row'));
    fireEvent.click(screen.getByTestId('slice-at-row-apply'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SliceMenu — Range inline inputs', () => {
  it('reveals inputs and emits "[a:b]" on apply', () => {
    const onChange = jest.fn();
    renderHarness({ slotShape: 'mixed', onChange });
    fireEvent.click(screen.getByTestId('slice-option-range'));
    fireEvent.change(screen.getByTestId('slice-range-start'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('slice-range-end'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('slice-range-apply'));
    expect(onChange).toHaveBeenCalledWith('[1:5]');
  });
});

describe('SliceMenu — current-selection indicator', () => {
  it('marks the option matching the current slice as selected', () => {
    renderHarness({ slotShape: 'mixed', slice: '[0]' });
    expect(screen.getByTestId('slice-option-first').className).toMatch(/font-medium/);
  });

  it('marks "All values" as selected when slice is null', () => {
    renderHarness({ slotShape: 'mixed', slice: null });
    expect(screen.getByTestId('slice-option-all').className).toMatch(/font-medium/);
  });
});
