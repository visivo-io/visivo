// Utility functions for generating and parsing node IDs

export const createNodeId = (type, path) => {
  return btoa(JSON.stringify({ type, path }));
};

export const parseNodeId = nodeId => {
  try {
    return JSON.parse(atob(nodeId));
  } catch (e) {
    console.error('Failed to parse node ID:', nodeId, e);
    return null;
  }
};

export const createSourceNodeId = sourceName => {
  return createNodeId('source', [sourceName]);
};

export const createDatabaseNodeId = (sourceName, databaseName) => {
  return createNodeId('database', [sourceName, databaseName]);
};

export const createSchemaNodeId = (sourceName, databaseName, schemaName) => {
  return createNodeId('schema', [sourceName, databaseName, schemaName]);
};

export const createTableNodeId = (sourceName, databaseName, schemaName, tableName) => {
  // For databases without schemas, schemaName will be null
  const path = schemaName
    ? [sourceName, databaseName, schemaName, tableName]
    : [sourceName, databaseName, tableName];
  return createNodeId('table', path);
};

export const createColumnNodeId = (sourceName, databaseName, schemaName, tableName, columnName) => {
  // For databases without schemas, schemaName will be null
  const path = schemaName
    ? [sourceName, databaseName, schemaName, tableName, columnName]
    : [sourceName, databaseName, tableName, columnName];
  return createNodeId('column', path);
};

// Helper to get data access keys for store lookups
export const getDataKey = {
  database: sourceName => sourceName,
  schema: (sourceName, databaseName) => `${sourceName}.${databaseName}`,
  table: (sourceName, databaseName, schemaName) =>
    schemaName ? `${sourceName}.${databaseName}.${schemaName}` : `${sourceName}.${databaseName}`,
  column: (sourceName, databaseName, schemaName, tableName) =>
    schemaName
      ? `${sourceName}.${databaseName}.${schemaName}.${tableName}`
      : `${sourceName}.${databaseName}.${tableName}`,
};
