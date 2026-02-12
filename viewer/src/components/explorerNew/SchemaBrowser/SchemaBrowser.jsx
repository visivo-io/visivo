import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PiTable,
  PiColumns,
  PiHardDrives,
  PiSpinner,
  PiMagnifyingGlass,
  PiArrowClockwise,
} from 'react-icons/pi';
import SchemaTreeNode from './SchemaTreeNode';
import {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
} from '../../../api/sourceSchemaJobs';

const SchemaBrowser = ({ onTableSelect, onCreateModel }) => {
  const [sources, setSources] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [loadedData, setLoadedData] = useState({});
  const [loadingNodes, setLoadingNodes] = useState(new Set());
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [generatingSchemas, setGeneratingSchemas] = useState(new Map());
  const [schemaErrors, setSchemaErrors] = useState(new Map());

  useEffect(() => {
    const loadSources = async () => {
      setSourcesLoading(true);
      try {
        const data = await fetchSourceSchemaJobs();
        setSources(data || []);
      } catch (err) {
        console.error('Failed to load sources:', err);
      } finally {
        setSourcesLoading(false);
      }
    };
    loadSources();
  }, []);

  const handleGenerateSchema = useCallback(async (sourceName, e) => {
    if (e) {
      e.stopPropagation();
    }

    setGeneratingSchemas(prev => new Map(prev).set(sourceName, { status: 'starting' }));
    setSchemaErrors(prev => {
      const next = new Map(prev);
      next.delete(sourceName);
      return next;
    });

    try {
      const { run_instance_id: jobId } = await generateSourceSchema(sourceName);

      const pollForCompletion = async () => {
        const maxWaitTime = 120000;
        const pollInterval = 2000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
          const status = await fetchSchemaGenerationStatus(jobId);

          setGeneratingSchemas(prev =>
            new Map(prev).set(sourceName, {
              status: status.status,
              progress: status.progress || 0,
              message: status.progress_message || '',
            })
          );

          if (status.status === 'completed') {
            setGeneratingSchemas(prev => {
              const next = new Map(prev);
              next.delete(sourceName);
              return next;
            });

            const updatedSources = await fetchSourceSchemaJobs();
            setSources(updatedSources || []);

            const sourceKey = `source::${sourceName}`;
            const tables = await fetchSourceTables(sourceName);
            setLoadedData(prev => ({ ...prev, [sourceKey]: tables }));
            setExpandedNodes(prev => new Set(prev).add(sourceKey));
            return;
          }

          if (status.status === 'failed') {
            throw new Error(status.error || 'Schema generation failed');
          }

          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error('Schema generation timed out');
      };

      await pollForCompletion();
    } catch (error) {
      setGeneratingSchemas(prev => {
        const next = new Map(prev);
        next.delete(sourceName);
        return next;
      });
      setSchemaErrors(prev => new Map(prev).set(sourceName, error.message));
      console.error(`Failed to generate schema for ${sourceName}:`, error);
    }
  }, []);

  const toggleNode = useCallback(
    async (nodeKey, loader) => {
      const isCurrentlyExpanded = expandedNodes.has(nodeKey);

      setExpandedNodes(prev => {
        const next = new Set(prev);
        if (next.has(nodeKey)) {
          next.delete(nodeKey);
        } else {
          next.add(nodeKey);
        }
        return next;
      });

      if (!isCurrentlyExpanded && !loadedData[nodeKey] && loader) {
        setLoadingNodes(prev => new Set(prev).add(nodeKey));
        try {
          const data = await loader();
          setLoadedData(prev => ({ ...prev, [nodeKey]: data }));
        } catch (error) {
          console.error(`Error loading ${nodeKey}:`, error);
          setLoadedData(prev => ({ ...prev, [nodeKey]: { error: error.message } }));
        } finally {
          setLoadingNodes(prev => {
            const next = new Set(prev);
            next.delete(nodeKey);
            return next;
          });
        }
      }
    },
    [loadedData, expandedNodes]
  );

  const matchesSearch = useCallback(
    name => {
      if (!searchQuery) return true;
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    },
    [searchQuery]
  );

  const hasLoadedMatch = useCallback(
    nodeKeyPrefix => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      for (const [key, data] of Object.entries(loadedData)) {
        if (!key.startsWith(nodeKeyPrefix)) continue;
        if (Array.isArray(data)) {
          if (data.some(item => item.name?.toLowerCase().includes(query))) return true;
        }
      }
      return false;
    },
    [searchQuery, loadedData]
  );

  const getNodeError = useCallback(
    nodeKey => {
      const data = loadedData[nodeKey];
      if (!data) return null;
      if (data.error) return data.error;
      return null;
    },
    [loadedData]
  );

  const renderColumns = useCallback(
    (columns, tableName) => {
      if (!columns || !Array.isArray(columns)) return null;
      return columns
        .filter(col => matchesSearch(col.name))
        .map(col => (
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
    (sourceName, sourceKey) => {
      const data = loadedData[sourceKey];
      if (!data || data.error) return null;

      const tables = Array.isArray(data) ? data : [];

      return tables
        .filter(table => {
          const colKey = `${sourceKey}::table::${table.name}`;
          return matchesSearch(table.name) || hasLoadedMatch(colKey);
        })
        .map(table => {
          const colKey = `${sourceKey}::table::${table.name}`;
          const colError = getNodeError(colKey);
          return (
            <SchemaTreeNode
              key={colKey}
              icon={<PiTable size={14} />}
              label={table.name}
              type="table"
              isExpanded={expandedNodes.has(colKey)}
              isLoading={loadingNodes.has(colKey)}
              errorMessage={colError}
              onClick={() => toggleNode(colKey, () => fetchTableColumns(sourceName, table.name))}
              onDoubleClick={() =>
                onTableSelect?.({
                  sourceName,
                  table: table.name,
                })
              }
              actions={[
                {
                  label: 'Create Model',
                  onClick: () =>
                    onCreateModel?.({
                      sourceName,
                      table: table.name,
                    }),
                },
              ]}
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
      onTableSelect,
      onCreateModel,
      renderColumns,
      getNodeError,
    ]
  );

  const filteredSources = useMemo(
    () =>
      sources.filter(source => {
        const sourceKey = `source::${source.source_name}`;
        return matchesSearch(source.source_name) || hasLoadedMatch(sourceKey);
      }),
    [sources, matchesSearch, hasLoadedMatch]
  );

  const renderSources = useCallback(() => {
    return filteredSources.map(source => {
      const sourceKey = `source::${source.source_name}`;
      const errorMsg = getNodeError(sourceKey) || schemaErrors.get(source.source_name);
      const generationStatus = generatingSchemas.get(source.source_name);
      const isGenerating = !!generationStatus;
      const hasCachedSchema = source.has_cached_schema;

      const getBadge = () => {
        if (isGenerating) {
          return generationStatus.message || 'Generating...';
        }
        if (source.total_tables !== undefined && source.total_tables !== null) {
          return `${source.total_tables} tables`;
        }
        return null;
      };

      const getActions = () => {
        if (hasCachedSchema && !isGenerating) {
          return [
            {
              label: 'Refresh Schema',
              icon: <PiArrowClockwise size={12} />,
              onClick: e => handleGenerateSchema(source.source_name, e),
            },
          ];
        }
        return [];
      };

      return (
        <SchemaTreeNode
          key={sourceKey}
          icon={<PiHardDrives size={14} />}
          label={source.source_name}
          type="source"
          badge={getBadge()}
          isExpanded={expandedNodes.has(sourceKey)}
          isLoading={loadingNodes.has(sourceKey) || isGenerating}
          errorMessage={errorMsg}
          onClick={() => {
            if (isGenerating) {
              return;
            }
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

  if (sourcesLoading) {
    return (
      <div className="flex items-center justify-center p-4" data-testid="sources-loading">
        <PiSpinner className="animate-spin text-secondary-400 mr-2" size={16} />
        <span className="text-sm text-secondary-400">Loading sources...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="schema-browser">
      <div className="flex-shrink-0 px-3 py-2 border-b border-secondary-200">
        <div className="relative">
          <PiMagnifyingGlass
            className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary-400"
            size={14}
          />
          <input
            type="text"
            placeholder="Search loaded tables and columns..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-sm pl-7 pr-2 py-1.5 border border-secondary-200 rounded focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary transition-all bg-white"
            data-testid="schema-search"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1" role="tree" data-testid="schema-tree">
        {sources.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <span className="text-sm text-secondary-400">No sources configured</span>
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <span className="text-sm text-secondary-400">No matches found</span>
          </div>
        ) : (
          renderSources()
        )}
      </div>
    </div>
  );
};

export default SchemaBrowser;
