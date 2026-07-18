/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PillMenu from './PillMenu';
import useStore from '../../../stores/store';

const openMenu = () => fireEvent.click(screen.getByTestId('pill-menu-trigger'));

beforeEach(() => {
  useStore.setState({
    models: [],
    sources: [],
    metrics: [],
    dimensions: [],
    explorerModelStates: {},
  });
});

describe('PillMenu', () => {
  test('renders a chevron trigger, closed by default', () => {
    render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
    expect(screen.getByTestId('pill-menu-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
  });

  test('clicking the chevron opens the popover with the field header', () => {
    render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
    openMenu();
    expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
    expect(screen.getByText('orders_q ▸ region')).toBeInTheDocument();
  });

  test('a dimension pill offers the Dimension + every non-restricted preset (unknown numeric-ness fails open)', () => {
    render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
    openMenu();
    expect(screen.getByTestId('pill-menu-preset-dimension')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-preset-sum')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-preset-avg')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-preset-min')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-preset-count')).toBeInTheDocument();
  });

  test('selecting a preset calls onSelectPreset with the aggregation key and closes the menu', () => {
    const onSelectPreset = jest.fn();
    render(
      <PillMenu
        state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }}
        onSelectPreset={onSelectPreset}
      />
    );
    openMenu();
    fireEvent.click(screen.getByTestId('pill-menu-preset-sum'));
    expect(onSelectPreset).toHaveBeenCalledWith('sum');
    expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
  });

  test('the current aggregation preset renders selected (aria-checked)', () => {
    render(
      <PillMenu state={{ kind: 'aggregate', agg: 'avg', ref: 'orders_q', column: 'amount' }} />
    );
    openMenu();
    expect(screen.getByTestId('pill-menu-preset-avg')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pill-menu-preset-sum')).toHaveAttribute('aria-checked', 'false');
  });

  test('a confidently non-numeric column restricts to Dimension/MIN/MAX/COUNT/COUNT DISTINCT (06 §4)', () => {
    useStore.setState({
      explorerModelStates: {
        orders_q: {
          queryResult: { columns: ['region'], rows: [{ region: 'north' }, { region: 'south' }] },
        },
      },
    });
    render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
    openMenu();
    expect(screen.getByTestId('pill-menu-preset-min')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-preset-max')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-preset-count')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-preset-count_distinct')).toBeInTheDocument();
    expect(screen.queryByTestId('pill-menu-preset-sum')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pill-menu-preset-avg')).not.toBeInTheDocument();
  });

  test('a confidently numeric column shows every preset', () => {
    useStore.setState({
      explorerModelStates: {
        orders_q: {
          queryResult: { columns: ['amount'], rows: [{ amount: 10 }, { amount: 20 }] },
        },
      },
    });
    render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
    openMenu();
    expect(screen.getByTestId('pill-menu-preset-sum')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-preset-avg')).toBeInTheDocument();
  });

  describe('MEDIAN dialect gating', () => {
    const withSourceType = type => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', type }],
      });
    };

    test('shows MEDIAN for a supported dialect (e.g. snowflake)', () => {
      withSourceType('snowflake');
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu-preset-median')).toBeInTheDocument();
    });

    test('hides MEDIAN for mysql', () => {
      withSourceType('mysql');
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    test('hides MEDIAN for sqlite', () => {
      withSourceType('sqlite');
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    test('fails open (shows MEDIAN) when the dialect is unresolved (e.g. duckdb / no source match)', () => {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu-preset-median')).toBeInTheDocument();
    });
  });

  test('metricRef/dimensionRef pills hide the "Use as" preset section entirely', () => {
    render(<PillMenu state={{ kind: 'metricRef', ref: 'churn_rate' }} />);
    openMenu();
    expect(screen.queryByTestId('pill-menu-preset-dimension')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pill-menu-preset-sum')).not.toBeInTheDocument();
    // The universal actions still render.
    expect(screen.getByTestId('pill-menu-custom-aggregation')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-save-as-metric')).toBeInTheDocument();
    expect(screen.getByTestId('pill-menu-remove')).toBeInTheDocument();
  });

  test('"Save as metric…" always renders disabled with the Phase 4 tooltip', () => {
    render(<PillMenu state={{ kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' }} />);
    openMenu();
    const saveAsMetric = screen.getByTestId('pill-menu-save-as-metric');
    expect(saveAsMetric).toBeDisabled();
    expect(saveAsMetric).toHaveAttribute('title', 'arrives with promote (Phase 4)');
  });

  test('"Custom aggregation…" calls onCustomAggregation and closes the menu', () => {
    const onCustomAggregation = jest.fn();
    render(
      <PillMenu
        state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }}
        onCustomAggregation={onCustomAggregation}
      />
    );
    openMenu();
    fireEvent.click(screen.getByTestId('pill-menu-custom-aggregation'));
    expect(onCustomAggregation).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
  });

  test('"Remove" calls onRemove and closes the menu', () => {
    const onRemove = jest.fn();
    render(
      <PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} onRemove={onRemove} />
    );
    openMenu();
    fireEvent.click(screen.getByTestId('pill-menu-remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
  });

  test('renders the global-name-first collision preflight warning when statedModel != resolvedParent', () => {
    render(
      <PillMenu
        state={{
          kind: 'metricRef',
          ref: 'churn_rate',
          statedModel: 'model_a',
          resolvedParent: 'model_b',
        }}
      />
    );
    openMenu();
    const warning = screen.getByTestId('pill-menu-collision-warning');
    expect(warning).toHaveTextContent('model_b');
    expect(warning).toHaveTextContent('model_a');
  });

  test('no preflight warning when there is no stated/resolved mismatch', () => {
    render(<PillMenu state={{ kind: 'metricRef', ref: 'churn_rate' }} />);
    openMenu();
    expect(screen.queryByTestId('pill-menu-collision-warning')).not.toBeInTheDocument();
  });

  test('the trigger is disabled when the row is disabled', () => {
    render(
      <PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} disabled />
    );
    expect(screen.getByTestId('pill-menu-trigger')).toBeDisabled();
  });
});
