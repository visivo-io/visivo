// Utility functions for generating and parsing node IDs

// Unicode-safe base64 encoding
const encodeBase64 = str => {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode('0x' + p1);
    })
  );
};

// Unicode-safe base64 decoding
const decodeBase64 = str => {
  return decodeURIComponent(
    atob(str)
      .split('')
      .map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join('')
  );
};

export const createNodeId = (type, path) => {
  return encodeBase64(JSON.stringify({ type, path }));
};

export const parseNodeId = nodeId => {
  try {
    if (!nodeId) return null;
    return JSON.parse(decodeBase64(nodeId));
  } catch (e) {
    // Invalid node ID - return null
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
