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
        .filter(table => matchesSearch(table.name))
        .map(table => {
          const colKey = `${tablesKey}::table::${table.name}`;
          return (
            <SchemaTreeNode
              key={colKey}
              icon={<PiTable size={14} />}
              label={table.name}
              type="table"
              isExpanded={expandedNodes.has(colKey)}
              isLoading={loadingNodes.has(colKey)}
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
      onTableSelect,
      onCreateModel,
      renderColumns,
    ]
  );

  const renderSchemas = useCallback(
    (sourceName, dbName, dbKey) => {
      const data = loadedData[dbKey];
      if (!data) return null;

      if (data.has_schemas === false) {
        const tablesKey = `${dbKey}::tables`;
        return renderTables(sourceName, dbName, null, tablesKey, 3);
      }

      if (!data.schemas) return null;

      return data.schemas
        .filter(schema => matchesSearch(schema.name))
        .map(schema => {
          const schemaKey = `${dbKey}::schema::${schema.name}`;
          const tablesKey = `${schemaKey}::tables`;
          return (
            <SchemaTreeNode
              key={schemaKey}
              icon={<PiFolder size={14} />}
              label={schema.name}
              type="schema"
              isExpanded={expandedNodes.has(schemaKey)}
              isLoading={loadingNodes.has(schemaKey)}
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
    [loadedData, expandedNodes, loadingNodes, toggleNode, matchesSearch, renderTables]
  );

  const renderDatabases = useCallback(
    (sourceName, sourceKey) => {
      const data = loadedData[sourceKey];
      if (!data || !data.databases) return null;

      return data.databases
        .filter(db => matchesSearch(db.name))
        .map(db => {
          const dbKey = `${sourceKey}::db::${db.name}`;
          return (
            <SchemaTreeNode
              key={dbKey}
              icon={<PiDatabase size={14} />}
              label={db.name}
              type="database"
              isExpanded={expandedNodes.has(dbKey)}
              isLoading={loadingNodes.has(dbKey)}
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
    [loadedData, expandedNodes, loadingNodes, toggleNode, matchesSearch, renderSchemas]
  );

  const filteredSources = useMemo(
    () => sources.filter(source => matchesSearch(source.name)),
    [sources, matchesSearch]
  );

  const renderSources = useCallback(() => {
    return filteredSources.map(source => {
      const sourceKey = `source::${source.name}`;
      return (
        <SchemaTreeNode
          key={sourceKey}
          icon={<PiHardDrives size={14} />}
          label={source.name}
          type="source"
          badge={source.status !== 'PUBLISHED' ? source.status : undefined}
          isExpanded={expandedNodes.has(sourceKey)}
          isLoading={loadingNodes.has(sourceKey)}
          onClick={() => toggleNode(sourceKey, () => fetchDatabases(source.name))}
          level={0}
        >
          {renderDatabases(source.name, sourceKey)}
        </SchemaTreeNode>
      );
    });
  }, [filteredSources, expandedNodes, loadingNodes, toggleNode, renderDatabases]);

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
