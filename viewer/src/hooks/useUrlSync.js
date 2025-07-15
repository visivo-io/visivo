import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import useStore from '../stores/store';

/**
 * Hook to synchronize selector state with URL parameters
 * This replaces the SearchParamsContext functionality while maintaining the same behavior
 */
export const useUrlSync = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectorValues, setSelectorValues, setSelectorValue } = useStore();

  // Initialize selector values from URL on mount
  useEffect(() => {
    const initialValues = {};

    for (const [key, value] of searchParams.entries()) {
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
  }, [searchParams, setSelectorValues]); // Only run on mount

  // Sync URL when selector values change
  useEffect(() => {
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
  const { setSelectorValue } = useStore();

  const setStateSearchParam = (name, value) => {
    setSelectorValue(name, value);
  };

  return [searchParams, setStateSearchParam];
};

export default useUrlSync;
