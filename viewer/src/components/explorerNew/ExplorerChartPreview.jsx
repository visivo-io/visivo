import { useMemo, useEffect, useRef, useState } from 'react';
import ChartPreview from '../new-views/common/ChartPreview';
import useStore from '../../stores/store';
import { useDebounce } from '../../hooks/useDebounce';
import { expandDotNotationProps } from '../../stores/explorerNewStore';

const ExplorerChartPreview = () => {
  const queryResult = useStore((s) => s.explorerQueryResult);
  const insightConfig = useStore((s) => s.explorerInsightConfig);
  const chartLayout = useStore((s) => s.explorerChartLayout);
  const syncPlotlyEdits = useStore((s) => s.syncPlotlyEditsToChartLayout);
  const activeModelName = useStore((s) => s.explorerActiveModelName);
  const projectId = useStore((s) => s.project?.id);

  const debouncedInsightConfig = useDebounce(insightConfig, 800);
  const lastSavedModelRef = useRef(null);
  const [modelSaved, setModelSaved] = useState(false);

  // Save model to cached tier when query result arrives
  useEffect(() => {
    if (!queryResult?.columns?.length) return;
    const { explorerSql, explorerSourceName, explorerActiveModelName } = useStore.getState();
    if (!explorerSql || !explorerSourceName) return;

    const modelName = explorerActiveModelName || 'preview_model';
    if (!explorerActiveModelName) {
      useStore.setState({ explorerActiveModelName: modelName });
    }

    const configKey = `${modelName}::${explorerSql}::${explorerSourceName}`;
    if (lastSavedModelRef.current === configKey) return;

    setModelSaved(false);
    useStore.getState().saveModelToCache(modelName, {
      name: modelName,
      sql: explorerSql,
      source: `ref(${explorerSourceName})`,
    }).then(() => {
      lastSavedModelRef.current = configKey;
      setModelSaved(true);
    });
  }, [queryResult]);

  // Save insight to cached tier when config changes (debounced)
  useEffect(() => {
    if (!activeModelName) return;
    if (!debouncedInsightConfig?.props?.type) return;

    const insightName = `${activeModelName}_preview_insight`;
    const config = {
      name: insightName,
      props: expandDotNotationProps(debouncedInsightConfig.props),
    };
    useStore.getState().saveInsightToCache(insightName, config);
  }, [debouncedInsightConfig, activeModelName]);

  // Check if insight has any data props beyond just 'type'
  const hasDataProps = useMemo(() => {
    if (!insightConfig?.props) return false;
    return Object.keys(insightConfig.props).some((k) => k !== 'type');
  }, [insightConfig]);

  // Build insight config for preview — only when we have data props
  const backendInsightConfig = useMemo(() => {
    if (!activeModelName || !insightConfig?.props?.type) return null;
    if (!hasDataProps) return null;
    return {
      name: `${activeModelName}_preview_insight`,
      props: expandDotNotationProps(insightConfig.props),
    };
  }, [activeModelName, insightConfig, hasDataProps]);

  const chartConfig = useMemo(() => ({
    name: `${activeModelName || 'preview'}_chart`,
    layout: chartLayout,
  }), [activeModelName, chartLayout]);

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

  if (!backendInsightConfig || !modelSaved) {
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
    />
  );
};

export default ExplorerChartPreview;
