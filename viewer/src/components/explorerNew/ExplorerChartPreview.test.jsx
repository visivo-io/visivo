/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerChartPreview from './ExplorerChartPreview';
import useStore from '../../stores/store';

// Capture the chart preview job hook args across renders so we can assert on payload shape.
let lastPreviewRequest = null;

jest.mock('../../hooks/usePreviewData', () => ({
  useChartPreviewJob: jest.fn((previewRequest) => {
    lastPreviewRequest = previewRequest;
    return {
      isLoading: false,
      isCompleted: false,
      isFailed: false,
      error: null,
      progress: 0,
      progressMessage: '',
      runInstanceId: null,
      previewRunId: null,
      previewInsightKeys: (previewRequest?.insight_names || []).map(n => `__preview__${n}`),
      status: null,
      resetPreview: jest.fn(),
    };
  }),
}));

jest.mock('../../hooks/useInputsData', () => ({
  useInputsData: jest.fn(),
}));

jest.mock('../new-views/common/ChartPreview', () => {
  return function MockChartPreview({ chartConfig, insightKeys, projectId }) {
    return (
      <div data-testid="chart-preview-component">
        <span data-testid="cp-chart-name">{chartConfig?.name}</span>
        <span data-testid="cp-insight-keys">{JSON.stringify(insightKeys)}</span>
        <span data-testid="cp-project-id">{projectId}</span>
        <span data-testid="cp-layout">{JSON.stringify(chartConfig?.layout)}</span>
      </div>
    );
  };
});

const makeModelState = (overrides = {}) => ({
  sql: '',
  sourceName: null,
  queryResult: null,
  queryError: null,
  computedColumns: [],
  enrichedResult: null,
  isNew: true,
  ...overrides,
});

const defaultState = {
  explorerModelStates: {},
  explorerModelTabs: [],
  explorerActiveModelName: null,
  explorerInsightStates: {},
  explorerActiveInsightName: null,
  explorerChartInsightNames: [],
  explorerChartName: 'test_chart',
  explorerChartLayout: {},
  project: { id: 'proj-1' },
  inputs: [],
  setChartLayout: layout => useStore.setState({ explorerChartLayout: layout }),
};

describe('ExplorerChartPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastPreviewRequest = null;
    useStore.setState(defaultState);
  });

  it('shows empty state when no insights attached to chart', () => {
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('chart-empty-no-insights')).toBeInTheDocument();
    expect(lastPreviewRequest).toBeNull();
  });

  it('renders ChartPreview when at least one insight has data props', () => {
    useStore.setState({
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: {
          type: 'scatter',
          props: { x: '?{${ref(sales).date}}', y: '?{${ref(sales).amount}}' },
          interactions: [],
          typePropsCache: {},
          isNew: true,
        },
      },
    });

    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('chart-preview-component')).toBeInTheDocument();
  });

  it('uses raw insight names in insight_names (no concatenation)', () => {
    useStore.setState({
      explorerChartInsightNames: ['my_insight'],
      explorerInsightStates: {
        my_insight: {
          type: 'scatter',
          props: { x: '?{${ref(sales).date}}', y: '?{${ref(sales).amount}}' },
          interactions: [],
          typePropsCache: {},
          isNew: true,
        },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPreviewRequest.insight_names).toEqual(['my_insight']);
    expect(lastPreviewRequest.context_objects.insights[0].name).toBe('my_insight');
  });

  it('sends one request containing every chart insight', () => {
    useStore.setState({
      explorerChartInsightNames: ['a', 'b', 'c'],
      explorerInsightStates: {
        a: { type: 'scatter', props: { x: '?{${ref(m).x}}' }, interactions: [] },
        b: { type: 'scatter', props: { x: '?{${ref(m).x}}' }, interactions: [] },
        c: { type: 'scatter', props: { x: '?{${ref(m).x}}' }, interactions: [] },
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPreviewRequest.insight_names).toEqual(['a', 'b', 'c']);
    expect(lastPreviewRequest.context_objects.insights).toHaveLength(3);
  });

  it('includes every explorerModelStates entry as a model override', () => {
    useStore.setState({
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: {
          type: 'scatter',
          props: { x: '?{${ref(sales).date}}' },
          interactions: [],
        },
      },
      explorerModelStates: {
        sales_model: makeModelState({ sql: 'SELECT * FROM sales', sourceName: 'pg' }),
        orders_model: makeModelState({ sql: 'SELECT * FROM orders', sourceName: 'pg' }),
      },
    });

    render(<ExplorerChartPreview />);

    expect(lastPreviewRequest.context_objects.models).toHaveLength(2);
    const modelNames = lastPreviewRequest.context_objects.models.map(m => m.name);
    expect(modelNames).toContain('sales_model');
    expect(modelNames).toContain('orders_model');
  });

  it('attaches computed columns as dimensions/metrics', () => {
    useStore.setState({
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: { x: '?{${ref(m).x}}' }, interactions: [] },
      },
      explorerModelStates: {
        sales: makeModelState({
          sql: 'SELECT * FROM sales',
          sourceName: 'pg',
          computedColumns: [
            { name: 'order_month', expression: "DATE_TRUNC('month', date)", type: 'dimension' },
            { name: 'total_rev', expression: 'SUM(amount)', type: 'metric' },
          ],
        }),
      },
    });

    render(<ExplorerChartPreview />);

    const model = lastPreviewRequest.context_objects.models[0];
    expect(model.dimensions).toEqual([
      { name: 'order_month', expression: "DATE_TRUNC('month', date)" },
    ]);
    expect(model.metrics).toEqual([{ name: 'total_rev', expression: 'SUM(amount)' }]);
  });

  it('builds preview request with no model tab open', () => {
    useStore.setState({
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: { x: '?{${ref(m).x}}' }, interactions: [] },
      },
      explorerModelStates: {},
      explorerModelTabs: [],
      explorerActiveModelName: null,
    });

    render(<ExplorerChartPreview />);

    expect(lastPreviewRequest).not.toBeNull();
    expect(lastPreviewRequest.insight_names).toEqual(['ins_1']);
    // No models in context_objects when nothing is being edited
    expect(lastPreviewRequest.context_objects.models).toBeUndefined();
  });

  it('passes chart name from store', () => {
    useStore.setState({
      explorerChartName: 'my_cool_chart',
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: { x: '?{${ref(m).x}}' }, interactions: [] },
      },
    });

    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('cp-chart-name')).toHaveTextContent('my_cool_chart');
  });

  it('passes chart layout from store', () => {
    useStore.setState({
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: { x: '?{${ref(m).x}}' }, interactions: [] },
      },
      explorerChartLayout: { title: { text: 'My Chart' } },
    });

    render(<ExplorerChartPreview />);
    const layout = JSON.parse(screen.getByTestId('cp-layout').textContent);
    expect(layout.title.text).toBe('My Chart');
  });

  it('passes projectId', () => {
    useStore.setState({
      project: { id: 'my-project-123' },
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: { x: '?{${ref(m).x}}' }, interactions: [] },
      },
    });

    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('cp-project-id')).toHaveTextContent('my-project-123');
  });

  it('forwards backend-format interactions', () => {
    useStore.setState({
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: {
          type: 'scatter',
          props: { x: '?{${ref(m).x}}' },
          interactions: [{ type: 'filter', value: '?{${ref(m).x} > 5}' }],
        },
      },
    });

    render(<ExplorerChartPreview />);

    const insight = lastPreviewRequest.context_objects.insights[0];
    expect(insight.interactions).toEqual([{ filter: '?{${ref(m).x} > 5}' }]);
  });

  it('drops insights with no data props beyond type', () => {
    useStore.setState({
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: { type: 'scatter', props: {}, interactions: [] },
      },
    });

    render(<ExplorerChartPreview />);

    // No data props → insight is dropped → request is null
    expect(lastPreviewRequest).toBeNull();
  });
});
