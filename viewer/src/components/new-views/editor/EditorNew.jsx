import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useStore from '../../../stores/store';
import { useObjectSave } from '../../../hooks/useObjectSave';
import SourceSearch from './SourceSearch';
import EditPanel from '../common/EditPanel';
import CreateButton from '../common/CreateButton';
import ObjectList from '../common/ObjectList';
import ObjectTypeFilter from '../common/ObjectTypeFilter';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';

/**
 * EditorNew - New editor view for sources, models, dimensions, metrics, relations, and insights
 * Completely independent of namedChildren/editorStore
 */
const EditorNew = () => {
  // Sources
  const sources = useStore(state => state.sources);
  const fetchSources = useStore(state => state.fetchSources);
  const sourcesLoading = useStore(state => state.sourcesLoading);
  const sourcesError = useStore(state => state.sourcesError);

  // Models
  const models = useStore(state => state.models);
  const fetchModels = useStore(state => state.fetchModels);
  const modelsLoading = useStore(state => state.modelsLoading);
  const modelsError = useStore(state => state.modelsError);

  // Dimensions
  const dimensions = useStore(state => state.dimensions);
  const fetchDimensions = useStore(state => state.fetchDimensions);
  const dimensionsLoading = useStore(state => state.dimensionsLoading);
  const dimensionsError = useStore(state => state.dimensionsError);

  // Metrics
  const metrics = useStore(state => state.metrics);
  const fetchMetrics = useStore(state => state.fetchMetrics);
  const metricsLoading = useStore(state => state.metricsLoading);
  const metricsError = useStore(state => state.metricsError);

  // Relations
  const relations = useStore(state => state.relations);
  const fetchRelations = useStore(state => state.fetchRelations);
  const relationsLoading = useStore(state => state.relationsLoading);
  const relationsError = useStore(state => state.relationsError);

  // Insights
  const insightConfigs = useStore(state => state.insightConfigs);
  const fetchInsightConfigs = useStore(state => state.fetchInsightConfigs);
  const insightConfigsLoading = useStore(state => state.insightConfigsLoading);
  const insightConfigsError = useStore(state => state.insightConfigsError);

  // Markdowns
  const markdownConfigs = useStore(state => state.markdownConfigs);
  const fetchMarkdownConfigs = useStore(state => state.fetchMarkdownConfigs);
  const markdownConfigsLoading = useStore(state => state.markdownConfigsLoading);
  const markdownConfigsError = useStore(state => state.markdownConfigsError);

  // Charts
  const chartConfigs = useStore(state => state.chartConfigs);
  const fetchChartConfigs = useStore(state => state.fetchChartConfigs);
  const chartConfigsLoading = useStore(state => state.chartConfigsLoading);
  const chartConfigsError = useStore(state => state.chartConfigsError);

  // Tables
  const tableConfigs = useStore(state => state.tableConfigs);
  const fetchTableConfigs = useStore(state => state.fetchTableConfigs);
  const tableConfigsLoading = useStore(state => state.tableConfigsLoading);
  const tableConfigsError = useStore(state => state.tableConfigsError);

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Navigation stack for editing - supports drilling into embedded objects
  // Each item is { type, object, applyToParent?: fn }
  const [editStack, setEditStack] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createObjectType, setCreateObjectType] = useState('source');

  // Navigation helpers
  // options.applyToParent: (parentConfig, embeddedConfig) => newParentConfig
  const pushEdit = useCallback((type, object, options = {}) => {
    setEditStack(prev => [...prev, { type, object, ...options }]);
    setIsCreating(false);
  }, []);

  const popEdit = useCallback(() => {
    setEditStack(prev => prev.slice(0, -1));
  }, []);

  const clearEdit = useCallback(() => {
    setEditStack([]);
  }, []);

  const currentEdit = editStack.length > 0 ? editStack[editStack.length - 1] : null;
  const canGoBack = editStack.length > 1;

  // Fetch all object types on mount
  useEffect(() => {
    fetchSources();
    fetchModels();
    fetchDimensions();
    fetchMetrics();
    fetchRelations();
    fetchInsightConfigs();
    fetchMarkdownConfigs();
    fetchChartConfigs();
    fetchTableConfigs();
  }, [fetchSources, fetchModels, fetchDimensions, fetchMetrics, fetchRelations, fetchInsightConfigs, fetchMarkdownConfigs, fetchChartConfigs, fetchTableConfigs]);

  // Compute object type counts
  const typeCounts = useMemo(() => {
    return {
      source: sources?.length || 0,
      model: models?.length || 0,
      dimension: dimensions?.length || 0,
      metric: metrics?.length || 0,
      relation: relations?.length || 0,
      insight: insightConfigs?.length || 0,
      markdown: markdownConfigs?.length || 0,
      chart: chartConfigs?.length || 0,
      table: tableConfigs?.length || 0,
    };
  }, [sources, models, dimensions, metrics, relations, insightConfigs, markdownConfigs, chartConfigs, tableConfigs]);

  // Filter sources by type and search query
  const filteredSources = useMemo(() => {
    if (!sources) return [];

    // If types are selected and source is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('source')) {
      return [];
    }

    let filtered = sources;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        source =>
          source.name.toLowerCase().includes(query) ||
          (source.type && source.type.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [sources, selectedTypes, searchQuery]);

  // Filter models by type and search query
  const filteredModels = useMemo(() => {
    if (!models) return [];

    // If types are selected and model is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('model')) {
      return [];
    }

    let filtered = models;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        model =>
          model.name.toLowerCase().includes(query) ||
          (model.sql && model.sql.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [models, selectedTypes, searchQuery]);

  // Filter dimensions by type and search query
  const filteredDimensions = useMemo(() => {
    if (!dimensions) return [];

    // If types are selected and dimension is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('dimension')) {
      return [];
    }

    let filtered = dimensions;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        dimension =>
          dimension.name.toLowerCase().includes(query) ||
          (dimension.config?.expression &&
            dimension.config.expression.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [dimensions, selectedTypes, searchQuery]);

  // Filter metrics by type and search query
  const filteredMetrics = useMemo(() => {
    if (!metrics) return [];

    // If types are selected and metric is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('metric')) {
      return [];
    }

    let filtered = metrics;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        metric =>
          metric.name.toLowerCase().includes(query) ||
          (metric.config?.expression && metric.config.expression.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [metrics, selectedTypes, searchQuery]);

  // Filter relations by type and search query
  const filteredRelations = useMemo(() => {
    if (!relations) return [];

    // If types are selected and relation is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('relation')) {
      return [];
    }

    let filtered = relations;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        relation =>
          relation.name.toLowerCase().includes(query) ||
          (relation.config?.condition && relation.config.condition.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [relations, selectedTypes, searchQuery]);

  // Filter insights by type and search query
  const filteredInsights = useMemo(() => {
    if (!insightConfigs) return [];

    // If types are selected and insight is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('insight')) {
      return [];
    }

    let filtered = insightConfigs;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        insight =>
          insight.name.toLowerCase().includes(query) ||
          (insight.config?.description && insight.config.description.toLowerCase().includes(query)) ||
          (insight.config?.props?.type && insight.config.props.type.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [insightConfigs, selectedTypes, searchQuery]);

  // Filter markdowns by type and search query
  const filteredMarkdowns = useMemo(() => {
    if (!markdownConfigs) return [];

    // If types are selected and markdown is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('markdown')) {
      return [];
    }

    let filtered = markdownConfigs;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        markdown =>
          markdown.name.toLowerCase().includes(query) ||
          (markdown.config?.content && markdown.config.content.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [markdownConfigs, selectedTypes, searchQuery]);

  // Filter charts by type and search query
  const filteredCharts = useMemo(() => {
    if (!chartConfigs) return [];

    // If types are selected and chart is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('chart')) {
      return [];
    }

    let filtered = chartConfigs;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        chart => chart.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [chartConfigs, selectedTypes, searchQuery]);

  // Filter tables by type and search query
  const filteredTables = useMemo(() => {
    if (!tableConfigs) return [];

    // If types are selected and table is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('table')) {
      return [];
    }

    let filtered = tableConfigs;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        table => table.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [tableConfigs, selectedTypes, searchQuery]);

  // Handle source selection
  const handleSourceSelect = useCallback(source => {
    clearEdit();
    pushEdit('source', source);
  }, [clearEdit, pushEdit]);

  // Handle model selection
  const handleModelSelect = useCallback(model => {
    clearEdit();
    pushEdit('model', model);
  }, [clearEdit, pushEdit]);

  // Handle dimension selection
  const handleDimensionSelect = useCallback(dimension => {
    clearEdit();
    pushEdit('dimension', dimension);
  }, [clearEdit, pushEdit]);

  // Handle metric selection
  const handleMetricSelect = useCallback(metric => {
    clearEdit();
    pushEdit('metric', metric);
  }, [clearEdit, pushEdit]);

  // Handle relation selection
  const handleRelationSelect = useCallback(relation => {
    clearEdit();
    pushEdit('relation', relation);
  }, [clearEdit, pushEdit]);

  // Handle insight selection
  const handleInsightSelect = useCallback(insight => {
    clearEdit();
    pushEdit('insight', insight);
  }, [clearEdit, pushEdit]);

  // Handle markdown selection
  const handleMarkdownSelect = useCallback(markdown => {
    clearEdit();
    pushEdit('markdown', markdown);
  }, [clearEdit, pushEdit]);

  // Handle chart selection
  const handleChartSelect = useCallback(chart => {
    clearEdit();
    pushEdit('chart', chart);
  }, [clearEdit, pushEdit]);

  // Handle table selection
  const handleTableSelect = useCallback(table => {
    clearEdit();
    pushEdit('table', table);
  }, [clearEdit, pushEdit]);

  // Handle create button selection
  const handleCreateSelect = useCallback(objectType => {
    clearEdit();
    setIsCreating(true);
    setCreateObjectType(objectType);
  }, [clearEdit]);

  // Handle panel close
  const handlePanelClose = useCallback(() => {
    clearEdit();
    setIsCreating(false);
  }, [clearEdit]);

  // Refresh all data after save
  const refreshData = useCallback(async () => {
    await fetchSources();
    await fetchModels();
    await fetchDimensions();
    await fetchMetrics();
    await fetchRelations();
    await fetchInsightConfigs();
    await fetchMarkdownConfigs();
    await fetchChartConfigs();
    await fetchTableConfigs();
  }, [fetchSources, fetchModels, fetchDimensions, fetchMetrics, fetchRelations, fetchInsightConfigs, fetchMarkdownConfigs, fetchChartConfigs, fetchTableConfigs]);

  // Callback for successful saves - refresh data and clear edit state
  const onSuccessfulSave = useCallback(async () => {
    await refreshData();
    clearEdit();
    setIsCreating(false);
  }, [refreshData, clearEdit]);

  // Use the unified save handler hook
  const handleObjectSave = useObjectSave(currentEdit, setEditStack, onSuccessfulSave);

  const isPanelOpen = currentEdit !== null || isCreating;
  const isLoading = sourcesLoading || modelsLoading || dimensionsLoading || metricsLoading || relationsLoading || insightConfigsLoading || markdownConfigsLoading || chartConfigsLoading || tableConfigsLoading;

  // Get type colors for consistent theming
  const sourceTypeConfig = getTypeByValue('source');
  const sourceColors = sourceTypeConfig?.colors || DEFAULT_COLORS;
  const SourceIcon = sourceTypeConfig?.icon;

  const modelTypeConfig = getTypeByValue('model');
  const modelColors = modelTypeConfig?.colors || DEFAULT_COLORS;
  const ModelIcon = modelTypeConfig?.icon;

  const dimensionTypeConfig = getTypeByValue('dimension');
  const DimensionIcon = dimensionTypeConfig?.icon;

  const metricTypeConfig = getTypeByValue('metric');
  const MetricIcon = metricTypeConfig?.icon;

  const relationTypeConfig = getTypeByValue('relation');
  const RelationIcon = relationTypeConfig?.icon;

  const insightTypeConfig = getTypeByValue('insight');
  const InsightIcon = insightTypeConfig?.icon;

  const hasNoObjects = !sources?.length && !models?.length && !dimensions?.length && !metrics?.length && !relations?.length && !insightConfigs?.length && !markdownConfigs?.length && !chartConfigs?.length && !tableConfigs?.length;
  const hasNoFilteredObjects = !filteredSources.length && !filteredModels.length && !filteredDimensions.length && !filteredMetrics.length && !filteredRelations.length && !filteredInsights.length && !filteredMarkdowns.length && !filteredCharts.length && !filteredTables.length;

  const hasError = sourcesError || modelsError || dimensionsError || metricsError || relationsError || insightConfigsError || markdownConfigsError || chartConfigsError || tableConfigsError;

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Left sidebar - Filter, Search, and list */}
      <div
        className={`w-80 bg-white border-r border-gray-200 flex flex-col ${isPanelOpen ? 'mr-96' : ''} transition-all duration-200`}
      >
        {/* Type Filter */}
        <div className="p-3 border-b border-gray-200">
          <ObjectTypeFilter
            selectedTypes={selectedTypes}
            onChange={setSelectedTypes}
            counts={typeCounts}
          />
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <SourceSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by name..."
          />
        </div>

        {/* Loading state */}
        {isLoading && hasNoObjects && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <span>Loading...</span>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            Error: {sourcesError || modelsError || dimensionsError || metricsError || relationsError || insightConfigsError || markdownConfigsError || chartConfigsError || tableConfigsError}
          </div>
        )}

        {/* Object Lists */}
        {!isLoading && (
          <div className="flex-1 overflow-y-auto">
            {/* Sources List */}
            {filteredSources.length > 0 && (
              <ObjectList
                objects={filteredSources}
                selectedName={currentEdit?.type === 'source' ? currentEdit.object?.name : null}
                onSelect={handleSourceSelect}
                title="Sources"
                objectType="source"
              />
            )}

            {/* Models List */}
            {filteredModels.length > 0 && (
              <ObjectList
                objects={filteredModels}
                selectedName={currentEdit?.type === 'model' ? currentEdit.object?.name : null}
                onSelect={handleModelSelect}
                title="Models"
                objectType="model"
              />
            )}

            {/* Dimensions List */}
            {filteredDimensions.length > 0 && (
              <ObjectList
                objects={filteredDimensions}
                selectedName={currentEdit?.type === 'dimension' ? currentEdit.object?.name : null}
                onSelect={handleDimensionSelect}
                title="Dimensions"
                objectType="dimension"
              />
            )}

            {/* Metrics List */}
            {filteredMetrics.length > 0 && (
              <ObjectList
                objects={filteredMetrics}
                selectedName={currentEdit?.type === 'metric' ? currentEdit.object?.name : null}
                onSelect={handleMetricSelect}
                title="Metrics"
                objectType="metric"
              />
            )}

            {/* Relations List */}
            {filteredRelations.length > 0 && (
              <ObjectList
                objects={filteredRelations}
                selectedName={currentEdit?.type === 'relation' ? currentEdit.object?.name : null}
                onSelect={handleRelationSelect}
                title="Relations"
                objectType="relation"
              />
            )}

            {/* Insights List */}
            {filteredInsights.length > 0 && (
              <ObjectList
                objects={filteredInsights}
                selectedName={currentEdit?.type === 'insight' ? currentEdit.object?.name : null}
                onSelect={handleInsightSelect}
                title="Insights"
                objectType="insight"
              />
            )}

            {/* Markdowns List */}
            {filteredMarkdowns.length > 0 && (
              <ObjectList
                objects={filteredMarkdowns}
                selectedName={currentEdit?.type === 'markdown' ? currentEdit.object?.name : null}
                onSelect={handleMarkdownSelect}
                title="Markdowns"
                objectType="markdown"
              />
            )}

            {/* Charts List */}
            {filteredCharts.length > 0 && (
              <ObjectList
                objects={filteredCharts}
                selectedName={currentEdit?.type === 'chart' ? currentEdit.object?.name : null}
                onSelect={handleChartSelect}
                title="Charts"
                objectType="chart"
              />
            )}

            {/* Tables List */}
            {filteredTables.length > 0 && (
              <ObjectList
                objects={filteredTables}
                selectedName={currentEdit?.type === 'table' ? currentEdit.object?.name : null}
                onSelect={handleTableSelect}
                title="Tables"
                objectType="table"
              />
            )}
          </div>
        )}

        {/* Empty search/filter results */}
        {!isLoading && !hasNoObjects && hasNoFilteredObjects && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center px-4">
            {selectedTypes.length > 0
              ? 'No objects of selected types'
              : `No objects match "${searchQuery}"`}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 bg-gray-50 relative">
        {/* Empty state */}
        {!isPanelOpen && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="flex gap-4 mb-4">
              {SourceIcon && (
                <div
                  className={`w-12 h-12 rounded-full ${sourceColors.bg} flex items-center justify-center`}
                >
                  <SourceIcon className={`w-6 h-6 ${sourceColors.text}`} />
                </div>
              )}
              {ModelIcon && (
                <div
                  className={`w-12 h-12 rounded-full ${modelColors.bg} flex items-center justify-center`}
                >
                  <ModelIcon className={`w-6 h-6 ${modelColors.text}`} />
                </div>
              )}
              {DimensionIcon && (
                <div
                  className={`w-12 h-12 rounded-full ${dimensionTypeConfig?.colors?.bg || 'bg-gray-100'} flex items-center justify-center`}
                >
                  <DimensionIcon
                    className={`w-6 h-6 ${dimensionTypeConfig?.colors?.text || 'text-gray-800'}`}
                  />
                </div>
              )}
              {MetricIcon && (
                <div
                  className={`w-12 h-12 rounded-full ${metricTypeConfig?.colors?.bg || 'bg-gray-100'} flex items-center justify-center`}
                >
                  <MetricIcon
                    className={`w-6 h-6 ${metricTypeConfig?.colors?.text || 'text-gray-800'}`}
                  />
                </div>
              )}
              {RelationIcon && (
                <div
                  className={`w-12 h-12 rounded-full ${relationTypeConfig?.colors?.bg || 'bg-gray-100'} flex items-center justify-center`}
                >
                  <RelationIcon
                    className={`w-6 h-6 ${relationTypeConfig?.colors?.text || 'text-gray-800'}`}
                  />
                </div>
              )}
              {InsightIcon && (
                <div className={`w-12 h-12 rounded-full ${insightTypeConfig?.colors?.bg || 'bg-gray-100'} flex items-center justify-center`}>
                  <InsightIcon className={`w-6 h-6 ${insightTypeConfig?.colors?.text || 'text-gray-800'}`} />
                </div>
              )}
            </div>
            <div className="text-lg mb-2">Select an object to edit</div>
            <div className="text-sm">or click the + button to create a new object</div>
          </div>
        )}

        {/* Create button (FAB) */}
        <CreateButton onSelect={handleCreateSelect} />
      </div>

      {/* Edit Panel (right side) - EditPanel now renders both the panel and preview drawer */}
      {isPanelOpen && (
        <>
          <div className="fixed top-12 right-0 bottom-0 z-20">
            <EditPanel
              editItem={currentEdit}
              canGoBack={canGoBack}
              onGoBack={popEdit}
              onNavigateTo={pushEdit}
              objectType={createObjectType}
              isCreate={isCreating}
              onClose={handlePanelClose}
              onSave={handleObjectSave}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default EditorNew;
