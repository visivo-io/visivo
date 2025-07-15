/**
 * Centralized URL configuration system for Visivo viewer
 * Supports different environments (local, dist) with configurable host and deployment root
 */

// URL patterns for different environments
const URL_PATTERNS = {
  local: {
    // Static data endpoints (work in both local and dist)
    project: '/api/project/',
    explorer: '/api/explorer/',
    dag: '/api/dag/',
    schema: '/api/schema/',
    error: '/api/error/',
    traceData: '/api/traces/{name}/data/',
    dashboardThumbnail: '/api/dashboards/{hash}.png',
    
    // New query endpoints (replaces provider-based queries)
    tracesQuery: '/api/traces/',
    dashboardQuery: '/api/dashboard/{name}/',
    
    // Interactive endpoints (local only)
    worksheet: '/api/worksheet/',
    worksheetDetail: '/api/worksheet/{id}/',
    worksheetSession: '/api/worksheet/session/',
    namedChildren: '/api/project/named_children/',
    writeChanges: '/api/project/write_changes/',
    projectFilePath: '/api/project/project_file_path/',
    sourcesMetadata: '/api/project/sources_metadata/',
    queryExecution: '/api/query/{projectId}/',
    traceQuery: '/api/trace/{traceName}/query/',
    
    // Editor endpoints
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
    traceData: '/data/{name}/data.json',
    dashboardThumbnail: '/data/dashboards/{hash}.png',
    
    // New query endpoints for dist mode
    tracesQuery: '/data/traces.json',
    dashboardQuery: '/data/dashboard/{name}.json',
    
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
    this.environment = options.environment || 'local';
    
    // Normalize deployment root
    this.deploymentRoot = this.deploymentRoot.endsWith('/') 
      ? this.deploymentRoot.slice(0, -1) 
      : this.deploymentRoot;
      
    // Normalize host
    this.host = this.host.endsWith('/') 
      ? this.host.slice(0, -1) 
      : this.host;
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

  /**
   * Get all available endpoint keys for the current environment
   * @returns {string[]}
   */
  getAvailableKeys() {
    const patterns = URL_PATTERNS[this.environment];
    if (!patterns) return [];
    
    return Object.entries(patterns)
      .filter(([key, pattern]) => pattern !== null)
      .map(([key]) => key);
  }

  /**
   * Create a new URLConfig with different options
   * @param {object} newOptions - New configuration options
   * @returns {URLConfig}
   */
  withOptions(newOptions) {
    return new URLConfig({
      host: this.host,
      deploymentRoot: this.deploymentRoot,
      environment: this.environment,
      ...newOptions
    });
  }
}

/**
 * Auto-detect environment from window.deploymentRoot
 * @returns {string} - 'local' or 'dist'
 */
function detectEnvironment() {
  // In local development, deploymentRoot is typically empty or undefined
  // In dist, it's set to a specific path
  if (typeof window !== 'undefined' && window.deploymentRoot !== undefined) {
    return window.deploymentRoot === '' ? 'local' : 'dist';
  }
  return 'local';
}

/**
 * Create URLConfig instance with auto-detected settings
 * @param {object} overrides - Override auto-detected settings
 * @returns {URLConfig}
 */
export function createURLConfig(overrides = {}) {
  const environment = overrides.environment || detectEnvironment();
  const deploymentRoot = overrides.deploymentRoot || 
    (typeof window !== 'undefined' ? window.deploymentRoot || '' : '');
  
  return new URLConfig({
    environment,
    deploymentRoot,
    host: '',
    ...overrides
  });
}

// Export URLConfig class for advanced usage
export { URLConfig };

// Create default instance
export const urlConfig = createURLConfig();

// Convenience function for getting URLs
export const getUrl = (key, params) => urlConfig.getUrl(key, params);