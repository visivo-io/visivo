import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import useStore from '../stores/store';

/**
 * Hook to synchronize selector state with URL parameters
 * This replaces the SearchParamsContext functionality while maintaining the same behavior
 */
export const useUrlSync = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectorValues = useStore(state => state.selectorValues);
  const setSelectorValues = useStore(state => state.setSelectorValues);
  const setSelectorValue = useStore(state => state.setSelectorValue);
  const initializedRef = useRef(false);

  // Initialize selector values from URL on mount only
  useEffect(() => {
    // Only run once on mount
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialValues = {};
    const urlParams = new URLSearchParams(window.location.search);

    for (const [key, value] of urlParams.entries()) {
      try {
        // Try to parse as JSON array first
        if (value.startsWith('[') && value.endsWith(']')) {
          initialValues[key] = JSON.parse(value);
        } else if (value === 'NoCohorts') {
          initialValues[key] = [];
        } else {
          initialValues[key] = value;
        }
      } catch (e) {
        // Fallback to string value
        initialValues[key] = value;
      }
    }

    if (Object.keys(initialValues).length > 0) {
      setSelectorValues(initialValues);
    }
  }, [setSelectorValues]);

  // Sync URL when selector values change (skip initial sync to avoid loop)
  useEffect(() => {
    // Skip on first render to avoid conflicting with initialization effect
    if (!initializedRef.current) return;

    const params = new URLSearchParams();

    Object.entries(selectorValues).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return; // Don't add null/undefined values
      }

      if (Array.isArray(value)) {
        if (value.length === 0) {
          params.set(key, 'NoCohorts');
        } else {
          params.set(key, JSON.stringify(value));
        }
      } else {
        params.set(key, String(value));
      }
    });

    // Update URL params if they've changed
    // Use searchParams from useSearchParams() for proper router integration
    const currentParams = searchParams.toString();
    const newParams = params.toString();

    if (currentParams !== newParams) {
      setSearchParams(params, { replace: true }); // Use replace to avoid adding to history
    }
  }, [selectorValues, searchParams, setSearchParams]);

  // Return helper functions for backwards compatibility
  const setStateSearchParam = (name, value) => {
    setSelectorValue(name, value);
  };

  return [searchParams, setStateSearchParam];
};

/**
 * Hook for components that need URL sync but don't want to trigger it automatically
 * Useful for components that handle their own URL synchronization timing
 */
export const useUrlSyncManual = () => {
  const [searchParams] = useSearchParams();
  const setSelectorValue = useStore(state => state.setSelectorValue);

  const setStateSearchParam = (name, value) => {
    setSelectorValue(name, value);
  };

  return [searchParams, setStateSearchParam];
};

export default useUrlSync;
