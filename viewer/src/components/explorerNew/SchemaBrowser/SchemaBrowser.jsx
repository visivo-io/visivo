import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PiDatabase,
  PiFolder,
  PiTable,
  PiColumns,
  PiHardDrives,
  PiSpinner,
  PiMagnifyingGlass,
} from 'react-icons/pi';
import SchemaTreeNode from './SchemaTreeNode';
import {
  fetchAllSources,
  fetchDatabases,
  fetchSchemas,
  fetchTables,
  fetchColumns,
} from '../../../api/sources';

const SchemaBrowser = ({ onTableSelect, onCreateModel }) => {
  const [sources, setSources] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [loadedData, setLoadedData] = useState({});
  const [loadingNodes, setLoadingNodes] = useState(new Set());
  const [sourcesLoading, setSourcesLoading] = useState(true);

  useEffect(() => {
    const loadSources = async () => {
      setSourcesLoading(true);
      try {
        const data = await fetchAllSources();
        setSources(data.sources || []);
      } catch (err) {
        console.error('Failed to load sources:', err);
      } finally {
        setSourcesLoading(false);
      }
    };
    loadSources();
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
        if (data.databases?.some(db => db.name.toLowerCase().includes(query))) return true;
        if (data.schemas?.some(s => s.name.toLowerCase().includes(query))) return true;
        if (data.tables?.some(t => t.name.toLowerCase().includes(query))) return true;
        if (data.columns?.some(c => c.name.toLowerCase().includes(query))) return true;
      }
      return false;
    },
    [searchQuery, loadedData]
  );

  const getNodeError = useCallback(
    nodeKey => {
      const data = loadedData[nodeKey];
      if (!data) return null;
      if (data.status === 'connection_failed' && data.error) return data.error;
      if (data.error && !data.databases && !data.schemas && !data.tables && !data.columns)
        return data.error;
      return null;
    },
    [loadedData]
  );

  const renderColumns = useCallback(
    columns => {
      if (!columns) return null;
      return columns
        .filter(col => matchesSearch(col.name))
        .map(col => (
          <SchemaTreeNode
            key={`col-${col.name}`}
            icon={<PiColumns size={14} />}
            label={col.name}
            type="column"
            badge={col.type}
            level={5}
          />
        ));
    },
    [matchesSearch]
  );

  const renderTables = useCallback(
    (sourceName, dbName, schemaName, tablesKey, tableLevel) => {
      const data = loadedData[tablesKey];
      if (!data || !data.tables) return null;

      return data.tables
        .filter(table => {
          const colKey = `${tablesKey}::table::${table.name}`;
          return matchesSearch(table.name) || hasLoadedMatch(colKey);
        })
        .map(table => {
          const colKey = `${tablesKey}::table::${table.name}`;
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
              onClick={() =>
                toggleNode(colKey, () => fetchColumns(sourceName, dbName, table.name, schemaName))
              }
              onDoubleClick={() =>
                onTableSelect?.({
                  sourceName,
                  database: dbName,
                  schema: schemaName,
                  table: table.name,
                })
              }
              actions={[
                {
                  label: 'Create Model',
                  onClick: () =>
                    onCreateModel?.({
                      sourceName,
                      database: dbName,
                      schema: schemaName,
                      table: table.name,
                    }),
                },
              ]}
              level={tableLevel}
            >
              {renderColumns(loadedData[colKey]?.columns)}
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

  const renderSchemas = useCallback(
    (sourceName, dbName, dbKey) => {
      const data = loadedData[dbKey];
      if (!data || data.error) return null;

      if (data.has_schemas === false) {
        const tablesKey = `${dbKey}::tables`;
        return renderTables(sourceName, dbName, null, tablesKey, 3);
      }

      if (!data.schemas) return null;

      return data.schemas
        .filter(schema => {
          const schemaKey = `${dbKey}::schema::${schema.name}`;
          const tablesKey = `${schemaKey}::tables`;
          return matchesSearch(schema.name) || hasLoadedMatch(tablesKey);
        })
        .map(schema => {
          const schemaKey = `${dbKey}::schema::${schema.name}`;
          const tablesKey = `${schemaKey}::tables`;
          const tablesError = getNodeError(tablesKey);
          return (
            <SchemaTreeNode
              key={schemaKey}
              icon={<PiFolder size={14} />}
              label={schema.name}
              type="schema"
              isExpanded={expandedNodes.has(schemaKey)}
              isLoading={loadingNodes.has(schemaKey)}
              errorMessage={tablesError}
              onClick={() => {
                toggleNode(schemaKey);
                if (!expandedNodes.has(schemaKey) && !loadedData[tablesKey]) {
                  toggleNode(tablesKey, () => fetchTables(sourceName, dbName, schema.name));
                }
              }}
              level={3}
            >
              {renderTables(sourceName, dbName, schema.name, tablesKey, 4)}
            </SchemaTreeNode>
          );
        });
    },
    [loadedData, expandedNodes, loadingNodes, toggleNode, matchesSearch, hasLoadedMatch, renderTables, getNodeError]
  );

  const renderDatabases = useCallback(
    (sourceName, sourceKey) => {
      const data = loadedData[sourceKey];
      if (!data || !data.databases) return null;

      return data.databases
        .filter(db => {
          const dbKey = `${sourceKey}::db::${db.name}`;
          return matchesSearch(db.name) || hasLoadedMatch(dbKey);
        })
        .map(db => {
          const dbKey = `${sourceKey}::db::${db.name}`;
          const dbError = getNodeError(dbKey);
          return (
            <SchemaTreeNode
              key={dbKey}
              icon={<PiDatabase size={14} />}
              label={db.name}
              type="database"
              isExpanded={expandedNodes.has(dbKey)}
              isLoading={loadingNodes.has(dbKey)}
              errorMessage={dbError}
              onClick={() =>
                toggleNode(dbKey, async () => {
                  const schemasData = await fetchSchemas(sourceName, db.name);
                  if (schemasData && schemasData.has_schemas === false) {
                    const tablesKey = `${dbKey}::tables`;
                    const tablesData = await fetchTables(sourceName, db.name, null);
                    if (tablesData) {
                      setLoadedData(prev => ({ ...prev, [tablesKey]: tablesData }));
                    }
                  }
                  return schemasData;
                })
              }
              level={2}
            >
              {renderSchemas(sourceName, db.name, dbKey)}
            </SchemaTreeNode>
          );
        });
    },
    [loadedData, expandedNodes, loadingNodes, toggleNode, matchesSearch, hasLoadedMatch, renderSchemas, getNodeError]
  );

  const filteredSources = useMemo(
    () =>
      sources.filter(source => {
        const sourceKey = `source::${source.name}`;
        return matchesSearch(source.name) || hasLoadedMatch(sourceKey);
      }),
    [sources, matchesSearch, hasLoadedMatch]
  );

  const renderSources = useCallback(() => {
    return filteredSources.map(source => {
      const sourceKey = `source::${source.name}`;
      const errorMsg = getNodeError(sourceKey);
      return (
        <SchemaTreeNode
          key={sourceKey}
          icon={<PiHardDrives size={14} />}
          label={source.name}
          type="source"
          badge={source.status !== 'PUBLISHED' ? source.status : undefined}
          isExpanded={expandedNodes.has(sourceKey)}
          isLoading={loadingNodes.has(sourceKey)}
          errorMessage={errorMsg}
          onClick={() => toggleNode(sourceKey, () => fetchDatabases(source.name))}
          level={0}
        >
          {renderDatabases(source.name, sourceKey)}
        </SchemaTreeNode>
      );
    });
  }, [filteredSources, expandedNodes, loadingNodes, toggleNode, renderDatabases, getNodeError]);

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
