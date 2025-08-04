import { useState, useEffect, useMemo } from 'react';
import { useTracesData } from './useTracesData';
import useStore from '../stores/store';

/**
 * Custom hook that provides trace data with client-side cohort processing
 * @param {Array} traces - Array of trace configurations from project.json
 * @returns {Object} Object containing cohorted trace data and processing status
 */
export const useCohortedTracesData = (traces) => {
  const [cohortedData, setCohortedData] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingErrors, setProcessingErrors] = useState({});

  // Get the raw traces data using existing hook
  const { data: rawTracesData, isLoading: isRawDataLoading, error: rawDataError } = useTracesData(traces);

  // Get cohort processing functions from store
  const {
    processTraceData,
    getProcessedTraceData,
    isProcessed,
    hasProcessingError,
    getProcessingError,
    clearProcessedTraceData
  } = useStore();

  // Memoize trace names for dependency optimization
  const traceNames = useMemo(() => 
    traces?.map(trace => trace.name) || [], 
    [traces]
  );

  // Process traces data when raw data becomes available
  useEffect(() => {
    if (!rawTracesData || Object.keys(rawTracesData).length === 0) {
      return;
    }

    const processAllTraces = async () => {
      setIsProcessing(true);
      const newCohortedData = {};
      const newErrors = {};

      // Process each trace with its configuration
      await Promise.all(
        traces.map(async (traceConfig) => {
          const traceName = traceConfig.name;
          const rawData = rawTracesData[traceName];

          if (!rawData) {
            console.warn(`No raw data available for trace: ${traceName}`);
            return;
          }

          try {
            // Check if already processed and cached
            let processedData = getProcessedTraceData(traceName);
            
            if (!processedData || !isProcessed(traceName)) {
              // Process the trace data with cohort configuration
              processedData = await processTraceData(traceName, rawData, traceConfig);
            }

            newCohortedData[traceName] = processedData;

            // Check for processing errors
            if (hasProcessingError(traceName)) {
              newErrors[traceName] = getProcessingError(traceName);
            }
          } catch (error) {
            console.error(`Failed to process trace ${traceName}:`, error);
            newErrors[traceName] = error.message;
            // Fallback to raw data structure
            newCohortedData[traceName] = { values: rawData };
          }
        })
      );

      setCohortedData(newCohortedData);
      setProcessingErrors(newErrors);
      setIsProcessing(false);
    };

    processAllTraces();
  }, [rawTracesData, traces, processTraceData, getProcessedTraceData, isProcessed, hasProcessingError, getProcessingError]);

  // Clear processed data when traces change
  useEffect(() => {
    return () => {
      // Cleanup: clear processed data for traces that are no longer needed
      traceNames.forEach(traceName => {
        clearProcessedTraceData(traceName);
      });
    };
  }, [traceNames, clearProcessedTraceData]);

  // Compute loading state
  const isLoading = isRawDataLoading || isProcessing;

  // Compute error state
  const error = rawDataError || (Object.keys(processingErrors).length > 0 ? processingErrors : null);

  // Compute data readiness
  const isDataReady = !isLoading && Object.keys(cohortedData).length > 0;

  return {
    data: cohortedData,
    isLoading,
    error,
    isDataReady,
    rawData: rawTracesData,
    processingErrors,
    isProcessing
  };
};

/**
 * Hook for processing a single trace with cohort configuration
 * @param {Object} traceConfig - Single trace configuration
 * @param {Object} rawData - Raw trace data
 * @returns {Object} Processed trace data and status
 */
export const useCohortedTraceData = (traceConfig, rawData) => {
  const [processedData, setProcessedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const { processTraceData } = useStore();

  useEffect(() => {
    if (!traceConfig || !rawData) {
      return;
    }

    const processTrace = async () => {
      setIsProcessing(true);
      setError(null);

      try {
        const result = await processTraceData(traceConfig.name, rawData, traceConfig);
        setProcessedData(result);
      } catch (err) {
        console.error(`Failed to process trace ${traceConfig.name}:`, err);
        setError(err.message);
        // Fallback to raw data
        setProcessedData({ values: rawData });
      } finally {
        setIsProcessing(false);
      }
    };

    processTrace();
  }, [traceConfig, rawData, processTraceData]);

  return {
    data: processedData,
    isProcessing,
    error,
    isReady: !isProcessing && processedData !== null
  };
};

/**
 * Hook for previewing cohort processing without applying it
 * @param {Object} rawData - Raw trace data
 * @param {string} cohortOn - Cohort configuration
 * @returns {Object} Preview information
 */
export const useCohortPreview = (rawData, cohortOn) => {
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const { previewCohorts } = useStore();

  useEffect(() => {
    if (!rawData) {
      setPreview(null);
      return;
    }

    const generatePreview = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const previewResult = await previewCohorts(rawData, cohortOn);
        setPreview(previewResult);
      } catch (err) {
        console.error('Failed to generate cohort preview:', err);
        setError(err.message);
        setPreview({
          cohortCount: 1,
          cohorts: ['values'],
          sampleData: { values: rawData },
          error: err.message
        });
      } finally {
        setIsLoading(false);
      }
    };

    generatePreview();
  }, [rawData, cohortOn, previewCohorts]);

  return {
    preview,
    isLoading,
    error
  };
};