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
    insightsQuery: '/api/insights/',
    insightData: '/api/insights/{hash}/',
    dashboardQuery: '/api/dashboards/{hash}/',
    dashboardThumbnail: '/api/dashboards/{hash}.png/',

    worksheet: '/api/worksheet/',
    worksheetDetail: '/api/worksheet/{id}/',
    worksheetSession: '/api/worksheet/session/',
    namedChildren: '/api/project/named_children/',
    writeChanges: '/api/project/write_changes/',
    projectFilePath: '/api/project/project_file_path/',
    sourcesMetadata: '/api/project/sources_metadata/',
    queryExecution: '/api/query/{projectId}/',
    traceQuery: '/api/trace/{traceName}/query/',

    editorsInstalled: '/api/editors/installed/',
    editorsOpen: '/api/editors/open/',
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
    insightsQuery: '/api/insights.json',
    insightData: '/api/insights/{hash}.json',
    dashboardQuery: '/data/dashboards/{hash}.json',
    dashboardThumbnail: '/data/dashboards/{hash}.png',

    // Interactive endpoints not available in dist
    worksheet: null,
    worksheetDetail: null,
    worksheetSession: null,
    namedChildren: null,
    writeChanges: null,
    projectFilePath: null,
    sourcesMetadata: null,
    queryExecution: null,
    traceQuery: null,
    editorsInstalled: null,
    editorsOpen: null,
  }
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
    this.host = this.host.endsWith('/')
      ? this.host.slice(0, -1)
      : this.host;
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