import { cohortProcessor } from '../utils/cohortProcessor';

/**
 * Cohort Store for managing client-side data processing
 */
const createCohortSlice = (set, get) => ({
  // Processed trace data cache
  processedTraceData: {},
  setProcessedTraceData: (traceName, data) => {
    set(state => ({
      processedTraceData: {
        ...state.processedTraceData,
        [traceName]: data
      }
    }));
  },

  // Processing status for each trace
  processingStatus: {},
  setProcessingStatus: (traceName, status) => {
    set(state => ({
      processingStatus: {
        ...state.processingStatus,
        [traceName]: status
      }
    }));
  },

  // Error states for cohort processing
  cohortErrors: {},
  setCohortError: (traceName, error) => {
    set(state => ({
      cohortErrors: {
        ...state.cohortErrors,
        [traceName]: error
      }
    }));
  },

  // Clear error for a specific trace
  clearCohortError: (traceName) => {
    set(state => {
      const newErrors = { ...state.cohortErrors };
      delete newErrors[traceName];
      return { cohortErrors: newErrors };
    });
  },

  /**
   * Process raw trace data with cohort configuration
   * @param {string} traceName - Name of the trace
   * @param {Object} rawData - Raw trace data from data.json
   * @param {Object} traceConfig - Trace configuration from project.json
   * @returns {Promise<Object>} Processed data ready for charts
   */
  processTraceData: async (traceName, rawData, traceConfig) => {
    const { 
      setProcessingStatus, 
      setCohortError, 
      clearCohortError, 
      setProcessedTraceData 
    } = get();

    try {
      // Clear any previous errors
      clearCohortError(traceName);
      
      // Set processing status
      setProcessingStatus(traceName, 'processing');

      // Process the data using cohort processor
      const processedData = await cohortProcessor.processTraceData(rawData, traceConfig);

      // Cache the processed data
      setProcessedTraceData(traceName, processedData);

      // Update processing status
      setProcessingStatus(traceName, 'completed');

      return processedData;
    } catch (error) {
      console.error(`Failed to process trace data for '${traceName}':`, error);
      
      // Set error state
      setCohortError(traceName, error.message);
      setProcessingStatus(traceName, 'error');

      // Return fallback data structure
      return { values: rawData };
    }
  },

  /**
   * Get processed data for a trace (from cache if available)
   * @param {string} traceName - Name of the trace
   * @returns {Object|null} Processed data or null if not available
   */
  getProcessedTraceData: (traceName) => {
    const { processedTraceData } = get();
    return processedTraceData[traceName] || null;
  },

  /**
   * Check if trace data is currently being processed
   * @param {string} traceName - Name of the trace
   * @returns {boolean} True if processing
   */
  isProcessing: (traceName) => {
    const { processingStatus } = get();
    return processingStatus[traceName] === 'processing';
  },

  /**
   * Check if trace processing has completed
   * @param {string} traceName - Name of the trace
   * @returns {boolean} True if completed
   */
  isProcessed: (traceName) => {
    const { processingStatus } = get();
    return processingStatus[traceName] === 'completed';
  },

  /**
   * Check if trace processing has an error
   * @param {string} traceName - Name of the trace
   * @returns {boolean} True if error occurred
   */
  hasProcessingError: (traceName) => {
    const { processingStatus } = get();
    return processingStatus[traceName] === 'error';
  },

  /**
   * Get processing error for a trace
   * @param {string} traceName - Name of the trace
   * @returns {string|null} Error message or null
   */
  getProcessingError: (traceName) => {
    const { cohortErrors } = get();
    return cohortErrors[traceName] || null;
  },

  /**
   * Clear all processed data and reset state
   */
  clearAllProcessedData: () => {
    set({
      processedTraceData: {},
      processingStatus: {},
      cohortErrors: {}
    });
  },

  /**
   * Clear processed data for a specific trace
   * @param {string} traceName - Name of the trace to clear
   */
  clearProcessedTraceData: (traceName) => {
    set(state => {
      const newProcessedData = { ...state.processedTraceData };
      const newProcessingStatus = { ...state.processingStatus };
      const newCohortErrors = { ...state.cohortErrors };
      
      delete newProcessedData[traceName];
      delete newProcessingStatus[traceName];
      delete newCohortErrors[traceName];
      
      return {
        processedTraceData: newProcessedData,
        processingStatus: newProcessingStatus,
        cohortErrors: newCohortErrors
      };
    });
  },

  /**
   * Preview cohort processing for a trace
   * @param {Object} rawData - Raw trace data
   * @param {string} cohortOn - Cohort configuration
   * @returns {Promise<Object>} Preview information
   */
  previewCohorts: async (rawData, cohortOn) => {
    try {
      return await cohortProcessor.previewCohorts(rawData, cohortOn);
    } catch (error) {
      console.error('Failed to preview cohorts:', error);
      return {
        cohortCount: 1,
        cohorts: ['values'],
        sampleData: { values: rawData },
        error: error.message
      };
    }
  },

  /**
   * Batch process multiple traces
   * @param {Array} traces - Array of {name, rawData, config} objects
   * @returns {Promise<Object>} Object mapping trace names to processed data
   */
  batchProcessTraces: async (traces) => {
    const { processTraceData } = get();
    const results = {};

    await Promise.all(
      traces.map(async ({ name, rawData, config }) => {
        try {
          results[name] = await processTraceData(name, rawData, config);
        } catch (error) {
          console.error(`Failed to process trace '${name}':`, error);
          results[name] = { values: rawData };
        }
      })
    );

    return results;
  }
});

export default createCohortSlice;