/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerChartPreview from './ExplorerChartPreview';
import useStore from '../../stores/store';
import useDraftInsightPreview from '../../hooks/useDraftInsightPreview';
import {
  markExplorationCreated,
  setWorkspaceTelemetryListener,
} from '../views/workspace/telemetry';
import { buildInsightFreshnessSignature } from '../../utils/insightFreshnessSignature';

// Explore 2.0 Phase 4: ExplorerChartPreview no longer builds the dead
// context_objects preview-job request — it drives `useDraftInsightPreview`
// (the client-side compile-draft + DuckDB lane) directly. Mocked here since
// its own behavior is unit-tested in `hooks/useDraftInsightPreview.test.js`.
jest.mock('../../hooks/useDraftInsightPreview', () => ({
  __esModule: true,
  default: jest.fn(),
  draftInsightKey: name => `__draft__:${name}`,
}));

// The promoted-lane poll (integration-gate fix cycle): mocked here since its
// own behavior is unit-tested in `hooks/useInsightsData.test.js` — this
// suite only cares that ExplorerChartPreview calls it with the right
// promoted-name subset and switches `insightKeys` once real data lands.
jest.mock('../../hooks/useInsightsData', () => ({
  useInsightsData: jest.fn(() => ({})),
}));

jest.mock('../views/workspace/usePreviewInputDependencies', () => ({
  usePreviewInputDependencies: jest.fn(() => ({ inputConfigs: [], unresolvedNames: [] })),
}));

jest.mock('../views/workspace/PreviewInputControls', () => {
  return function MockPreviewInputControls({ inputConfigs }) {
    return <div data-testid="preview-input-controls">{JSON.stringify(inputConfigs)}</div>;
  };
});

jest.mock('../views/common/ChartPreview', () => {
  return function MockChartPreview({ chartConfig, insightKeys, projectId, isLoading, error }) {
    return (
      <div data-testid="chart-preview-component">
        <span data-testid="cp-chart-name">{chartConfig?.name}</span>
        <span data-testid="cp-insight-keys">{JSON.stringify(insightKeys)}</span>
        <span data-testid="cp-project-id">{projectId}</span>
        <span data-testid="cp-layout">{JSON.stringify(chartConfig?.layout)}</span>
        <span data-testid="cp-is-loading">{String(isLoading)}</span>
        <span data-testid="cp-error">{error || ''}</span>
      </div>
    );
  };
});

const { usePreviewInputDependencies } = jest.requireMock(
  '../views/workspace/usePreviewInputDependencies'
);

const defaultDraftPreview = {
  previewInsightKeys: ['__draft__:ins_1'],
  perInsight: {},
  isLoading: false,
  error: null,
  blockedReason: null,
  blockedModel: null,
};

const defaultState = {
  explorerInsightStates: {
    ins_1: {
      type: 'scatter',
      props: { x: '?{${ref(sales).date}}', y: '?{${ref(sales).amount}}' },
      interactions: [],
    },
  },
  explorerChartInsightNames: ['ins_1'],
  explorerChartName: 'test_chart',
  explorerChartLayout: {},
  project: { id: 'proj-1' },
  setChartLayout: layout => useStore.setState({ explorerChartLayout: layout }),
  // Neither promoted yet by default — every test starts on the pure draft
  // lane unless it explicitly opts into the promoted-lane-switch scenario.
  insights: [],
  insightJobs: {},
  // VIS-1091 — lane detection is scoped to the ACTIVE exploration's own
  // promoted[] trail. This component only ever mounts while an exploration
  // tab is active, so every test seeds one (with an empty trail by default).
  workspaceActiveObject: { type: 'exploration', name: 'exp_1' },
  workspaceExplorations: { byId: { exp_1: { id: 'exp_1', promoted: [] } }, order: ['exp_1'] },
  // P6-D1/D2/D3/D8 — the durable, store-backed freshness signature. Empty by
  // default: every test that wants the real (promoted) lane to resolve must
  // go through `markPromoted` below, exactly like the real
  // `promoteExploration` store action would.
  explorerModelStates: {},
  explorerPromotedSignatures: {},
};

// Simulates what `promoteExploration` (workspaceExplorationsStore.js) does at
// promote-invoke time: records BOTH the exploration's promoted[] trail AND
// the frozen `insightFreshnessSignature.js` signature for each name,
// computed from whatever `explorerInsightStates`/`explorerModelStates`
// currently look like — never hand-constructed, so a test can't accidentally
// drift from what the real store action would actually capture.
const markPromoted = (names, explorationId = 'exp_1') => {
  const { explorerInsightStates, explorerModelStates } = useStore.getState();
  const signatures = {};
  names.forEach(name => {
    signatures[name] = buildInsightFreshnessSignature(explorerInsightStates[name], explorerModelStates);
  });
  useStore.setState(state => ({
    workspaceExplorations: {
      byId: {
        [explorationId]: {
          id: explorationId,
          promoted: names.map(name => ({ type: 'insight', name })),
        },
      },
      order: [explorationId],
    },
    explorerPromotedSignatures: { ...(state.explorerPromotedSignatures || {}), ...signatures },
  }));
};

describe('ExplorerChartPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDraftInsightPreview.mockReturnValue(defaultDraftPreview);
    usePreviewInputDependencies.mockReturnValue({ inputConfigs: [], unresolvedNames: [] });
    useStore.setState(defaultState);
  });

  it('shows empty state when no insights attached to chart', () => {
    useStore.setState({ explorerChartInsightNames: [] });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('chart-empty-no-insights')).toBeInTheDocument();
  });

  it('renders ChartPreview with the draft-namespaced insight keys from useDraftInsightPreview', () => {
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('chart-preview-component')).toBeInTheDocument();
    expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
      JSON.stringify(['__draft__:ins_1'])
    );
  });

  it('falls back to a default chart name when explorerChartName is unset', () => {
    useStore.setState({ explorerChartName: undefined });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('cp-chart-name')).toHaveTextContent('Preview Chart');
  });

  it('tolerates state.insights being absent entirely (realInsights || [] fallback)', () => {
    useStore.setState({ insights: undefined });
    expect(() => render(<ExplorerChartPreview />)).not.toThrow();
    // No real insights known at all -> stays on the draft-namespaced key.
    expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
      JSON.stringify(['__draft__:ins_1'])
    );
  });

  it('tolerates a workspaceExplorations entry with no `promoted` key at all (explorationPromoted fallback)', () => {
    useStore.setState({
      workspaceExplorations: { byId: { exp_1: { id: 'exp_1' } }, order: ['exp_1'] }, // no `promoted` key
    });
    expect(() => render(<ExplorerChartPreview />)).not.toThrow();
    expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
      JSON.stringify(['__draft__:ins_1'])
    );
  });

  it('tolerates useInsightsData returning a falsy value instead of an object', () => {
    const { useInsightsData } = jest.requireMock('../../hooks/useInsightsData');
    useInsightsData.mockReturnValue(null);
    useStore.setState({ insights: [{ name: 'ins_1' }], insightJobs: {} });
    markPromoted(['ins_1']);
    expect(() => render(<ExplorerChartPreview />)).not.toThrow();
  });

  // A name can be in the exploration's promoted[] trail (VIS-1091) without
  // ever having a recorded freshness signature — e.g. a legacy/pre-P6-D1
  // promote, or a signature write that itself failed. Must fall back to the
  // draft-namespaced key rather than throwing on a missing signature.
  it('a promoted name with no recorded signature at all falls back to the draft key', () => {
    useStore.setState({
      insights: [{ name: 'ins_1' }],
      insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 1 }] } },
      workspaceExplorations: {
        byId: { exp_1: { id: 'exp_1', promoted: [{ type: 'insight', name: 'ins_1' }] } },
        order: ['exp_1'],
      },
      explorerPromotedSignatures: {}, // no signature recorded for ins_1 at all
    });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
      JSON.stringify(['__draft__:ins_1'])
    );
  });

  it('passes chart name and layout from the store', () => {
    useStore.setState({
      explorerChartName: 'my_cool_chart',
      explorerChartLayout: { title: { text: 'My Chart' } },
    });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('cp-chart-name')).toHaveTextContent('my_cool_chart');
    const layout = JSON.parse(screen.getByTestId('cp-layout').textContent);
    expect(layout.title.text).toBe('My Chart');
  });

  it('passes projectId through', () => {
    useStore.setState({ project: { id: 'my-project-123' } });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('cp-project-id')).toHaveTextContent('my-project-123');
  });

  // VIS-1092: the component reads `perInsight[name]` (draft-lane-scoped),
  // not the hook's aggregate `isLoading`/`error` fields, so it can never
  // blank an already-rendering promoted insight over a draft sibling's
  // error — see the `mixed lane` describe block below for that guarantee.
  it('forwards isLoading/error from useDraftInsightPreview via perInsight', () => {
    useDraftInsightPreview.mockReturnValue({
      ...defaultDraftPreview,
      perInsight: { ins_1: { isLoading: true, error: 'boom', blockedReason: null, blockedModel: null } },
    });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('cp-is-loading')).toHaveTextContent('true');
    expect(screen.getByTestId('cp-error')).toHaveTextContent('boom');
  });

  it('renders the graceful "run the query first" state instead of ChartPreview on a model_not_run block', () => {
    useDraftInsightPreview.mockReturnValue({
      ...defaultDraftPreview,
      perInsight: {
        ins_1: { isLoading: false, error: null, blockedReason: 'model_not_run', blockedModel: 'cohort_q' },
      },
    });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('chart-preview-run-first')).toBeInTheDocument();
    expect(screen.getByTestId('chart-preview-run-first')).toHaveTextContent('cohort_q');
    expect(screen.queryByTestId('chart-preview-component')).not.toBeInTheDocument();
  });

  // ux-audit.md "infinite spinner" finding (cold-start #2, pills #3): nothing
  // mapped yet -> a guided empty state, never a spinner with no request in
  // flight (Chart.jsx's own `hasAllInsightData` gate would otherwise spin
  // forever waiting on data this hook never even tries to fetch).
  it('renders the "run the query first" state without naming a model when blockedModel is null', () => {
    useDraftInsightPreview.mockReturnValue({
      ...defaultDraftPreview,
      perInsight: {
        ins_1: { isLoading: false, error: null, blockedReason: 'model_not_run', blockedModel: null },
      },
    });
    render(<ExplorerChartPreview />);
    const runFirst = screen.getByTestId('chart-preview-run-first');
    expect(runFirst).toHaveTextContent('Run your query to see a preview');
    expect(runFirst).not.toHaveTextContent('for "');
  });

  it('renders a guided empty state instead of ChartPreview on a no_data_props block', () => {
    useDraftInsightPreview.mockReturnValue({
      ...defaultDraftPreview,
      perInsight: {
        ins_1: { isLoading: false, error: null, blockedReason: 'no_data_props', blockedModel: null },
      },
    });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('chart-preview-empty-no-props')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-preview-component')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chart-preview-loading')).not.toBeInTheDocument();
  });

  // VIS-1092 — the actual mixed-lane guarantee: a promoted insight with real
  // data must never be blanked by a DRAFT sibling's error/loading, because
  // the promoted one isn't even in the draft lane the aggregate is scoped to.
  describe('mixed-lane isLoading/error scoping (VIS-1092)', () => {
    it('an already-promoted insight with real data is never blanked by a draft sibling erroring', () => {
      useStore.setState({
        explorerChartInsightNames: ['promoted_ins', 'draft_ins'],
        insights: [{ name: 'promoted_ins' }],
        insightJobs: { promoted_ins: { name: 'promoted_ins', data: [{ x: 1 }] } },
      });
      markPromoted(['promoted_ins']);
      useDraftInsightPreview.mockReturnValue({
        previewInsightKeys: ['promoted_ins', '__draft__:draft_ins'],
        perInsight: {
          draft_ins: { isLoading: false, error: 'draft_ins blew up', blockedReason: null, blockedModel: null },
        },
        isLoading: false,
        error: 'draft_ins blew up', // the AGGREGATE still carries it — proves the fix reads perInsight, not this.
        blockedReason: null,
        blockedModel: null,
      });
      render(<ExplorerChartPreview />);
      // promoted_ins renders through the normal ChartPreview path (not
      // blanked by chart-preview-error / chart-preview-run-first).
      expect(screen.getByTestId('chart-preview-component')).toBeInTheDocument();
      expect(screen.getByTestId('cp-is-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('cp-error')).toBeEmptyDOMElement();
    });
  });

  it('renders PreviewInputControls above the chart, driven by usePreviewInputDependencies', () => {
    usePreviewInputDependencies.mockReturnValue({
      inputConfigs: [{ name: 'region' }],
      unresolvedNames: [],
    });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('preview-input-controls')).toHaveTextContent('region');
  });

  it('surfaces an explicit banner for a draft referencing a genuinely undefined input (never a silent drop)', () => {
    usePreviewInputDependencies.mockReturnValue({
      inputConfigs: [],
      unresolvedNames: ['not_defined_yet'],
    });
    render(<ExplorerChartPreview />);
    const banner = screen.getByTestId('chart-preview-unresolved-inputs');
    expect(banner).toHaveTextContent('not_defined_yet');
    // Singular phrasing for exactly one unresolved name.
    expect(banner).toHaveTextContent('Input "not_defined_yet" isn\'t defined in this project yet.');
    // D11 / ux-audit.md "unresolved-input misclassification": plain
    // language, never the "promoted" pipeline jargon a MODEL banner used to
    // leak onto a genuine input.
    expect(banner).not.toHaveTextContent('promoted');
  });

  it('pluralizes the unresolved-inputs banner when more than one name is unresolved', () => {
    usePreviewInputDependencies.mockReturnValue({
      inputConfigs: [],
      unresolvedNames: ['region', 'quarter'],
    });
    render(<ExplorerChartPreview />);
    const banner = screen.getByTestId('chart-preview-unresolved-inputs');
    expect(banner).toHaveTextContent('Inputs "region", "quarter" aren\'t defined in this project yet.');
  });

  // ux-audit.md "unresolved-input misclassification" (cold-start #3): the
  // component must hand its own known draft model tab names to
  // usePreviewInputDependencies so a model ref (e.g. the auto-created
  // 'model' tab) is never misclassified as an unresolved input.
  it('passes draft model tab names as extraModelNames to usePreviewInputDependencies', () => {
    useStore.setState({ explorerModelStates: { orders_q: {}, model: {} } });
    render(<ExplorerChartPreview />);
    expect(usePreviewInputDependencies).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ extraModelNames: expect.arrayContaining(['orders_q', 'model']) })
    );
  });

  it('tolerates explorerModelStates being unset entirely (never throws, extraModelNames falls back to empty)', () => {
    useStore.setState({ explorerModelStates: undefined });
    expect(() => render(<ExplorerChartPreview />)).not.toThrow();
    expect(usePreviewInputDependencies).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ extraModelNames: [] })
    );
  });

  it('passes previewInsightKeys as the insightNames usePreviewInputDependencies resolves against', () => {
    useDraftInsightPreview.mockReturnValue({
      ...defaultDraftPreview,
      previewInsightKeys: ['__draft__:ins_1', '__draft__:ins_2'],
    });
    render(<ExplorerChartPreview />);
    expect(usePreviewInputDependencies).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ insightNames: ['__draft__:ins_1', '__draft__:ins_2'] })
    );
  });

  // Integration-gate fix cycle: `insightJobs['ins_1']` (the real,
  // un-namespaced key) never populated after a promote — nothing on the
  // Explorer route ever asked `useInsightsData` for it. These lock in the
  // fix: ExplorerChartPreview now polls for real data once an insight is
  // promoted (present in `state.insights`), and only SWITCHES the chart's
  // insightKeys over once that real data has actually landed.
  describe('promoted-lane switch', () => {
    // Every "promoted" scenario below must seed BOTH a matching real
    // `state.insights` entry AND the ACTIVE exploration's own `promoted[]`
    // trail (VIS-1091) — a bare `state.insights` match alone is no longer
    // sufficient. `markPromoted` (module-level, above) also records the
    // frozen freshness signature `promoteExploration` would have captured.

    it('stays on the draft-namespaced key while promoted but real data has not landed yet', () => {
      useStore.setState({ insights: [{ name: 'ins_1' }], insightJobs: {} });
      markPromoted(['ins_1']);
      render(<ExplorerChartPreview />);
      expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
        JSON.stringify(['__draft__:ins_1'])
      );
    });

    it('switches to the real name once insightJobs holds real data for the promoted insight', () => {
      useStore.setState({
        insights: [{ name: 'ins_1' }],
        insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 1 }] } },
      });
      markPromoted(['ins_1']);
      render(<ExplorerChartPreview />);
      expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));
    });

    it('requests real data only for the promoted subset of chart insights', () => {
      const { useInsightsData } = jest.requireMock('../../hooks/useInsightsData');
      useDraftInsightPreview.mockReturnValue({
        ...defaultDraftPreview,
        previewInsightKeys: ['__draft__:ins_1', '__draft__:ins_2'],
      });
      useStore.setState({
        explorerChartInsightNames: ['ins_1', 'ins_2'],
        insights: [{ name: 'ins_1' }], // ins_2 is still a draft-only insight
        insightJobs: {},
      });
      markPromoted(['ins_1']);
      render(<ExplorerChartPreview />);
      expect(useInsightsData).toHaveBeenCalledWith('proj-1', ['ins_1'], undefined, {
        cacheKey: 0,
      });
    });

    it('never treats an unpromoted insight as real, even if some other insight of the same name exists elsewhere', () => {
      useStore.setState({ insights: [{ name: 'some_other_insight' }], insightJobs: {} });
      render(<ExplorerChartPreview />);
      expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
        JSON.stringify(['__draft__:ins_1'])
      );
    });

    // VIS-1091 — the actual confirmed gap: a REAL insight named 'ins_1'
    // exists (e.g. promoted by a DIFFERENT exploration, or pre-existing in
    // the project) but THIS exploration's own promoted[] trail never
    // recorded promoting it. Must stay on the draft-namespaced key — never
    // silently swap in the unrelated real data.
    it('a same-named real insight that THIS exploration never promoted is never treated as promoted (cross-exploration collision)', () => {
      useStore.setState({
        insights: [{ name: 'ins_1' }],
        insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 99 }] } },
      });
      // workspaceExplorations.byId.exp_1.promoted stays [] — the default —
      // simulating a DIFFERENT exploration having promoted 'ins_1', or a
      // pre-existing project insight of the same auto-generated name.
      render(<ExplorerChartPreview />);
      expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
        JSON.stringify(['__draft__:ins_1'])
      );
    });

    it('no active exploration id (edge case) never treats anything as promoted', () => {
      useStore.setState({
        workspaceActiveObject: null,
        insights: [{ name: 'ins_1' }],
        insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 1 }] } },
      });
      render(<ExplorerChartPreview />);
      expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
        JSON.stringify(['__draft__:ins_1'])
      );
    });

    // P5-D1 — the sticky promoted-lane lock: editing a promoted insight must
    // resume live draft rendering immediately, never freeze on the
    // promote-moment snapshot ("promote early, keep refining").
    describe('promoted-data freshness (P5-D1)', () => {
      it('falls back to the draft key once the promoted insight is edited after promotion', () => {
        const data = [{ x: 1 }];
        useStore.setState({ insights: [{ name: 'ins_1' }], insightJobs: { ins_1: { name: 'ins_1', data } } });
        markPromoted(['ins_1']);
        const { rerender } = render(<ExplorerChartPreview />);
        // First render: real data just landed, current insight state is what
        // it represents — resolves to the real key.
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));

        // User edits the (still-promoted) insight's props post-promote — the
        // SAME `data` object is still sitting in insightJobs (no new run yet).
        act(() => {
          useStore.setState({
            explorerInsightStates: {
              ins_1: { type: 'scatter', props: { x: '?{${ref(sales).new_col}}' }, interactions: [] },
            },
          });
        });
        rerender(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
          JSON.stringify(['__draft__:ins_1'])
        );
      });

      // P6-D8 (recurrence of P5-D1) — the OLD mechanism flipped back to the
      // real key the instant ANY new `insightJobs[name].data` reference
      // appeared, trusting whatever the CURRENT insight state was at that
      // moment. The fix flips back ONLY on a fresh recorded promotion
      // (`markPromoted` again here — a real re-promote) — a new data
      // reference landing on its own must never be enough (see the
      // "data landing alone never re-locks" test right after this one).
      it('flips back to the real key once the insight is RE-PROMOTED after an edit (a fresh signature is recorded)', () => {
        const staleData = [{ x: 1 }];
        useStore.setState({
          insights: [{ name: 'ins_1' }],
          insightJobs: { ins_1: { name: 'ins_1', data: staleData } },
        });
        markPromoted(['ins_1']);
        const { rerender } = render(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));

        // Edit — falls back to draft, as proven above.
        act(() => {
          useStore.setState({
            explorerInsightStates: {
              ins_1: { type: 'scatter', props: { x: '?{${ref(sales).new_col}}' }, interactions: [] },
            },
          });
        });
        rerender(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
          JSON.stringify(['__draft__:ins_1'])
        );

        // Re-promote: a fresh run lands a NEW data reference AND the store
        // records a NEW signature matching the (current, just-edited) state
        // — mirrors what `promoteExploration` actually does on every
        // successful promote.
        const freshData = [{ x: 2 }];
        act(() => {
          useStore.setState({ insightJobs: { ins_1: { name: 'ins_1', data: freshData } } });
          markPromoted(['ins_1']);
        });
        rerender(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));
      });

      // P6-D3/D8 — the exact defect the old ref-based mechanism had: it
      // stamped a signature onto data the INSTANT a new data reference was
      // seen, with no check that the data actually corresponds to the
      // current state. The fix's contract is that ONLY a fresh
      // `recordPromotedInsightSignature` write (i.e. an actual re-promote)
      // can flip the lane back — never a bare new data reference.
      it('a new data reference landing alone (no fresh re-promote) never re-locks the lane', () => {
        const staleData = [{ x: 1 }];
        useStore.setState({
          insights: [{ name: 'ins_1' }],
          insightJobs: { ins_1: { name: 'ins_1', data: staleData } },
        });
        markPromoted(['ins_1']);
        const { rerender } = render(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));

        act(() => {
          useStore.setState({
            explorerInsightStates: {
              ins_1: { type: 'scatter', props: { x: '?{${ref(sales).new_col}}' }, interactions: [] },
            },
          });
        });
        rerender(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
          JSON.stringify(['__draft__:ins_1'])
        );

        // A new data reference lands (e.g. some other run finishing) but
        // NOTHING re-records the signature — must stay on the draft key.
        act(() => {
          useStore.setState({ insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 2 }] } } });
        });
        rerender(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
          JSON.stringify(['__draft__:ins_1'])
        );
      });

      it('never flickers to draft on a render where insightJobs is unchanged and the insight is untouched', () => {
        const data = [{ x: 1 }];
        useStore.setState({ insights: [{ name: 'ins_1' }], insightJobs: { ins_1: { name: 'ins_1', data } } });
        markPromoted(['ins_1']);
        const { rerender } = render(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));

        // An unrelated re-render (e.g. chart layout edit) with no insight or
        // data change must stay on the real key.
        act(() => {
          useStore.setState({ explorerChartLayout: { title: 'x' } });
        });
        rerender(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));
      });

      // P6-D1 (HIGH) — a component-instance ref dies on remount; the old
      // mechanism's first render after resume would recapture the CURRENT
      // (edited) signature as if it described the STALE data already
      // sitting in insightJobs, silently reverting the user's edit. The
      // durable store field must not.
      it('a remount (tab park/resume) does not resurrect a stale lock — pre-existing store data + edited state stays on the draft lane', () => {
        const data = [{ x: 1 }];
        useStore.setState({ insights: [{ name: 'ins_1' }], insightJobs: { ins_1: { name: 'ins_1', data } } });
        markPromoted(['ins_1']);
        const { unmount } = render(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));

        // Edit post-promote (still real data sitting in insightJobs, no new
        // run) — then park/resume: unmount (tab switch away) and remount
        // (tab switch back). `explorerPromotedSignatures` is a store field,
        // not a component ref, so it is NOT reset across this cycle here —
        // exactly like the real park (snapshotExplorerWorkingState) / resume
        // (restoreExplorerWorkingState) round trip preserves it.
        act(() => {
          useStore.setState({
            explorerInsightStates: {
              ins_1: { type: 'scatter', props: { x: '?{${ref(sales).new_col}}' }, interactions: [] },
            },
          });
        });
        unmount();
        render(<ExplorerChartPreview />);

        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
          JSON.stringify(['__draft__:ins_1'])
        );
      });

      // P6-D3/D8 — an edit made between clicking promote and the in-flight
      // run's data landing must never be silently absorbed as if the
      // (pre-edit) data represented the (post-edit) state.
      it('an edit made between promote and the run landing data is never absorbed as fresh (mid-run edit)', () => {
        useStore.setState({ insights: [{ name: 'ins_1' }], insightJobs: {} });
        // Promote captures the signature for the PRE-edit config...
        markPromoted(['ins_1']);

        // ...then the user edits the insight WHILE the run is still in
        // flight (no data has landed for it yet).
        act(() => {
          useStore.setState({
            explorerInsightStates: {
              ins_1: { type: 'scatter', props: { x: '?{${ref(sales).new_col}}' }, interactions: [] },
            },
          });
        });

        const { rerender } = render(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
          JSON.stringify(['__draft__:ins_1'])
        );

        // The in-flight run completes and lands data compiled from the
        // PRE-edit (promote-moment) config. The recorded signature is frozen
        // from promote-time and no longer matches the current (edited)
        // state, so this must stay on the draft key — never silently show
        // stale data as if it reflected the user's edit.
        act(() => {
          useStore.setState({ insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 1 }] } } });
        });
        rerender(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
          JSON.stringify(['__draft__:ins_1'])
        );
      });

      // P6-D2 — the signature must cover referenced-model state, not just
      // the insight's own props/interactions: a model-SQL edit changes the
      // rendered result without touching the insight's own props text.
      it('a promoted model SQL edit unlocks the lane even though the insight itself is untouched', () => {
        useStore.setState({
          explorerModelStates: {
            sales: { sql: 'select 1', sourceName: 'src', queryResult: { rows: [] } },
          },
          insights: [{ name: 'ins_1' }],
          insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 1 }] } },
        });
        markPromoted(['ins_1']);
        const { rerender } = render(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));

        // Edit the MODEL's SQL post-promote — the insight's own
        // props/interactions are completely untouched.
        act(() => {
          useStore.setState({
            explorerModelStates: {
              sales: { sql: 'select 2', sourceName: 'src', queryResult: { rows: [] } },
            },
          });
        });
        rerender(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(
          JSON.stringify(['__draft__:ins_1'])
        );
      });
    });
  });

  // VIS-1093 — the promoted-poll bridge's bounded lifetime + failure path.
  describe('promoted-poll bridge failure path (VIS-1093)', () => {
    const { useInsightsData } = jest.requireMock('../../hooks/useInsightsData');

    beforeEach(() => {
      jest.useFakeTimers();
      // The default module mock resolves to `{}` (no error) — reset it
      // explicitly since a prior test's `.mockReturnValue` override would
      // otherwise leak (jest.clearAllMocks() clears call history, not a
      // configured return value).
      useInsightsData.mockReturnValue({});
    });
    afterEach(() => {
      act(() => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    });

    it('surfaces useInsightsData\'s error via a banner instead of silently discarding it', () => {
      const { useInsightsData } = jest.requireMock('../../hooks/useInsightsData');
      useInsightsData.mockReturnValue({ error: new Error('fetch failed') });
      useStore.setState({ insights: [{ name: 'ins_1' }], insightJobs: {} });
      markPromoted(['ins_1']);
      render(<ExplorerChartPreview />);
      expect(screen.getByTestId('chart-preview-promoted-poll-failed')).toHaveTextContent(
        'fetch failed'
      );
    });

    it('renders a non-Error promotedFetchError (no .message) via String() fallback', () => {
      const { useInsightsData } = jest.requireMock('../../hooks/useInsightsData');
      useInsightsData.mockReturnValue({ error: 'plain string failure' });
      useStore.setState({ insights: [{ name: 'ins_1' }], insightJobs: {} });
      markPromoted(['ins_1']);
      render(<ExplorerChartPreview />);
      expect(screen.getByTestId('chart-preview-promoted-poll-failed')).toHaveTextContent(
        'plain string failure'
      );
    });

    it('stops polling and shows the failure banner after the attempt budget is exhausted', () => {
      useStore.setState({ insights: [{ name: 'ins_1' }], insightJobs: {} });
      markPromoted(['ins_1']);
      render(<ExplorerChartPreview />);
      expect(screen.queryByTestId('chart-preview-promoted-poll-failed')).not.toBeInTheDocument();

      // Exhaust the ~30s (15 x 2s) polling budget — advance comfortably past
      // it so the exact attempt-count boundary doesn't make this test brittle.
      act(() => {
        jest.advanceTimersByTime(20 * 2000);
      });

      expect(screen.getByTestId('chart-preview-promoted-poll-failed')).toBeInTheDocument();
    });

    it('never shows the failure banner once real data actually lands', () => {
      useStore.setState({
        insights: [{ name: 'ins_1' }],
        insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 1 }] } },
      });
      markPromoted(['ins_1']);
      render(<ExplorerChartPreview />);
      act(() => {
        jest.advanceTimersByTime(15 * 2000 + 1000);
      });
      expect(screen.queryByTestId('chart-preview-promoted-poll-failed')).not.toBeInTheDocument();
    });
  });

  // VIS-1072 — flywheel telemetry: time_to_first_chart fires the first time
  // ANY chart insight (draft or promoted) actually has data on screen for
  // the active exploration.
  describe('time_to_first_chart telemetry (VIS-1072)', () => {
    let events;
    let unsubscribe;

    beforeEach(() => {
      events = [];
      unsubscribe = setWorkspaceTelemetryListener(e => events.push(e));
    });
    afterEach(() => unsubscribe());

    const chartEvents = () => events.filter(e => e.eventName === 'time_to_first_chart');

    test('fires once real/draft data is on screen for the active (created-this-session) exploration', () => {
      markExplorationCreated('exp_1');
      useStore.setState({
        insights: [{ name: 'ins_1' }],
        insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 1 }] } },
      });
      markPromoted(['ins_1']);
      render(<ExplorerChartPreview />);
      expect(chartEvents()).toHaveLength(1);
    });

    test('does not fire while nothing has data yet', () => {
      markExplorationCreated('exp_1');
      render(<ExplorerChartPreview />);
      expect(chartEvents()).toHaveLength(0);
    });

    test('does not fire for an exploration this session never saw created (e.g. resumed after reload)', () => {
      // A fresh, never-marked-created id — distinct from the other tests in
      // this describe block, since `markExplorationCreated` bookkeeping is
      // module-level and not reset between tests.
      useStore.setState({
        workspaceActiveObject: { type: 'exploration', name: 'exp_resumed_after_reload' },
        insights: [{ name: 'ins_1' }],
        insightJobs: { ins_1: { name: 'ins_1', data: [{ x: 1 }] } },
      });
      // Real promoted data genuinely on screen (anyInsightAlreadyHasData is
      // true) — the ONLY thing suppressing the event must be the
      // never-created-this-session gate, not an accidental draft-lane
      // fallback from a missing signature.
      markPromoted(['ins_1'], 'exp_resumed_after_reload');
      render(<ExplorerChartPreview />);
      expect(chartEvents()).toHaveLength(0);
    });
  });
});
