/* eslint-disable no-template-curly-in-string -- literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightBuildSection from './InsightBuildSection';
import useStore from '../../../stores/store';
import { saveAsMetric } from './saveAsMetricFlow';

async function renderSettled(ui) {
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {
    render(ui);
  });
}

let mockCaptured = {};

jest.mock('../common/TracePropsEditor', () => {
  return function MockTracePropsEditor({
    props,
    onChange,
    droppable,
    onDropField,
    onSaveAsMetric,
    externalErrors,
  }) {
    mockCaptured.props = props;
    mockCaptured.onChange = onChange;
    mockCaptured.droppable = droppable;
    mockCaptured.onDropField = onDropField;
    mockCaptured.onSaveAsMetric = onSaveAsMetric;
    mockCaptured.externalErrors = externalErrors;
    return (
      <div data-testid="trace-props-editor-mock" data-droppable={droppable ? 'true' : 'false'}>
        {JSON.stringify(props)}
      </div>
    );
  };
});

jest.mock('../common/RefTextArea', () => {
  return function MockRefTextArea({ value, onChange }) {
    return (
      <textarea
        data-testid="mock-ref-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    );
  };
});

jest.mock('./saveAsMetricFlow', () => ({
  ...jest.requireActual('./saveAsMetricFlow'),
  saveAsMetric: jest.fn(),
}));

jest.mock('../../../schemas/schemas', () => ({
  CHART_TYPES: [
    { value: 'scatter', label: 'Scatter / Line' },
    { value: 'bar', label: 'Bar' },
    { value: 'pie', label: 'Pie' },
  ],
}));

const defaultInsightState = {
  type: 'scatter',
  props: { x: '?{${ref(orders_q).col_x}}', y: '?{${ref(orders_q).col_y}}' },
  interactions: [],
  isNew: true,
};

const setupStore = (overrides = {}) => {
  useStore.setState({
    explorerInsightStates: { test_insight: { ...defaultInsightState } },
    explorerActiveInsightName: 'test_insight',
    explorerChartInsightNames: ['test_insight'],
    explorerActiveModelName: 'orders_q',
    explorerModelTabs: ['orders_q'],
    explorerModelStates: {},
    models: [],
    metrics: [],
    dimensions: [],
    sources: [],
    ...overrides,
  });
};

describe('InsightBuildSection', () => {
  let originalActions;

  beforeAll(() => {
    const s = useStore.getState();
    originalActions = {
      setInsightType: s.setInsightType,
      setInsightProp: s.setInsightProp,
      removeInsightProp: s.removeInsightProp,
      removeInsightFromChart: s.removeInsightFromChart,
      addInsightInteraction: s.addInsightInteraction,
      removeInsightInteraction: s.removeInsightInteraction,
      updateInsightInteraction: s.updateInsightInteraction,
      setActiveInsight: s.setActiveInsight,
      renameInsight: s.renameInsight,
    };
  });

  beforeEach(() => {
    mockCaptured = {};
    useStore.setState({ ...originalActions });
    setupStore();
  });

  it('renders insight name with purple styling', async () => {
    render(
      <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );
    expect(await screen.findByText('test_insight')).toBeInTheDocument();
    const header = screen.getByTestId('insight-header-test_insight');
    expect(header.className).toContain('border-purple');
  });

  // D12 (grounding diagnosis #4): the legacy top-level Type <Select> — a
  // byte-for-byte duplicate of TracePropsEditor's own TypeSelector — is
  // deleted. Type switching is now exercised for real in
  // TracePropsEditor.test.jsx (TracePropsEditor is mocked in THIS file, so
  // the real TypeSelector never mounts here); this is a regression guard
  // that the duplicate control never comes back.
  it('renders no legacy top-level Type select — TracePropsEditor owns type switching alone', async () => {
    await renderSettled(
      <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );
    await screen.findByTestId('trace-props-editor-mock');
    expect(screen.queryByTestId('insight-type-select-test_insight')).not.toBeInTheDocument();
  });

  it('renders TracePropsEditor with droppable=true and props.type re-attached, when expanded', async () => {
    render(
      <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );
    const editor = await screen.findByTestId('trace-props-editor-mock');
    expect(editor).toHaveAttribute('data-droppable', 'true');
    expect(mockCaptured.props).toEqual({ ...defaultInsightState.props, type: 'scatter' });
  });

  it('does not render TracePropsEditor when collapsed', async () => {
    render(
      <InsightBuildSection insightName="test_insight" isExpanded={false} onToggleExpand={jest.fn()} />
    );
    await screen.findByTestId('insight-header-test_insight');
    expect(screen.queryByTestId('trace-props-editor-mock')).not.toBeInTheDocument();
  });

  it('collapse/expand toggle works', async () => {
    const onToggleExpand = jest.fn();
    render(
      <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={onToggleExpand} />
    );
    fireEvent.click(await screen.findByTestId('insight-toggle-test_insight'));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('remove button calls removeInsightFromChart', async () => {
    const removeInsightFromChart = jest.fn();
    useStore.setState({ removeInsightFromChart });
    render(
      <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );
    fireEvent.click(await screen.findByTestId('insight-remove-test_insight'));
    expect(removeInsightFromChart).toHaveBeenCalledWith('test_insight');
  });

  describe('TracePropsEditor onChange -> legacy store diffing', () => {
    it('a same-type prop edit diffs through setInsightProp / removeInsightProp, never touching setInsightType', async () => {
      const setInsightProp = jest.fn();
      const removeInsightProp = jest.fn();
      const setInsightType = jest.fn();
      useStore.setState({ setInsightProp, removeInsightProp, setInsightType });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onChange({ type: 'scatter', x: '?{${ref(orders_q).col_x}}', z: 'new' });

      expect(setInsightType).not.toHaveBeenCalled();
      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'z', 'new');
      expect(removeInsightProp).toHaveBeenCalledWith('test_insight', 'y');
      expect(setInsightProp).not.toHaveBeenCalledWith('test_insight', 'x', expect.anything());
    });

    it('a type switch calls setInsightType FIRST, then re-applies TracePropsEditor own preserved props on top', async () => {
      const calls = [];
      const setInsightType = jest.fn((name, type) => {
        calls.push(['setInsightType', type]);
        // Mirror the real action: switching type resets props (simplified).
        useStore.setState(s => ({
          explorerInsightStates: {
            ...s.explorerInsightStates,
            [name]: { ...s.explorerInsightStates[name], type, props: {} },
          },
        }));
      });
      const setInsightProp = jest.fn((name, key, value) => {
        calls.push(['setInsightProp', key, value]);
      });
      useStore.setState({ setInsightType, setInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      // TracePropsEditor's own preserveTraceProps decided x/y carry forward.
      act(() => {
        mockCaptured.onChange({
          type: 'bar',
          x: '?{${ref(orders_q).col_x}}',
          y: '?{${ref(orders_q).col_y}}',
        });
      });

      expect(calls[0]).toEqual(['setInsightType', 'bar']);
      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'x', '?{${ref(orders_q).col_x}}');
      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'y', '?{${ref(orders_q).col_y}}');
    });
  });

  describe('D10 drop-default heuristic (onDropField)', () => {
    it('a numeric source-schema column drop defaults to a SUM aggregate pill', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('x', { type: 'sourceColumn', name: 'amount', columnType: 'DOUBLE' });

      expect(setInsightProp).toHaveBeenCalledWith(
        'test_insight',
        'x',
        '?{sum(${ref(orders_q).amount})}'
      );
    });

    it('a non-numeric (or type-unknown) column drop defaults to a plain dimension pill', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('x', { type: 'sourceColumn', name: 'region', columnType: 'VARCHAR' });
      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'x', '?{${ref(orders_q).region}}');

      mockCaptured.onDropField('x', { type: 'column', name: 'region' });
      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'x', '?{${ref(orders_q).region}}');
    });

    it('a metric/dimension object drop resolves to its own ref, parentModel-scoped when present', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('x', { type: 'metric', name: 'churn_rate' });
      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'x', '?{${ref(churn_rate)}}');

      mockCaptured.onDropField('x', { type: 'dimension', name: 'cohort', parentModel: 'orders_q' });
      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'x', '?{${ref(orders_q).cohort}}');
    });

    it('an input drop resolves .values for multi-select, .value otherwise', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('x', { type: 'input', name: 'region_filter', inputType: 'multi-select' });
      expect(setInsightProp).toHaveBeenCalledWith(
        'test_insight',
        'x',
        '?{${ref(region_filter).values}}'
      );

      mockCaptured.onDropField('x', { type: 'input', name: 'region_filter', inputType: 'select' });
      expect(setInsightProp).toHaveBeenCalledWith(
        'test_insight',
        'x',
        '?{${ref(region_filter).value}}'
      );
    });

    // T4 (cold-start #3 / pills-buildrail #1): every drop this handler
    // doesn't act on now SAYS WHY via the shared workspace toast, instead
    // of failing with no pill, no error, and no animation.
    it('a sourceTable drop is a no-op AND shows visible feedback (never fails silently)', async () => {
      const setInsightProp = jest.fn();
      const showWorkspaceToast = jest.fn();
      useStore.setState({ setInsightProp, showWorkspaceToast });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('x', { type: 'sourceTable', name: 'orders' });
      expect(setInsightProp).not.toHaveBeenCalled();
      expect(showWorkspaceToast).toHaveBeenCalledWith(expect.stringContaining("Can't drop"));
    });

    it('an unrecognized drag payload with no name is a no-op AND shows visible feedback', async () => {
      const setInsightProp = jest.fn();
      const showWorkspaceToast = jest.fn();
      useStore.setState({ setInsightProp, showWorkspaceToast });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('x', { type: 'mystery-payload' });
      expect(setInsightProp).not.toHaveBeenCalled();
      expect(showWorkspaceToast).toHaveBeenCalled();
    });

    it('a completely null/undefined dragData is a silent no-op (defensive guard)', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      expect(() => mockCaptured.onDropField('x', null)).not.toThrow();
      expect(setInsightProp).not.toHaveBeenCalled();
    });

    it('falls back to `preview_model` when explorerActiveModelName is unset', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp, explorerActiveModelName: undefined });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      mockCaptured.onDropField('x', { type: 'column', name: 'region' });
      expect(setInsightProp).toHaveBeenCalledWith(
        'test_insight',
        'x',
        '?{${ref(preview_model).region}}'
      );
    });
  });

  // T4 (pills-buildrail #4): pills can be dragged BETWEEN slots — the whole
  // pill is a drag source (PropertyRow) whose payload reaches this same
  // onDropField as `{ source: 'pill', sourcePath, raw }`.
  describe('pill-to-pill move (T4 — drag a pill between slots)', () => {
    it('moves the resolved expression from the source slot to the target slot, clearing the source', async () => {
      const setInsightProp = jest.fn();
      const removeInsightProp = jest.fn();
      useStore.setState({ setInsightProp, removeInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('y', {
        source: 'pill',
        sourcePath: 'x',
        raw: '${ref(orders_q).amount}',
      });

      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'y', '?{${ref(orders_q).amount}}');
      expect(removeInsightProp).toHaveBeenCalledWith('test_insight', 'x');
    });

    it('dropping a pill back onto its own slot is a no-op', async () => {
      const setInsightProp = jest.fn();
      const removeInsightProp = jest.fn();
      useStore.setState({ setInsightProp, removeInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('x', {
        source: 'pill',
        sourcePath: 'x',
        raw: '${ref(orders_q).amount}',
      });

      expect(setInsightProp).not.toHaveBeenCalled();
      expect(removeInsightProp).not.toHaveBeenCalled();
    });

    it('a pill drag missing sourcePath or raw is a no-op (defensive guard)', async () => {
      const setInsightProp = jest.fn();
      const removeInsightProp = jest.fn();
      useStore.setState({ setInsightProp, removeInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('y', { source: 'pill', sourcePath: 'x' }); // no `raw`
      mockCaptured.onDropField('y', { source: 'pill', raw: '${ref(orders_q).amount}' }); // no `sourcePath`
      expect(setInsightProp).not.toHaveBeenCalled();
      expect(removeInsightProp).not.toHaveBeenCalled();
    });
  });

  describe('advisory ref-target validation (externalErrors)', () => {
    it('flags a ref to a name absent from BOTH store collections AND the draft query names', async () => {
      useStore.setState({
        explorerModelTabs: ['orders_q'],
        models: [{ name: 'some_other_model' }],
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            props: { x: '?{${ref(nonexistent_thing).col}}' },
          },
        },
      });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      expect(mockCaptured.externalErrors).toHaveProperty('x');
    });

    it('does NOT flag a ref to the exploration OWN scratch query name (never a real store model)', async () => {
      useStore.setState({
        explorerModelTabs: ['orders_q'],
        models: [],
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            props: { x: '?{${ref(orders_q).amount}}' },
          },
        },
      });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      expect(mockCaptured.externalErrors).not.toHaveProperty('x');
    });
  });

  describe('interactions', () => {
    it('Add Interaction calls addInsightInteraction', async () => {
      const addInsightInteraction = jest.fn();
      useStore.setState({ addInsightInteraction });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      fireEvent.click(await screen.findByTestId('insight-add-interaction-test_insight'));
      expect(addInsightInteraction).toHaveBeenCalledWith('test_insight', { type: 'filter', value: '' });
    });

    it('renders + removes an existing interaction row', async () => {
      const removeInsightInteraction = jest.fn();
      useStore.setState({
        removeInsightInteraction,
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            interactions: [{ type: 'filter', value: '?{${ref(orders_q).region}}' }],
          },
        },
      });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('insight-interaction-0');
      fireEvent.click(screen.getByTestId('insight-remove-interaction-0'));
      expect(removeInsightInteraction).toHaveBeenCalledWith('test_insight', 0);
    });
  });

  // Explore 2.0 Phase 4 (06 §4): "Save as metric…" orchestration. The actual
  // flow logic (collision/aggregate-ness/saveMetric/slot-swap/dedup) is unit-
  // tested in isolation in saveAsMetricFlow.test.js — these tests only pin
  // that InsightBuildSection wires the prompt + `saveAsMetric` + the
  // resulting dedup-offer banner correctly.
  describe('Save as metric orchestration', () => {
    beforeEach(() => {
      saveAsMetric.mockReset();
    });

    it('onSaveAsMetric is wired to TracePropsEditor and opens the prompt, pre-filled with the suggested name', async () => {
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      expect(mockCaptured.onSaveAsMetric).toBeInstanceOf(Function);

      act(() => {
        mockCaptured.onSaveAsMetric('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      });

      expect(screen.getByTestId('save-as-metric-prompt')).toBeInTheDocument();
      expect(screen.getByTestId('save-as-metric-name-input')).toHaveValue('orders_q_amount_sum');
    });

    it('submitting calls saveAsMetric with the pill state, insightName, path, and getState', async () => {
      saveAsMetric.mockResolvedValue({ success: true, dedupOffer: null });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      const pillState = { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' };
      act(() => {
        mockCaptured.onSaveAsMetric('y', pillState);
      });
      fireEvent.click(screen.getByTestId('save-as-metric-submit'));

      await screen.findByTestId('trace-props-editor-mock'); // settle
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          pillState,
          name: 'orders_q_amount_sum',
          insightName: 'test_insight',
          path: 'y',
          getState: expect.any(Function),
        })
      );
    });

    it('a successful submit closes the prompt (never re-shows a stale error)', async () => {
      saveAsMetric.mockResolvedValue({ success: true, dedupOffer: null });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      act(() => {
        mockCaptured.onSaveAsMetric('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      });
      fireEvent.click(screen.getByTestId('save-as-metric-submit'));

      await waitFor(() =>
        expect(screen.queryByTestId('save-as-metric-prompt')).not.toBeInTheDocument()
      );
    });

    it('a failed submit (e.g. name collision) shows the inline error and keeps the prompt open', async () => {
      saveAsMetric.mockResolvedValue({
        success: false,
        error: 'A metric named "orders_q_amount_sum" already exists — choose another name.',
      });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      act(() => {
        mockCaptured.onSaveAsMetric('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      });
      fireEvent.click(screen.getByTestId('save-as-metric-submit'));

      await screen.findByTestId('save-as-metric-error');
      expect(screen.getByTestId('save-as-metric-error')).toHaveTextContent('already exists');
      expect(screen.getByTestId('save-as-metric-prompt')).toBeInTheDocument();
    });

    it('Cancel closes the prompt without calling saveAsMetric', async () => {
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      act(() => {
        mockCaptured.onSaveAsMetric('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      });
      fireEvent.click(screen.getByTestId('save-as-metric-cancel'));
      expect(screen.queryByTestId('save-as-metric-prompt')).not.toBeInTheDocument();
      expect(saveAsMetric).not.toHaveBeenCalled();
    });

    it('a dedupOffer on success renders the FieldSwapOfferBanner (never a silent match-and-replace)', async () => {
      saveAsMetric.mockResolvedValue({
        success: true,
        dedupOffer: {
          promotedType: 'metric',
          promotedName: 'orders_q_amount_sum',
          slots: [{ insightName: 'other', location: 'prop', key: 'y', swapTo: { kind: 'metricRef', ref: 'orders_q_amount_sum' } }],
        },
      });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      act(() => {
        mockCaptured.onSaveAsMetric('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      });
      fireEvent.click(screen.getByTestId('save-as-metric-submit'));

      await screen.findByTestId('field-swap-offer-banner');
      expect(screen.getByTestId('field-swap-offer-orders_q_amount_sum')).toBeInTheDocument();
    });
  });

  describe('InteractionRow value parsing', () => {
    const renderWithInteraction = interaction => {
      useStore.setState({
        explorerInsightStates: {
          test_insight: { ...defaultInsightState, interactions: [interaction] },
        },
      });
      return render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
    };

    it('unwraps a `?{...}` query-string value to its inner body for the chip editor', async () => {
      renderWithInteraction({ type: 'filter', value: '?{${ref(orders_q).region}}' });
      const textarea = await screen.findByTestId('mock-ref-textarea');
      expect(textarea).toHaveValue('${ref(orders_q).region}');
    });

    it('a plain non-query-string value passes through unchanged (no match -> use as-is)', async () => {
      renderWithInteraction({ type: 'filter', value: 'not-a-query-string' });
      const textarea = await screen.findByTestId('mock-ref-textarea');
      expect(textarea).toHaveValue('not-a-query-string');
    });

    it('a missing `value` defaults to an empty string (no crash)', async () => {
      renderWithInteraction({ type: 'filter' });
      const textarea = await screen.findByTestId('mock-ref-textarea');
      expect(textarea).toHaveValue('');
    });

    it('a missing `type` defaults the Select to "filter"', async () => {
      renderWithInteraction({ value: '' });
      const select = await screen.findByTestId('interaction-type-select-0');
      expect(select).toHaveTextContent('Filter');
    });

    it('editing the value back to empty writes an empty string (not `?{}`)', async () => {
      const updateInsightInteraction = jest.fn();
      useStore.setState({ updateInsightInteraction });
      renderWithInteraction({ type: 'filter', value: '?{${ref(orders_q).region}}' });
      const textarea = await screen.findByTestId('mock-ref-textarea');
      fireEvent.change(textarea, { target: { value: '' } });
      expect(updateInsightInteraction).toHaveBeenCalledWith('test_insight', 0, { value: '' });
    });

    it('editing the value to a non-empty body wraps it in `?{...}`', async () => {
      const updateInsightInteraction = jest.fn();
      useStore.setState({ updateInsightInteraction });
      renderWithInteraction({ type: 'filter', value: '' });
      const textarea = await screen.findByTestId('mock-ref-textarea');
      fireEvent.change(textarea, { target: { value: '${ref(orders_q).region}' } });
      expect(updateInsightInteraction).toHaveBeenCalledWith('test_insight', 0, {
        value: '?{${ref(orders_q).region}}',
      });
    });

    it('changing the interaction type select calls updateInsightInteraction with the new type', async () => {
      const updateInsightInteraction = jest.fn();
      useStore.setState({ updateInsightInteraction });
      renderWithInteraction({ type: 'filter', value: '' });
      // The real react-select-backed <Select> (see components/common/Select.jsx) —
      // driven the same way TracePropsEditor's TypeSelector tests drive it:
      // focus + open + click the rendered option.
      const container = await screen.findByTestId('interaction-type-select-0');
      const input = container.querySelector('input[role="combobox"]') || screen.getAllByRole('combobox')[0];
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      const splitOption = await screen.findByText('Split');
      fireEvent.click(splitOption);
      expect(updateInsightInteraction).toHaveBeenCalledWith('test_insight', 0, { type: 'split' });
    });
  });

  describe('handleTracePropsChange guard branches', () => {
    it('a null/non-object payload from TracePropsEditor is a silent no-op', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      expect(() => {
        mockCaptured.onChange(null);
        mockCaptured.onChange('a string');
        mockCaptured.onChange(42);
      }).not.toThrow();
      expect(setInsightProp).not.toHaveBeenCalled();
    });

    it('a payload arriving after the insight has been removed from the store is a silent no-op', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      const capturedOnChange = mockCaptured.onChange;
      // Simulate the insight having been removed from the chart in the
      // meantime (e.g. a race with a remove action) before the stale
      // TracePropsEditor callback fires.
      act(() => {
        useStore.setState(s => {
          const next = { ...s.explorerInsightStates };
          delete next.test_insight;
          return { explorerInsightStates: next };
        });
      });
      expect(() => {
        capturedOnChange({ type: 'scatter', x: '1' });
      }).not.toThrow();
      expect(setInsightProp).not.toHaveBeenCalled();
    });

    it('diffs correctly when the CURRENT insight has no `props` key at all (props||{} fallback)', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({
        setInsightProp,
        explorerInsightStates: {
          test_insight: { type: 'scatter', interactions: [], isNew: true }, // no `props`
        },
      });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      mockCaptured.onChange({ type: 'scatter', x: '1' });
      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'x', '1');
    });
  });

  describe('resolveSourceDialect (Explore 2.0 Phase 4 "Save as metric" dialect gate)', () => {
    beforeEach(() => {
      saveAsMetric.mockReset();
      saveAsMetric.mockResolvedValue({ success: true, dedupOffer: null });
    });

    const openAndSubmit = async (path, pillState) => {
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      act(() => {
        mockCaptured.onSaveAsMetric(path, pillState);
      });
      fireEvent.click(screen.getByTestId('save-as-metric-submit'));
      await waitFor(() => expect(saveAsMetric).toHaveBeenCalled());
    };

    it('resolves via a promoted model with config.source + a matching source.type', async () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: 'ref(warehouse)' } }],
        sources: [{ name: 'warehouse', type: 'mysql' }],
      });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: 'mysql' })
      );
    });

    it('resolves via model.source (no .config wrapper)', async () => {
      useStore.setState({
        models: [{ name: 'orders_q', source: 'ref(warehouse)' }],
        sources: [{ name: 'warehouse', type: 'sqlite' }],
      });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: 'sqlite' })
      );
    });

    it('resolves the source via source_name when .name does not match', async () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: 'ref(warehouse)' } }],
        sources: [{ source_name: 'warehouse', type: 'snowflake' }],
      });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: 'snowflake' })
      );
    });

    it('resolves the source type via source.config.type when .type is absent', async () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: 'ref(warehouse)' } }],
        sources: [{ name: 'warehouse', config: { type: 'mysql' } }],
      });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: 'mysql' })
      );
    });

    it('normalizes postgresql to "postgres"', async () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: 'ref(warehouse)' } }],
        sources: [{ name: 'warehouse', type: 'postgresql' }],
      });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: 'postgres' })
      );
    });

    it('a promoted model with an unresolved source falls through to the draft binding', async () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: 'ref(missing_source)' } }],
        sources: [],
        explorerModelStates: { orders_q: { sourceName: 'warehouse' } },
        explorerSources: [{ source_name: 'warehouse', type: 'mysql' }],
      });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: 'mysql' })
      );
    });

    it('no model at all resolves an undefined dialect (fails open)', async () => {
      useStore.setState({ models: [], sources: [], explorerSources: [], explorerModelStates: {} });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: undefined })
      );
    });

    it('a resolved model with NO source reference at all falls through to the draft binding', async () => {
      useStore.setState({
        models: [{ name: 'orders_q' }], // no config.source, no source
        sources: [],
        explorerModelStates: { orders_q: { sourceName: 'warehouse' } },
        explorerSources: [{ source_name: 'warehouse', type: 'mysql' }],
      });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: 'mysql' })
      );
    });

    it('tolerates `sources` being undefined (not just empty) — falls through without crashing', async () => {
      useStore.setState({
        models: [{ name: 'orders_q', config: { source: 'ref(warehouse)' } }],
        sources: undefined,
        explorerModelStates: { orders_q: { sourceName: 'warehouse' } },
        explorerSources: [{ source_name: 'warehouse', type: 'snowflake' }],
      });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: 'snowflake' })
      );
    });

    it('tolerates `models` being undefined (not just empty) — falls through without crashing', async () => {
      useStore.setState({
        models: undefined,
        sources: [],
        explorerModelStates: { orders_q: { sourceName: 'warehouse' } },
        explorerSources: [{ source_name: 'warehouse', type: 'mysql' }],
      });
      await openAndSubmit('y', { kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' });
      expect(saveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ sourceDialect: 'mysql' })
      );
    });
  });

  describe('advisoryErrors defensive fallbacks', () => {
    it('tolerates `modelTabs` being undefined (not just empty) — no crash', async () => {
      useStore.setState({ explorerModelTabs: undefined });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
    });

    it('tolerates `models` being undefined (not just empty) — no crash', async () => {
      useStore.setState({ models: undefined });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
    });
  });

  describe('status dot', () => {
    it('renders green for a "new" insight status', async () => {
      useStore.setState({ explorerDiffResult: { insights: { test_insight: 'new' } } });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      const dot = await screen.findByTestId('insight-status-dot-test_insight');
      expect(dot.className).toContain('bg-green-500');
    });

    it('renders amber for any non-"new" status', async () => {
      useStore.setState({ explorerDiffResult: { insights: { test_insight: 'modified' } } });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      const dot = await screen.findByTestId('insight-status-dot-test_insight');
      expect(dot.className).toContain('bg-amber-500');
    });

    it('renders no dot at all when there is no diff status', async () => {
      useStore.setState({ explorerDiffResult: null });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');
      expect(screen.queryByTestId('insight-status-dot-test_insight')).not.toBeInTheDocument();
    });
  });

  describe('rename flow', () => {
    it('clicking the name enters rename mode ONLY when the insight isNew', async () => {
      useStore.setState({
        explorerInsightStates: { test_insight: { ...defaultInsightState, isNew: false } },
      });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      fireEvent.click(await screen.findByTestId('insight-name-test_insight'));
      expect(screen.queryByTestId('insight-rename-input-test_insight')).not.toBeInTheDocument();
    });

    it('clicking the name on a NEW insight enters rename mode, pre-filled with the current name', async () => {
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      fireEvent.click(await screen.findByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      expect(input).toHaveValue('test_insight');
    });

    it('committing a trimmed, changed name on blur calls renameInsight and exits rename mode', async () => {
      const renameInsight = jest.fn();
      useStore.setState({ renameInsight });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      fireEvent.click(await screen.findByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: '  renamed_insight  ' } });
      fireEvent.blur(input);
      expect(renameInsight).toHaveBeenCalledWith('test_insight', 'renamed_insight');
      expect(screen.queryByTestId('insight-rename-input-test_insight')).not.toBeInTheDocument();
    });

    it('committing the SAME (or empty/whitespace) name is a no-op that just exits rename mode', async () => {
      const renameInsight = jest.fn();
      useStore.setState({ renameInsight });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      fireEvent.click(await screen.findByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.blur(input);
      expect(renameInsight).not.toHaveBeenCalled();
      expect(screen.queryByTestId('insight-rename-input-test_insight')).not.toBeInTheDocument();
    });

    it('Enter commits the rename (same path as blur)', async () => {
      const renameInsight = jest.fn();
      useStore.setState({ renameInsight });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      fireEvent.click(await screen.findByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: 'enter_name' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(renameInsight).toHaveBeenCalledWith('test_insight', 'enter_name');
    });

    it('Escape cancels the rename without committing', async () => {
      const renameInsight = jest.fn();
      useStore.setState({ renameInsight });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      fireEvent.click(await screen.findByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: 'abandoned' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(renameInsight).not.toHaveBeenCalled();
      expect(screen.queryByTestId('insight-rename-input-test_insight')).not.toBeInTheDocument();
    });

    it('a NAME_COLLISION error shows inline and keeps the rename input open', async () => {
      const renameInsight = jest.fn(() => {
        const err = new Error('Name "dupe" is already in use. Choose a different name.');
        err.code = 'NAME_COLLISION';
        throw err;
      });
      useStore.setState({ renameInsight });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      fireEvent.click(await screen.findByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: 'dupe' } });
      fireEvent.blur(input);
      const error = screen.getByTestId('insight-rename-error-test_insight');
      expect(error).toHaveTextContent('already in use');
      expect(screen.getByTestId('insight-rename-input-test_insight')).toHaveValue('dupe');
    });

    it('typing after a collision error clears it', async () => {
      const renameInsight = jest.fn(() => {
        const err = new Error('Name "dupe" is already in use.');
        err.code = 'NAME_COLLISION';
        throw err;
      });
      useStore.setState({ renameInsight });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      fireEvent.click(await screen.findByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: 'dupe' } });
      fireEvent.blur(input);
      expect(screen.getByTestId('insight-rename-error-test_insight')).toBeInTheDocument();
      fireEvent.change(input, { target: { value: 'dupe_2' } });
      expect(screen.queryByTestId('insight-rename-error-test_insight')).not.toBeInTheDocument();
    });

    // Note: `commitRename`'s `if (err?.code === 'NAME_COLLISION') {...} throw err;`
    // rethrow-of-a-non-collision-error branch is intentionally NOT covered
    // here. React's synthetic event dispatch surfaces an error thrown inside
    // an event handler as an "Uncaught" console.error via jsdom's global
    // error-event plumbing (not a catchable exception from `fireEvent.blur`
    // itself, nor deterministically observable via a `console.error` spy in
    // this environment/RTL version) — every attempt produced a flaky,
    // environment-dependent result rather than a genuine assertion. The
    // sibling `ChartBuildSection.jsx` has the exact same rethrow shape in its
    // own `commitRename`, and `ChartBuildSection.test.jsx` doesn't attempt to
    // cover it either, for the same reason.
  });
});
