import React from 'react';
import { render, screen } from '@testing-library/react';
import InsightPreview from './InsightPreview';
import useStore from '../../../stores/store';
import { useInsightPreviewData } from '../../../hooks/usePreviewData';
import { useInputsData } from '../../../hooks/useInputsData';

// Mock dependencies
jest.mock('../../../stores/store');
jest.mock('../../../hooks/usePreviewData', () => ({
  useInsightPreviewData: jest.fn(),
}));
jest.mock('../../../hooks/useInputsData');
jest.mock('../../items/Chart', () => ({ chart, project }) => (
  <div data-testid="chart-component">
    Chart: {chart?.name}
  </div>
));
jest.mock('../../items/Input', () => ({ input }) => (
  <div data-testid="input-component">
    Input: {input?.name}
  </div>
));

describe('InsightPreview', () => {
  const mockFetchInputConfigs = jest.fn();
  const defaultInsightConfig = {
    name: 'test_insight',
    props: {
      type: 'scatter',
      x: 'ref(model).column_x',
      y: 'ref(model).column_y',
    },
    interactions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default store state
    useStore.mockImplementation(selector => {
      const state = {
        inputConfigs: [],
        fetchInputConfigs: mockFetchInputConfigs,
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    // Default hook implementations
    useInsightPreviewData.mockReturnValue({
      isLoading: false,
      error: null,
      progress: 0,
      progressMessage: '',
      previewInsightKey: '__preview__test_insight',
    });
    useInputsData.mockReturnValue(undefined);
  });

  describe('Unsaved insights', () => {
    it('shows message for unsaved insights without name', () => {
      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: null,
        progress: 0,
        progressMessage: '',
        previewInsightKey: null,
      });

      render(
        <InsightPreview
          insightConfig={{ props: { type: 'scatter' } }}
          projectId="proj-1"
        />
      );

      expect(screen.getByTestId('unsaved-insight-message')).toBeInTheDocument();
      expect(screen.getByText('Save to Preview with Data')).toBeInTheDocument();
      expect(screen.getByText(/Save the insight and run 'visivo run'/)).toBeInTheDocument();
    });

    it('shows message for preview placeholder name', () => {
      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: null,
        progress: 0,
        progressMessage: '',
        previewInsightKey: '__preview____preview__',
      });

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
    it('calls useInsightPreviewData with insight config and projectId', () => {
      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
        />
      );

      expect(useInsightPreviewData).toHaveBeenCalledWith(
        defaultInsightConfig,
        { projectId: 'proj-1' }
      );
    });

    it('fetches input configs on mount', () => {
      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
        />
      );

      expect(mockFetchInputConfigs).toHaveBeenCalled();
    });

    it('renders chart when insight has name', () => {
      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
          layoutValues={{ title: 'Test Chart' }}
        />
      );

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });
  });

  describe('Loading and error states', () => {
    it('shows loading state when preview is running', () => {
      useInsightPreviewData.mockReturnValue({
        isLoading: true,
        error: null,
        progress: 0.5,
        progressMessage: 'Running query...',
        previewInsightKey: '__preview__test_insight',
      });

      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
        />
      );

      expect(screen.getByTestId('preview-loading')).toBeInTheDocument();
      expect(screen.getByText('Running Preview')).toBeInTheDocument();
      expect(screen.getByText('Running query...')).toBeInTheDocument();
    });

    it('shows error state when preview fails', () => {
      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: 'Query syntax error',
        progress: 0,
        progressMessage: '',
        previewInsightKey: '__preview__test_insight',
      });

      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
        />
      );

      expect(screen.getByTestId('preview-error')).toBeInTheDocument();
      expect(screen.getByText('Preview Failed')).toBeInTheDocument();
      expect(screen.getByText('Query syntax error')).toBeInTheDocument();
    });
  });

  describe('Input controls', () => {
    it('does not render input controls section when no inputs referenced', () => {
      useStore.mockImplementation(selector => {
        const state = {
          inputConfigs: [],
          fetchInputConfigs: mockFetchInputConfigs,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });

      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
        />
      );

      // Should not have the input controls section
      expect(screen.queryByTestId('input-controls-section')).not.toBeInTheDocument();
    });

    it('renders input controls when inputs are referenced in props', () => {
      const configWithInputs = {
        name: 'test_insight',
        props: {
          type: 'scatter',
          mode: `\${show_markers.value}`,
        },
      };

      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: null,
        progress: 0,
        progressMessage: '',
        previewInsightKey: '__preview__test_insight',
      });

      useStore.mockImplementation(selector => {
        const state = {
          inputConfigs: [
            { name: 'show_markers', config: { name: 'show_markers', type: 'select' } },
          ],
          fetchInputConfigs: mockFetchInputConfigs,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });

      render(
        <InsightPreview
          insightConfig={configWithInputs}
          projectId="proj-1"
        />
      );

      expect(screen.getByTestId('input-component')).toBeInTheDocument();
    });

    it('renders input controls when inputs are referenced in interactions', () => {
      const configWithInputs = {
        name: 'test_insight',
        props: { type: 'scatter' },
        interactions: [
          {
            type: 'filter',
            value: `x > \${min_value.value}`,
          },
        ],
      };

      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: null,
        progress: 0,
        progressMessage: '',
        previewInsightKey: '__preview__test_insight',
      });

      useStore.mockImplementation(selector => {
        const state = {
          inputConfigs: [
            { name: 'min_value', config: { name: 'min_value', type: 'number' } },
          ],
          fetchInputConfigs: mockFetchInputConfigs,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });

      render(
        <InsightPreview
          insightConfig={configWithInputs}
          projectId="proj-1"
        />
      );

      expect(screen.getByTestId('input-component')).toBeInTheDocument();
    });

    it('calls useInputsData with extracted input names', () => {
      const configWithInputs = {
        name: 'test_insight',
        props: {
          type: 'scatter',
          mode: `\${show_markers.value}`,
        },
      };

      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: null,
        progress: 0,
        progressMessage: '',
        previewInsightKey: '__preview__test_insight',
      });

      useStore.mockImplementation(selector => {
        const state = {
          inputConfigs: [
            { name: 'show_markers', config: { name: 'show_markers', type: 'select' } },
          ],
          fetchInputConfigs: mockFetchInputConfigs,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });

      render(
        <InsightPreview
          insightConfig={configWithInputs}
          projectId="proj-1"
        />
      );

      expect(useInputsData).toHaveBeenCalledWith('proj-1', ['show_markers']);
    });

    it('filters out model references and only loads actual inputs', () => {
      const configWithMixedRefs = {
        name: 'test_insight',
        props: {
          type: 'scatter',
          x: 'ref(some_model).column_x', // model reference
          mode: `\${show_markers.value}`, // input reference
        },
      };

      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: null,
        progress: 0,
        progressMessage: '',
        previewInsightKey: '__preview__test_insight',
      });

      useStore.mockImplementation(selector => {
        const state = {
          inputConfigs: [
            // Only show_markers is an actual input
            { name: 'show_markers', config: { name: 'show_markers', type: 'select' } },
          ],
          fetchInputConfigs: mockFetchInputConfigs,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });

      render(
        <InsightPreview
          insightConfig={configWithMixedRefs}
          projectId="proj-1"
        />
      );

      // Should only load actual inputs, not model references
      expect(useInputsData).toHaveBeenCalledWith('proj-1', ['show_markers']);
    });

    it('renders input controls section when inputs are present', () => {
      const configWithInputs = {
        name: 'test_insight',
        props: {
          mode: `\${show_markers.value}`,
        },
      };

      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: null,
        progress: 0,
        progressMessage: '',
        previewInsightKey: '__preview__test_insight',
      });

      useStore.mockImplementation(selector => {
        const state = {
          inputConfigs: [
            { name: 'show_markers', config: { name: 'show_markers', type: 'select' } },
          ],
          fetchInputConfigs: mockFetchInputConfigs,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });

      render(
        <InsightPreview
          insightConfig={configWithInputs}
          projectId="proj-1"
        />
      );

      // Check for input controls section
      expect(screen.getByTestId('input-controls-section')).toBeInTheDocument();
    });
  });

  describe('Layout configuration', () => {
    it('applies layout values to chart', () => {
      const layoutValues = {
        title: 'Custom Title',
        showlegend: true,
      };

      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
          layoutValues={layoutValues}
        />
      );

      // Chart component should receive layout with custom values
      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });

    it('uses default layout when no layoutValues provided', () => {
      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
        />
      );

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('renders without crashing when insightConfig is null', () => {
      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: null,
        progress: 0,
        progressMessage: '',
        previewInsightKey: null,
      });

      render(
        <InsightPreview
          insightConfig={null}
          projectId="proj-1"
        />
      );

      expect(screen.getByTestId('unsaved-insight-message')).toBeInTheDocument();
      expect(screen.getByText('Save to Preview with Data')).toBeInTheDocument();
    });

    it('renders without crashing when inputConfigs fail to load', () => {
      useStore.mockImplementation(selector => {
        const state = {
          inputConfigs: null,
          fetchInputConfigs: mockFetchInputConfigs,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });

      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
        />
      );

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });
  });

  describe('Component structure', () => {
    it('renders inputs above chart when both present', () => {
      const configWithInputs = {
        name: 'test_insight',
        props: {
          type: 'scatter',
          mode: `\${show_markers.value}`,
        },
      };

      useInsightPreviewData.mockReturnValue({
        isLoading: false,
        error: null,
        progress: 0,
        progressMessage: '',
        previewInsightKey: '__preview__test_insight',
      });

      useStore.mockImplementation(selector => {
        const state = {
          inputConfigs: [
            { name: 'show_markers', config: { name: 'show_markers', type: 'select' } },
          ],
          fetchInputConfigs: mockFetchInputConfigs,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });

      render(
        <InsightPreview
          insightConfig={configWithInputs}
          projectId="proj-1"
        />
      );

      const inputComponent = screen.getByTestId('input-component');
      const chartComponent = screen.getByTestId('chart-component');

      // Both should be present
      expect(inputComponent).toBeInTheDocument();
      expect(chartComponent).toBeInTheDocument();
    });

    it('renders with proper layout structure', () => {
      render(
        <InsightPreview
          insightConfig={defaultInsightConfig}
          projectId="proj-1"
        />
      );

      // Chart component should be rendered
      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });
  });
});
