import React, { useCallback, useState } from 'react';
import { PiCaretDown, PiCaretRight } from 'react-icons/pi';
import EditPanel from '../new-views/common/EditPanel';
import InsightEditForm from '../new-views/common/InsightEditForm';
import { getTypeByValue } from '../new-views/common/objectTypeConfigs';
import useStore from '../../stores/store';

const InsightEditorPanel = () => {
  const editStack = useStore((s) => s.explorerEditStack);
  const insightConfig = useStore((s) => s.explorerInsightConfig);
  const pushEdit = useStore((s) => s.pushExplorerEdit);
  const popEdit = useStore((s) => s.popExplorerEdit);
  const setInsightConfig = useStore((s) => s.setExplorerInsightConfig);
  const modelName = useStore((s) => s.explorerModelName);
  const chartName = useStore((s) => s.explorerChartName);
  const setModelName = useStore((s) => s.setExplorerModelName);
  const setChartName = useStore((s) => s.setExplorerChartName);
  const sql = useStore((s) => s.explorerSql);
  const sourceName = useStore((s) => s.explorerSourceName);
  const savedModelName = useStore((s) => s.explorerSavedModelName);
  const savedInsightName = useStore((s) => s.explorerSavedInsightName);
  const isSaving = useStore((s) => s.explorerIsSaving);

  const modelType = getTypeByValue('model');
  const insightType = getTypeByValue('insight');
  const chartType = getTypeByValue('chart');

  const [isNamingExpanded, setIsNamingExpanded] = useState(true);

  const currentEdit = editStack.length > 0 ? editStack[editStack.length - 1] : null;
  const canGoBack = editStack.length > 1;

  const canSave = !!(modelName && insightConfig?.name && chartName && sql && sourceName);

  const handleNavigateTo = useCallback(
    (type, object) => {
      pushEdit(type, object);
    },
    [pushEdit]
  );

  const handleEditPanelSave = useCallback(
    async (type, name, config) => {
      if (type === 'insight') {
        setInsightConfig({ name, ...config });
      }
      const store = useStore.getState();
      const saveActions = {
        model: store.saveModel,
        insight: store.saveInsight,
        source: store.saveSource,
        dimension: store.saveDimension,
        metric: store.saveMetric,
        relation: store.saveRelation,
      };
      const saveFn = saveActions[type];
      if (saveFn) {
        return await saveFn(name, config);
      }
      return { success: false, error: 'Unknown type' };
    },
    [setInsightConfig]
  );

  const handleInsightSave = useCallback(
    async (type, name, config) => {
      setInsightConfig({ name, ...config });
    },
    [setInsightConfig]
  );

  const handleSaveToProject = useCallback(async () => {
    const store = useStore.getState();
    await store.saveExplorerModel(modelName);
    await store.saveExplorerInsight(insightConfig?.name);
    await store.saveExplorerChart(chartName);
  }, [modelName, chartName, insightConfig?.name]);

  // If editStack has items, render EditPanel for the stacked edit (e.g., model edit)
  if (currentEdit) {
    return (
      <div
        className="w-96 flex-shrink-0 border-l border-secondary-200 bg-white overflow-hidden flex flex-col"
        data-testid="insight-editor-panel"
      >
        <EditPanel
          editItem={currentEdit}
          isCreate={currentEdit.isCreate}
          canGoBack={canGoBack}
          onGoBack={popEdit}
          onNavigateTo={handleNavigateTo}
          onClose={() => useStore.getState().clearExplorerEditStack()}
          onSave={handleEditPanelSave}
        />
      </div>
    );
  }

  // Default: always-on insight editor with object naming
  return (
    <div
      className="w-96 flex-shrink-0 border-l border-secondary-200 bg-white overflow-y-auto flex flex-col"
      data-testid="insight-editor-panel"
    >
      {/* Object Naming Header — collapsible */}
      <div className="border-b border-gray-200 flex-shrink-0" data-testid="object-naming-header">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          onClick={() => setIsNamingExpanded((prev) => !prev)}
          data-testid="toggle-naming"
        >
          {isNamingExpanded ? <PiCaretDown size={12} /> : <PiCaretRight size={12} />}
          Object Names
          {!isNamingExpanded && (modelName || insightConfig?.name || chartName) && (
            <span className="ml-auto text-xs text-gray-400 truncate max-w-[140px]">
              {modelName || insightConfig?.name || chartName}
            </span>
          )}
        </button>

        {isNamingExpanded && (
          <div className="px-4 pb-3 space-y-2">
            {/* Model Name */}
            <div className="flex items-center gap-2">
              {modelType && (
                <modelType.icon
                  className={modelType.colors.text}
                  style={{ fontSize: 16 }}
                  data-testid="model-icon"
                />
              )}
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="Model name..."
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-secondary-800 placeholder:text-secondary-400"
                data-testid="model-name-input"
              />
            </div>

            {/* Insight Name */}
            <div className="flex items-center gap-2">
              {insightType && (
                <insightType.icon
                  className={insightType.colors.text}
                  style={{ fontSize: 16 }}
                  data-testid="insight-icon"
                />
              )}
              <input
                type="text"
                value={insightConfig?.name || ''}
                onChange={(e) => setInsightConfig({ ...insightConfig, name: e.target.value })}
                placeholder="Insight name..."
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-secondary-800 placeholder:text-secondary-400"
                data-testid="insight-name-input"
              />
            </div>

            {/* Chart Name */}
            <div className="flex items-center gap-2">
              {chartType && (
                <chartType.icon
                  className={chartType.colors.text}
                  style={{ fontSize: 16 }}
                  data-testid="chart-icon"
                />
              )}
              <input
                type="text"
                value={chartName}
                onChange={(e) => setChartName(e.target.value)}
                placeholder="Chart name..."
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-secondary-800 placeholder:text-secondary-400"
                data-testid="chart-name-input"
              />
            </div>

            {/* Save to Project */}
            <button
              onClick={handleSaveToProject}
              disabled={!canSave || isSaving}
              className="w-full py-1.5 px-4 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="save-to-project-button"
            >
              {isSaving ? 'Saving...' : 'Save to Project'}
            </button>

            {savedModelName && (
              <div className="text-xs text-green-600" data-testid="save-status">
                Saved: {savedModelName}
                {savedInsightName ? ` → ${savedInsightName}` : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Insight Edit Form */}
      <div className="flex-1 flex flex-col min-h-0">
        <InsightEditForm
          insight={insightConfig || { name: '', props: { type: 'scatter' } }}
          isCreate={true}
          onClose={() => {}}
          onSave={handleInsightSave}
          isPreviewOpen={false}
          setIsPreviewOpen={() => {}}
          setPreviewConfig={() => {}}
        />
      </div>
    </div>
  );
};

export default InsightEditorPanel;
