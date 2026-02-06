import { getUrl, isAvailable } from '../contexts/URLContext';

/**
 * Fetch list of all sources with cached schema availability
 * @returns {Promise<Object[]>} Array of source objects with schema metadata
 */
export const fetchSourceSchemaJobs = async () => {
  if (!isAvailable('sourceSchemaJobsList')) {
    console.warn('Source schema jobs endpoint not available in this environment');
    return [];
  }

  const url = getUrl('sourceSchemaJobsList');
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch source schema jobs: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return response.json();
};

/**
 * Fetch cached schema for a specific source
 * @param {string} sourceName - Name of the source
 * @param {string} runId - Optional run_id to fetch from specific version (main vs preview)
 * @returns {Promise<Object|null>} Schema data or null if not cached
 */
export const fetchSourceSchema = async (sourceName, runId = null) => {
  if (!isAvailable('sourceSchemaJobDetail')) {
    console.warn('Source schema endpoint not available in this environment');
    return null;
  }

  let url = getUrl('sourceSchemaJobDetail', { name: sourceName });
  if (runId) {
    url += `?run_id=${encodeURIComponent(runId)}`;
  }
  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch source schema: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return response.json();
};

/**
 * Trigger on-demand schema generation for a source
 * @param {string} sourceName - Name of the source
 * @returns {Promise<Object>} Object containing run_instance_id
 */
export const generateSourceSchema = async sourceName => {
  if (!isAvailable('sourceSchemaJobCreate')) {
    throw new Error('Schema generation not available in this environment');
  }

  const url = getUrl('sourceSchemaJobCreate');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      config: { source_name: sourceName },
      run: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to generate source schema: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return response.json();
};

/**
 * Fetch the status of a schema generation job
 * @param {string} jobId - Job ID from generateSourceSchema
 * @returns {Promise<Object>} Job status object
 */
export const fetchSchemaGenerationStatus = async jobId => {
  if (!isAvailable('sourceSchemaJobStatus')) {
    throw new Error('Schema generation status not available in this environment');
  }

  const url = getUrl('sourceSchemaJobStatus', { jobId });
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch schema generation status: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return response.json();
};

/**
 * Fetch or generate schema with automatic polling
 * Returns cached schema if available, otherwise triggers generation and polls for completion
 * @param {string} sourceName - Name of the source
 * @param {Object} options - Options for generation
 * @param {number} options.pollInterval - Polling interval in ms (default: 1000)
 * @param {number} options.maxWaitTime - Maximum wait time in ms (default: 120000)
 * @param {function} options.onProgress - Progress callback (status, progress, message)
 * @param {string} options.runId - Optional run_id to fetch from specific version
 * @returns {Promise<Object>} Schema data
 */
export const fetchOrGenerateSchema = async (sourceName, options = {}) => {
  const { pollInterval = 1000, maxWaitTime = 120000, onProgress, runId = null } = options;

  // First try to get cached schema
  const cachedSchema = await fetchSourceSchema(sourceName, runId);
  if (cachedSchema) {
    if (onProgress) {
      onProgress('completed', 1.0, 'Using cached schema');
    }
    return cachedSchema;
  }

  // No cached schema, trigger generation
  if (onProgress) {
    onProgress('running', 0.0, 'Starting schema generation');
  }

  const { run_instance_id: jobId } = await generateSourceSchema(sourceName);

  // Poll for completion
  const startTime = Date.now();
  const generatedRunId = `preview-${sourceName}`;

  while (Date.now() - startTime < maxWaitTime) {
    const status = await fetchSchemaGenerationStatus(jobId);

    if (onProgress) {
      onProgress(status.status, status.progress || 0, status.progress_message || '');
    }

    if (status.status === 'completed') {
      // Fetch the generated schema from the preview run_id
      const schema = await fetchSourceSchema(sourceName, generatedRunId);
      if (!schema) {
        throw new Error('Schema generation completed but schema not found');
      }
      return schema;
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Schema generation failed');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Schema generation timed out after ${maxWaitTime}ms`);
};

/**
 * Fetch list of tables for a source
 * @param {string} sourceName - Name of the source
 * @param {Object} options - Options object
 * @param {string} options.search - Optional search string to filter tables
 * @param {string} options.runId - Optional run_id to fetch from specific version
 * @returns {Promise<Object[]>} Array of table objects
 */
export const fetchSourceTables = async (sourceName, { search = '', runId = null } = {}) => {
  if (!isAvailable('sourceSchemaJobTables')) {
    console.warn('Source schema tables endpoint not available in this environment');
    return [];
  }

  let url = getUrl('sourceSchemaJobTables', { name: sourceName });
  const params = new URLSearchParams();
  if (search) {
    params.append('search', search);
  }
  if (runId) {
    params.append('run_id', runId);
  }
  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  const response = await fetch(url);

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch source tables: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return response.json();
};

/**
 * Fetch columns for a table in a source
 * @param {string} sourceName - Name of the source
 * @param {string} tableName - Name of the table
 * @param {Object} options - Options object
 * @param {string} options.search - Optional search string to filter columns
 * @param {string} options.runId - Optional run_id to fetch from specific version
 * @returns {Promise<Object[]>} Array of column objects
 */
export const fetchTableColumns = async (sourceName, tableName, { search = '', runId = null } = {}) => {
  if (!isAvailable('sourceSchemaJobColumns')) {
    console.warn('Source schema columns endpoint not available in this environment');
    return [];
  }

  let url = getUrl('sourceSchemaJobColumns', { name: sourceName, table: tableName });
  const params = new URLSearchParams();
  if (search) {
    params.append('search', search);
  }
  if (runId) {
    params.append('run_id', runId);
  }
  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  const response = await fetch(url);

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch table columns: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return response.json();
};
