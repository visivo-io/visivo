import { useMemo } from 'react';
import ChartPreview from '../new-views/common/ChartPreview';
import { useChartPreviewJob } from '../../hooks/usePreviewData';
import { useInputsData } from '../../hooks/useInputsData';
import useStore from '../../stores/store';
import { useShallow } from 'zustand/react/shallow';
import {
  expandDotNotationProps,
  selectDerivedInputNames,
} from '../../stores/explorerNewStore';

const ExplorerChartPreview = () => {
  const insightStates = useStore(s => s.explorerInsightStates);
  const modelStates = useStore(s => s.explorerModelStates);
  const chartLayout = useStore(s => s.explorerChartLayout);
  const chartName = useStore(s => s.explorerChartName);
  const syncPlotlyEdits = useStore(s => s.setChartLayout);
  const projectId = useStore(s => s.project?.id);
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const derivedInputNames = useStore(useShallow(selectDerivedInputNames));
  const storeInputs = useStore(s => s.inputs || []);

  // Load input data (parquet, options, defaults) for dynamically referenced inputs
  useInputsData(projectId, derivedInputNames);

  // Build the batched preview request: every insight on the chart + every
  // edited object in the explorer's working stores. The backend overlays them
  // onto the published project and runs all insights in one DAG invocation.
  const previewRequest = useMemo(() => {
    if (!chartInsightNames || chartInsightNames.length === 0) return null;

    const insightOverrides = chartInsightNames
      .map(name => {
        const state = insightStates?.[name];
        if (!state) return null;
        const props = { type: state.type, ...state.props };
        const hasDataProps = Object.keys(props).some(k => k !== 'type');
        if (!hasDataProps) return null;
        const backendInteractions = (state.interactions || [])
          .filter(i => i.value)
          .map(i => ({ [i.type]: i.value }));
        return {
          name,
          props: expandDotNotationProps(props),
          ...(backendInteractions.length > 0 ? { interactions: backendInteractions } : {}),
        };
      })
      .filter(Boolean);

    if (insightOverrides.length === 0) return null;

    const modelOverrides = Object.entries(modelStates || {})
      .map(([name, state]) => {
        if (!state?.sql || !state?.sourceName) return null;
        const modelConfig = {
          name,
          sql: state.sql,
          source: `\${ref(${state.sourceName})}`,
        };
        const dims = (state.computedColumns || [])
          .filter(c => c.type === 'dimension')
          .map(c => ({ name: c.name, expression: c.expression }));
        const mets = (state.computedColumns || [])
          .filter(c => c.type === 'metric')
          .map(c => ({ name: c.name, expression: c.expression }));
        if (dims.length) modelConfig.dimensions = dims;
        if (mets.length) modelConfig.metrics = mets;
        return modelConfig;
      })
      .filter(Boolean);

    const inputOverrides = (storeInputs || [])
      .filter(i => derivedInputNames.includes(i.name))
      .map(i => {
        const { name_hash, structure, ...cleanConfig } = i.config || {};
        return { ...cleanConfig, name: i.name };
      });

    const context_objects = { insights: insightOverrides };
    if (modelOverrides.length) context_objects.models = modelOverrides;
    if (inputOverrides.length) context_objects.inputs = inputOverrides;

    return {
      insight_names: chartInsightNames,
      context_objects,
    };
  }, [chartInsightNames, insightStates, modelStates, storeInputs, derivedInputNames]);

  const previewJob = useChartPreviewJob(previewRequest, { projectId });

  const chartConfig = useMemo(
    () => ({
      name: chartName || 'Preview Chart',
      layout: chartLayout,
    }),
    [chartName, chartLayout]
  );

  if (!chartInsightNames || chartInsightNames.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full bg-gray-50"
        data-testid="chart-empty-no-insights"
      >
        <span className="text-sm text-secondary-400">Add an insight to see chart preview</span>
      </div>
    );
  }

  return (
    <ChartPreview
      chartConfig={chartConfig}
      insightKeys={previewJob.previewInsightKeys}
      projectId={projectId}
      onLayoutChange={syncPlotlyEdits}
      editableLayout={true}
      isLoading={previewJob.isLoading}
      error={previewJob.error}
      progress={previewJob.progress}
      progressMessage={previewJob.progressMessage}
    />
  );
};

export default ExplorerChartPreview;
