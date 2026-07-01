/**
 * MiniLineageCard behaviour (VIS-780 / Track C C-4 — shared lineage-card body).
 *
 * This is the lineage-ladder body extracted out of <LibraryRowFlipPopover> so
 * the Library row flip and the canvas item flip render ONE shared card. The
 * popover's own suite (LibraryRowFlipPopover.test.jsx) covers anchoring +
 * portal + close-on-outside-click; this suite locks the CARD itself:
 *
 *   - Ancestor + descendant ladders render with the staircase shift.
 *   - Subject row pins icon left / type right.
 *   - Colours come from `objectTypeConfigs`.
 *   - Selector input is editable and parses `+N name +M` syntax.
 *   - Header / footer can be toggled off for embedded use.
 *   - `onExpand` override is honored (so a host without the workspace lens can
 *     route Expand its own way).
 */
import React from 'react';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import useStore from '../../../../stores/store';
import MiniLineageCard, {
  buildLineageRelations,
  parseSelector,
  defaultSelector,
  UNBOUNDED,
} from './MiniLineageCard';

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
      dashboards: [],
      defaults: { source_name: 'local_postgres' },
      fetchDashboards: jest.fn(),
      fetchDefaults: jest.fn(),
      openWorkspaceTab: jest.fn(),
      setWorkspaceLens: jest.fn(),
      setWorkspaceLensIntent: jest.fn(),
    });
  });
};

beforeEach(seedStore);

describe('parseSelector (VIS-780)', () => {
  test('default unbounded both directions', () => {
    expect(parseSelector('+revenue_chart+', 'revenue_chart')).toEqual({
      name: 'revenue_chart',
      ancestors: UNBOUNDED,
      descendants: UNBOUNDED,
    });
  });

  test('clamps depths via leading/trailing digits', () => {
    expect(parseSelector('2+revenue_chart+1', 'revenue_chart')).toEqual({
      name: 'revenue_chart',
      ancestors: 2,
      descendants: 1,
    });
  });

  test('no plus → no traversal in that direction', () => {
    expect(parseSelector('revenue_chart', 'revenue_chart')).toEqual({
      name: 'revenue_chart',
      ancestors: 0,
      descendants: 0,
    });
  });

  test('defaultSelector wraps the name in both-direction pluses', () => {
    expect(defaultSelector('foo')).toBe('+foo+');
  });
});

describe('buildLineageRelations (VIS-780)', () => {
  test('walks ancestors + descendants from the store', () => {
    const { ancestors, descendants } = buildLineageRelations(
      SUBJECT_CHART,
      {
        charts: useStore.getState().charts,
        insights: useStore.getState().insights,
        models: useStore.getState().models,
        sources: useStore.getState().sources,
        tables: [],
        markdowns: [],
        inputs: [],
        dimensions: [],
        metrics: [],
        relations: [],
        csvScriptModels: [],
        localMergeModels: [],
        allDashboards: useStore.getState().allDashboards,
        defaults: { source_name: 'local_postgres' },
      },
      { ancestors: UNBOUNDED, descendants: UNBOUNDED }
    );
    const ancNames = ancestors.map(a => a.name);
    expect(ancNames).toEqual(expect.arrayContaining(['revenue_breakdown', 'monthly_revenue']));
    const descNames = descendants.map(d => d.name);
    expect(descNames).toEqual(expect.arrayContaining(['exec_kpi_dashboard']));
  });
});

describe('MiniLineageCard rendering (VIS-780)', () => {
  test('renders the subject row + ancestor ladder', () => {
    render(<MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" />);
    expect(screen.getByTestId('mlc-lineage-subject')).toHaveTextContent('revenue_chart');
    expect(screen.getByTestId('mlc-lineage-insight-revenue_breakdown')).toBeInTheDocument();
  });

  test('subject pill colour comes from objectTypeConfigs (chart → bg-pink-100)', () => {
    render(<MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" />);
    expect(screen.getByTestId('mlc-lineage-subject').className).toContain('bg-pink-100');
  });

  test('selector input is editable', () => {
    render(<MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" />);
    const input = screen.getByTestId('mlc-selector-input');
    expect(input).toHaveValue('+revenue_chart+');
    fireEvent.change(input, { target: { value: '1+revenue_chart' } });
    expect(input).toHaveValue('1+revenue_chart');
  });

  test('header + footer can be hidden for embedded use', () => {
    render(
      <MiniLineageCard
        obj={SUBJECT_CHART}
        testIdPrefix="mlc"
        showHeader={false}
        showFooter={false}
      />
    );
    expect(screen.queryByTestId('mlc-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mlc-expand')).not.toBeInTheDocument();
    // Body still renders.
    expect(screen.getByTestId('mlc-lineage-subject')).toBeInTheDocument();
  });

  test('default Expand opens the tab AND requests the Lineage lens for the subject', () => {
    render(<MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" onClose={jest.fn()} />);
    fireEvent.click(screen.getByTestId('mlc-expand'));

    const state = useStore.getState();
    expect(state.openWorkspaceTab).toHaveBeenCalledWith({
      id: 'chart:revenue_chart',
      type: 'chart',
      name: 'revenue_chart',
    });
    // PerObjectPane ignores the store lens, so the one-shot object-scoped
    // intent is what actually lands a previewable subject on Lineage.
    expect(state.setWorkspaceLensIntent).toHaveBeenCalledWith({
      objectKey: 'chart:revenue_chart',
      lens: 'lineage',
    });
    expect(state.setWorkspaceLens).toHaveBeenCalledWith('lineage');
  });

  test('onExpand override is invoked with the subject (instead of workspace lens)', () => {
    const onExpand = jest.fn();
    const onClose = jest.fn();
    render(
      <MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" onExpand={onExpand} onClose={onClose} />
    );
    fireEvent.click(screen.getByTestId('mlc-expand'));
    expect(onExpand).toHaveBeenCalledWith(expect.objectContaining({ name: 'revenue_chart' }));
    expect(onClose).toHaveBeenCalled();
    // The store-driven lens path must NOT fire when onExpand is provided.
    expect(useStore.getState().setWorkspaceLens).not.toHaveBeenCalled();
  });

  test('close button only renders when onClose is provided', () => {
    const { rerender } = render(<MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" />);
    expect(screen.queryByTestId('mlc-close')).not.toBeInTheDocument();
    rerender(<MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" onClose={jest.fn()} />);
    expect(screen.getByTestId('mlc-close')).toBeInTheDocument();
  });

  test('empty lineage shows the empty state', () => {
    render(<MiniLineageCard obj={{ type: 'chart', name: 'orphan_chart' }} testIdPrefix="mlc" />);
    expect(screen.getByTestId('mlc-empty')).toBeInTheDocument();
  });

  test('ancestor + descendant rows use type colours from objectTypeConfigs', () => {
    render(<MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" />);
    const insightRow = screen.getByTestId('mlc-lineage-insight-revenue_breakdown');
    expect(within(insightRow).getByText('insight')).toBeInTheDocument();
  });
});

describe('MiniLineageCard lazy collection fetch on mount (View-mode fix)', () => {
  // In View mode the render-only <Dashboard> only fetches a subset of
  // collections, so the chart→insight→model→source walk dead-ends. The card's
  // one-shot mount pass lazy-fetches every EMPTY collection the walker reads.
  const makeFetchSpies = () => ({
    fetchCharts: jest.fn(),
    fetchInsights: jest.fn(),
    fetchModels: jest.fn(),
    fetchTables: jest.fn(),
    fetchSources: jest.fn(),
    fetchDimensions: jest.fn(),
    fetchMetrics: jest.fn(),
    fetchRelations: jest.fn(),
    fetchDashboards: jest.fn(),
    fetchDefaults: jest.fn(),
  });

  test('fetches every empty collection on mount (View mode)', () => {
    const spies = makeFetchSpies();
    act(() => {
      useStore.setState({
        charts: [],
        insights: [],
        models: [],
        tables: [],
        sources: [],
        dimensions: [],
        metrics: [],
        relations: [],
        markdowns: [],
        inputs: [],
        csvScriptModels: [],
        localMergeModels: [],
        allDashboards: [],
        dashboards: [],
        defaults: null,
        openWorkspaceTab: jest.fn(),
        setWorkspaceLens: jest.fn(),
        ...spies,
      });
    });
    render(<MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" />);
    expect(spies.fetchCharts).toHaveBeenCalledTimes(1);
    expect(spies.fetchInsights).toHaveBeenCalledTimes(1);
    expect(spies.fetchModels).toHaveBeenCalledTimes(1);
    expect(spies.fetchTables).toHaveBeenCalledTimes(1);
    expect(spies.fetchSources).toHaveBeenCalledTimes(1);
    expect(spies.fetchDimensions).toHaveBeenCalledTimes(1);
    expect(spies.fetchMetrics).toHaveBeenCalledTimes(1);
    expect(spies.fetchRelations).toHaveBeenCalledTimes(1);
    expect(spies.fetchDashboards).toHaveBeenCalledTimes(1);
    expect(spies.fetchDefaults).toHaveBeenCalledTimes(1);
  });

  test('does NOT re-fetch populated collections on mount (Workspace)', () => {
    // The default seedStore() populates charts/insights/models/sources/etc, so
    // the lazy fetch must be a no-op there. Re-seed with explicit spies.
    const spies = makeFetchSpies();
    act(() => {
      useStore.setState({
        charts: [{ name: 'revenue_chart', child_item_names: ['revenue_breakdown'] }],
        insights: [{ name: 'revenue_breakdown', child_item_names: ['monthly_revenue'] }],
        models: [{ name: 'monthly_revenue', child_item_names: ['local_postgres'] }],
        tables: [{ name: 't' }],
        sources: [{ name: 'local_postgres', child_item_names: [] }],
        dimensions: [{ name: 'd' }],
        metrics: [{ name: 'm' }],
        relations: [{ name: 'r' }],
        markdowns: [],
        inputs: [],
        csvScriptModels: [],
        localMergeModels: [],
        allDashboards: [{ name: 'dash', rows: [] }],
        dashboards: [{ name: 'dash', config: { rows: [] } }],
        defaults: { source_name: 'local_postgres' },
        openWorkspaceTab: jest.fn(),
        setWorkspaceLens: jest.fn(),
        ...spies,
      });
    });
    render(<MiniLineageCard obj={SUBJECT_CHART} testIdPrefix="mlc" />);
    expect(spies.fetchCharts).not.toHaveBeenCalled();
    expect(spies.fetchInsights).not.toHaveBeenCalled();
    expect(spies.fetchModels).not.toHaveBeenCalled();
    expect(spies.fetchTables).not.toHaveBeenCalled();
    expect(spies.fetchSources).not.toHaveBeenCalled();
    expect(spies.fetchDimensions).not.toHaveBeenCalled();
    expect(spies.fetchMetrics).not.toHaveBeenCalled();
    expect(spies.fetchRelations).not.toHaveBeenCalled();
    expect(spies.fetchDashboards).not.toHaveBeenCalled();
    expect(spies.fetchDefaults).not.toHaveBeenCalled();
  });
});
