import { useState, useCallback } from 'react';
import { parseNodeId } from '../utils/nodeIdUtils';
import { useTreeContext } from '../TreeContext';

export const useTreeExpansion = () => {
  const [expandedNodes, setExpandedNodes] = useState([]);
  const { loadDatabases, loadSchemas, loadTables, loadColumns } = useTreeContext();

  const handleNodeToggle = useCallback(
    async (event, nodeIds) => {
      // Find newly expanded nodes
      const newlyExpanded = nodeIds.filter(id => !expandedNodes.includes(id));

      // Update expanded nodes state
      setExpandedNodes(nodeIds);

      // Load data for newly expanded nodes
      for (const nodeId of newlyExpanded) {
        const nodeInfo = parseNodeId(nodeId);
        if (!nodeInfo) continue;

        const { type, path } = nodeInfo;

        switch (type) {
          case 'source': {
            const [sourceName] = path;
            await loadDatabases(sourceName);
            break;
          }

          case 'database': {
            const [sourceName, databaseName] = path;
            await loadSchemas(sourceName, databaseName);
            break;
          }

          case 'schema': {
            const [sourceName, databaseName, schemaName] = path;
            await loadTables(sourceName, databaseName, schemaName);
            break;
          }

          case 'table': {
            if (path.length === 4) {
              // Has schema
              const [sourceName, databaseName, schemaName, tableName] = path;
              await loadColumns(sourceName, databaseName, tableName, schemaName);
            } else {
              // No schema
              const [sourceName, databaseName, tableName] = path;
              await loadColumns(sourceName, databaseName, tableName);
            }
            break;
          }

          default:
          // Unknown node type - ignore
        }
      }
    },
    [expandedNodes, loadDatabases, loadSchemas, loadTables, loadColumns]
  );

  return {
    expandedNodes,
    handleNodeToggle,
  };
};
