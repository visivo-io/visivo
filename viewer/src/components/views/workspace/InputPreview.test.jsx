/**
 * InputPreview tests (VIS-796 / N-4).
 *
 * The Track-N input preview reuses the EXISTING <Input> control renderer,
 * resolving the saved input from the input store by name and surfacing its
 * current selected value. <Input> and the options-loading hook are mocked.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import InputPreview from './InputPreview';
import useStore from '../../../stores/store';

const mockInputSpy = jest.fn();
jest.mock('../../items/Input', () => ({
  __esModule: true,
  default: props => {
    mockInputSpy(props);
    return <div data-testid="input-renderer-mock">{props.input?.name}</div>;
  },
}));
jest.mock('../../../hooks/useInputsData', () => ({
  useInputsData: jest.fn(),
}));

const seed = (inputs = [], selectedValues = {}) => {
  act(() => {
    useStore.setState({
      inputs,
      fetchInputs: jest.fn(),
      inputSelectedValues: selectedValues,
    });
  });
};

describe('InputPreview (VIS-796)', () => {
  beforeEach(() => mockInputSpy.mockClear());

  test('renders the existing Input control for a saved input', () => {
    seed([{ name: 'region', config: { type: 'single-select' } }]);
    render(<InputPreview activeObject={{ type: 'input', name: 'region' }} projectId="p1" />);
    expect(screen.getByTestId('input-preview')).toBeInTheDocument();
    expect(screen.getByTestId('input-renderer-mock')).toHaveTextContent('region');
  });

  test('surfaces the current selected value beside the control', () => {
    seed([{ name: 'region', config: { type: 'single-select' } }], { region: 'west' });
    render(<InputPreview activeObject={{ type: 'input', name: 'region' }} projectId="p1" />);
    expect(screen.getByTestId('input-preview-value')).toHaveTextContent('west');
  });

  test('renders a placeholder dash when no value is selected', () => {
    seed([{ name: 'region', config: { type: 'single-select' } }], {});
    render(<InputPreview activeObject={{ type: 'input', name: 'region' }} projectId="p1" />);
    expect(screen.getByTestId('input-preview-value')).toHaveTextContent('—');
  });

  test('joins multi-select array values for display', () => {
    seed([{ name: 'tags', config: { type: 'multi-select' } }], { tags: ['a', 'b'] });
    render(<InputPreview activeObject={{ type: 'input', name: 'tags' }} projectId="p1" />);
    expect(screen.getByTestId('input-preview-value')).toHaveTextContent('a, b');
  });

  test('renders an empty state when the input is not found', () => {
    seed([], {});
    render(<InputPreview activeObject={{ type: 'input', name: 'missing' }} projectId="p1" />);
    expect(screen.getByTestId('input-preview-empty')).toHaveTextContent(/not found/i);
  });
});
