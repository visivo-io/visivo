import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PiSidebarSimple,
  PiHardDrives,
  PiMagnifyingGlass,
  PiX,
  PiSpinner,
} from 'react-icons/pi';
import { HiDatabase } from 'react-icons/hi';
import { useDraggable } from '@dnd-kit/core';
import ObjectList from '../new-views/common/ObjectList';
import { getTypeColors, getTypeIcon } from '../new-views/common/objectTypeConfigs';
import EmbeddedPill from '../new-views/lineage/EmbeddedPill';
import SourceBrowser from './SourceBrowser';
import EmptyStateCTA from '../common/EmptyStateCTA';
import useStore from '../../stores/store';
import { selectActiveModelSourceName } from '../../stores/explorerNewStore';
import { useSourceCreationModal } from '../../stores/sourceModalStore';

const SECTION_DEFS = [
  { id: 'source', label: 'Sources', storeKey: null },
  { id: 'model', label: 'Models', storeKey: 'models', loadingKey: 'modelsLoading', fetchKey: 'fetchModels' },
  { id: 'metric', label: 'Metrics', storeKey: 'metrics', loadingKey: 'metricsLoading', fetchKey: 'fetchMetrics' },
  { id: 'dimension', label: 'Dimensions', storeKey: 'dimensions', loadingKey: 'dimensionsLoading', fetchKey: 'fetchDimensions' },
  { id: 'insight', label: 'Insights', storeKey: 'insights', loadingKey: 'insightsLoading', fetchKey: 'fetchInsights' },
  { id: 'chart', label: 'Charts', storeKey: 'charts', loadingKey: 'chartsLoading', fetchKey: 'fetchCharts' },
  { id: 'input', label: 'Inputs', storeKey: 'inputs', loadingKey: 'inputsLoading', fetchKey: 'fetchInputs' },
];

const DraggableItem = ({ item, type }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${type}-${item.name}`,
    data: {
      name: item.name,
      type,
      expression: item.config?.expression,
      parentModel: item.parentModel || null,
      inputType: item.config?.type || null,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-4 py-2 border-b border-gray-100 cursor-grab active:cursor-grabbing hover:bg-gray-50 transition-colors ${isDragging ? 'opacity-50' : ''}`}
      data-testid={`draggable-${type}-${item.name}`}
    >
      <EmbeddedPill objectType={type} label={item.name} statusDot={item.status || null} as="div" />
      {item.config?.expression && (
        <span className="text-xs text-secondary-400 truncate max-w-[100px]" title={item.config.expression}>
          {item.config.expression}
        </span>
      )}
    </div>
  );
};

const ExplorerLeftPanel = () => {
  const isCollapsed = useStore((s) => s.explorerLeftNavCollapsed);
  const toggleCollapsed = useStore((s) => s.toggleExplorerLeftNavCollapsed);
  const handleTableSelect = useStore((s) => s.handleTableSelect);
  const loadModel = useStore((s) => s.loadModel);
  const loadChart = useStore((s) => s.loadChart);
  const setActiveInsight = useStore((s) => s.setActiveInsight);
  const setExplorerSources = useStore((s) => s.setExplorerSources);
  const closeModelTab = useStore((s) => s.closeModelTab);
  const deleteExplorerInsight = useStore((s) => s.deleteExplorerInsight);
  const resetModel = useStore((s) => s.resetModel);
  const resetInsight = useStore((s) => s.resetInsight);
  const resetChart = useStore((s) => s.resetChart);
  const sourceName = useStore(selectActiveModelSourceName);
  const setSourceName = useStore((s) => s.setActiveModelSource);
  const activeModelName = useStore((s) => s.explorerActiveModelName);
  const explorerModelStates = useStore((s) => s.explorerModelStates);
  const explorerInsightStates = useStore((s) => s.explorerInsightStates);

  // Source creation modal — invoked from empty state CTA
  const { open: openSourceModal } = useSourceCreationModal();

  // Object stores
  const models = useStore((s) => s.models || []);
  const modelsLoading = useStore((s) => s.modelsLoading);
  const fetchModels = useStore((s) => s.fetchModels);
  const metrics = useStore((s) => s.metrics || []);
  const metricsLoading = useStore((s) => s.metricsLoading);
  const fetchMetrics = useStore((s) => s.fetchMetrics);
  const dimensions = useStore((s) => s.dimensions || []);
  const dimensionsLoading = useStore((s) => s.dimensionsLoading);
  const fetchDimensions = useStore((s) => s.fetchDimensions);
  const insights = useStore((s) => s.insights || []);
  const insightsLoading = useStore((s) => s.insightsLoading);
  const fetchInsights = useStore((s) => s.fetchInsights);
  const charts = useStore((s) => s.charts || []);
  const chartsLoading = useStore((s) => s.chartsLoading);
  const fetchCharts = useStore((s) => s.fetchCharts);
  const inputs = useStore((s) => s.inputs || []);
  const inputsLoading = useStore((s) => s.inputsLoading);
  const fetchInputs = useStore((s) => s.fetchInputs);

  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all object data on mount
  useEffect(() => {
    fetchModels?.();
    fetchMetrics?.();
    fetchDimensions?.();
    fetchInsights?.();
    fetchCharts?.();
    fetchInputs?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const matchesSearch = useCallback(
    (name) => {
      if (!searchQuery) return true;
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    },
    [searchQuery]
  );

  // Status from backend diff result
  const diffResult = useStore((s) => s.explorerDiffResult);

  // Merge explorer-created objects into API-fetched lists (with status from diff)
  const mergedModels = useMemo(() => {
    const modelStatuses = diffResult?.models || {};
    const apiModels = models.map((m) => {
      const status = modelStatuses[m.name] || null;
      return status ? { ...m, status } : m;
    });
    const apiNames = new Set(models.map((m) => m.name));
    const newModels = Object.entries(explorerModelStates)
      .filter(([name, ms]) => !apiNames.has(name) && ms.sql)
      .map(([name]) => ({ name, status: modelStatuses[name] || 'new' }));
    return [...apiModels, ...newModels];
  }, [models, explorerModelStates, diffResult]);

  const mergedInsights = useMemo(() => {
    const insightStatuses = diffResult?.insights || {};
    const apiInsights = insights.map((i) => {
      const status = insightStatuses[i.name] || null;
      return status ? { ...i, status } : i;
    });
    const apiNames = new Set(insights.map((i) => i.name));
    const newInsights = Object.entries(explorerInsightStates)
      .filter(([name]) => !apiNames.has(name))
      .map(([name]) => ({ name, status: insightStatuses[name] || 'new' }));
    return [...apiInsights, ...newInsights];
  }, [insights, explorerInsightStates, diffResult]);

  const mergedMetrics = useMemo(() => {
    const metricStatuses = diffResult?.metrics || {};
    const apiNames = new Set(metrics.map((m) => m.name));
    const apiMetrics = metrics.map((m) => {
      const status = metricStatuses[m.name] || null;
      return status ? { ...m, status } : m;
    });
    const newMetrics = [];
    for (const [modelName, ms] of Object.entries(explorerModelStates)) {
      for (const cc of ms.computedColumns || []) {
        if (cc.type === 'metric' && !apiNames.has(cc.name)) {
          newMetrics.push({ name: cc.name, config: { expression: cc.expression }, status: metricStatuses[cc.name] || 'new', parentModel: modelName });
        }
      }
    }
    return [...apiMetrics, ...newMetrics];
  }, [metrics, explorerModelStates, diffResult]);

  const mergedDimensions = useMemo(() => {
    const dimensionStatuses = diffResult?.dimensions || {};
    const apiNames = new Set(dimensions.map((d) => d.name));
    const apiDimensions = dimensions.map((d) => {
      const status = dimensionStatuses[d.name] || null;
      return status ? { ...d, status } : d;
    });
    const newDimensions = [];
    for (const [modelName, ms] of Object.entries(explorerModelStates)) {
      for (const cc of ms.computedColumns || []) {
        if (cc.type === 'dimension' && !apiNames.has(cc.name)) {
          newDimensions.push({ name: cc.name, config: { expression: cc.expression }, status: dimensionStatuses[cc.name] || 'new', parentModel: modelName });
        }
      }
    }
    return [...apiDimensions, ...newDimensions];
  }, [dimensions, explorerModelStates, diffResult]);

  const filteredModels = useMemo(
    () => mergedModels.filter((m) => matchesSearch(m.name)),
    [mergedModels, matchesSearch]
  );
  const filteredMetrics = useMemo(
    () => mergedMetrics.filter((m) => matchesSearch(m.name)),
    [mergedMetrics, matchesSearch]
  );
  const filteredDimensions = useMemo(
    () => mergedDimensions.filter((d) => matchesSearch(d.name)),
    [mergedDimensions, matchesSearch]
  );
  const filteredInsights = useMemo(
    () => mergedInsights.filter((i) => matchesSearch(i.name)),
    [mergedInsights, matchesSearch]
  );
  const explorerChartName = useStore((s) => s.explorerChartName);

  const filteredCharts = useMemo(() => {
    const chartStatus = diffResult?.chart || null;
    const merged = charts.map((c) => {
      if (c.name === explorerChartName && chartStatus) {
        return { ...c, status: chartStatus };
      }
      return c;
    });
    return merged.filter((c) => matchesSearch(c.name));
  }, [charts, matchesSearch, explorerChartName, diffResult]);
  const filteredInputs = useMemo(
    () => inputs.filter((i) => matchesSearch(i.name)),
    [inputs, matchesSearch]
  );

  const handleSourcesLoaded = useCallback(
    (sources) => {
      setExplorerSources(sources);
      if (sources?.length > 0 && !sourceName) {
        setSourceName(sources[0].source_name);
      }
    },
    [setExplorerSources, sourceName, setSourceName]
  );

  const handleModelClick = useCallback(
    (model) => {
      loadModel(model);
    },
    [loadModel]
  );

  const handleChartClick = useCallback(
    (chart) => {
      // Skip if this chart is already loaded
      if (chart.name === useStore.getState().explorerChartName) return;

      // Resolve chart lineage: find insights, models, and inputs
      const allInsights = useStore.getState().insights || [];
      const allModels = useStore.getState().models || [];
      const allInputs = useStore.getState().inputs || [];
      const allInputNames = new Set(allInputs.map((i) => i.name));

      // Find insights referenced by this chart
      const chartInsightRefs = chart.config?.insights || [];
      const resolvedInsights = [];
      for (const ref of chartInsightRefs) {
        const refName = typeof ref === 'string' ? ref.replace(/.*ref\(([^)]+)\).*/, '$1') : null;
        if (refName) {
          const found = allInsights.find((i) => i.name === refName);
          if (found) resolvedInsights.push(found);
        }
      }

      // Walk insight refs to collect only model dependencies — inputs are
      // handled dynamically by selectDerivedInputNames at render time.
      const modelNames = new Set();
      for (const insight of resolvedInsights) {
        const searchStr = JSON.stringify(insight.config || {});
        const matches = searchStr.matchAll(/ref\(([^.)]+)\)/g);
        for (const match of matches) {
          const name = match[1];
          if (!allInputNames.has(name)) {
            modelNames.add(name);
          }
        }
      }
      const resolvedModels = allModels.filter((m) => modelNames.has(m.name));

      loadChart(chart, resolvedInsights, resolvedModels);
    },
    [loadChart]
  );

  const handleInsightClick = useCallback(
    (insight) => {
      setActiveInsight(insight.name);
    },
    [setActiveInsight]
  );

  const isLoading = modelsLoading || metricsLoading || dimensionsLoading || insightsLoading || chartsLoading || inputsLoading;

  // Collapsed icon rail
  if (isCollapsed) {
    return (
      <div
        className="w-12 flex-shrink-0 border-r border-secondary-200 bg-white flex flex-col items-center pt-2 gap-3 h-full"
        data-testid="left-panel"
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          className="p-1.5 text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 rounded transition-colors"
          title="Expand sidebar"
          data-testid="expand-sidebar"
        >
          <PiSidebarSimple size={16} />
        </button>
        <div className="w-6 border-t border-secondary-200" />
        {SECTION_DEFS.map((def) => {
          const Icon = def.id === 'source' ? PiHardDrives : getTypeIcon(def.id);
          const colors = getTypeColors(def.id);
          return (
            <div key={def.id} className={`p-1.5 rounded ${colors.text}`} title={def.label}>
              {def.id === 'source' ? (
                <PiHardDrives size={16} className="text-orange-500" />
              ) : (
                <Icon style={{ fontSize: 16 }} className={colors.text} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="flex-shrink-0 border-r border-secondary-200 bg-white flex flex-col h-full overflow-hidden"
      data-testid="left-panel"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-secondary-200 flex-shrink-0">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="p-1 text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 rounded transition-colors flex-shrink-0"
          title="Collapse sidebar"
          data-testid="collapse-sidebar"
        >
          <PiSidebarSimple size={16} />
        </button>
        <span className="text-xs font-medium text-secondary-600">Explorer</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-secondary-100 flex-shrink-0">
        <div className="relative">
          <PiMagnifyingGlass
            className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary-400"
            size={12}
          />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-7 py-1 text-xs border border-secondary-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            data-testid="left-panel-search"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
            >
              <PiX size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto" data-testid="left-panel-content">
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-3 text-secondary-400">
            <PiSpinner className="animate-spin" size={14} />
            <span className="text-xs">Loading...</span>
          </div>
        )}

        {/* Sources (schema browser) */}
        <SourceBrowser
          searchQuery={searchQuery}
          onTableSelect={handleTableSelect}
          onSourcesLoaded={handleSourcesLoaded}
        />

        {/* Models */}
        {filteredModels.length > 0 && (
          <ObjectList
            objects={filteredModels}
            selectedName={activeModelName}
            onSelect={handleModelClick}
            onDelete={(obj) => closeModelTab(obj.name)}
            onReset={(obj) => resetModel(obj.name)}
            title="Models"
            objectType="model"
          />
        )}

        {/* Metrics (draggable) */}
        {filteredMetrics.length > 0 && (
          <div data-testid="section-metrics">
            <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b ${getTypeColors('metric').bg} ${getTypeColors('metric').text} ${getTypeColors('metric').border}`}>
              Metrics ({filteredMetrics.length})
            </div>
            {filteredMetrics.map((m) => (
              <DraggableItem key={m.name} item={m} type="metric" />
            ))}
          </div>
        )}

        {/* Dimensions (draggable) */}
        {filteredDimensions.length > 0 && (
          <div data-testid="section-dimensions">
            <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b ${getTypeColors('dimension').bg} ${getTypeColors('dimension').text} ${getTypeColors('dimension').border}`}>
              Dimensions ({filteredDimensions.length})
            </div>
            {filteredDimensions.map((d) => (
              <DraggableItem key={d.name} item={d} type="dimension" />
            ))}
          </div>
        )}

        {/* Insights */}
        {filteredInsights.length > 0 && (
          <ObjectList
            objects={filteredInsights}
            onSelect={handleInsightClick}
            onDelete={(obj) => deleteExplorerInsight(obj.name)}
            onReset={(obj) => resetInsight(obj.name)}
            title="Insights"
            objectType="insight"
            draggableType="insight"
          />
        )}

        {/* Charts */}
        {filteredCharts.length > 0 && (
          <ObjectList
            objects={filteredCharts}
            onSelect={handleChartClick}
            onReset={(obj) => obj.name === explorerChartName && resetChart()}
            title="Charts"
            objectType="chart"
          />
        )}

        {/* Inputs (draggable to interaction fields and prop fields) */}
        {filteredInputs.length > 0 && (
          <div data-testid="section-inputs">
            <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b ${getTypeColors('input').bg} ${getTypeColors('input').text} ${getTypeColors('input').border}`}>
              Inputs ({filteredInputs.length})
            </div>
            {filteredInputs.map((inp) => (
              <DraggableItem key={inp.name} item={inp} type="input" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading &&
          filteredModels.length === 0 &&
          filteredMetrics.length === 0 &&
          filteredDimensions.length === 0 &&
          filteredInsights.length === 0 &&
          filteredCharts.length === 0 &&
          filteredInputs.length === 0 &&
          (searchQuery ? (
            <div className="flex items-center justify-center h-32 text-xs text-secondary-400">
              {`No results for "${searchQuery}"`}
            </div>
          ) : (
            <EmptyStateCTA
              icon={<HiDatabase className="w-12 h-12" />}
              title="No data sources yet"
              body="Connect a database or upload a CSV to start building."
              primaryAction={{ label: 'Add Source', onClick: openSourceModal }}
            />
          ))}
      </div>
    </div>
  );
};

export default ExplorerLeftPanel;
