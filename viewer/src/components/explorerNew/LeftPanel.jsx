import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PiSidebarSimple,
  PiHardDrives,
  PiCube,
  PiTable,
  PiColumns,
  PiSpinner,
  PiArrowClockwise,
  PiCaretDown,
  PiCaretRight,
  PiDatabase,
  PiMagnifyingGlass,
  PiX,
} from 'react-icons/pi';
import SchemaTreeNode from './SchemaBrowser/SchemaTreeNode';
import { getTypeColors, getTypeIcon } from '../new-views/common/objectTypeConfigs';
import {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
} from '../../api/sourceSchemaJobs';
import useStore from '../../stores/store';
import { ObjectStatus } from '../../stores/sourceStore';

const stripRef = (value) => {
  if (typeof value !== 'string') return value;
  const match = value.match(/^ref\((.+)\)$/);
  return match ? match[1] : value;
};

const STATUS_DOT_CLASSES = {
  [ObjectStatus.NEW]: 'bg-green-500',
  [ObjectStatus.MODIFIED]: 'bg-amber-500',
};

const SECTION_DEFS = [
  { id: 'source', label: 'Sources', Icon: PiHardDrives, iconColor: 'text-orange-500' },
  { id: 'model', label: 'Models', Icon: PiCube, iconColor: 'text-amber-700' },
  { id: 'metric', label: 'Metrics', iconColor: null },
  { id: 'dimension', label: 'Dimensions', iconColor: null },
];

const LeftPanel = () => {
  const isCollapsed = useStore((s) => s.explorerLeftNavCollapsed);
  const toggleCollapsed = useStore((s) => s.toggleExplorerLeftNavCollapsed);
  const sourceName = useStore((s) => s.explorerSourceName);
  const setSourceName = useStore((s) => s.setExplorerSourceName);
  const handleTableSelect = useStore((s) => s.handleExplorerTableSelect);

  // Models
  const models = useStore((s) => s.models);
  const modelsLoading = useStore((s) => s.modelsLoading);
  const fetchModelsAction = useStore((s) => s.fetchModels);
  const handleModelUse = useStore((s) => s.handleExplorerModelUse);
  const activeModelName = useStore((s) => s.explorerActiveModelName);
  const setExplorerSources = useStore((s) => s.setExplorerSources);

  // Metrics & Dimensions
  const dimensions = useStore((s) => s.dimensions || []);
  const dimensionsLoading = useStore((s) => s.dimensionsLoading);
  const fetchDimensionsAction = useStore((s) => s.fetchDimensions);
  const metrics = useStore((s) => s.metrics || []);
  const metricsLoading = useStore((s) => s.metricsLoading);
  const fetchMetricsAction = useStore((s) => s.fetchMetrics);

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleTypes, setVisibleTypes] = useState(new Set());
  const [expandedSections, setExpandedSections] = useState(
    new Set(['source', 'model', 'metric', 'dimension'])
  );

  // Source tree state
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [loadedData, setLoadedData] = useState({});
  const [loadingNodes, setLoadingNodes] = useState(new Set());
  const [generatingSchemas, setGeneratingSchemas] = useState(new Map());
  const [schemaErrors, setSchemaErrors] = useState(new Map());

  // Fetch all data on mount
  useEffect(() => {
    const loadSources = async () => {
      setSourcesLoading(true);
      try {
        const data = await fetchSourceSchemaJobs();
        setSources(data || []);
        setExplorerSources(data || []);
        if (data?.length > 0 && !sourceName) {
          setSourceName(data[0].source_name);
        }
      } catch (err) {
        console.error('Failed to load sources:', err);
      } finally {
        setSourcesLoading(false);
      }
    };
    loadSources();
    fetchModelsAction();
    fetchDimensionsAction();
    fetchMetricsAction();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Search & filter helpers ───────────────────────────
  const matchesSearch = useCallback(
    (name) => {
      if (!searchQuery) return true;
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    },
    [searchQuery]
  );

  const isTypeVisible = useCallback(
    (type) => visibleTypes.size === 0 || visibleTypes.has(type),
    [visibleTypes]
  );

  const toggleType = useCallback((type) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const toggleSection = useCallback((section) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  // ─── Source tree handlers ──────────────────────────────
  const handleGenerateSchema = useCallback(async (srcName, e) => {
    if (e) e.stopPropagation();

    setGeneratingSchemas((prev) => new Map(prev).set(srcName, { status: 'starting' }));
    setSchemaErrors((prev) => {
      const next = new Map(prev);
      next.delete(srcName);
      return next;
    });

    try {
      const { run_instance_id: jobId } = await generateSourceSchema(srcName);
      const maxWaitTime = 120000;
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const status = await fetchSchemaGenerationStatus(jobId);
        setGeneratingSchemas((prev) =>
          new Map(prev).set(srcName, {
            status: status.status,
            progress: status.progress || 0,
            message: status.progress_message || '',
          })
        );

        if (status.status === 'completed') {
          setGeneratingSchemas((prev) => {
            const next = new Map(prev);
            next.delete(srcName);
            return next;
          });
          const updatedSources = await fetchSourceSchemaJobs();
          setSources(updatedSources || []);
          const sourceKey = `source::${srcName}`;
          const tables = await fetchSourceTables(srcName);
          setLoadedData((prev) => ({ ...prev, [sourceKey]: tables }));
          setExpandedNodes((prev) => new Set(prev).add(sourceKey));
          return;
        }

        if (status.status === 'failed') {
          throw new Error(status.error || 'Schema generation failed');
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      throw new Error('Schema generation timed out');
    } catch (error) {
      setGeneratingSchemas((prev) => {
        const next = new Map(prev);
        next.delete(srcName);
        return next;
      });
      setSchemaErrors((prev) => new Map(prev).set(srcName, error.message));
      console.error(`Failed to generate schema for ${srcName}:`, error);
    }
  }, []);

  const toggleNode = useCallback(
    async (nodeKey, loader) => {
      const isCurrentlyExpanded = expandedNodes.has(nodeKey);
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        if (next.has(nodeKey)) {
          next.delete(nodeKey);
        } else {
          next.add(nodeKey);
        }
        return next;
      });

      if (!isCurrentlyExpanded && !loadedData[nodeKey] && loader) {
        setLoadingNodes((prev) => new Set(prev).add(nodeKey));
        try {
          const data = await loader();
          setLoadedData((prev) => ({ ...prev, [nodeKey]: data }));
        } catch (error) {
          console.error(`Error loading ${nodeKey}:`, error);
          setLoadedData((prev) => ({ ...prev, [nodeKey]: { error: error.message } }));
        } finally {
          setLoadingNodes((prev) => {
            const next = new Set(prev);
            next.delete(nodeKey);
            return next;
          });
        }
      }
    },
    [loadedData, expandedNodes]
  );

  // ─── Filtered data ────────────────────────────────────
  const hasLoadedMatch = useCallback(
    (nodeKeyPrefix) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      for (const [key, data] of Object.entries(loadedData)) {
        if (!key.startsWith(nodeKeyPrefix)) continue;
        if (Array.isArray(data)) {
          if (data.some((item) => item.name?.toLowerCase().includes(query))) return true;
        }
      }
      return false;
    },
    [searchQuery, loadedData]
  );

  const filteredSources = useMemo(
    () =>
      sources.filter((s) => {
        const sourceKey = `source::${s.source_name}`;
        return matchesSearch(s.source_name) || hasLoadedMatch(sourceKey);
      }),
    [sources, matchesSearch, hasLoadedMatch]
  );

  const filteredModels = useMemo(
    () =>
      models.filter((m) => {
        if (matchesSearch(m.name)) return true;
        const src = m.config?.source;
        if (typeof src === 'string' && src.toLowerCase().includes(searchQuery.toLowerCase()))
          return true;
        return false;
      }),
    [models, matchesSearch, searchQuery]
  );

  const filteredMetrics = useMemo(() => {
    if (!activeModelName) return [];
    return metrics.filter((m) => {
      const rawModel = m.parentModel || m.config?.model;
      const modelName = rawModel ? stripRef(rawModel) : null;
      return modelName === activeModelName && matchesSearch(m.name);
    });
  }, [metrics, activeModelName, matchesSearch]);

  const filteredDimensions = useMemo(() => {
    if (!activeModelName) return [];
    return dimensions.filter((d) => {
      const rawModel = d.parentModel || d.config?.model;
      const modelName = rawModel ? stripRef(rawModel) : null;
      return modelName === activeModelName && matchesSearch(d.name);
    });
  }, [dimensions, activeModelName, matchesSearch]);

  // Counts for type badges
  const typeCounts = useMemo(
    () => ({
      source: filteredSources.length,
      model: filteredModels.length,
      metric: filteredMetrics.length,
      dimension: filteredDimensions.length,
    }),
    [filteredSources, filteredModels, filteredMetrics, filteredDimensions]
  );

  // ─── Source tree rendering ─────────────────────────────
  const getNodeError = useCallback(
    (nodeKey) => {
      const data = loadedData[nodeKey];
      return data?.error || null;
    },
    [loadedData]
  );

  const renderColumns = useCallback(
    (columns, tableName) => {
      if (!columns || !Array.isArray(columns)) return null;
      return columns
        .filter((col) => matchesSearch(col.name))
        .map((col) => (
          <SchemaTreeNode
            key={`col-${tableName}-${col.name}`}
            icon={<PiColumns size={14} />}
            label={col.name}
            type="column"
            badge={col.type}
            level={2}
          />
        ));
    },
    [matchesSearch]
  );

  const renderTables = useCallback(
    (srcName, sourceKey) => {
      const data = loadedData[sourceKey];
      if (!data || data.error) return null;
      const tables = Array.isArray(data) ? data : [];

      return tables
        .filter((table) => {
          const colKey = `${sourceKey}::table::${table.name}`;
          return matchesSearch(table.name) || hasLoadedMatch(colKey);
        })
        .map((table) => {
          const colKey = `${sourceKey}::table::${table.name}`;
          return (
            <SchemaTreeNode
              key={colKey}
              icon={<PiTable size={14} />}
              label={table.name}
              type="table"
              isExpanded={expandedNodes.has(colKey)}
              isLoading={loadingNodes.has(colKey)}
              errorMessage={getNodeError(colKey)}
              onClick={() => toggleNode(colKey, () => fetchTableColumns(srcName, table.name))}
              onDoubleClick={() => handleTableSelect?.({ sourceName: srcName, table: table.name })}
              level={1}
            >
              {renderColumns(loadedData[colKey], table.name)}
            </SchemaTreeNode>
          );
        });
    },
    [
      loadedData,
      expandedNodes,
      loadingNodes,
      toggleNode,
      matchesSearch,
      hasLoadedMatch,
      handleTableSelect,
      renderColumns,
      getNodeError,
    ]
  );

  const renderSourceTree = useCallback(() => {
    return filteredSources.map((source) => {
      const sourceKey = `source::${source.source_name}`;
      const errorMsg = getNodeError(sourceKey) || schemaErrors.get(source.source_name);
      const generationStatus = generatingSchemas.get(source.source_name);
      const isGenerating = !!generationStatus;
      const hasCachedSchema = source.has_cached_schema;

      const getBadge = () => {
        if (isGenerating) return generationStatus.message || 'Generating...';
        if (source.total_tables != null) return `${source.total_tables} tables`;
        return null;
      };

      const getActions = () => {
        if (hasCachedSchema && !isGenerating) {
          return [
            {
              label: 'Refresh Schema',
              icon: <PiArrowClockwise size={12} />,
              onClick: (e) => handleGenerateSchema(source.source_name, e),
            },
          ];
        }
        return [];
      };

      return (
        <SchemaTreeNode
          key={sourceKey}
          icon={<PiHardDrives size={14} className="text-orange-500" />}
          label={source.source_name}
          type="source"
          badge={getBadge()}
          isExpanded={expandedNodes.has(sourceKey)}
          isLoading={loadingNodes.has(sourceKey) || isGenerating}
          errorMessage={errorMsg}
          onClick={() => {
            if (isGenerating) return;
            if (!hasCachedSchema) {
              handleGenerateSchema(source.source_name);
              return;
            }
            toggleNode(sourceKey, () => fetchSourceTables(source.source_name));
          }}
          actions={getActions()}
          level={0}
        >
          {renderTables(source.source_name, sourceKey)}
        </SchemaTreeNode>
      );
    });
  }, [
    filteredSources,
    expandedNodes,
    loadingNodes,
    toggleNode,
    renderTables,
    getNodeError,
    generatingSchemas,
    schemaErrors,
    handleGenerateSchema,
  ]);

  // ─── Section header ────────────────────────────────────
  const renderSectionHeader = (type, count) => {
    const colors = getTypeColors(type);
    const isExpanded = expandedSections.has(type);
    const def = SECTION_DEFS.find((d) => d.id === type);

    return (
      <button
        type="button"
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b ${colors.bg} ${colors.text} ${colors.border} hover:opacity-80 transition-opacity`}
        onClick={() => toggleSection(type)}
        data-testid={`section-header-${type}`}
      >
        {isExpanded ? <PiCaretDown size={10} /> : <PiCaretRight size={10} />}
        <span>{def?.label || type}</span>
        <span className="ml-auto font-normal">{count}</span>
      </button>
    );
  };

  // ─── Model list rendering ──────────────────────────────
  const renderModelsList = () => {
    if (filteredModels.length === 0 && searchQuery) {
      return (
        <div className="text-xs text-secondary-400 text-center py-4" data-testid="models-no-results">
          No models matching &quot;{searchQuery}&quot;
        </div>
      );
    }

    return filteredModels.map((model) => {
      const isActive = model.name === activeModelName;
      return (
        <div
          key={model.name}
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group ${
            isActive
              ? 'bg-primary-50 border-l-2 border-primary'
              : 'hover:bg-secondary-50 border-l-2 border-transparent'
          }`}
          data-testid={`model-item-${model.name}`}
        >
          <button
            type="button"
            className="flex-1 flex items-center gap-2 text-left min-w-0"
            onClick={() => handleModelUse(model)}
            title={`Load SQL from "${model.name}"`}
            data-testid={`model-use-${model.name}`}
          >
            {model.status && STATUS_DOT_CLASSES[model.status] && (
              <span
                className={`w-2 h-2 rounded-full ${STATUS_DOT_CLASSES[model.status]} flex-shrink-0`}
                data-testid={`status-dot-${model.status === ObjectStatus.NEW ? 'new' : 'modified'}`}
              />
            )}
            <PiCube size={14} className="flex-shrink-0 text-amber-700" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-secondary-800 truncate">{model.name}</div>
              {model.config?.source && (
                <div className="flex items-center gap-1 text-xs text-secondary-400 truncate">
                  <PiDatabase size={10} />
                  {typeof model.config.source === 'string'
                    ? model.config.source
                    : model.config.source.type || 'source'}
                </div>
              )}
            </div>
          </button>
        </div>
      );
    });
  };

  // ─── Metrics/Dimensions rendering ──────────────────────
  const MetricIcon = getTypeIcon('metric');
  const DimensionIcon = getTypeIcon('dimension');
  const metColors = getTypeColors('metric');
  const dimColors = getTypeColors('dimension');

  const renderSemanticItems = (items, type) => {
    const Icon = type === 'metric' ? MetricIcon : DimensionIcon;
    const colors = type === 'metric' ? metColors : dimColors;
    const testPrefix = type === 'metric' ? 'met' : 'dim';

    return items.map((item) => (
      <div
        key={`${testPrefix}-${item.name}`}
        className={`flex items-center gap-2 px-3 py-1.5 ${colors.bgHover} border-l-2 border-transparent`}
        data-testid={`semantic-${testPrefix}-${item.name}`}
      >
        <Icon style={{ fontSize: 14 }} className={`${colors.text} flex-shrink-0`} />
        <span className="text-xs text-secondary-700 truncate flex-1">{item.name}</span>
        {type === 'metric' && item.config?.aggregation && (
          <span className={`text-xs ${colors.text}`}>{item.config.aggregation}</span>
        )}
        {item.config?.expression && (
          <span className="text-xs text-secondary-400 truncate max-w-[100px]" title={item.config.expression}>
            {item.config.expression}
          </span>
        )}
        {item.status && item.status !== 'published' && (
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              item.status === 'new' ? 'bg-green-500' : 'bg-amber-500'
            }`}
            data-testid={`status-${item.status}`}
          />
        )}
      </div>
    ));
  };

  // ─── Loading state ─────────────────────────────────────
  const isLoading = sourcesLoading || modelsLoading || metricsLoading || dimensionsLoading;

  // ─── Collapsed icon rail ───────────────────────────────
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
          const Icon = def.Icon || getTypeIcon(def.id);
          const colors = getTypeColors(def.id);
          return (
            <div
              key={def.id}
              className={`p-1.5 rounded ${colors.text}`}
              title={def.label}
              data-testid={`collapsed-icon-${def.id}`}
            >
              {def.Icon ? (
                <Icon size={16} className={def.iconColor || colors.text} />
              ) : (
                <Icon style={{ fontSize: 16 }} className={colors.text} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Expanded panel ────────────────────────────────────
  return (
    <div
      className="flex-shrink-0 border-r border-secondary-200 bg-white flex flex-col h-full overflow-hidden"
      data-testid="left-panel"
    >
      {/* Header with collapse toggle */}
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
              data-testid="clear-search"
            >
              <PiX size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Type filter badges */}
      <div
        className="flex flex-wrap gap-1 px-3 py-2 border-b border-secondary-100 flex-shrink-0"
        data-testid="type-filter"
      >
        {SECTION_DEFS.map((def) => {
          const colors = getTypeColors(def.id);
          const isActive = visibleTypes.size === 0 || visibleTypes.has(def.id);
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => toggleType(def.id)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                isActive
                  ? `${colors.bg} ${colors.text} ${colors.border}`
                  : 'bg-secondary-100 text-secondary-400 border-secondary-200'
              }`}
              data-testid={`type-filter-${def.id}`}
            >
              {def.label} ({typeCounts[def.id]})
            </button>
          );
        })}
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto" data-testid="left-panel-content">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-3 text-secondary-400" data-testid="left-panel-loading">
            <PiSpinner className="animate-spin" size={14} />
            <span className="text-xs">Loading...</span>
          </div>
        )}

        {/* Sources */}
        {isTypeVisible('source') && !sourcesLoading && filteredSources.length > 0 && (
          <div data-testid="section-sources">
            {renderSectionHeader('source', filteredSources.length)}
            {expandedSections.has('source') && renderSourceTree()}
          </div>
        )}

        {/* Models */}
        {isTypeVisible('model') && !modelsLoading && filteredModels.length > 0 && (
          <div data-testid="section-models">
            {renderSectionHeader('model', filteredModels.length)}
            {expandedSections.has('model') && renderModelsList()}
          </div>
        )}

        {/* Metrics */}
        {isTypeVisible('metric') && !metricsLoading && filteredMetrics.length > 0 && (
          <div data-testid="section-metrics">
            {renderSectionHeader('metric', filteredMetrics.length)}
            {expandedSections.has('metric') && renderSemanticItems(filteredMetrics, 'metric')}
          </div>
        )}

        {/* Dimensions */}
        {isTypeVisible('dimension') && !dimensionsLoading && filteredDimensions.length > 0 && (
          <div data-testid="section-dimensions">
            {renderSectionHeader('dimension', filteredDimensions.length)}
            {expandedSections.has('dimension') && renderSemanticItems(filteredDimensions, 'dimension')}
          </div>
        )}

        {/* Empty state */}
        {!isLoading &&
          filteredSources.length === 0 &&
          filteredModels.length === 0 &&
          filteredMetrics.length === 0 &&
          filteredDimensions.length === 0 && (
            <div className="flex items-center justify-center h-32 text-xs text-secondary-400" data-testid="left-panel-empty">
              {searchQuery ? `No results for "${searchQuery}"` : 'No project objects defined'}
            </div>
          )}
      </div>
    </div>
  );
};

export default LeftPanel;
