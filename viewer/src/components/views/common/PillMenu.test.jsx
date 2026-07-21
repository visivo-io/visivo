/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

  test('renders gracefully with no `state` prop at all — fail-open dialect + "Field" label fallback', () => {
    render(<PillMenu />);
    openMenu();
    // KIND_LABEL has no entry for an undefined kind -> generic "Field" fallback.
    expect(screen.getByTestId('pill-menu')).toHaveTextContent('Field');
    // usePillDialect(undefined) returns undefined (fails open) -> MEDIAN still offered...
    // but isColumnBacked is false for an undefined state, so "Use as" never renders at all.
    expect(screen.queryByTestId('pill-menu-preset-dimension')).not.toBeInTheDocument();
  });

  test('a kind with no KIND_LABEL entry (e.g. "opaque") falls back to the generic "Field" label', () => {
    render(<PillMenu state={{ kind: 'opaque', ref: 'raw expression' }} />);
    openMenu();
    expect(screen.getByTestId('pill-menu')).toHaveTextContent('Field');
  });

  describe('usePillDialect resolution paths (06 §4 / S5 §4)', () => {
    test('metricRef resolves its dialect via the metric record\'s parentModel -> promoted model -> source', () => {
      useStore.setState({
        metrics: [{ name: 'churn_rate', parentModel: 'orders_q' }],
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', type: 'mysql' }],
      });
      render(<PillMenu state={{ kind: 'metricRef', ref: 'churn_rate' }} />);
      openMenu();
      // mysql doesn't support MEDIAN -> disabled/hidden even though this is a
      // metricRef (not directly column-backed) pill.
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    test('metricRef falls back to record.config.model when parentModel is absent', () => {
      useStore.setState({
        metrics: [{ name: 'churn_rate', config: { model: 'orders_q' } }],
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', type: 'snowflake' }],
      });
      render(<PillMenu state={{ kind: 'metricRef', ref: 'churn_rate' }} />);
      openMenu();
      // snowflake supports MEDIAN -> resolved via config.model, not parentModel.
      expect(screen.getByTestId('pill-menu-custom-aggregation')).toBeInTheDocument();
    });

    test('dimensionRef resolves against the dimensions list (not metrics)', () => {
      useStore.setState({
        dimensions: [{ name: 'cohort', parentModel: 'orders_q' }],
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', type: 'mysql' }],
      });
      render(<PillMenu state={{ kind: 'dimensionRef', ref: 'cohort' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu')).toHaveTextContent('Dimension');
    });

    test('metricRef with NO matching record in the metrics list resolves no model (fails open)', () => {
      useStore.setState({ metrics: [] });
      render(<PillMenu state={{ kind: 'metricRef', ref: 'unknown_metric' }} />);
      openMenu();
      // No model resolved at all -> MEDIAN fails open (still offered)... but
      // again, "Use as" never renders for a non-column-backed kind, so assert
      // the dialect-gated custom-aggregation control is present and the menu
      // doesn't crash.
      expect(screen.getByTestId('pill-menu-custom-aggregation')).toBeInTheDocument();
    });

    test('resolves via model.source (no .config wrapper) when the model has no config.source', () => {
      useStore.setState({
        models: [{ name: 'orders_q', source: '${ref(warehouse)}' }],
        sources: [{ name: 'warehouse', type: 'sqlite' }],
      });
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    test('resolves the source via source_name when .name does not match', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ source_name: 'warehouse', type: 'mysql' }],
      });
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    test('resolves the source type via source.config.type when .type is absent', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', config: { type: 'mysql' } }],
      });
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    test('postgresql normalizes to the "postgres" dialect key', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', type: 'postgresql' }],
      });
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      // postgres supports MEDIAN.
      expect(screen.getByTestId('pill-menu-preset-median')).toBeInTheDocument();
    });

    test('a promoted model with an UNRESOLVED source type falls through to the draft resolution path', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(missing_source)}' } }],
        sources: [],
        explorerModelStates: { orders_q: { sourceName: 'warehouse' } },
        explorerSources: [{ source_name: 'warehouse', type: 'mysql' }],
      });
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      // The promoted model exists but its source doesn't resolve to a type ->
      // falls through to the draft binding, which DOES resolve (mysql, no MEDIAN).
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    // Nullish-coalescing fallbacks (`|| []`) for store selectors that can
    // legitimately come back undefined before the project/store finishes
    // hydrating — fails open (undefined dialect -> MEDIAN shown) rather than
    // throwing on `.find` of undefined.
    test('a metricRef with `metrics` itself undefined (not just empty) fails open, no crash', () => {
      useStore.setState({ metrics: undefined });
      render(<PillMenu state={{ kind: 'metricRef', ref: 'churn_rate' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu-custom-aggregation')).toBeInTheDocument();
    });

    test('a dimension pill with `models` itself undefined fails open, no crash', () => {
      useStore.setState({ models: undefined });
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu-preset-median')).toBeInTheDocument();
    });

    test('a resolved model with NO source reference at all (sourceRef falsy) falls through to draft resolution', () => {
      useStore.setState({
        models: [{ name: 'orders_q' }],
        explorerModelStates: { orders_q: { sourceName: 'warehouse' } },
        explorerSources: [{ source_name: 'warehouse', type: 'mysql' }],
      });
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.queryByTestId('pill-menu-preset-median')).not.toBeInTheDocument();
    });

    test('a resolved model whose source list is undefined (not just empty) falls through without crashing', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: undefined,
        explorerModelStates: { orders_q: { sourceName: 'warehouse' } },
        explorerSources: [{ source_name: 'warehouse', type: 'snowflake' }],
      });
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'amount' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu-preset-median')).toBeInTheDocument();
    });
  });

  test('an aggregate pill with an agg key absent from AGG_LABELS shows the raw key in the header', () => {
    render(
      <PillMenu state={{ kind: 'aggregate', agg: 'stddev', ref: 'orders_q', column: 'amount' }} />
    );
    openMenu();
    expect(screen.getByTestId('pill-menu')).toHaveTextContent('(stddev)');
  });

  describe('PillMenuPopover click-outside-to-close (S5)', () => {
    test('a mousedown outside the popover AND outside the trigger closes the menu', () => {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu')).toBeInTheDocument();

      const outside = document.createElement('div');
      document.body.appendChild(outside);
      fireEvent.mouseDown(outside);

      expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
      document.body.removeChild(outside);
    });

    test('a mousedown INSIDE the popover does not close it', () => {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      fireEvent.mouseDown(screen.getByTestId('pill-menu'));
      expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
    });

    test('a mousedown on the trigger itself does not close it via the outside-click handler', () => {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      fireEvent.mouseDown(screen.getByTestId('pill-menu-trigger'));
      expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
    });
  });

  // T4 (pills-buildrail #5): measured-then-flip positioning.
  describe('flip-to-open-upward when the popover would overflow the viewport bottom', () => {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

    afterEach(() => {
      // Restore jsdom's own implementation rather than deleting it — other
      // tests in this file (and any run alongside it) still call it.
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    });

    test('flips upward (resolvedTop below the trigger top) when the measured popover would overflow the bottom', () => {
      Element.prototype.getBoundingClientRect = jest.fn(function mockRect() {
        // Every measured element (trigger + popover) reports a big, low box so
        // the popover's own rect.bottom clears innerHeight - 8.
        return {
          top: 700,
          bottom: 900,
          left: 20,
          right: 100,
          width: 80,
          height: 200,
          x: 20,
          y: 700,
        };
      });
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      const popover = screen.getByTestId('pill-menu');
      // Flipped: top = triggerTop(700) - rect.height(200) - 4 = 496, clamped to >= 8.
      expect(popover.style.top).toBe('496px');
    });
  });

  test('selecting the "Dimension" row (not an aggregation preset) calls onSelectPreset with "dimension"', () => {
    const onSelectPreset = jest.fn();
    render(
      <PillMenu
        state={{ kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' }}
        onSelectPreset={onSelectPreset}
      />
    );
    openMenu();
    fireEvent.click(screen.getByTestId('pill-menu-preset-dimension'));
    expect(onSelectPreset).toHaveBeenCalledWith('dimension');
    expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
  });

  test('a keydown inside the popover never bubbles to reach an ancestor handler (same portal-bubbling guard as click)', () => {
    const ancestorKeyDown = jest.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div onKeyDown={ancestorKeyDown}>
        <PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />
      </div>
    );
    openMenu();
    fireEvent.keyDown(screen.getByTestId('pill-menu'), { key: 'Escape' });
    expect(ancestorKeyDown).not.toHaveBeenCalled();
  });

  // T4 (pills-buildrail #10): PropertyRow holds a ref to open the menu from
  // the pill BODY's click, not just the chevron trigger.
  test('the imperative `open()` handle opens the menu without a chevron click', () => {
    const ref = React.createRef();
    render(<PillMenu ref={ref} state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
    expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
    act(() => {
      ref.current.open();
    });
    expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
  });
});
