import { useMemo, useState, useCallback, useEffect } from 'react';
import ChartPreview from '../new-views/common/ChartPreview';
import { useInsightPreviewData } from '../../hooks/usePreviewData';
import { useInputsData } from '../../hooks/useInputsData';
import useStore from '../../stores/store';
import {
  expandDotNotationProps,
  selectActiveModelSql,
  selectActiveModelSourceName,
  selectActiveModelComputedColumns,
  selectActiveModelQueryResult,
} from '../../stores/explorerNewStore';

/**
 * Triggers a preview job for a single insight and reports back its preview key.
 * Renders nothing — purely a side-effect component.
 */
const InsightPreviewTrigger = ({ insightConfig, projectId, extraPreviewBody, onPreviewKey }) => {
  const { previewInsightKey } = useInsightPreviewData(insightConfig, {
    projectId,
    extraPreviewBody,
  });

  useEffect(() => {
    onPreviewKey(insightConfig?.name, previewInsightKey);
  }, [insightConfig?.name, previewInsightKey, onPreviewKey]);

  return null;
};

const ExplorerChartPreview = () => {
  const queryResult = useStore(selectActiveModelQueryResult);
  const insightStates = useStore((s) => s.explorerInsightStates);
  const chartLayout = useStore((s) => s.explorerChartLayout);
  const syncPlotlyEdits = useStore((s) => s.setChartLayout);
  const activeModelName = useStore((s) => s.explorerActiveModelName);
  const explorerSql = useStore(selectActiveModelSql);
  const explorerSourceName = useStore(selectActiveModelSourceName);
  const computedColumns = useStore(selectActiveModelComputedColumns);
  const projectId = useStore((s) => s.project?.id);
  const chartInsightNames = useStore((s) => s.explorerChartInsightNames);
  const chartInputNames = useStore((s) => s.explorerChartInputNames);
  const storeInputs = useStore((s) => s.inputs || []);

  // Load input data (parquet, options, defaults) for chart's referenced inputs
  useInputsData(projectId, chartInputNames);

  const [secondaryKeys, setSecondaryKeys] = useState({});

  const effectiveModelName = activeModelName || 'preview_model';

  // Build configs for ALL chart insights
  const allInsightConfigs = useMemo(() => {
    return chartInsightNames
      .map((name) => {
        const insight = insightStates[name];
        if (!insight) return null;
        const props = { type: insight.type, ...insight.props };
        const hasDataProps = Object.keys(props).some((k) => k !== 'type');
        if (!hasDataProps) return null;

        // Transform interactions from UI format {type, value} to backend format {filter/split/sort: value}
        const backendInteractions = (insight.interactions || [])
          .filter((i) => i.value)
          .map((i) => ({ [i.type]: i.value }));

        return {
          name: `${effectiveModelName}_${name}_preview`,
          props: expandDotNotationProps(props),
          ...(backendInteractions.length > 0 ? { interactions: backendInteractions } : {}),
        };
      })
      .filter(Boolean);
  }, [chartInsightNames, insightStates, effectiveModelName]);

  // Primary insight = first config (drives loading/error UX)
  const primaryConfig = allInsightConfigs.length > 0 ? allInsightConfigs[0] : null;
  const secondaryConfigs = allInsightConfigs.slice(1);

  const contextObjects = useMemo(() => {
    if (!explorerSql || !explorerSourceName) return null;

    const modelConfig = {
      name: effectiveModelName,
      sql: explorerSql,
      source: `\${ref(${explorerSourceName})}`,
    };

    const dims = computedColumns
      .filter((c) => c.type === 'dimension')
      .map((c) => ({ name: c.name, expression: c.expression }));
    const mets = computedColumns
      .filter((c) => c.type === 'metric')
      .map((c) => ({ name: c.name, expression: c.expression }));

    if (dims.length) modelConfig.dimensions = dims;
    if (mets.length) modelConfig.metrics = mets;

    const ctx = { models: [modelConfig] };

    // Include input configs so the backend DAG can resolve ${ref(input).accessor}
    // Strip API-only fields (name_hash, structure) that the Pydantic model rejects
    const inputConfigs = storeInputs
      .filter((i) => chartInputNames.includes(i.name))
      .map((i) => {
        const { name_hash, structure, ...cleanConfig } = i.config || {};
        return { ...cleanConfig, name: i.name };
      });
    if (inputConfigs.length > 0) ctx.inputs = inputConfigs;

    return ctx;
  }, [effectiveModelName, explorerSql, explorerSourceName, computedColumns, chartInputNames, storeInputs]);

  const extraPreviewBody = useMemo(
    () => (contextObjects ? { context_objects: contextObjects } : undefined),
    [contextObjects]
  );

  const handleSecondaryKey = useCallback((configName, key) => {
    setSecondaryKeys((prev) => {
      if (prev[configName] === key) return prev;
      return { ...prev, [configName]: key };
    });
  }, []);

  const additionalInsightKeys = useMemo(
    () => secondaryConfigs.map((c) => secondaryKeys[c.name]).filter(Boolean),
    [secondaryConfigs, secondaryKeys]
  );

  const chartConfig = useMemo(
    () => ({
      name: `${effectiveModelName}_chart`,
      layout: chartLayout,
    }),
    [effectiveModelName, chartLayout]
  );

  if (!queryResult?.columns?.length) {
    return (
      <div
        className="flex items-center justify-center h-full bg-gray-50"
        data-testid="chart-empty-no-results"
      >
        <span className="text-sm text-secondary-400">Run a query to see chart preview</span>
      </div>
    );
  }

  if (!primaryConfig) {
    return (
      <div
        className="flex items-center justify-center h-full bg-gray-50"
        data-testid="chart-empty-no-config"
      >
        <span className="text-sm text-secondary-400">
          Drag columns to axis fields to see chart preview
        </span>
      </div>
    );
  }

  return (
    <>
      {/* Trigger preview jobs for secondary insights */}
      {secondaryConfigs.map((config) => (
        <InsightPreviewTrigger
          key={config.name}
          insightConfig={config}
          projectId={projectId}
          extraPreviewBody={extraPreviewBody}
          onPreviewKey={handleSecondaryKey}
        />
      ))}
      <ChartPreview
        chartConfig={chartConfig}
        insightConfig={primaryConfig}
        projectId={projectId}
        onLayoutChange={syncPlotlyEdits}
        editableLayout={true}
        contextObjects={contextObjects}
        additionalInsightKeys={additionalInsightKeys}
      />
    </>
  );
};

export default ExplorerChartPreview;
