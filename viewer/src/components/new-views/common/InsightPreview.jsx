import React, { useMemo, useEffect } from 'react';
import Chart from '../../items/Chart';
import Input from '../../items/Input';
import { useInsightPreviewData } from '../../../hooks/usePreviewData';
import { useInputsData } from '../../../hooks/useInputsData';
import { extractInputDependenciesFromProps } from '../../../models/Insight';
import useStore from '../../../stores/store';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * InsightPreview - A minimal dashboard for previewing a single insight
 *
 * This component creates a synthetic dashboard configuration with:
 * - Input controls for any inputs referenced in the insight
 * - A single chart displaying the insight
 *
 * The preview flow:
 * 1. User edits insight config in the editor
 * 2. useInsightPreviewData detects changes in query-affecting properties
 * 3. Only triggers preview run when necessary
 * 4. Displays loading/error states and chart when ready
 *
 * Props:
 * - insightConfig: The insight configuration object
 * - projectId: Project ID for data loading
 * - layoutValues: Optional layout configuration for the chart
 */
const InsightPreview = ({ insightConfig, projectId, layoutValues = {} }) => {
  const { inputConfigs, fetchInputConfigs } = useStore();

  const { isLoading, error, insight, progress, progressMessage } = useInsightPreviewData(
    insightConfig,
    { projectId }
  );

  useEffect(() => {
    fetchInputConfigs();
  }, [fetchInputConfigs]);

  const allReferencedNames = useMemo(() => {
    if (!insightConfig) return [];
    return extractInputDependenciesFromProps(insightConfig);
  }, [insightConfig]);

  const inputs = useMemo(() => {
    if (!inputConfigs || inputConfigs.length === 0) return [];

    const inputConfigMap = new Map(inputConfigs.map(ic => [ic.name, ic.config]));

    return allReferencedNames
      .filter(name => inputConfigMap.has(name))
      .map(name => inputConfigMap.get(name));
  }, [allReferencedNames, inputConfigs]);

  const chart = useMemo(() => {
    const insightName = insightConfig?.name;

    const previewLayout = {
      autosize: true,
      margin: { l: 40, r: 10, t: 20, b: 30 },
      ...layoutValues,
    };

    if (insightName && insightName !== '__preview__') {
      return {
        name: 'Preview Chart',
        insights: [{ name: insightName }],
        traces: [],
        layout: previewLayout,
      };
    }

    return {
      name: 'Preview Chart',
      insights: [],
      traces: [],
      layout: previewLayout,
    };
  }, [insightConfig, layoutValues]);

  const project = useMemo(
    () => ({
      id: projectId,
      project_json: {
        name: 'Preview Project',
        dashboards: [],
      },
    }),
    [projectId]
  );

  const inputNamesToLoad = useMemo(() => inputs.map(input => input.name), [inputs]);

  useInputsData(projectId, inputNamesToLoad);

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="preview-loading"
      >
        <CircularProgress size={48} className="mb-4" />
        <h3 className="text-lg font-medium text-gray-700 mb-2">Running Preview</h3>
        <p className="text-sm text-gray-500 max-w-sm mb-2">{progressMessage}</p>
        <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = typeof error === 'string' ? error : error?.message || String(error);
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="preview-error"
      >
        <h3 className="text-lg font-medium text-red-600 mb-2">Preview Failed</h3>
        <p className="text-sm text-gray-700 max-w-sm font-mono bg-red-50 p-3 rounded">
          {errorMessage}
        </p>
      </div>
    );
  }

  if (!insightConfig?.name || insightConfig.name === '__preview__') {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="unsaved-insight-message"
      >
        <h3 className="text-lg font-medium text-gray-700 mb-2">Save to Preview with Data</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Save the insight and run 'visivo run' to generate preview data.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {inputs.length > 0 && (
        <div
          className="flex flex-wrap gap-2 p-3 border-b border-gray-200 bg-gray-50"
          data-testid="input-controls-section"
        >
          {inputs.map(input => (
            <Input key={input.name} input={input} project={project} itemWidth={1} />
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 p-4 overflow-hidden">
        <div className="w-full h-full relative" style={{ minWidth: 0 }}>
          <Chart
            chart={chart}
            project={project}
            itemWidth={1}
            height={400}
            width={undefined}
            shouldLoad={true}
            hideToolbar={true}
          />
        </div>
      </div>
    </div>
  );
};

export default InsightPreview;
