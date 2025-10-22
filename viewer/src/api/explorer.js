import { getUrl } from '../contexts/URLContext';

export const fetchExplorer = async () => {
  const response = await fetch(getUrl('explorer'));
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

export const fetchSourceMetadata = async () => {
  const response = await fetch('/api/project/sources_metadata/');
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

// Lazy-loading API functions

export const fetchDatabases = async sourceName => {
  const response = await fetch(`/api/project/sources/${encodeURIComponent(sourceName)}/databases/`);
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

export const fetchSchemas = async (sourceName, databaseName) => {
  const response = await fetch(
    `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/schemas/`
  );
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

export const fetchTables = async (sourceName, databaseName, schemaName = null) => {
  const url = schemaName
    ? `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/schemas/${encodeURIComponent(schemaName)}/tables/`
    : `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/tables/`;

  const response = await fetch(url);
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

export const testSourceConnection = async sourceName => {
  const response = await fetch(
    `/api/project/sources/${encodeURIComponent(sourceName)}/test-connection/`
  );
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

export const testSourceConnectionFromConfig = async sourceConfig => {
  const response = await fetch(`/api/sources/test-connection/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sourceConfig),
  });
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    const error = await response.text();
    try {
      return JSON.parse(error);
    } catch {
      return { status: 'connection_failed', error: 'Failed to test connection' };
    }
  }
};

export const fetchColumns = async (sourceName, databaseName, tableName, schemaName = null) => {
  const url = schemaName
    ? `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(tableName)}/columns/`
    : `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/columns/`;

  const response = await fetch(url);
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};
