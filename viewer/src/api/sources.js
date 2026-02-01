import { getUrl } from '../contexts/URLContext';

/**
 * Fetch all sources with their status (NEW, MODIFIED, PUBLISHED)
 */
export const fetchAllSources = async () => {
  const response = await fetch(getUrl('sourcesList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch sources');
};

/**
 * Fetch a single source by name with status information
 */
export const fetchSource = async name => {
  const response = await fetch(getUrl('sourceDetail', { name }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch source: ${name}`);
};

/**
 * Save a source configuration to cache (draft state)
 */
export const saveSource = async (name, config) => {
  const response = await fetch(getUrl('sourceSave', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (response.status === 200) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.error || 'Failed to save source');
};

/**
 * Delete a source from cache (revert to published version)
 */
export const deleteSource = async name => {
  const response = await fetch(getUrl('sourceDetail', { name }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to delete source from cache');
};

/**
 * Validate a source configuration without saving
 */
export const validateSource = async (name, config) => {
  const response = await fetch(getUrl('sourceValidate', { name }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data;
};

/**
 * Test a source connection from configuration
 */
export const testSourceConnection = async config => {
  const response = await fetch(getUrl('sourceTestConnection'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (response.status === 200) {
    return await response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  return {
    status: 'connection_failed',
    error: errorData.error || 'Connection test failed',
  };
};

// === Introspection functions ===

export const fetchDatabases = async sourceName => {
  const response = await fetch(`/api/project/sources/${encodeURIComponent(sourceName)}/databases/`);
  if (response.status === 200) return response.json();
  return null;
};

export const fetchSchemas = async (sourceName, databaseName) => {
  const enc = encodeURIComponent;
  const response = await fetch(
    `/api/project/sources/${enc(sourceName)}/databases/${enc(databaseName)}/schemas/`
  );
  if (response.status === 200) return response.json();
  return null;
};

export const fetchTables = async (sourceName, databaseName, schemaName = null) => {
  const enc = encodeURIComponent;
  const url = schemaName
    ? `/api/project/sources/${enc(sourceName)}/databases/${enc(databaseName)}/schemas/${enc(schemaName)}/tables/`
    : `/api/project/sources/${enc(sourceName)}/databases/${enc(databaseName)}/tables/`;
  const response = await fetch(url);
  if (response.status === 200) return response.json();
  return null;
};

export const fetchColumns = async (sourceName, databaseName, tableName, schemaName = null) => {
  const enc = encodeURIComponent;
  const url = schemaName
    ? `/api/project/sources/${enc(sourceName)}/databases/${enc(databaseName)}/schemas/${enc(schemaName)}/tables/${enc(tableName)}/columns/`
    : `/api/project/sources/${enc(sourceName)}/databases/${enc(databaseName)}/tables/${enc(tableName)}/columns/`;
  const response = await fetch(url);
  if (response.status === 200) return response.json();
  return null;
};
