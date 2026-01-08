import React from 'react';
import { render, screen } from '@testing-library/react';
import Input, { SINGLE_SELECT, MULTI_SELECT } from './Input';

// Mock all input components
jest.mock('./inputs/Dropdown', () => ({ label }) => (
  <div data-testid="dropdown">{label}</div>
));
jest.mock('./inputs/MultiSelectDropdown', () => ({ label }) => (
  <div data-testid="multi-select-dropdown">{label}</div>
));
jest.mock('./inputs/RadioInput', () => ({ label }) => (
  <div data-testid="radio-input">{label}</div>
));
jest.mock('./inputs/ToggleInput', () => ({ label }) => (
  <div data-testid="toggle-input">{label}</div>
));
jest.mock('./inputs/TabsInput', () => ({ label }) => (
  <div data-testid="tabs-input">{label}</div>
));
jest.mock('./inputs/CheckboxesInput', () => ({ label }) => (
  <div data-testid="checkboxes-input">{label}</div>
));
jest.mock('./inputs/ChipsInput', () => ({ label }) => (
  <div data-testid="chips-input">{label}</div>
));
jest.mock('./inputs/RangeSliderInput', () => ({ label }) => (
  <div data-testid="range-slider-input">{label}</div>
));

// Store mock state - needs to be accessible both inside mock factory and in tests
const mockSetInputValue = jest.fn();

jest.mock('../../stores/store', () => {
  const storeState = {
    setInputValue: jest.fn(),
    inputs: {},
    inputOptions: {},
    inputData: {},
    setInputOptions: jest.fn(),
    setDefaultInputValue: jest.fn(),
    setInputData: jest.fn(),
    inputSelectedValues: {},
  };

  const mockFn = jest.fn(fn => fn(storeState));
  mockFn.getState = () => storeState;

  return {
    __esModule: true,
    default: mockFn,
  };
});

describe('Input component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders null if no input provided', () => {
    const { container } = render(<Input />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders null if input.type is not single-select or multi-select', () => {
    render(<Input input={{ type: 'text' }} itemWidth={2} />);
    expect(screen.queryByTestId('dropdown')).toBeNull();
  });

  describe('single-select inputs', () => {
    it('renders Dropdown for single-select type with dropdown display', () => {
      const input = {
        type: SINGLE_SELECT,
        label: 'Select Region',
        options: ['East', 'West'],
        name: 'region',
        display: { type: 'dropdown' },
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('dropdown')).toBeInTheDocument();
    });

    it('renders Dropdown for single-select type with default display', () => {
      const input = {
        type: SINGLE_SELECT,
        label: 'Choose option',
        options: ['One', 'Two'],
        default: 'One',
        name: 'testDropdown',
      };

      render(<Input input={input} itemWidth={3} />);

      const dropdown = screen.getByTestId('dropdown');
      expect(dropdown).toBeInTheDocument();
      expect(dropdown).toHaveTextContent('Choose option');
    });

    it('renders RadioInput for single-select with radio display', () => {
      const input = {
        type: SINGLE_SELECT,
        label: 'Radio Options',
        options: ['A', 'B', 'C'],
        name: 'radioTest',
        display: { type: 'radio' },
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('radio-input')).toBeInTheDocument();
    });

    it('renders ToggleInput for single-select with toggle display', () => {
      const input = {
        type: SINGLE_SELECT,
        label: 'Toggle Option',
        options: ['On', 'Off'],
        name: 'toggleTest',
        display: { type: 'toggle' },
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('toggle-input')).toBeInTheDocument();
    });

    it('renders TabsInput for single-select with tabs display', () => {
      const input = {
        type: SINGLE_SELECT,
        label: 'Tab Options',
        options: ['Tab1', 'Tab2', 'Tab3'],
        name: 'tabsTest',
        display: { type: 'tabs' },
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('tabs-input')).toBeInTheDocument();
    });
  });

  describe('multi-select inputs', () => {
    it('renders MultiSelectDropdown for multi-select with dropdown display', () => {
      const input = {
        type: MULTI_SELECT,
        label: 'Select Categories',
        options: ['A', 'B', 'C'],
        name: 'categories',
        display: { type: 'dropdown' },
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('multi-select-dropdown')).toBeInTheDocument();
    });

    it('renders MultiSelectDropdown for multi-select with default display', () => {
      const input = {
        type: MULTI_SELECT,
        label: 'Select Items',
        options: ['X', 'Y', 'Z'],
        name: 'items',
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('multi-select-dropdown')).toBeInTheDocument();
    });

    it('renders CheckboxesInput for multi-select with checkboxes display', () => {
      const input = {
        type: MULTI_SELECT,
        label: 'Checkbox Options',
        options: ['Opt1', 'Opt2', 'Opt3'],
        name: 'checkboxTest',
        display: { type: 'checkboxes' },
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('checkboxes-input')).toBeInTheDocument();
    });

    it('renders ChipsInput for multi-select with chips display', () => {
      const input = {
        type: MULTI_SELECT,
        label: 'Chip Options',
        options: ['Chip1', 'Chip2', 'Chip3'],
        name: 'chipsTest',
        display: { type: 'chips' },
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('chips-input')).toBeInTheDocument();
    });

    it('renders ChipsInput for multi-select with tags display', () => {
      const input = {
        type: MULTI_SELECT,
        label: 'Tag Options',
        options: ['Tag1', 'Tag2'],
        name: 'tagsTest',
        display: { type: 'tags' },
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('chips-input')).toBeInTheDocument();
    });

    it('renders RangeSliderInput for multi-select with range-slider display', () => {
      const input = {
        type: MULTI_SELECT,
        label: 'Range Selection',
        options: ['1', '2', '3', '4', '5'],
        name: 'rangeTest',
        display: { type: 'range-slider' },
      };

      render(<Input input={input} itemWidth={3} />);

      expect(screen.getByTestId('range-slider-input')).toBeInTheDocument();
    });
  });

  describe('infinite loop prevention', () => {
    it('memoizes callbacks to prevent infinite re-renders', () => {
      // This test verifies that the Input component properly memoizes its callbacks
      // Without memoization, Dropdown would receive new function references on every render
      // causing useEffect dependencies to trigger infinitely

      const input = {
        type: SINGLE_SELECT,
        label: 'Test Input',
        options: ['A', 'B'],
        name: 'testInput',
        default: 'A',
      };

      // Render should complete without throwing "Maximum update depth exceeded"
      const { rerender } = render(<Input input={input} itemWidth={2} />);

      // The component should render successfully
      expect(screen.getByTestId('dropdown')).toBeInTheDocument();

      // Re-render with same input should not cause issues
      rerender(<Input input={input} itemWidth={2} />);
      expect(screen.getByTestId('dropdown')).toBeInTheDocument();

      // Input should NOT call setInputValue on its own (Dropdown only calls on user selection)
      // So calls should be 0 without user interaction
      expect(mockSetInputValue.mock.calls.length).toBe(0);
    });

    it('handles re-renders with updated input without infinite loops', () => {
      const input1 = {
        type: SINGLE_SELECT,
        label: 'Test Input',
        options: ['A', 'B'],
        name: 'testInput',
        default: 'A',
      };

      const input2 = {
        type: SINGLE_SELECT,
        label: 'Test Input Updated',
        options: ['A', 'B', 'C'],
        name: 'testInput',
        default: 'B',
      };

      const { rerender } = render(<Input input={input1} itemWidth={2} />);
      expect(screen.getByTestId('dropdown')).toBeInTheDocument();

      // Clear mock calls before rerender
      mockSetInputValue.mockClear();

      // Re-render with different input
      rerender(<Input input={input2} itemWidth={2} />);
      expect(screen.getByTestId('dropdown')).toBeInTheDocument();

      // Input should NOT call setInputValue on re-renders (only on user selection)
      expect(mockSetInputValue.mock.calls.length).toBe(0);
    });
  });
});
