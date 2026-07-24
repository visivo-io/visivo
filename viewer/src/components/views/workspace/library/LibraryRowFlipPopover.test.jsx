/**
 * LibraryRowFlipPopover behaviour (VIS-776 — refined C-3 flip-card design).
 *
 * Coverage:
 *   - Ancestor + descendant ladders render with the staircase shift.
 *   - Subject row pins icon left / type right, no THIS pill.
 *   - Direct ancestors drop a dotted L connector toward the subject.
 *   - Colours come from `objectTypeConfigs` (so `chart` rows carry the
 *     `bg-pink-100` class, `model` rows carry `bg-amber-100`, etc.).
 *   - Selector input is editable and parses `+N name +M` syntax.
 *   - Collapse + scroll handles complex trees in a small surface.
 *
 * The shared `<MiniLineageCard>` migration still lands with VIS-780.
 */
import React from 'react';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import useStore from '../../../../stores/store';
import LibraryRowFlipPopover, {
  buildLineageRelations,
  parseSelector,
  defaultSelector,
  UNBOUNDED,
} from './LibraryRowFlipPopover';

const SUBJECT_CHART = { type: 'chart', name: 'revenue_chart' };

const seedStore = () => {
  act(() => {
    useStore.setState({
      charts: [
        {
          name: 'revenue_chart',
          child_item_names: ['revenue_breakdown', 'cohort_retention'],
        },
      ],
      insights: [
        { name: 'revenue_breakdown', child_item_names: ['monthly_revenue'] },
        { name: 'cohort_retention', child_item_names: ['customers'] },
      ],
      models: [
        { name: 'monthly_revenue', child_item_names: ['local_postgres'] },
        { name: 'customers', child_item_names: ['local_postgres'] },
      ],
      sources: [{ name: 'local_postgres', child_item_names: [] }],
      tables: [],
      markdowns: [],
      inputs: [],
      dimensions: [],
      metrics: [],
      relations: [],
      allDashboards: [
        {
          name: 'exec_kpi_dashboard',
          rows: [{ items: [{ chart: 'revenue_chart' }] }],
        },
      ],
    });
  });
};

describe('LibraryRowFlipPopover — staircase layout', () => {
  beforeEach(() => {
    seedStore();
  });

  test('renders ancestors above the subject and descendants below, both with direct-flagged rows', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);

    // Direct insights are flagged so the popover drops a dotted line from them.
    expect(
      screen.getByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toHaveAttribute('data-direct', 'true');
    expect(
      screen.getByTestId('library-flip-popover-lineage-insight-cohort_retention')
    ).toHaveAttribute('data-direct', 'true');

    // Transitive ancestors are present but not flagged direct.
    expect(
      screen.getByTestId('library-flip-popover-lineage-model-monthly_revenue')
    ).toHaveAttribute('data-direct', 'false');
    expect(
      screen.getByTestId('library-flip-popover-lineage-source-local_postgres')
    ).toHaveAttribute('data-direct', 'false');

    // Descendant: the dashboard that contains revenue_chart.
    expect(
      screen.getByTestId('library-flip-popover-lineage-dashboard-exec_kpi_dashboard')
    ).toHaveAttribute('data-direct', 'true');

    // Dotted connectors mount once per direct ancestor.
    expect(
      screen.getByTestId('library-flip-popover-dotted-revenue_breakdown')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-flip-popover-dotted-cohort_retention')
    ).toBeInTheDocument();
  });

  test('row colours come from objectTypeConfigs (not hand-rolled hex codes)', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);

    // `chart` carries the shared pink palette; `model` carries amber; `insight`
    // carries purple; `source` carries orange — see objectTypeConfigs.js.
    const subjectRow = screen.getByTestId('library-flip-popover-lineage-subject');
    expect(subjectRow.className).toMatch(/bg-pink-100/);
    expect(within(subjectRow).getByText('chart').className).toMatch(/bg-pink-100/);

    expect(
      within(
        screen.getByTestId('library-flip-popover-lineage-model-monthly_revenue')
      ).getByText('model').className
    ).toMatch(/bg-amber-100/);

    expect(
      within(
        screen.getByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
      ).getByText('insight').className
    ).toMatch(/bg-purple-100/);

    expect(
      within(
        screen.getByTestId('library-flip-popover-lineage-source-local_postgres')
      ).getByText('source').className
    ).toMatch(/bg-orange-100/);

    expect(
      within(
        screen.getByTestId('library-flip-popover-lineage-dashboard-exec_kpi_dashboard')
      ).getByText('dashboard').className
    ).toMatch(/bg-rose-100/);
  });

  test('rows form a staircase — direct ancestor and first descendant share BASE_INDENT', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const lowestAncestor = screen.getByTestId(
      'library-flip-popover-lineage-insight-cohort_retention'
    );
    const firstDescendant = screen.getByTestId(
      'library-flip-popover-lineage-dashboard-exec_kpi_dashboard'
    );
    expect(lowestAncestor.style.marginLeft).toBe(firstDescendant.style.marginLeft);

    // Topmost ancestor (deepest = source) sits further right than the
    // direct insight — that's the staircase widening toward the subject.
    const topAncestor = screen.getByTestId(
      'library-flip-popover-lineage-source-local_postgres'
    );
    expect(parseInt(topAncestor.style.marginLeft, 10)).toBeGreaterThan(
      parseInt(lowestAncestor.style.marginLeft, 10)
    );
  });

  test('subject row pins icon left, type right, name centred, no THIS pill', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const subjectRow = screen.getByTestId('library-flip-popover-lineage-subject');
    expect(subjectRow).toHaveAttribute('data-direction', 'subject');
    expect(subjectRow).toHaveTextContent('revenue_chart');
    expect(within(subjectRow).queryByText(/^this$/i)).toBeNull();
    expect(within(subjectRow).getByText('chart')).toBeInTheDocument();
  });
});

describe('LibraryRowFlipPopover — editable selector', () => {
  beforeEach(() => {
    seedStore();
  });

  test('defaults to `+name+` (unbounded both directions)', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const input = screen.getByTestId('library-flip-popover-selector-input');
    expect(input).toHaveValue('+revenue_chart+');
  });

  test('typing `1+revenue_chart+1` clamps ancestor depth to 1 and descendant to 1', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const input = screen.getByTestId('library-flip-popover-selector-input');
    fireEvent.change(input, { target: { value: '1+revenue_chart+1' } });
    // Direct insights still render, but their parent models + source must NOT.
    expect(
      screen.getByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('library-flip-popover-lineage-model-monthly_revenue')
    ).toBeNull();
    expect(
      screen.queryByTestId('library-flip-popover-lineage-source-local_postgres')
    ).toBeNull();
    // Descendant depth 1 still surfaces the dashboard.
    expect(
      screen.getByTestId('library-flip-popover-lineage-dashboard-exec_kpi_dashboard')
    ).toBeInTheDocument();
  });

  test('typing `revenue_chart` (no plus) hides both ladders', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const input = screen.getByTestId('library-flip-popover-selector-input');
    fireEvent.change(input, { target: { value: 'revenue_chart' } });
    expect(
      screen.queryByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toBeNull();
    expect(
      screen.queryByTestId('library-flip-popover-lineage-dashboard-exec_kpi_dashboard')
    ).toBeNull();
  });

  test('changing the selector to a different object name swaps the subject', () => {
    // Popover opens for revenue_chart; user retypes the selector to
    // `+monthly_revenue+` — the popover should now render
    // monthly_revenue's lineage (its own upstream source + its
    // downstream insight) rather than revenue_chart's.
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const input = screen.getByTestId('library-flip-popover-selector-input');
    fireEvent.change(input, { target: { value: '+monthly_revenue+' } });
    // The header + subject row swap to monthly_revenue.
    expect(screen.getByTestId('library-flip-popover-name')).toHaveTextContent(
      'monthly_revenue'
    );
    const subjectRow = screen.getByTestId('library-flip-popover-lineage-subject');
    expect(subjectRow).toHaveTextContent('monthly_revenue');
    // monthly_revenue's downstream insight surfaces (it didn't before).
    expect(
      screen.getByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toHaveAttribute('data-direction', 'descendant');
    // monthly_revenue's upstream source surfaces as an ancestor.
    expect(
      screen.getByTestId('library-flip-popover-lineage-source-local_postgres')
    ).toHaveAttribute('data-direction', 'ancestor');
  });

  test('selector with an unknown name falls back to the original subject', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const input = screen.getByTestId('library-flip-popover-selector-input');
    fireEvent.change(input, { target: { value: '+definitely_does_not_exist+' } });
    // Header keeps the original row name; the lineage list collapses
    // because the typed name doesn't resolve and the original subject's
    // depth limits still apply (unbounded here).
    expect(screen.getByTestId('library-flip-popover-name')).toHaveTextContent(
      'revenue_chart'
    );
  });
});

describe('LibraryRowFlipPopover — collapse and empty state', () => {
  beforeEach(() => {
    seedStore();
  });

  test('clicking the ancestors toggle collapses + re-expands the ancestor ladder', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    expect(
      screen.getByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('library-flip-popover-ancestors-toggle'));
    expect(
      screen.queryByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toBeNull();
    fireEvent.click(screen.getByTestId('library-flip-popover-ancestors-toggle'));
    expect(
      screen.getByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toBeInTheDocument();
  });

  test('renders the empty body for an object with neither upstream nor downstream', () => {
    render(
      <LibraryRowFlipPopover obj={{ type: 'source', name: 'orphan' }} onClose={jest.fn()} />
    );
    expect(screen.getByTestId('library-flip-popover-empty')).toBeInTheDocument();
  });

  test('footer note advertises opening the full lineage', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    expect(screen.getByTestId('library-flip-popover-deferred-note')).toHaveTextContent(
      'Open full lineage'
    );
  });

  test('Expand button is enabled and opens the subject in the workspace lineage lens', () => {
    const openWorkspaceTab = jest.fn();
    const setWorkspaceLens = jest.fn();
    act(() => {
      useStore.setState({ openWorkspaceTab, setWorkspaceLens });
    });
    const onClose = jest.fn();
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={onClose} />);

    const expand = screen.getByTestId('library-flip-popover-expand');
    expect(expand).not.toBeDisabled();

    fireEvent.click(expand);

    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'chart:revenue_chart',
      type: 'chart',
      name: 'revenue_chart',
    });
    expect(setWorkspaceLens).toHaveBeenCalledWith('lineage');
    expect(onClose).toHaveBeenCalled();
  });

  test('renders into document.body via portal so the rail overflow does not clip it', () => {
    const { container } = render(
      <LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />
    );
    expect(within(container).queryByTestId('library-flip-popover')).toBeNull();
    expect(screen.getByTestId('library-flip-popover')).toBeInTheDocument();
  });

  test('fires onClose when the × button is clicked', () => {
    const onClose = jest.fn();
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('library-flip-popover-close'));
    expect(onClose).toHaveBeenCalled();
  });

  test('Escape key fires onClose', () => {
    const onClose = jest.fn();
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('parseSelector', () => {
  test('`+name+` is unbounded both directions', () => {
    expect(parseSelector('+revenue_chart+', 'revenue_chart')).toEqual({
      name: 'revenue_chart',
      ancestors: UNBOUNDED,
      descendants: UNBOUNDED,
    });
  });

  test('`2+name+1` clamps ancestor depth to 2 and descendant to 1', () => {
    expect(parseSelector('2+revenue_chart+1', 'fallback')).toEqual({
      name: 'revenue_chart',
      ancestors: 2,
      descendants: 1,
    });
  });

  test('`2+name+` clamps ancestor depth to 2 and leaves descendants unbounded', () => {
    expect(parseSelector('2+revenue_chart+', 'fallback')).toEqual({
      name: 'revenue_chart',
      ancestors: 2,
      descendants: UNBOUNDED,
    });
  });

  test('`+name` is unbounded ancestors only', () => {
    expect(parseSelector('+revenue_chart', 'fallback')).toEqual({
      name: 'revenue_chart',
      ancestors: UNBOUNDED,
      descendants: 0,
    });
  });

  test('`name+` is unbounded descendants only', () => {
    expect(parseSelector('revenue_chart+', 'fallback')).toEqual({
      name: 'revenue_chart',
      ancestors: 0,
      descendants: UNBOUNDED,
    });
  });

  test('`name` returns just the subject', () => {
    expect(parseSelector('revenue_chart', 'fallback')).toEqual({
      name: 'revenue_chart',
      ancestors: 0,
      descendants: 0,
    });
  });

  test('empty string falls back to the supplied default', () => {
    expect(parseSelector('', 'fallback')).toEqual({
      name: 'fallback',
      ancestors: 0,
      descendants: 0,
    });
  });
});

describe('buildLineageRelations', () => {
  beforeEach(() => {
    seedStore();
  });

  const storeApi = () => ({
    charts: useStore.getState().charts,
    insights: useStore.getState().insights,
    models: useStore.getState().models,
    tables: useStore.getState().tables,
    sources: useStore.getState().sources,
    dimensions: useStore.getState().dimensions,
    metrics: useStore.getState().metrics,
    relations: useStore.getState().relations,
    markdowns: useStore.getState().markdowns,
    inputs: useStore.getState().inputs,
    allDashboards: useStore.getState().allDashboards,
  });

  test('returns both upstream and downstream relations for a chart with default unbounded scope', () => {
    const relations = buildLineageRelations(
      { type: 'chart', name: 'revenue_chart' },
      storeApi()
    );
    expect(relations.ancestors.map(n => `${n.type}:${n.name}`)).toEqual([
      'source:local_postgres',
      'model:monthly_revenue',
      'insight:revenue_breakdown',
      'model:customers',
      'insight:cohort_retention',
    ]);
    expect(relations.descendants.map(n => `${n.type}:${n.name}`)).toEqual([
      'dashboard:exec_kpi_dashboard',
    ]);
  });

  test('ancestor depth limit excludes deeper ancestors', () => {
    const relations = buildLineageRelations(
      { type: 'chart', name: 'revenue_chart' },
      storeApi(),
      { ancestors: 1, descendants: UNBOUNDED }
    );
    expect(relations.ancestors.map(n => n.type).sort()).toEqual(['insight', 'insight']);
  });

  test('flags terminal ancestors (no upstream of their own) for layout bumping', () => {
    // Seed: insight has both a model AND an input as direct ancestors.
    // The model has a source upstream → not terminal. The input has
    // nothing upstream → terminal. Both are at depth 1.
    act(() => {
      useStore.setState({
        ...useStore.getState(),
        charts: [],
        insights: [
          {
            name: 'date_insight',
            child_item_names: ['daily_metrics', 'autocomplete_date'],
          },
        ],
        models: [{ name: 'daily_metrics', child_item_names: ['local_postgres'] }],
        sources: [{ name: 'local_postgres', child_item_names: [] }],
        inputs: [{ name: 'autocomplete_date', child_item_names: [] }],
      });
    });
    const relations = buildLineageRelations(
      { type: 'insight', name: 'date_insight' },
      storeApi()
    );
    const model = relations.ancestors.find(n => n.name === 'daily_metrics');
    const input = relations.ancestors.find(n => n.name === 'autocomplete_date');
    const source = relations.ancestors.find(n => n.name === 'local_postgres');
    expect(model.isTerminal).toBe(false); // has source upstream
    expect(input.isTerminal).toBe(true);  // nothing upstream
    expect(source.isTerminal).toBe(true);
  });
});

describe('default selector helper', () => {
  test('formats a name into `+name+`', () => {
    expect(defaultSelector('revenue_chart')).toBe('+revenue_chart+');
  });
});
