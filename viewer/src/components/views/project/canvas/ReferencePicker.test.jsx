/**
 * ReferencePicker tests (VIS-792 / Track L L-2).
 *
 * The modal that picks a replacement reference for a broken canvas slot. Covers
 * the loaded list, search filtering, click-to-select, the empty state + its
 * create CTA, and the create-new footer link.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ReferencePicker from './ReferencePicker';
import useStore from '../../../../stores/store';

const seedCharts = () => {
  useStore.setState({
    charts: [
      { name: 'revenue_chart', insights: [{ name: 'revenue_insight' }] },
      { name: 'cost_chart', insights: ['cost_insight'] },
      { name: 'orders_chart' },
    ],
    tables: [],
    markdowns: [],
    inputs: [],
  });
};

beforeEach(seedCharts);

describe('ReferencePicker (VIS-792)', () => {
  test('renders the type-aware title and lists available objects', () => {
    render(<ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByTestId('reference-picker-title')).toHaveTextContent('Pick a chart');
    expect(screen.getByTestId('reference-picker-row-revenue_chart')).toBeInTheDocument();
    expect(screen.getByTestId('reference-picker-row-cost_chart')).toBeInTheDocument();
    expect(screen.getByTestId('reference-picker-row-orders_chart')).toBeInTheDocument();
  });

  test('shows the underlying insight as a description when present', () => {
    render(<ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} />);
    const row = screen.getByTestId('reference-picker-row-revenue_chart');
    expect(row).toHaveTextContent('insight: revenue_insight');
  });

  test('search filters the list', () => {
    render(<ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} />);
    fireEvent.change(screen.getByTestId('reference-picker-search'), {
      target: { value: 'cost' },
    });
    expect(screen.getByTestId('reference-picker-row-cost_chart')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-picker-row-revenue_chart')).not.toBeInTheDocument();
  });

  test('a search with no matches shows the no-matches message', () => {
    render(<ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} />);
    fireEvent.change(screen.getByTestId('reference-picker-search'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByTestId('reference-picker-no-matches')).toBeInTheDocument();
  });

  test('click-to-select calls onSelect with the chosen name', () => {
    const onSelect = jest.fn();
    render(<ReferencePicker type="chart" onSelect={onSelect} onClose={jest.fn()} />);
    fireEvent.click(screen.getByTestId('reference-picker-row-cost_chart'));
    expect(onSelect).toHaveBeenCalledWith('cost_chart');
  });

  test('close button + Escape both call onClose', () => {
    const onClose = jest.fn();
    render(<ReferencePicker type="chart" onSelect={jest.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('reference-picker-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('empty state shows a prominent create CTA when no objects of the type exist', () => {
    useStore.setState({ charts: [] });
    const onCreateNew = jest.fn();
    render(
      <ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} onCreateNew={onCreateNew} />
    );
    expect(screen.getByTestId('reference-picker-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reference-picker-empty-create'));
    expect(onCreateNew).toHaveBeenCalledWith('chart');
  });

  test('loading shows the skeleton, not the list', () => {
    render(<ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} loading />);
    expect(screen.getByTestId('reference-picker-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-picker-row-revenue_chart')).not.toBeInTheDocument();
  });

  test('create-new footer link routes to the create flow when the list is populated', () => {
    // Seed a populated type so the footer create link renders (the empty state
    // owns its own CTA instead of the footer link).
    useStore.setState({ tables: [{ name: 'orders_table' }] });
    const onCreateNew = jest.fn();
    render(
      <ReferencePicker type="table" onSelect={jest.fn()} onClose={jest.fn()} onCreateNew={onCreateNew} />
    );
    fireEvent.click(screen.getByTestId('reference-picker-create'));
    expect(onCreateNew).toHaveBeenCalledWith('table');
  });
});
