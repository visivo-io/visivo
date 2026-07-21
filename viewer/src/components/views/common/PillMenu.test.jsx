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
    explorerSources: [],
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

  test('selecting a preset closes the popover, and a click inside it never re-opens it through a portal-bubbling ancestor handler', () => {
    // Composed-gate regression (Wave 1): the popover renders through a React
    // portal, and portal events bubble up the REACT tree — so every click
    // inside it also reached the pill BODY's open-the-menu handler one level
    // up, re-opening the menu in the same tick that selecting a preset closed
    // it. The menu then stayed open forever and the next chevron click only
    // appeared to do nothing (it toggled the already-open menu shut).
    const onSelectPreset = jest.fn();
    const reopen = jest.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={reopen} data-testid="pill-body-ancestor">
        <PillMenu
          state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }}
          onSelectPreset={onSelectPreset}
        />
      </div>
    );
    openMenu();
    expect(screen.getByTestId('pill-menu')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pill-menu-preset-sum'));

    expect(onSelectPreset).toHaveBeenCalledWith('sum');
    expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
    // The ancestor never saw the in-menu click, so nothing re-opened it.
    expect(reopen).not.toHaveBeenCalled();
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

    // Delta-review fix (HIGH): a fresh, unpromoted scratch query chip has no
    // entry in `models`/`sources` yet — before the fix, that fell through to
    // "unresolved" and silently showed MEDIAN even on a MySQL/SQLite draft
    // source. `withDraftSourceType` sets up the draft-only path
    // (`explorerModelStates`/`explorerSources`), never touching the promoted
    // `models`/`sources` collections, so these tests fail on the old code.
    const withDraftSourceType = type => {
      useStore.setState({
        explorerModelStates: {
          orders_q: { sourceName: 'warehouse' },
        },
        explorerSources: [{ source_name: 'warehouse', type }],
      });
    };

    test('draft (unpromoted) query chip: hides MEDIAN for mysql', () => {
      withDraftSourceType('mysql');
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    test('draft (unpromoted) query chip: hides MEDIAN for sqlite', () => {
      withDraftSourceType('sqlite');
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    test('draft (unpromoted) query chip: shows MEDIAN for a supported dialect (snowflake)', () => {
      withDraftSourceType('snowflake');
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu-preset-median')).toBeInTheDocument();
    });

    test('draft (unpromoted) query chip on duckdb: shows MEDIAN (control)', () => {
      withDraftSourceType('duckdb');
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

  describe('"Save as metric…" (Explore 2.0 Phase 4, 06 §4)', () => {
    test('disabled with no onSaveAsMetric handler, even on an aggregate pill', () => {
      render(<PillMenu state={{ kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu-save-as-metric')).toBeDisabled();
    });

    test('disabled on a dimension pill even WITH a handler — only aggregate/custom qualify', () => {
      const onSaveAsMetric = jest.fn();
      render(
        <PillMenu
          state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }}
          onSaveAsMetric={onSaveAsMetric}
        />
      );
      openMenu();
      expect(screen.getByTestId('pill-menu-save-as-metric')).toBeDisabled();
    });

    test('disabled on a metricRef/dimensionRef pill (already durable, nothing to promote)', () => {
      const onSaveAsMetric = jest.fn();
      render(<PillMenu state={{ kind: 'metricRef', ref: 'churn_rate' }} onSaveAsMetric={onSaveAsMetric} />);
      openMenu();
      expect(screen.getByTestId('pill-menu-save-as-metric')).toBeDisabled();
    });

    test('enabled on an aggregate pill WITH a handler; clicking calls it and closes the menu', () => {
      const onSaveAsMetric = jest.fn();
      render(
        <PillMenu
          state={{ kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' }}
          onSaveAsMetric={onSaveAsMetric}
        />
      );
      openMenu();
      const button = screen.getByTestId('pill-menu-save-as-metric');
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      expect(onSaveAsMetric).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
    });

    // ux-audit.md "Save-as-metric flow is solid but 'Save as metric' disabled
    // state gives no visible reason": a native `title` attribute only shows
    // on hover — a visible line is required so the reason isn't invisible
    // until the user happens to hover a greyed-out item.
    test('a disabled "Save as metric…" shows a VISIBLE reason, not just a hover title', () => {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu-save-as-metric-disabled-hint')).toHaveTextContent(
        'Only an aggregate pill'
      );
    });

    test('no visible disabled-reason line once "Save as metric…" is enabled', () => {
      render(
        <PillMenu
          state={{ kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' }}
          onSaveAsMetric={jest.fn()}
        />
      );
      openMenu();
      expect(
        screen.queryByTestId('pill-menu-save-as-metric-disabled-hint')
      ).not.toBeInTheDocument();
    });
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
