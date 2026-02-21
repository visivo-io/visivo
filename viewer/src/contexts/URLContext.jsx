import React, { createContext, useContext, useMemo } from 'react';
import { createURLConfig } from '../config/urls';

// Re-export createURLConfig for convenience
export { createURLConfig };

/**
 * Context for URL configuration
 */
const URLContext = createContext();

// Global reference for when context is not available (loaders, stores)
let globalURLConfig = null;

/**
 * Set the global URL config (used internally by URLProvider)
 * @param {URLConfig} config
 */
export function setGlobalURLConfig(config) {
  globalURLConfig = config;
}

/**
 * Get URL using global config (backwards compatible)
 * @param {string} key - Endpoint key
 * @param {object} params - URL parameters
 * @returns {string} - Complete URL
 */
export function getUrl(key, params = {}) {
  if (!globalURLConfig) {
    throw new Error(
      'getUrl() called before URLConfig was initialized. Make sure URLProvider is rendered before any API calls.'
    );
  }
  return globalURLConfig.getUrl(key, params);
}

/**
 * Check if a URL endpoint is available in the current configuration
 * @param {string} key - Endpoint key
 * @returns {boolean} - True if the endpoint is available
 */
export function isAvailable(key) {
  if (!globalURLConfig) {
    return false;
  }
  return globalURLConfig.isAvailable(key);
}

/**
 * Provider component for URL configuration
 * @param {object} props
 * @param {URLConfig} props.urlConfig - URLConfig instance to use (optional)
 * @param {string} props.host - Base host URL (optional, used if urlConfig not provided)
 * @param {string} props.deploymentRoot - Deployment root path (optional, used if urlConfig not provided)
 * @param {string} props.environment - Environment ('server' or 'dist') - required if urlConfig not provided
 * @param {React.ReactNode} props.children
 */
export function URLProvider({ urlConfig, host, deploymentRoot, environment, children }) {
  const finalUrlConfig = useMemo(() => {
    // If URLConfig instance is provided directly, use it
    if (urlConfig) {
      setGlobalURLConfig(urlConfig);
      return urlConfig;
    }

    // Otherwise, fall back to creating from individual props (for backward compatibility)
    const newConfig = createURLConfig({
      host,
      deploymentRoot,
      environment,
    });

    setGlobalURLConfig(newConfig);
    return newConfig;
  }, [urlConfig, host, deploymentRoot, environment]);

  return <URLContext.Provider value={finalUrlConfig}>{children}</URLContext.Provider>;
}

/**
 * Hook to access URL configuration
 * @returns {URLConfig}
 */
export function useURLConfig() {
  const context = useContext(URLContext);
  if (!context) {
    throw new Error('useURLConfig must be used within a URLProvider');
  }
  return context;
}

/**
 * Hook to get URL for a specific endpoint
 * @param {string} key - Endpoint key
 * @param {object} params - URL parameters (optional)
 * @returns {string} - Complete URL
 */
export function useURL(key, params = {}) {
  const urlConfig = useURLConfig();
  return useMemo(() => {
    return urlConfig.getUrl(key, params);
  }, [urlConfig, key, params]);
}
