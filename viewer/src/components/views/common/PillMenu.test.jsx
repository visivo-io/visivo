/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import PillMenu, { usePillDialect } from './PillMenu';
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

  test('the header shows just the ref (no ▸ separator) when the pill has no bound column', () => {
    render(<PillMenu state={{ kind: 'metricRef', ref: 'churn_rate' }} />);
    openMenu();
    expect(screen.getByText('churn_rate')).toBeInTheDocument();
    expect(screen.queryByText(/▸/)).not.toBeInTheDocument();
  });

  test('the kind subtitle falls back to "Field" for an unrecognized/absent kind', () => {
    render(<PillMenu state={{ ref: 'orders_q', column: 'x' }} />);
    openMenu();
    expect(screen.getByText('Field')).toBeInTheDocument();
  });

  test('an aggregate pill with no agg set yet shows the bare "Aggregate" subtitle (no "(SUM)" suffix)', () => {
    render(<PillMenu state={{ kind: 'aggregate', ref: 'orders_q', column: 'amount' }} />);
    openMenu();
    expect(screen.getByText('Aggregate')).toBeInTheDocument();
  });

  test('an unrecognized agg key falls back to its own raw string rather than a blank AGG_LABELS lookup', () => {
    render(
      <PillMenu state={{ kind: 'aggregate', agg: 'some_custom_agg', ref: 'orders_q', column: 'amount' }} />
    );
    openMenu();
    expect(screen.getByText('Aggregate (some_custom_agg)')).toBeInTheDocument();
  });

  test('renders without crashing and shows the "Field" fallback when no state prop is passed at all', () => {
    render(<PillMenu />);
    openMenu();
    expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
    expect(screen.getByText('Field')).toBeInTheDocument();
  });

  // T4 (pills-buildrail #10): exposes an imperative `open()` so the pill
  // BODY (not just this chevron) can also open the menu (`PropertyRow` holds
  // a ref and calls it from the pill's own onClick).
  test('exposes an imperative open() via ref, so a caller besides the chevron can open the menu', () => {
    const ref = React.createRef();
    render(<PillMenu ref={ref} state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
    expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
    act(() => {
      ref.current.open();
    });
    expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
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

  test('clicking "Dimension" itself calls onSelectPreset(\'dimension\') and closes the menu', () => {
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

  describe('usePillDialect (every resolution branch, S5 §4)', () => {
    test('returns undefined for a null/undefined state', () => {
      const { result } = renderHook(() => usePillDialect(null));
      expect(result.current).toBeUndefined();
    });

    test('metricRef: resolves the model via the metric record\'s parentModel', () => {
      useStore.setState({
        metrics: [{ name: 'churn_rate', parentModel: 'ref(orders_q)' }],
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', type: 'snowflake' }],
      });
      const { result } = renderHook(() => usePillDialect({ kind: 'metricRef', ref: 'churn_rate' }));
      expect(result.current).toBe('snowflake');
    });

    test('metricRef: falls back to record.config.model when parentModel is absent', () => {
      useStore.setState({
        metrics: [{ name: 'churn_rate', config: { model: 'ref(orders_q)' } }],
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', type: 'mysql' }],
      });
      const { result } = renderHook(() => usePillDialect({ kind: 'metricRef', ref: 'churn_rate' }));
      expect(result.current).toBe('mysql');
    });

    test('dimensionRef: resolves via the dimensions collection (not metrics)', () => {
      useStore.setState({
        dimensions: [{ name: 'region', parentModel: 'ref(orders_q)' }],
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', type: 'sqlite' }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimensionRef', ref: 'region' })
      );
      expect(result.current).toBe('sqlite');
    });

    test('metricRef with no matching record at all resolves to undefined (fails open)', () => {
      useStore.setState({ metrics: [] });
      const { result } = renderHook(() => usePillDialect({ kind: 'metricRef', ref: 'ghost' }));
      expect(result.current).toBeUndefined();
    });

    test('model matched via the LEGACY model.source field (not model.config.source)', () => {
      useStore.setState({
        models: [{ name: 'orders_q', source: '${ref(warehouse)}' }],
        sources: [{ name: 'warehouse', type: 'mysql' }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBe('mysql');
    });

    test('source matched via source_name (not name) when name doesn\'t match', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ source_name: 'warehouse', type: 'sqlite' }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBe('sqlite');
    });

    test('source type resolved via src.config.type (not src.type)', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', config: { type: 'mysql' } }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBe('mysql');
    });

    test('normalizes "postgresql" to "postgres"', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse', type: 'postgresql' }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBe('postgres');
    });

    test('a matched model whose source has no resolvable type falls through to the draft-source path', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'warehouse' }], // no `type` and no `config.type`
        explorerModelStates: { orders_q: { sourceName: 'draft_src' } },
        explorerSources: [{ source_name: 'draft_src', type: 'snowflake' }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBe('snowflake');
    });

    test('a model name with no matching model record at all falls through to the draft-source path', () => {
      useStore.setState({
        models: [],
        explorerModelStates: { orders_q: { sourceName: 'draft_src' } },
        explorerSources: [{ source_name: 'draft_src', type: 'mysql' }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBe('mysql');
    });

    test('fails safe when the metrics/dimensions collection itself is undefined (not just empty)', () => {
      useStore.setState({ metrics: undefined });
      const { result } = renderHook(() => usePillDialect({ kind: 'metricRef', ref: 'churn_rate' }));
      expect(result.current).toBeUndefined();
    });

    test('fails safe when the models collection itself is undefined (not just empty)', () => {
      useStore.setState({ models: undefined });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBeUndefined();
    });

    test('fails safe when the sources collection itself is undefined (not just empty)', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: undefined,
        explorerModelStates: { orders_q: { sourceName: 'draft_src' } },
        explorerSources: [{ source_name: 'draft_src', type: 'mysql' }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBe('mysql');
    });

    test('a decoy source matching neither name nor source_name is skipped (falls through to the draft path)', () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: '${ref(warehouse)}' } }],
        sources: [{ name: 'unrelated_source', source_name: 'also_unrelated', type: 'mysql' }],
        explorerModelStates: { orders_q: { sourceName: 'draft_src' } },
        explorerSources: [{ source_name: 'draft_src', type: 'snowflake' }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBe('snowflake');
    });

    test('a matched model with no source binding at all falls through to the draft-source path', () => {
      useStore.setState({
        models: [{ name: 'orders_q' }], // no `source`, no `config.source`
        explorerModelStates: { orders_q: { sourceName: 'draft_src' } },
        explorerSources: [{ source_name: 'draft_src', type: 'sqlite' }],
      });
      const { result } = renderHook(() =>
        usePillDialect({ kind: 'dimension', ref: 'orders_q', column: 'x' })
      );
      expect(result.current).toBe('sqlite');
    });
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

  describe('popover dismissal + keyboard (outside-click handler, T4 pills-buildrail #5)', () => {
    test('a mousedown OUTSIDE both the popover and the trigger closes the menu', () => {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
    });

    test('a mousedown INSIDE the popover does not close it', () => {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      fireEvent.mouseDown(screen.getByTestId('pill-menu'));
      expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
    });

    test('a mousedown on the trigger itself does not close the menu via the outside-click handler', () => {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      fireEvent.mouseDown(screen.getByTestId('pill-menu-trigger'));
      expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
    });

    // React portals bubble through the REACT tree, not the DOM tree (see the
    // component's own comment) — `stopPropagation` here guards a React
    // ancestor's onKeyDown, which a raw `addEventListener` on `document.body`
    // can't observe either way. This just pins that a keydown inside the
    // popover is handled without throwing and never closes/breaks it.
    test('a keydown inside the popover is handled without closing or crashing it', () => {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      fireEvent.keyDown(screen.getByTestId('pill-menu'), { key: 'ArrowDown' });
      expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
    });
  });

  // T4 (pills-buildrail #5): the popover flips to open UPWARD when its
  // measured height would overflow the viewport bottom.
  test('flips the popover to open upward when it would overflow the viewport bottom', () => {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const originalInnerHeight = window.innerHeight;
    let callCount = 0;
    Element.prototype.getBoundingClientRect = jest.fn(function mockRect() {
      callCount += 1;
      // The trigger's own rect (read by `menuStyle`) — near the bottom of a
      // short viewport, so the popover's guessed downward position overflows.
      if (callCount === 1) {
        return { top: 700, bottom: 720, left: 100, right: 120, width: 20, height: 20 };
      }
      // The popover container's own rect, measured in the flip-check effect.
      return { top: 704, bottom: 900, left: 100, right: 364, width: 264, height: 196 };
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });

    try {
      render(<PillMenu state={{ kind: 'dimension', ref: 'orders_q', column: 'region' }} />);
      openMenu();
      const popover = screen.getByTestId('pill-menu');
      // Flipped upward: computed top is well above the trigger's own top (700).
      expect(parseFloat(popover.style.top)).toBeLessThan(700);
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });
});
