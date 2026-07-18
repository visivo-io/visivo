/* eslint-disable no-template-curly-in-string -- literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
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

function openSelectMenu(testId) {
  fireEvent.mouseDown(within(screen.getByTestId(testId)).getByRole('combobox'));
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

  it('renders type selector dropdown with CHART_TYPES', async () => {
    await renderSettled(
      <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );
    const select = screen.getByTestId('insight-type-select-test_insight');
    expect(select).toHaveTextContent('Scatter / Line');
    openSelectMenu('insight-type-select-test_insight');
    const options = screen.getAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['Scatter / Line', 'Bar', 'Pie']);
  });

  it('changing type via the top Select calls setInsightType', async () => {
    const setInsightType = jest.fn();
    useStore.setState({ setInsightType });
    await renderSettled(
      <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );
    openSelectMenu('insight-type-select-test_insight');
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'Bar'));
    expect(setInsightType).toHaveBeenCalledWith('test_insight', 'bar');
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

    it('a sourceTable drop is a no-op (not a scalar ref)', async () => {
      const setInsightProp = jest.fn();
      useStore.setState({ setInsightProp });
      render(
        <InsightBuildSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );
      await screen.findByTestId('trace-props-editor-mock');

      mockCaptured.onDropField('x', { type: 'sourceTable', name: 'orders' });
      expect(setInsightProp).not.toHaveBeenCalled();
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
});
