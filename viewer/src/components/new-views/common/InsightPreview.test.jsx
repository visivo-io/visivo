import React from 'react';
import { render, screen } from '@testing-library/react';
import InsightPreview from './InsightPreview';
import { usePreviewInsightData } from '../../../hooks/usePreviewData';
import { usePreviewInputDependencies } from '../workspace/usePreviewInputDependencies';

// Mock the two-mode resolver (VIS-1002) and the shared input-dependency hook
// (VIS-1003). The component is a thin shell over them, so mocking both keeps
// this a focused unit test of the render branches.
jest.mock('../../../hooks/usePreviewData', () => ({
  usePreviewInsightData: jest.fn(),
}));
jest.mock('../workspace/usePreviewInputDependencies', () => ({
  usePreviewInputDependencies: jest.fn(),
}));
jest.mock('../../items/Chart', () => ({ chart }) => (
  <div data-testid="chart-component">Chart: {chart?.name}</div>
));
jest.mock('../../items/Input', () => ({ input }) => (
  <div data-testid="input-component">Input: {input?.name}</div>
));

describe('InsightPreview', () => {
  const defaultInsightConfig = {
    name: 'test_insight',
    props: {
      type: 'scatter',
      x: 'ref(model).column_x',
      y: 'ref(model).column_y',
    },
    interactions: [],
  };

  const setResolver = (overrides = {}) => {
    usePreviewInsightData.mockReturnValue({
      isLoading: false,
      error: null,
      progress: 0,
      progressMessage: '',
      chartInsightKey: 'test_insight',
      insightNotInMain: false,
      ...overrides,
    });
  };

  const setInputs = (inputConfigs = []) => {
    usePreviewInputDependencies.mockReturnValue({ inputConfigs });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setResolver();
    setInputs([]);
  });

  describe('Unsaved insights', () => {
    it('shows message for unsaved insights without name', () => {
      setResolver({ chartInsightKey: null });
      render(<InsightPreview insightConfig={{ props: { type: 'scatter' } }} projectId="proj-1" />);

      expect(screen.getByTestId('unsaved-insight-message')).toBeInTheDocument();
      expect(screen.getByText('Save to Preview with Data')).toBeInTheDocument();
      expect(screen.getByText(/Save the insight and run 'visivo run'/)).toBeInTheDocument();
    });

    it('shows message for preview placeholder name', () => {
      setResolver({ chartInsightKey: '__preview____preview__' });
      render(
        <InsightPreview
          insightConfig={{ name: '__preview__', props: { type: 'scatter' } }}
          projectId="proj-1"
        />
      );

      expect(screen.getByTestId('unsaved-insight-message')).toBeInTheDocument();
      expect(screen.getByText('Save to Preview with Data')).toBeInTheDocument();
    });
  });

  describe('Saved insights', () => {
    it('calls usePreviewInsightData with insight config and projectId', () => {
      render(<InsightPreview insightConfig={defaultInsightConfig} projectId="proj-1" />);

      expect(usePreviewInsightData).toHaveBeenCalledWith(defaultInsightConfig, {
        projectId: 'proj-1',
      });
    });

    it('passes the resolved insight name to the input-dependency hook', () => {
      render(<InsightPreview insightConfig={defaultInsightConfig} projectId="proj-1" />);

      expect(usePreviewInputDependencies).toHaveBeenCalledWith('proj-1', {
        insightNames: ['test_insight'],
        configForFallback: defaultInsightConfig,
      });
    });

    it('renders chart when insight has a resolved key', () => {
      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
          layoutValues={{ title: 'Test Chart' }}
        />
      );

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });

    it('points the synthetic chart at the resolved (MODE A) un-prefixed key', () => {
      setResolver({ chartInsightKey: 'test_insight' });
      render(<InsightPreview insightConfig={defaultInsightConfig} projectId="proj-1" />);

      // MODE A: chart references the un-prefixed insight name.
      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });
  });

  describe('Loading and error states', () => {
    it('shows loading state when preview is running', () => {
      setResolver({ isLoading: true, progress: 0.5, progressMessage: 'Running query...' });
      render(<InsightPreview insightConfig={defaultInsightConfig} projectId="proj-1" />);

      expect(screen.getByTestId('preview-loading')).toBeInTheDocument();
      expect(screen.getByText('Running Preview')).toBeInTheDocument();
      expect(screen.getByText('Running query...')).toBeInTheDocument();
    });

    it('shows error state when preview fails', () => {
      setResolver({ error: 'Query syntax error' });
      render(<InsightPreview insightConfig={defaultInsightConfig} projectId="proj-1" />);

      expect(screen.getByTestId('preview-error')).toBeInTheDocument();
      expect(screen.getByText('Preview Failed')).toBeInTheDocument();
      expect(screen.getByText('Query syntax error')).toBeInTheDocument();
    });
  });

  describe('Input controls', () => {
    it('does not render input controls section when no inputs referenced', () => {
      setInputs([]);
      render(<InsightPreview insightConfig={defaultInsightConfig} projectId="proj-1" />);

      expect(screen.queryByTestId('input-controls-section')).not.toBeInTheDocument();
    });

    it('renders an input widget for each resolved input config', () => {
      setInputs([{ name: 'show_markers', type: 'single-select' }]);
      render(<InsightPreview insightConfig={defaultInsightConfig} projectId="proj-1" />);

      expect(screen.getByTestId('input-controls-section')).toBeInTheDocument();
      expect(screen.getByTestId('input-component')).toHaveTextContent('show_markers');
    });

    it('renders the input controls outside the chart (above it) when both present', () => {
      setInputs([{ name: 'show_markers', type: 'single-select' }]);
      render(<InsightPreview insightConfig={defaultInsightConfig} projectId="proj-1" />);

      expect(screen.getByTestId('input-component')).toBeInTheDocument();
      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });
  });

  describe('Layout configuration', () => {
    it('applies layout values to chart', () => {
      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
          layoutValues={{ title: 'Custom Title', showlegend: true }}
        />
      );

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });

    it('uses default layout when no layoutValues provided', () => {
      render(<InsightPreview insightConfig={defaultInsightConfig} projectId="proj-1" />);

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('renders without crashing when insightConfig is null', () => {
      setResolver({ chartInsightKey: null });
      render(<InsightPreview insightConfig={null} projectId="proj-1" />);

      expect(screen.getByTestId('unsaved-insight-message')).toBeInTheDocument();
      expect(screen.getByText('Save to Preview with Data')).toBeInTheDocument();
    });
  });
});
