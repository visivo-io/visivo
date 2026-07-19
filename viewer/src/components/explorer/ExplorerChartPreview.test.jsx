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

  // VIS-1092 — the actual mixed-lane guarantee: a promoted insight with real
  // data must never be blanked by a DRAFT sibling's error/loading, because
  // the promoted one isn't even in the draft lane the aggregate is scoped to.
  describe('mixed-lane isLoading/error scoping (VIS-1092)', () => {
    it('an already-promoted insight with real data is never blanked by a draft sibling erroring', () => {
      useStore.setState({
        explorerChartInsightNames: ['promoted_ins', 'draft_ins'],
        insights: [{ name: 'promoted_ins' }],
        insightJobs: { promoted_ins: { name: 'promoted_ins', data: [{ x: 1 }] } },
        workspaceExplorations: {
          byId: { exp_1: { id: 'exp_1', promoted: [{ type: 'insight', name: 'promoted_ins' }] } },
          order: ['exp_1'],
        },
      });
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

  it('surfaces an explicit banner for a draft referencing a not-yet-promoted input (never a silent drop)', () => {
    usePreviewInputDependencies.mockReturnValue({
      inputConfigs: [],
      unresolvedNames: ['not_yet_promoted'],
    });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('chart-preview-unresolved-inputs')).toHaveTextContent(
      'not_yet_promoted'
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
    // sufficient.
    const markPromoted = (names) =>
      useStore.setState({
        workspaceExplorations: {
          byId: {
            exp_1: {
              id: 'exp_1',
              promoted: names.map(name => ({ type: 'insight', name })),
            },
          },
          order: ['exp_1'],
        },
      });

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

      it('flips back to the real key once a fresh promote/run lands new data matching the current state', () => {
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

        // Re-promote completes and a fresh run lands a NEW data reference —
        // captured as representing the (current, just-repromoted) state.
        const freshData = [{ x: 2 }];
        act(() => {
          useStore.setState({ insightJobs: { ins_1: { name: 'ins_1', data: freshData } } });
        });
        rerender(<ExplorerChartPreview />);
        expect(screen.getByTestId('cp-insight-keys')).toHaveTextContent(JSON.stringify(['ins_1']));
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

    const markPromoted = (names) =>
      useStore.setState({
        workspaceExplorations: {
          byId: { exp_1: { id: 'exp_1', promoted: names.map(name => ({ type: 'insight', name })) } },
          order: ['exp_1'],
        },
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
      useStore.setState({
        workspaceExplorations: {
          byId: { exp_1: { id: 'exp_1', promoted: [{ type: 'insight', name: 'ins_1' }] } },
          order: ['exp_1'],
        },
      });
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
        workspaceExplorations: {
          byId: {
            exp_resumed_after_reload: {
              id: 'exp_resumed_after_reload',
              promoted: [{ type: 'insight', name: 'ins_1' }],
            },
          },
          order: ['exp_resumed_after_reload'],
        },
      });
      render(<ExplorerChartPreview />);
      expect(chartEvents()).toHaveLength(0);
    });
  });
});
