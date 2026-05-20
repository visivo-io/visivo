import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PiHardDrives,
  PiTable,
  PiColumns,
  PiArrowClockwise,
  PiEye,
} from 'react-icons/pi';
import SchemaTreeNode from './SchemaBrowser/SchemaTreeNode';
import ContextMenu from '../common/ContextMenu';
import DataPreviewModal from '../sources/DataPreviewModal';
import {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
} from '../../api/sourceSchemaJobs';

/**
 * SourceBrowser - Hierarchical tree view of data sources, tables, and columns.
 * Extracted from the old LeftPanel for reuse.
 */
const SourceBrowser = ({ searchQuery, onTableSelect, onSourcesLoaded }) => {
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [loadedData, setLoadedData] = useState({});
  const [loadingNodes, setLoadingNodes] = useState(new Set());
  const [generatingSchemas, setGeneratingSchemas] = useState(new Map());
  const [schemaErrors, setSchemaErrors] = useState(new Map());
  const [expandedErrors, setExpandedErrors] = useState(new Set());
  // Right-click menu state. ``null`` when no menu is open; otherwise contains
  // {x, y, sourceName, databaseName, schemaName, tableName}.
  const [contextMenu, setContextMenu] = useState(null);
  // Preview-rows modal state. ``null`` when closed.
  const [previewTarget, setPreviewTarget] = useState(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  useEffect(() => {
    const loadSources = async () => {
      setSourcesLoading(true);
      try {
        const data = await fetchSourceSchemaJobs();
        setSources(data || []);
        onSourcesLoaded?.(data || []);
      } catch (err) {
        console.error('Failed to load sources:', err);
      } finally {
        setSourcesLoading(false);
      }
    };
    loadSources();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const matchesSearch = useCallback(
    (name) => {
      if (!searchQuery) return true;
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    },
    [searchQuery]
  );

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

        if (cancelledRef.current) return;
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
              onDoubleClick={() => onTableSelect?.({ sourceName: srcName, table: table.name })}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  sourceName: srcName,
                  // SourceManager's table list does not currently expose the
                  // owning database/schema; the source-side preview helper
                  // accepts these as hints, so we pass best-effort defaults.
                  // This will work for SQLite/DuckDB and PostgreSQL with the
                  // default 'public' schema; multi-schema sources can extend
                  // the tree node to carry full context later.
                  databaseName: table.database || 'main',
                  schemaName: table.schema || null,
                  tableName: table.name,
                });
              }}
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
      renderColumns,
      getNodeError,
    ]
  );

  const filteredSources = sources.filter((s) => {
    const sourceKey = `source::${s.source_name}`;
    return matchesSearch(s.source_name) || hasLoadedMatch(sourceKey);
  });

  if (sourcesLoading) {
    return null; // Parent handles loading state
  }

  if (filteredSources.length === 0) {
    return null;
  }

  const closeContextMenu = () => setContextMenu(null);
  const closePreview = () => setPreviewTarget(null);
  const openPreviewFromMenu = () => {
    if (!contextMenu) return;
    setPreviewTarget({
      sourceName: contextMenu.sourceName,
      databaseName: contextMenu.databaseName,
      schemaName: contextMenu.schemaName,
      tableName: contextMenu.tableName,
    });
    closeContextMenu();
  };

  return (
    <div data-testid="source-browser">
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu}>
          <button
            type="button"
            data-testid="context-menu-preview"
            onClick={openPreviewFromMenu}
            className="w-full text-left px-3 py-1.5 text-sm text-secondary-700 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2"
          >
            <PiEye size={14} />
            Preview 100 rows
          </button>
        </ContextMenu>
      )}
      {previewTarget && (
        <DataPreviewModal
          source={previewTarget.sourceName}
          database={previewTarget.databaseName}
          table={previewTarget.tableName}
          schema={previewTarget.schemaName}
          onClose={closePreview}
        />
      )}
      {filteredSources.map((source) => {
        const sourceKey = `source::${source.source_name}`;
        const errorMsg = getNodeError(sourceKey) || schemaErrors.get(source.source_name);
        const generationStatus = generatingSchemas.get(source.source_name);
        const isGenerating = !!generationStatus;
        const hasCachedSchema = source.has_cached_schema;

        const getBadge = () => {
          if (isGenerating) return 'Connecting...';
          return null;
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
            errorCollapsed={!expandedErrors.has(source.source_name)}
            onClick={() => {
              if (isGenerating) return;
              if (errorMsg) {
                setExpandedErrors((prev) => {
                  const next = new Set(prev);
                  if (next.has(source.source_name)) {
                    next.delete(source.source_name);
                  } else {
                    next.add(source.source_name);
                  }
                  return next;
                });
                return;
              }
              if (!hasCachedSchema) {
                handleGenerateSchema(source.source_name);
                return;
              }
              toggleNode(sourceKey, () => fetchSourceTables(source.source_name));
            }}
            actions={
              hasCachedSchema && !isGenerating
                ? [
                    {
                      label: 'Refresh Schema',
                      icon: <PiArrowClockwise size={12} />,
                      onClick: (e) => handleGenerateSchema(source.source_name, e),
                    },
                  ]
                : []
            }
            level={0}
          >
            {renderTables(source.source_name, sourceKey)}
          </SchemaTreeNode>
        );
      })}
    </div>
  );
};

export default SourceBrowser;
