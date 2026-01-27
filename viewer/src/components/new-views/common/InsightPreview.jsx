import React, { useMemo, useEffect } from 'react';
import Chart from '../../items/Chart';
import Input from '../../items/Input';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { useInputsData } from '../../../hooks/useInputsData';
import { extractInputDependenciesFromProps } from '../../../models/Insight';
import useStore from '../../../stores/store';
import { usePreviewJob } from '../../../hooks/usePreviewJob';
import { useDuckDB } from '../../../contexts/DuckDBContext';
import { loadInsightParquetFiles, runDuckDBQuery, prepPostQuery } from '../../../duckdb/queries';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * InsightPreview - A minimal dashboard for previewing a single insight
 *
 * This component creates a synthetic dashboard configuration with:
 * - Input controls for any inputs referenced in the insight
 * - A single chart displaying the insight
 *
 * It supports two modes:
 * 1. Saved insight mode (usePreview=false): Uses normal data loading via useInsightsData
 * 2. Preview job mode (usePreview=true): Runs a preview job and loads result
 *
 * Props:
 * - insightConfig: The insight configuration object
 * - projectId: Project ID for data loading
 * - layoutValues: Optional layout configuration for the chart
 * - usePreview: Boolean - if true, run a preview job instead of loading saved data
 */
const InsightPreview = ({ insightConfig, projectId, layoutValues = {}, usePreview = false }) => {
  const { inputConfigs, fetchInputConfigs, setInsights } = useStore();
  const db = useDuckDB();

  const { progress, progressMessage, result, error: jobError, isRunning, isCompleted, isFailed, startJob, resetJob } = usePreviewJob();

  useEffect(() => {
    fetchInputConfigs();
  }, [fetchInputConfigs]);

  useEffect(() => {
    if (!usePreview || !insightConfig) return;

    resetJob();

    startJob(insightConfig).catch(err => {
      console.error('Failed to start preview job:', err);
    });
  }, [usePreview, insightConfig, startJob, resetJob]);

  useEffect(() => {
    if (!usePreview || !isCompleted || !result || !db) return;

    const processPreviewResult = async () => {
      try {
        const insightName = result.name || '__preview__';
        const { files, query, props_mapping, split_key, type, static_props } = result;

        const freshInputs = useStore.getState().inputs || {};

        const { loaded, failed } = await loadInsightParquetFiles(db, files);

        const preparedQuery = prepPostQuery({ query }, freshInputs);
        const queryResult = await runDuckDBQuery(db, preparedQuery, 3, 1000);

        const processedRows = queryResult.toArray().map(row => {
          const rowData = row.toJSON();
          return Object.fromEntries(
            Object.entries(rowData).map(([key, value]) => [
              key,
              typeof value === 'bigint' ? value.toString() : value,
            ])
          );
        });

        const insightData = {
          [insightName]: {
            name: insightName,
            data: processedRows,
            files,
            query,
            props_mapping,
            static_props,
            split_key,
            type,
            loaded: loaded.length,
            failed: failed.length,
            error: null,
            pendingInputs: null,
            inputDependencies: [],
          },
        };

        setInsights(insightData);
      } catch (error) {
        console.error('Failed to process preview result:', error);
        const insightName = result.name || '__preview__';
        setInsights({
          [insightName]: {
            name: insightName,
            data: [],
            error: error.message || String(error),
            loaded: 0,
            failed: result.files?.length || 0,
          },
        });
      }
    };

    processPreviewResult();
  }, [usePreview, isCompleted, result, db, setInsights]);

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
    const insightName = usePreview ? (result?.name || '__preview__') : insightConfig?.name;

    const previewLayout = {
      autosize: true,
      margin: { l: 40, r: 10, t: 20, b: 30 },
      ...layoutValues
    };

    if (insightName && insightName !== '__preview__') {
      return {
        name: 'Preview Chart',
        insights: [{ name: insightName }],
        traces: [],
        layout: previewLayout
      };
    }

    return {
      name: 'Preview Chart',
      insights: [],
      traces: [],
      layout: previewLayout
    };
  }, [insightConfig, layoutValues, usePreview, result]);

  const project = useMemo(() => ({
    id: projectId,
    project_json: {
      name: 'Preview Project',
      dashboards: []
    }
  }), [projectId]);

  const insightNamesToLoad = useMemo(() => {
    const name = insightConfig?.name;
    return (name && name !== '__preview__') ? [name] : [];
  }, [insightConfig]);

  const loadRunId = useMemo(() => {
    if (usePreview && result?.name) {
      return `preview-${result.name}`;
    }
    return "main";
  }, [usePreview, result]);

  useInsightsData(projectId, usePreview ? [] : insightNamesToLoad, loadRunId);

  const inputNamesToLoad = useMemo(() => inputs.map(input => input.name), [inputs]);

  useInputsData(projectId, inputNamesToLoad);

  if (usePreview && isRunning) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" data-testid="preview-loading">
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

  if (usePreview && isFailed) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" data-testid="preview-error">
        <h3 className="text-lg font-medium text-red-600 mb-2">Preview Failed</h3>
        <p className="text-sm text-gray-700 max-w-sm font-mono bg-red-50 p-3 rounded">
          {jobError}
        </p>
      </div>
    );
  }

  if (!usePreview && (!insightConfig?.name || insightConfig.name === '__preview__')) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" data-testid="unsaved-insight-message">
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
        <div className="flex flex-wrap gap-2 p-3 border-b border-gray-200 bg-gray-50" data-testid="input-controls-section">
          {inputs.map(input => (
            <Input
              key={input.name}
              input={input}
              project={project}
              itemWidth={1}
            />
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