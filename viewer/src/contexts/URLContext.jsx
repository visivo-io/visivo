import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { createURLConfig, _setGlobalURLConfig } from '../config/urls';

/**
 * Context for URL configuration
 */
const URLContext = createContext();

/**
 * Provider component for URL configuration
 * @param {object} props
 * @param {string} props.host - Base host URL (optional)
 * @param {string} props.deploymentRoot - Deployment root path (optional)
 * @param {string} props.environment - Environment ('local' or 'dist') - required
 * @param {React.ReactNode} props.children
 */
export function URLProvider({ host, deploymentRoot, environment, children }) {
  const urlConfig = useMemo(() => {
    return createURLConfig({
      host,
      deploymentRoot,
      environment
    });
  }, [host, deploymentRoot, environment]);

  // Set the global config for getUrl() function
  useEffect(() => {
    _setGlobalURLConfig(urlConfig);
  }, [urlConfig]);

  return (
    <URLContext.Provider value={urlConfig}>
      {children}
    </URLContext.Provider>
  );
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

/**
 * Hook to check if an endpoint is available
 * @param {string} key - Endpoint key
 * @returns {boolean}
 */
export function useIsURLAvailable(key) {
  const urlConfig = useURLConfig();
  return useMemo(() => {
    return urlConfig.isAvailable(key);
  }, [urlConfig, key]);
}