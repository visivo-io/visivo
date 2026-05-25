/**
 * LibraryRowFlipPopover behaviour (VIS-776 — refined C-3 flip-card design).
 *
 * The popover renders three sections inside its body:
 *   1. Ancestors  : [type] [name] [icon] rows, right-aligned ladder.
 *   2. Subject    : full-width row with [icon] left, [name] centred,
 *                   [type] right — no THIS pill.
 *   3. Descendants: [icon] [name] [type] rows, left-aligned ladder.
 *
 * The refined ladder + collapse + scroll behaviour replaces the inline
 * chain placeholder that shipped with the original VIS-776; the shared
 * `<MiniLineageCard>` migration still lands with VIS-780 (C-4).
 */
import React from 'react';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import useStore from '../../../../stores/store';
import LibraryRowFlipPopover, {
  buildLineageRelations,
  buildChainFromStore,
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
      csvScriptModels: [],
      localMergeModels: [],
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

describe('LibraryRowFlipPopover (refined C-3 layout)', () => {
  beforeEach(() => {
    seedStore();
  });

  test('renders ancestor rows in [type] [name] [icon] order with dotted lines for direct ancestors', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);

    // Ancestor rows are tagged with data-direction="ancestor".
    const ancestorInsightRow = screen.getByTestId(
      'library-flip-popover-lineage-insight-revenue_breakdown'
    );
    expect(ancestorInsightRow).toHaveAttribute('data-direction', 'ancestor');
    expect(ancestorInsightRow).toHaveAttribute('data-direct', 'true');

    // The model + source rows are transitive ancestors.
    expect(
      screen.getByTestId('library-flip-popover-lineage-model-monthly_revenue')
    ).toHaveAttribute('data-direct', 'false');
    expect(
      screen.getByTestId('library-flip-popover-lineage-source-local_postgres')
    ).toHaveAttribute('data-direct', 'false');

    // Direct ancestors render a dotted connector that drops down to the subject.
    expect(
      screen.getByTestId('library-flip-popover-dotted-revenue_breakdown')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-flip-popover-dotted-cohort_retention')
    ).toBeInTheDocument();
  });

  test('renders the subject row with [icon] left, [name] centred, [type] right and no THIS pill', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const subjectRow = screen.getByTestId('library-flip-popover-lineage-subject');
    expect(subjectRow).toHaveAttribute('data-direction', 'subject');
    expect(subjectRow).toHaveTextContent('revenue_chart');
    // Refined design removes the "THIS" pill in favour of the [type] pill alignment.
    expect(within(subjectRow).queryByText(/this/i)).toBeNull();
    // The [type] pill (exact "chart" — distinct from the name "revenue_chart")
    // is still present on the row.
    expect(within(subjectRow).getByText('chart')).toBeInTheDocument();
  });

  test('renders descendant rows in [icon] [name] [type] order', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const descendantRow = screen.getByTestId(
      'library-flip-popover-lineage-dashboard-exec_kpi_dashboard'
    );
    expect(descendantRow).toHaveAttribute('data-direction', 'descendant');
    expect(descendantRow).toHaveAttribute('data-direct', 'true');
  });

  test('lowest ancestor and first descendant share the same left padding (ladder meet point)', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    // Last ancestor in display order: cohort_retention (direct, sits just above subject).
    const lowestAncestor = screen.getByTestId(
      'library-flip-popover-lineage-insight-cohort_retention'
    );
    const firstDescendant = screen.getByTestId(
      'library-flip-popover-lineage-dashboard-exec_kpi_dashboard'
    );
    expect(lowestAncestor.style.paddingLeft).toBe(firstDescendant.style.paddingLeft);
  });

  test('ancestor rows shift progressively left so the ladder widens toward the subject', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    const topAncestor = screen.getByTestId(
      'library-flip-popover-lineage-source-local_postgres'
    );
    const lowestAncestor = screen.getByTestId(
      'library-flip-popover-lineage-insight-cohort_retention'
    );
    expect(parseInt(topAncestor.style.paddingLeft, 10)).toBeGreaterThan(
      parseInt(lowestAncestor.style.paddingLeft, 10)
    );
  });

  test('clicking the ancestors toggle collapses + re-expands the ancestor ladder', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    expect(
      screen.getByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('library-flip-popover-ancestors-toggle'));
    // Collapsed → ancestor rows are gone, summary chip is shown.
    expect(
      screen.queryByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toBeNull();
    expect(
      screen.getByTestId('library-flip-popover-ancestors')
    ).toHaveAttribute('data-collapsed', 'true');
    // Re-expand restores the rows.
    fireEvent.click(screen.getByTestId('library-flip-popover-ancestors-toggle'));
    expect(
      screen.getByTestId('library-flip-popover-lineage-insight-revenue_breakdown')
    ).toBeInTheDocument();
  });

  test('clicking the descendants toggle collapses the descendant ladder', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    expect(
      screen.getByTestId('library-flip-popover-lineage-dashboard-exec_kpi_dashboard')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('library-flip-popover-descendants-toggle'));
    expect(
      screen.queryByTestId('library-flip-popover-lineage-dashboard-exec_kpi_dashboard')
    ).toBeNull();
    expect(
      screen.getByTestId('library-flip-popover-descendants')
    ).toHaveAttribute('data-collapsed', 'true');
  });

  test('renders the empty body for an object with neither upstream nor downstream', () => {
    render(
      <LibraryRowFlipPopover obj={{ type: 'source', name: 'orphan' }} onClose={jest.fn()} />
    );
    expect(screen.getByTestId('library-flip-popover-empty')).toBeInTheDocument();
  });

  test('still renders the deferred-card footer note pointing at VIS-780', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    expect(screen.getByTestId('library-flip-popover-deferred-note')).toHaveTextContent(
      'VIS-780'
    );
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
    csvScriptModels: [],
    localMergeModels: [],
  });

  test('returns both upstream and downstream relations for a chart', () => {
    const relations = buildLineageRelations(
      { type: 'chart', name: 'revenue_chart' },
      storeApi()
    );
    // Ancestors include the per-insight branch (model + insight) for each direct insight.
    expect(relations.ancestors.map(n => `${n.type}:${n.name}`)).toEqual([
      'source:local_postgres',
      'model:monthly_revenue',
      'insight:revenue_breakdown',
      'model:customers',
      'insight:cohort_retention',
    ]);
    // Direct insights are flagged so the popover can drop a dotted line from them.
    const direct = relations.ancestors.filter(n => n.isDirect).map(n => n.name);
    expect(direct).toEqual(['revenue_breakdown', 'cohort_retention']);
    // Descendants surface the dashboard that contains the chart.
    expect(relations.descendants.map(n => `${n.type}:${n.name}`)).toEqual([
      'dashboard:exec_kpi_dashboard',
    ]);
  });

  test('walks the full downstream subtree from a source', () => {
    const relations = buildLineageRelations(
      { type: 'source', name: 'local_postgres' },
      storeApi()
    );
    expect(relations.ancestors).toEqual([]);
    const byType = relations.descendants.reduce((acc, n) => {
      (acc[n.type] = acc[n.type] || []).push(n.name);
      return acc;
    }, {});
    expect(byType.model.sort()).toEqual(['customers', 'monthly_revenue']);
    expect(byType.insight.sort()).toEqual(['cohort_retention', 'revenue_breakdown']);
    expect(byType.chart).toEqual(['revenue_chart']);
    expect(byType.dashboard).toEqual(['exec_kpi_dashboard']);
    // Only the immediate downstream of the source is flagged as direct.
    const direct = relations.descendants.filter(n => n.isDirect).map(n => n.name).sort();
    expect(direct).toEqual(['customers', 'monthly_revenue']);
  });

  test('legacy buildChainFromStore still returns the ancestor chain', () => {
    const chain = buildChainFromStore({ type: 'chart', name: 'revenue_chart' }, storeApi());
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every(n => typeof n.type === 'string' && typeof n.name === 'string')).toBe(
      true
    );
  });
});
