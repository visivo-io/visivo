import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PiSidebarSimple,
  PiHardDrives,
  PiMagnifyingGlass,
  PiX,
  PiSpinner,
} from 'react-icons/pi';
import { useDraggable } from '@dnd-kit/core';
import ObjectList from '../new-views/common/ObjectList';
import { getTypeColors, getTypeIcon } from '../new-views/common/objectTypeConfigs';
import EmbeddedPill from '../new-views/lineage/EmbeddedPill';
import SourceBrowser from './SourceBrowser';
import useStore from '../../stores/store';
import { selectActiveModelSourceName } from '../../stores/explorerNewStore';

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
    data: { name: item.name, type, expression: item.config?.expression },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-4 py-2 border-b border-gray-100 cursor-grab active:cursor-grabbing hover:bg-gray-50 transition-colors ${isDragging ? 'opacity-50' : ''}`}
      data-testid={`draggable-${type}-${item.name}`}
    >
      <EmbeddedPill objectType={type} label={item.name} as="div" />
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
  const sourceName = useStore(selectActiveModelSourceName);
  const setSourceName = useStore((s) => s.setActiveModelSource);
  const activeModelName = useStore((s) => s.explorerActiveModelName);

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

  const filteredModels = useMemo(
    () => models.filter((m) => matchesSearch(m.name)),
    [models, matchesSearch]
  );
  const filteredMetrics = useMemo(
    () => metrics.filter((m) => matchesSearch(m.name)),
    [metrics, matchesSearch]
  );
  const filteredDimensions = useMemo(
    () => dimensions.filter((d) => matchesSearch(d.name)),
    [dimensions, matchesSearch]
  );
  const filteredInsights = useMemo(
    () => insights.filter((i) => matchesSearch(i.name)),
    [insights, matchesSearch]
  );
  const filteredCharts = useMemo(
    () => charts.filter((c) => matchesSearch(c.name)),
    [charts, matchesSearch]
  );
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
      // Resolve chart lineage: find insights and their models
      const allInsights = useStore.getState().insights || [];
      const allModels = useStore.getState().models || [];

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

      // Find models referenced by insights (via props containing ref(modelName))
      const modelNames = new Set();
      for (const insight of resolvedInsights) {
        const propsStr = JSON.stringify(insight.config?.props || {});
        const matches = propsStr.matchAll(/ref\(([^.)]+)\)/g);
        for (const match of matches) {
          modelNames.add(match[1]);
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
            title="Insights"
            objectType="insight"
          />
        )}

        {/* Charts */}
        {filteredCharts.length > 0 && (
          <ObjectList
            objects={filteredCharts}
            onSelect={handleChartClick}
            title="Charts"
            objectType="chart"
          />
        )}

        {/* Inputs (read-only in explorer — draggable to interaction fields) */}
        {filteredInputs.length > 0 && (
          <ObjectList
            objects={filteredInputs}
            onSelect={() => {}}
            title="Inputs"
            objectType="input"
          />
        )}

        {/* Empty state */}
        {!isLoading &&
          filteredModels.length === 0 &&
          filteredMetrics.length === 0 &&
          filteredDimensions.length === 0 &&
          filteredInsights.length === 0 &&
          filteredCharts.length === 0 &&
          filteredInputs.length === 0 && (
            <div className="flex items-center justify-center h-32 text-xs text-secondary-400">
              {searchQuery ? `No results for "${searchQuery}"` : 'No project objects defined'}
            </div>
          )}
      </div>
    </div>
  );
};

export default ExplorerLeftPanel;
