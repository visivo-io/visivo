export const fetchExplorer = async () => {
  const response = await fetch('/data/explorer.json');
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error('Failed to fetch explorer data');
    return null;
  }
};

export const fetchSourceMetadata = async () => {
  const response = await fetch('/api/project/sources_metadata');
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error('Failed to fetch source metadata');
    return null;
  }
};

// Lazy-loading API functions

export const fetchDatabases = async sourceName => {
  const response = await fetch(`/api/project/sources/${encodeURIComponent(sourceName)}/databases`);
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error(`Failed to fetch databases for source: ${sourceName}`);
    return null;
  }
};

export const fetchSchemas = async (sourceName, databaseName) => {
  const response = await fetch(
    `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/schemas`
  );
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error(`Failed to fetch schemas for ${sourceName}.${databaseName}`);
    return null;
  }
};

export const fetchTables = async (sourceName, databaseName, schemaName = null) => {
  const url = schemaName
    ? `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/schemas/${encodeURIComponent(schemaName)}/tables`
    : `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/tables`;

  const response = await fetch(url);
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error(
      `Failed to fetch tables for ${sourceName}.${databaseName}.${schemaName || 'default'}`
    );
    return null;
  }
};

export const testSourceConnection = async sourceName => {
  const response = await fetch(
    `/api/project/sources/${encodeURIComponent(sourceName)}/test-connection`
  );
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error(`Failed to test connection for source: ${sourceName}`);
    return null;
  }
};

export const fetchColumns = async (sourceName, databaseName, tableName, schemaName = null) => {
  const url = schemaName
    ? `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(tableName)}/columns`
    : `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/columns`;

  const response = await fetch(url);
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error(
      `Failed to fetch columns for ${sourceName}.${databaseName}.${schemaName || 'default'}.${tableName}`
    );
    return null;
  }
};
