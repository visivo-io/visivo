import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Input from './Input';
import { runDuckDBQuery } from '../../duckdb/queries';
import { useDuckDB } from '../../contexts/DuckDBContext';

jest.mock('../../duckdb/queries', () => ({
  runDuckDBQuery: jest.fn(),
}));

jest.mock('../../contexts/DuckDBContext', () => ({
  useDuckDB: jest.fn(),
}));

jest.mock('../../stores/store', () => {
  const setInputValue = jest.fn();
  const setDefaultInputValue = jest.fn();
  const state = { setInputValue, setDefaultInputValue };

  return jest.fn(selector => selector(state));
});

// --- Mock child components ---
jest.mock('./inputs/Dropdown', () => props => (
  <div data-testid="dropdown">{JSON.stringify(props)}</div>
));
jest.mock('../common/Loading', () => props => (
  <div data-testid="loading">{props.text}</div>
));

describe('Input component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDuckDB.mockReturnValue('mockDb');
  });

  it('renders dropdown with static options', async () => {
    const mockInput = {
      type: 'dropdown',
      name: 'static',
      options: ['One', 'Two'],
      default: 'One',
      label: 'Pick one',
    };

    render(<Input input={mockInput} project="p" itemWidth={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('dropdown')).toBeInTheDocument();
    });

    const dropdownProps = JSON.parse(screen.getByTestId('dropdown').textContent);

    expect(dropdownProps.options).toEqual([
      { id: 'One', label: 'One' },
      { id: 'Two', label: 'Two' },
    ]);
    expect(dropdownProps.defaultValue).toEqual({ id: 'One', label: 'One' });
    expect(dropdownProps.label).toBe('Pick one');
    expect(dropdownProps.name).toBe('static');
  });

  it('renders dropdown with query options', async () => {
    const mockValues = {
      length: 2,
      get: i => (i === 0 ? 'Alpha' : 'Beta'),
    };
    const mockResult = {
      getChildAt: () => mockValues,
    };

    runDuckDBQuery.mockResolvedValueOnce(mockResult);

    const mockInput = {
      type: 'dropdown',
      name: 'query',
      options: 'SELECT x FROM y',
      is_query: true,
    };

    render(<Input input={mockInput} project="p" itemWidth={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('dropdown')).toBeInTheDocument();
    });

    const dropdownProps = JSON.parse(screen.getByTestId('dropdown').textContent);
    expect(dropdownProps.options).toEqual([
      { id: 'Alpha', label: 'Alpha' },
      { id: 'Beta', label: 'Beta' },
    ]);
  });

  it('renders nothing for unsupported input type', async () => {
    render(<Input input={{ type: 'text', name: 'x' }} project="p" itemWidth={2} />);

    await waitFor(() => {
      expect(screen.queryByTestId('dropdown')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
  });
});
