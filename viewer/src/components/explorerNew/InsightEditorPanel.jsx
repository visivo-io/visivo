import { useState, useEffect, useCallback, useMemo } from 'react';
import { PiCaretDown, PiCaretRight } from 'react-icons/pi';
import useStore from '../../stores/store';
import { CHART_TYPES, getSchema } from '../../schemas/schemas';
import { SchemaEditor } from '../new-views/common/SchemaEditor/SchemaEditor';
import { getRequiredFields } from '../new-views/common/insightRequiredFields';
import SaveToProjectModal from './SaveToProjectModal';

const InsightEditorPanel = () => {
  const insightConfig = useStore((s) => s.explorerInsightConfig);
  const setInsightConfig = useStore((s) => s.setExplorerInsightConfig);
  const chartLayout = useStore((s) => s.explorerChartLayout);
  const syncPlotlyEdits = useStore((s) => s.syncPlotlyEditsToChartLayout);
  const queryResult = useStore((s) => s.explorerQueryResult);
  const setExplorerSaveModalOpen = useStore((s) => s.setExplorerSaveModalOpen);

  const insightType = insightConfig?.props?.type || 'scatter';

  const [propsSchema, setPropsSchema] = useState(null);
  const [layoutSchema, setLayoutSchema] = useState(null);
  const [isPropsExpanded, setIsPropsExpanded] = useState(true);
  const [isLayoutExpanded, setIsLayoutExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSchema(insightType).then((schema) => {
      if (!cancelled) setPropsSchema(schema);
    });
    return () => { cancelled = true; };
  }, [insightType]);

  useEffect(() => {
    let cancelled = false;
    getSchema('layout').then((schema) => {
      if (!cancelled) setLayoutSchema(schema);
    });
    return () => { cancelled = true; };
  }, []);

  const handleTypeChange = useCallback(
    (newType) => {
      const requiredNames = new Set(getRequiredFields(newType).map((f) => f.name));
      const newProps = { type: newType };
      Object.entries(insightConfig?.props || {}).forEach(([key, val]) => {
        if (key !== 'type' && requiredNames.has(key)) {
          newProps[key] = val;
        }
      });
      setInsightConfig({ ...insightConfig, props: newProps });
    },
    [insightConfig, setInsightConfig]
  );

  const handleInsightPropsChange = useCallback(
    (newValue) => {
      setInsightConfig({
        ...insightConfig,
        props: { ...insightConfig?.props, ...newValue },
      });
    },
    [insightConfig, setInsightConfig]
  );

  const handleLayoutChange = useCallback(
    (newValue) => {
      syncPlotlyEdits(newValue);
    },
    [syncPlotlyEdits]
  );

  // Required fields should be auto-expanded in SchemaEditor
  const requiredFieldNames = useMemo(
    () => getRequiredFields(insightType).map((f) => f.name),
    [insightType]
  );

  // Only exclude 'type' — required fields are shown in SchemaEditor with DnD
  const excludeFromSchema = ['type'];

  // Count configured props (excluding type)
  const configuredPropsCount = Object.keys(insightConfig?.props || {}).filter(
    (k) => k !== 'type' && insightConfig.props[k] != null
  ).length;

  const layoutPropsCount = Object.keys(chartLayout || {}).length;

  const hasQueryResult = !!queryResult?.columns?.length;

  return (
    <div
      className="w-96 flex-shrink-0 border-l border-secondary-200 bg-white overflow-y-auto flex flex-col"
      data-testid="insight-editor-panel"
    >
      {/* Insight Type Selector */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0" data-testid="insight-type-section">
        <label className="block text-xs font-medium text-gray-500 mb-1">Insight Type</label>
        <select
          value={insightType}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          data-testid="insight-type-select"
        >
          {CHART_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>
      </div>

      {/* Insight Properties — Collapsible SchemaEditor with DnD on query properties */}
      <div className="border-b border-gray-200 flex-shrink-0" data-testid="insight-props-section">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          onClick={() => setIsPropsExpanded((prev) => !prev)}
          data-testid="toggle-insight-props"
        >
          {isPropsExpanded ? <PiCaretDown size={12} /> : <PiCaretRight size={12} />}
          Insight Properties
          {configuredPropsCount > 0 && (
            <span className="ml-auto text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">
              {configuredPropsCount}
            </span>
          )}
        </button>

        {isPropsExpanded && propsSchema && (
          <div className="px-4 pb-3" data-testid="insight-props-editor">
            <SchemaEditor
              schema={propsSchema}
              value={insightConfig?.props || {}}
              onChange={handleInsightPropsChange}
              excludeProperties={excludeFromSchema}
              initiallyExpanded={requiredFieldNames}
              droppable
            />
          </div>
        )}
      </div>

      {/* Chart Layout — Collapsible SchemaEditor */}
      <div className="border-b border-gray-200 flex-shrink-0" data-testid="chart-layout-section">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          onClick={() => setIsLayoutExpanded((prev) => !prev)}
          data-testid="toggle-chart-layout"
        >
          {isLayoutExpanded ? <PiCaretDown size={12} /> : <PiCaretRight size={12} />}
          Chart Layout
          {layoutPropsCount > 0 && (
            <span className="ml-auto text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">
              {layoutPropsCount}
            </span>
          )}
        </button>

        {isLayoutExpanded && layoutSchema && (
          <div className="px-4 pb-3" data-testid="chart-layout-editor">
            <SchemaEditor
              schema={layoutSchema}
              value={chartLayout || {}}
              onChange={handleLayoutChange}
              excludeProperties={[]}
            />
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save to Project Button */}
      <div className="p-4 border-t border-gray-200 flex-shrink-0">
        <button
          onClick={() => setExplorerSaveModalOpen(true)}
          disabled={!hasQueryResult}
          className="w-full py-2 px-4 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="save-to-project-button"
        >
          Save to Project
        </button>
      </div>

      <SaveToProjectModal />
    </div>
  );
};

export default InsightEditorPanel;
