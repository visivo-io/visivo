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
    insights: [],
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

  test('click-to-select calls onSelect with the chosen name AND its type', () => {
    const onSelect = jest.fn();
    render(<ReferencePicker type="chart" onSelect={onSelect} onClose={jest.fn()} />);
    fireEvent.click(screen.getByTestId('reference-picker-row-cost_chart'));
    expect(onSelect).toHaveBeenCalledWith('cost_chart', 'chart');
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

describe('ReferencePicker — multi-type mode (W5 click-to-pick)', () => {
  const seedChartsAndInsights = () => {
    seedCharts();
    useStore.setState({
      insights: [{ name: 'rev-insight' }, { name: 'churn-insight' }],
    });
  };

  const renderMulti = (props = {}) =>
    render(
      <ReferencePicker
        types={['chart', 'insight']}
        onSelect={jest.fn()}
        onClose={jest.fn()}
        {...props}
      />
    );

  beforeEach(seedChartsAndInsights);

  test('lists charts AND insights in typed sections with headers', () => {
    renderMulti();
    expect(screen.getByTestId('reference-picker-title')).toHaveTextContent(
      'Pick a chart or insight'
    );
    // Typed section headers (objectTypeConfigs labels).
    expect(screen.getByTestId('reference-picker-section-chart')).toHaveTextContent('Charts');
    expect(screen.getByTestId('reference-picker-section-insight')).toHaveTextContent('Insights');
    // Rows of both types, each tagged with its section type.
    expect(screen.getByTestId('reference-picker-row-revenue_chart')).toHaveAttribute(
      'data-picker-type',
      'chart'
    );
    expect(screen.getByTestId('reference-picker-row-rev-insight')).toHaveAttribute(
      'data-picker-type',
      'insight'
    );
  });

  test('single-type mode renders NO section headers (BrokenRefCard parity)', () => {
    render(<ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByTestId('reference-picker-section-chart')).not.toBeInTheDocument();
  });

  test('search filters across both sections and hides emptied sections', () => {
    renderMulti();
    fireEvent.change(screen.getByTestId('reference-picker-search'), {
      target: { value: 'insight' },
    });
    // Only insight rows match; the chart section disappears entirely.
    expect(screen.getByTestId('reference-picker-row-rev-insight')).toBeInTheDocument();
    expect(screen.getByTestId('reference-picker-row-churn-insight')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-picker-section-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reference-picker-row-revenue_chart')).not.toBeInTheDocument();
  });

  test('picking an insight reports the insight type to onSelect', () => {
    const onSelect = jest.fn();
    renderMulti({ onSelect });
    fireEvent.click(screen.getByTestId('reference-picker-row-rev-insight'));
    expect(onSelect).toHaveBeenCalledWith('rev-insight', 'insight');
  });

  test('empty state spans both types and the create CTA targets the primary type', () => {
    useStore.setState({ charts: [], insights: [] });
    const onCreateNew = jest.fn();
    renderMulti({ onCreateNew });
    expect(screen.getByTestId('reference-picker-empty')).toBeInTheDocument();
    expect(screen.getByTestId('reference-picker-empty')).toHaveTextContent(
      'No charts and insights available'
    );
    fireEvent.click(screen.getByTestId('reference-picker-empty-create'));
    expect(onCreateNew).toHaveBeenCalledWith('chart');
  });

  test('one populated type keeps the list mode (no empty state) even when the other is empty', () => {
    useStore.setState({ charts: [] });
    renderMulti();
    expect(screen.queryByTestId('reference-picker-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('reference-picker-row-rev-insight')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-picker-section-chart')).not.toBeInTheDocument();
  });
});

// ── Modal focus management (W5) ─────────────────────────────────────────────
// Click-to-pick promotes this dialog from a failure-state repair tool to the
// PRIMARY affordance for filling an empty slot, and the flow is sold as
// keyboard-completable. `aria-modal="true"` promises assistive tech that focus
// is contained here and that closing returns it where it came from; both have
// to actually be true.
describe('ReferencePicker — focus management', () => {
  const renderWithTrigger = (props = {}) => {
    const utils = render(
      <>
        <button type="button" data-testid="opener">
          Empty slot
        </button>
        <ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} {...props} />
      </>
    );
    return utils;
  };

  test('focuses the search box on open', () => {
    render(<ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByTestId('reference-picker-search')).toHaveFocus();
  });

  test('returns focus to the opener when the picker closes', () => {
    // Mount the trigger first and focus it, exactly as a real slot click does.
    const { rerender } = render(
      <button type="button" data-testid="opener">
        Empty slot
      </button>
    );
    screen.getByTestId('opener').focus();
    expect(screen.getByTestId('opener')).toHaveFocus();

    rerender(
      <>
        <button type="button" data-testid="opener">
          Empty slot
        </button>
        <ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} />
      </>
    );
    expect(screen.getByTestId('reference-picker-search')).toHaveFocus();

    // Close (Escape / X / backdrop all unmount the picker).
    rerender(
      <button type="button" data-testid="opener">
        Empty slot
      </button>
    );
    expect(screen.getByTestId('opener')).toHaveFocus();
  });

  test('leaves focus alone when the opener is gone (a filled slot unmounts it)', () => {
    const { rerender } = render(
      <button type="button" data-testid="opener">
        Empty slot
      </button>
    );
    screen.getByTestId('opener').focus();
    rerender(
      <>
        <button type="button" data-testid="opener">
          Empty slot
        </button>
        <ReferencePicker type="chart" onSelect={jest.fn()} onClose={jest.fn()} />
      </>
    );
    // A successful pick replaces the slot button with real content.
    expect(() => rerender(<div data-testid="filled" />)).not.toThrow();
    expect(screen.queryByTestId('opener')).not.toBeInTheDocument();
  });

  // DOM order inside the dialog: close (X) → search → object rows → footer
  // create link (absent here — no onCreateNew). So the trap's endpoints are
  // the close button and the LAST object row.
  const firstFocusable = () => screen.getByTestId('reference-picker-close');
  const lastFocusable = () => screen.getByTestId('reference-picker-row-orders_chart');

  test('Tab from the last focusable wraps to the first (focus trap)', () => {
    renderWithTrigger();
    lastFocusable().focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(firstFocusable()).toHaveFocus();
  });

  test('Shift+Tab from the first focusable wraps to the last, never out of the dialog', () => {
    renderWithTrigger();
    firstFocusable().focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(lastFocusable()).toHaveFocus();
    // aria-modal="true" claims nothing behind the backdrop is reachable.
    expect(screen.getByTestId('opener')).not.toHaveFocus();
  });

  test('Tab from outside the dialog is pulled back in', () => {
    renderWithTrigger();
    screen.getByTestId('opener').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(firstFocusable()).toHaveFocus();
    expect(screen.getByTestId('opener')).not.toHaveFocus();
  });
});
