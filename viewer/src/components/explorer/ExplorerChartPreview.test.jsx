/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerChartPreview from './ExplorerChartPreview';
import useStore from '../../stores/store';
import useDraftInsightPreview from '../../hooks/useDraftInsightPreview';

// Explore 2.0 Phase 4: ExplorerChartPreview no longer builds the dead
// context_objects preview-job request — it drives `useDraftInsightPreview`
// (the client-side compile-draft + DuckDB lane) directly. Mocked here since
// its own behavior is unit-tested in `hooks/useDraftInsightPreview.test.js`.
jest.mock('../../hooks/useDraftInsightPreview', () => jest.fn());

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

  it('forwards isLoading/error from useDraftInsightPreview', () => {
    useDraftInsightPreview.mockReturnValue({
      ...defaultDraftPreview,
      isLoading: true,
      error: 'boom',
    });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('cp-is-loading')).toHaveTextContent('true');
    expect(screen.getByTestId('cp-error')).toHaveTextContent('boom');
  });

  it('renders the graceful "run the query first" state instead of ChartPreview on a model_not_run block', () => {
    useDraftInsightPreview.mockReturnValue({
      ...defaultDraftPreview,
      blockedReason: 'model_not_run',
      blockedModel: 'cohort_q',
    });
    render(<ExplorerChartPreview />);
    expect(screen.getByTestId('chart-preview-run-first')).toBeInTheDocument();
    expect(screen.getByTestId('chart-preview-run-first')).toHaveTextContent('cohort_q');
    expect(screen.queryByTestId('chart-preview-component')).not.toBeInTheDocument();
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
});
