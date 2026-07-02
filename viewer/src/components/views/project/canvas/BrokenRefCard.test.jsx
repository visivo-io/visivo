/**
 * BrokenRefCard tests (VIS-792 / Track L L-1).
 *
 * The placeholder card shown in a canvas slot whose chart/table/markdown/input
 * ref no longer resolves. Covers the type-aware heading + monospace ref name,
 * the Fix… → ReferencePicker → onFix flow, and the Delete-this-slot confirm →
 * onDelete flow.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BrokenRefCard from './BrokenRefCard';
import useStore from '../../../../stores/store';

beforeEach(() => {
  useStore.setState({
    charts: [{ name: 'real_chart' }, { name: 'other_chart' }],
    tables: [],
    markdowns: [],
    inputs: [],
  });
});

describe('BrokenRefCard (VIS-792)', () => {
  test('renders a type-aware heading and the missing ref name in monospace', () => {
    render(<BrokenRefCard type="chart" name="ghost_chart" />);
    expect(screen.getByTestId('broken-ref-heading')).toHaveTextContent("Chart ‘ghost_chart’ not found");
    const code = screen.getByTestId('broken-ref-name');
    expect(code).toHaveTextContent('ghost_chart');
    expect(code.tagName).toBe('CODE');
  });

  test('heading reflects the leaf type (table)', () => {
    render(<BrokenRefCard type="table" name="ghost_table" />);
    expect(screen.getByTestId('broken-ref-heading')).toHaveTextContent("Table ‘ghost_table’ not found");
  });

  test('Fix… opens the ReferencePicker; picking calls onFix with type + name', () => {
    const onFix = jest.fn();
    render(<BrokenRefCard type="chart" name="ghost_chart" onFix={onFix} />);
    expect(screen.queryByTestId('reference-picker')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('broken-ref-fix'));
    expect(screen.getByTestId('reference-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reference-picker-row-real_chart'));
    expect(onFix).toHaveBeenCalledWith('chart', 'real_chart');
    // Picker closes after a selection.
    expect(screen.queryByTestId('reference-picker')).not.toBeInTheDocument();
  });

  test('Delete this slot requires confirmation before calling onDelete', () => {
    const onDelete = jest.fn();
    render(<BrokenRefCard type="chart" name="ghost_chart" onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('broken-ref-delete'));
    // Confirm panel appears; onDelete not yet fired.
    expect(screen.getByTestId('broken-ref-confirm-delete')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('broken-ref-confirm-delete-button'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test('Delete confirmation can be cancelled', () => {
    const onDelete = jest.fn();
    render(<BrokenRefCard type="chart" name="ghost_chart" onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('broken-ref-delete'));
    fireEvent.click(screen.getByTestId('broken-ref-cancel-delete'));
    expect(screen.queryByTestId('broken-ref-confirm-delete')).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('carries data attributes for the broken type + name (story hooks)', () => {
    render(<BrokenRefCard type="markdown" name="ghost_md" />);
    const card = screen.getByTestId('broken-ref-card');
    expect(card).toHaveAttribute('data-broken-type', 'markdown');
    expect(card).toHaveAttribute('data-broken-name', 'ghost_md');
  });
});
