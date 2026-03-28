import { useMemo } from 'react';
import ChartPreview from '../new-views/common/ChartPreview';
import useStore from '../../stores/store';
import {
  expandDotNotationProps,
  selectActiveModelSql,
  selectActiveModelSourceName,
  selectActiveModelComputedColumns,
  selectActiveModelQueryResult,
} from '../../stores/explorerNewStore';

const ExplorerChartPreview = () => {
  const queryResult = useStore(selectActiveModelQueryResult);
  const activeInsightName = useStore((s) => s.explorerActiveInsightName);
  const insightStates = useStore((s) => s.explorerInsightStates);
  const chartLayout = useStore((s) => s.explorerChartLayout);
  const syncPlotlyEdits = useStore((s) => s.setChartLayout);
  const activeModelName = useStore((s) => s.explorerActiveModelName);
  const explorerSql = useStore(selectActiveModelSql);
  const explorerSourceName = useStore(selectActiveModelSourceName);
  const computedColumns = useStore(selectActiveModelComputedColumns);
  const projectId = useStore((s) => s.project?.id);

  // Use a local fallback instead of mutating global store state
  const effectiveModelName = activeModelName || 'preview_model';

  // Derive insight config from raw state to avoid referential instability
  const insightConfig = useMemo(() => {
    const insight = activeInsightName ? insightStates[activeInsightName] : null;
    if (!insight) return { name: '', props: { type: 'scatter' } };
    return { name: activeInsightName, props: { type: insight.type, ...insight.props } };
  }, [activeInsightName, insightStates]);

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

    return { models: [modelConfig] };
  }, [effectiveModelName, explorerSql, explorerSourceName, computedColumns]);

  const hasDataProps = useMemo(() => {
    if (!insightConfig?.props) return false;
    return Object.keys(insightConfig.props).some((k) => k !== 'type');
  }, [insightConfig]);

  const backendInsightConfig = useMemo(() => {
    if (!insightConfig?.props?.type) return null;
    if (!hasDataProps) return null;
    return {
      name: `${effectiveModelName}_preview_insight`,
      props: expandDotNotationProps(insightConfig.props),
    };
  }, [effectiveModelName, insightConfig, hasDataProps]);

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

  if (!backendInsightConfig) {
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
    <ChartPreview
      chartConfig={chartConfig}
      insightConfig={backendInsightConfig}
      projectId={projectId}
      onLayoutChange={syncPlotlyEdits}
      editableLayout={true}
      contextObjects={contextObjects}
    />
  );
};

export default ExplorerChartPreview;
