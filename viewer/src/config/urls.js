/**
 * Centralized URL configuration system for Visivo viewer
 * Supports different environments (server, dist) with configurable host and deployment root
 */

// URL patterns for different environments
const URL_PATTERNS = {
  server: {
    project: '/api/project/',
    explorer: '/api/explorer/',
    dag: '/api/dag/',
    schema: '/api/schema/',
    error: '/api/error/',
    tracesQuery: '/api/traces/',
    traceData: '/api/traces/{hash}/',
    insightJobsQuery: '/api/insight-jobs/',
    insightJobData: '/api/insight-jobs/{hash}/',
    inputJobsQuery: '/api/input-jobs/',
    inputJobData: '/data/inputs/{hash}.json',
    dashboardQuery: '/api/dashboards/{hash}/',
    dashboardThumbnail: '/api/dashboards/{hash}.png/',

    worksheet: '/api/worksheet/',
    worksheetDetail: '/api/worksheet/{id}/',
    worksheetSession: '/api/worksheet/session/',
    worksheetCells: '/api/worksheet/{id}/cells/',
    worksheetCellDetail: '/api/worksheet/{worksheetId}/cells/{cellId}/',
    worksheetCellExecute: '/api/worksheet/{worksheetId}/cells/{cellId}/execute/',
    namedChildren: '/api/project/named_children/',
    writeChanges: '/api/project/write_changes/',
    projectFilePath: '/api/project/project_file_path/',
    sourcesMetadata: '/api/project/sources_metadata/',
    queryExecution: '/api/query/{projectId}/',
    traceQuery: '/api/trace/{traceName}/query/',

    editorsInstalled: '/api/editors/installed/',
    editorsOpen: '/api/editors/open/',

    // Source management endpoints
    sourcesList: '/api/sources/',
    sourceDetail: '/api/sources/{name}/',
    sourceSave: '/api/sources/{name}/save/',
    sourceValidate: '/api/sources/{name}/validate/',
    sourceTestConnection: '/api/sources/test-connection/',

    // Model management endpoints
    modelsList: '/api/models/',
    modelDetail: '/api/models/{name}/',
    modelSave: '/api/models/{name}/save/',
    modelValidate: '/api/models/{name}/validate/',

    // Model profiling endpoints
    modelProfile: '/api/models/{name}/profile/',
    modelHistogram: '/api/models/{name}/histogram/{column}/',
    modelProfileInvalidate: '/api/models/{name}/profile/invalidate/',

    // Dimension management endpoints
    dimensionsList: '/api/dimensions/',
    dimensionDetail: '/api/dimensions/{name}/',
    dimensionSave: '/api/dimensions/{name}/save/',
    dimensionValidate: '/api/dimensions/{name}/validate/',

    // Metric management endpoints
    metricsList: '/api/metrics/',
    metricDetail: '/api/metrics/{name}/',
    metricSave: '/api/metrics/{name}/save/',
    metricValidate: '/api/metrics/{name}/validate/',

    // Relation management endpoints
    relationsList: '/api/relations/',
    relationDetail: '/api/relations/{name}/',
    relationSave: '/api/relations/{name}/save/',
    relationValidate: '/api/relations/{name}/validate/',

    // Insight management endpoints
    insightsList: '/api/insights/',
    insightDetail: '/api/insights/{name}/',
    insightSave: '/api/insights/{name}/save/',
    insightValidate: '/api/insights/{name}/validate/',

    // Input management endpoints
    inputsList: '/api/inputs/',
    inputDetail: '/api/inputs/{name}/',
    inputSave: '/api/inputs/{name}/save/',
    inputValidate: '/api/inputs/{name}/validate/',

    // Markdown management endpoints
    markdownsList: '/api/markdowns/',
    markdownDetail: '/api/markdowns/{name}/',
    markdownSave: '/api/markdowns/{name}/save/',
    markdownValidate: '/api/markdowns/{name}/validate/',

    // Chart management endpoints
    chartsList: '/api/charts/',
    chartDetail: '/api/charts/{name}/',
    chartSave: '/api/charts/{name}/save/',
    chartValidate: '/api/charts/{name}/validate/',

    // Table management endpoints
    tablesList: '/api/tables/',
    tableDetail: '/api/tables/{name}/',
    tableSave: '/api/tables/{name}/save/',
    tableValidate: '/api/tables/{name}/validate/',

    // Dashboard management endpoints
    dashboardsList: '/api/dashboards/',
    dashboardSave: '/api/dashboards/{name}/save/',
    dashboardDelete: '/api/dashboards/{name}/delete/',
    dashboardValidate: '/api/dashboards/{name}/validate/',

    // CsvScriptModel management endpoints
    csvScriptModelsList: '/api/csv-script-models/',
    csvScriptModelDetail: '/api/csv-script-models/{name}/',
    csvScriptModelSave: '/api/csv-script-models/{name}/save/',
    csvScriptModelValidate: '/api/csv-script-models/{name}/validate/',

    // LocalMergeModel management endpoints
    localMergeModelsList: '/api/local-merge-models/',
    localMergeModelDetail: '/api/local-merge-models/{name}/',
    localMergeModelSave: '/api/local-merge-models/{name}/save/',
    localMergeModelValidate: '/api/local-merge-models/{name}/validate/',

    // Defaults management endpoints
    defaultsGet: '/api/defaults/',
    defaultsSave: '/api/defaults/save/',

    // Publish management endpoints
    publishStatus: '/api/publish/status/',
    publishPending: '/api/publish/pending/',
    publish: '/api/publish/',

    // Source schema jobs endpoints
    sourceSchemaJobsList: '/api/source-schema-jobs/',
    sourceSchemaJobDetail: '/api/source-schema-jobs/{name}/',
    sourceSchemaJobTables: '/api/source-schema-jobs/{name}/tables/',
    sourceSchemaJobColumns: '/api/source-schema-jobs/{name}/tables/{table}/columns/',
    sourceSchemaJobCreate: '/api/source-schema-jobs/',
    sourceSchemaJobStatus: '/api/source-schema-jobs/{jobId}/',

    // Model query jobs endpoints
    modelQueryJobs: '/api/model-query-jobs/',
    modelQueryJobDetail: '/api/model-query-jobs/{jobId}/',
  },

  dist: {
    // Static data endpoints only in dist mode
    project: '/data/project.json',
    explorer: '/data/explorer.json',
    dag: '/data/dag.json',
    schema: '/data/schema.json',
    error: '/data/error.json',
    tracesQuery: '/data/traces.json',
    traceData: '/data/traces/{hash}.json',
    insightJobsQuery: '/data/insights.json',
    insightJobData: '/data/insights/{hash}.json',
    inputJobsQuery: '/data/inputs.json',
    inputJobData: '/data/inputs/{hash}.json',
    dashboardQuery: '/data/dashboards/{hash}.json',
    dashboardThumbnail: '/data/dashboards/{hash}.png',

    // Interactive endpoints not available in dist
    worksheet: null,
    worksheetDetail: null,
    worksheetSession: null,
    worksheetCells: null,
    worksheetCellDetail: null,
    worksheetCellExecute: null,
    namedChildren: null,
    writeChanges: null,
    projectFilePath: null,
    sourcesMetadata: null,
    queryExecution: null,
    traceQuery: null,
    editorsInstalled: null,
    editorsOpen: null,

    // Source management endpoints (not available in dist)
    sourcesList: null,
    sourceDetail: null,
    sourceSave: null,
    sourceValidate: null,
    sourceTestConnection: null,

    // Model management endpoints (not available in dist)
    modelsList: null,
    modelDetail: null,
    modelSave: null,
    modelValidate: null,

    // Model profiling endpoints (not available in dist)
    modelProfile: null,
    modelHistogram: null,
    modelProfileInvalidate: null,

    // Dimension management endpoints (not available in dist)
    dimensionsList: null,
    dimensionDetail: null,
    dimensionSave: null,
    dimensionValidate: null,

    // Metric management endpoints (not available in dist)
    metricsList: null,
    metricDetail: null,
    metricSave: null,
    metricValidate: null,

    // Relation management endpoints (not available in dist)
    relationsList: null,
    relationDetail: null,
    relationSave: null,
    relationValidate: null,

    // Insight management endpoints (not available in dist)
    insightsList: null,
    insightDetail: null,
    insightSave: null,
    insightValidate: null,

    // Input management endpoints (not available in dist)
    inputsList: null,
    inputDetail: null,
    inputSave: null,
    inputValidate: null,

    // Markdown management endpoints (not available in dist)
    markdownsList: null,
    markdownDetail: null,
    markdownSave: null,
    markdownValidate: null,

    // Chart management endpoints (not available in dist)
    chartsList: null,
    chartDetail: null,
    chartSave: null,
    chartValidate: null,

    // Table management endpoints (not available in dist)
    tablesList: null,
    tableDetail: null,
    tableSave: null,
    tableValidate: null,

    // Dashboard management endpoints (not available in dist)
    dashboardsList: null,
    dashboardSave: null,
    dashboardDelete: null,
    dashboardValidate: null,

    // CsvScriptModel management endpoints (not available in dist)
    csvScriptModelsList: null,
    csvScriptModelDetail: null,
    csvScriptModelSave: null,
    csvScriptModelValidate: null,

    // LocalMergeModel management endpoints (not available in dist)
    localMergeModelsList: null,
    localMergeModelDetail: null,
    localMergeModelSave: null,
    localMergeModelValidate: null,

    // Defaults management endpoints (not available in dist)
    defaultsGet: null,
    defaultsSave: null,

    // Publish management endpoints (not available in dist)
    publishStatus: null,
    publishPending: null,
    publish: null,

    // Source schema jobs endpoints (not available in dist)
    sourceSchemaJobsList: null,
    sourceSchemaJobDetail: null,
    sourceSchemaJobTables: null,
    sourceSchemaJobColumns: null,
    sourceSchemaJobCreate: null,
    sourceSchemaJobStatus: null,

    // Model query jobs endpoints (not available in dist)
    modelQueryJobs: null,
    modelQueryJobDetail: null,
  },
};

/**
 * URL Configuration Manager
 */
class URLConfig {
  constructor(options = {}) {
    this.host = options.host || '';
    this.deploymentRoot = options.deploymentRoot || '';
    this.environment = options.environment || 'server';

    // Normalize deployment root: should be '' for base or '/subfolder' for subfolders
    if (this.deploymentRoot) {
      // Ensure it starts with / and doesn't end with /
      if (!this.deploymentRoot.startsWith('/')) {
        this.deploymentRoot = '/' + this.deploymentRoot;
      }
      if (this.deploymentRoot.endsWith('/')) {
        this.deploymentRoot = this.deploymentRoot.slice(0, -1);
      }
    }

    // Normalize host
    this.host = this.host.endsWith('/') ? this.host.slice(0, -1) : this.host;
  }

  /**
   * Get the route for React Router (always starts with /)
   * @returns {string} - Route path for React Router
   */
  getRoute() {
    return this.deploymentRoot || '/';
  }

  /**
   * Get URL for a specific endpoint key
   * @param {string} key - The endpoint key (e.g., 'project', 'traceData')
   * @param {object} params - Parameters to substitute in URL template (e.g., {name: 'trace1'})
   * @returns {string} - Complete URL
   */
  getUrl(key, params = {}) {
    const patterns = URL_PATTERNS[this.environment];

    if (!patterns) {
      throw new Error(`Unknown environment: ${this.environment}`);
    }

    const pattern = patterns[key];

    if (pattern === undefined) {
      throw new Error(`Unknown URL key: ${key}`);
    }

    if (pattern === null) {
      throw new Error(`URL key '${key}' is not available in '${this.environment}' environment`);
    }

    // Replace parameters in URL pattern
    let url = pattern;
    Object.entries(params).forEach(([param, value]) => {
      url = url.replace(new RegExp(`\\{${param}\\}`, 'g'), encodeURIComponent(value));
    });

    // Check for unreplaced parameters
    const unreplacedParams = url.match(/\{[^}]+\}/g);
    if (unreplacedParams) {
      throw new Error(`Missing parameters for URL '${key}': ${unreplacedParams.join(', ')}`);
    }

    // Build full URL
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${this.host}${this.deploymentRoot}${cleanUrl}`;
  }

  /**
   * Check if an endpoint is available in the current environment
   * @param {string} key - The endpoint key
   * @returns {boolean}
   */
  isAvailable(key) {
    const patterns = URL_PATTERNS[this.environment];
    return patterns && patterns[key] !== null && patterns[key] !== undefined;
  }
}

/**
 * Get deployment root from window object
 * @returns {string} - Deployment root from window or empty string
 */
function getWindowDeploymentRoot() {
  if (typeof window !== 'undefined' && 'deploymentRoot' in window) {
    return window.deploymentRoot || '';
  }
  return '';
}

/**
 * Create URLConfig instance with explicit settings
 * @param {object} options - Configuration options
 * @param {string} options.environment - Environment ('server' or 'dist') - required
 * @param {string} options.host - Base host URL (optional)
 * @param {string} options.deploymentRoot - Deployment root path (optional)
 * @returns {URLConfig}
 */
export function createURLConfig(options = {}) {
  if (!options.environment) {
    throw new Error('Environment is required when creating URLConfig');
  }

  const config = {
    environment: options.environment,
    host: options.host || '',
  };

  // Handle deploymentRoot: explicit option takes precedence, then window.deploymentRoot, then default to ''
  if ('deploymentRoot' in options) {
    config.deploymentRoot = options.deploymentRoot;
  } else {
    config.deploymentRoot = getWindowDeploymentRoot();
  }

  return new URLConfig(config);
}

// Export URLConfig class for advanced usage
export { URLConfig };
