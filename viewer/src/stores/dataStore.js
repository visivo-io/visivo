import { dataProcessor } from '../services/dataProcessor';

/**
 * Data Store for managing processed trace objects
 * Stores final trace objects ready for rendering, not intermediate data
 */
const createDataSlice = (set, get) => ({
  // Final trace objects ready for rendering
  // Structure: { [traceName]: [traceObject1, traceObject2, ...] }
  // Each traceObject is a complete Plotly trace ready for charts
  processedTraces: {},

  // Processing status for each trace
  // Values: 'idle' | 'loading' | 'completed' | 'error'
  processingStatus: {},

  // Error messages for failed processing
  processingErrors: {},

  /**
   * Process multiple traces with their configurations
   * Main entry point for trace processing
   * @param {Array} tracesConfig - Array of trace configurations
   * @param {Object} rawTracesData - Raw trace data mapping
   * @returns {Promise<void>}
   */
  processTraces: async (tracesConfig, rawTracesData) => {
    if (!tracesConfig || !rawTracesData) {
      return;
    }

    // Mark all traces as loading
    const loadingStatus = {};
    const clearErrors = {};
    tracesConfig.forEach(trace => {
      loadingStatus[trace.name] = 'loading';
      clearErrors[trace.name] = null;
    });

    set(state => ({
      processingStatus: { ...state.processingStatus, ...loadingStatus },
      processingErrors: { ...state.processingErrors, ...clearErrors }
    }));

    try {
      // Process all traces using DataProcessor
      const processedResults = await dataProcessor.processTraces(tracesConfig, rawTracesData);

      // Update store with results
      const completedStatus = {};
      if (processedResults && typeof processedResults === 'object') {
        Object.keys(processedResults).forEach(traceName => {
          completedStatus[traceName] = 'completed';
        });
      }

      set(state => ({
        processedTraces: { ...state.processedTraces, ...processedResults },
        processingStatus: { ...state.processingStatus, ...completedStatus }
      }));

    } catch (error) {
      console.error('Failed to process traces:', error);

      // Mark all traces as error
      const errorStatus = {};
      const errorMessages = {};
      tracesConfig.forEach(trace => {
        errorStatus[trace.name] = 'error';
        errorMessages[trace.name] = error.message;
      });

      set(state => ({
        processingStatus: { ...state.processingStatus, ...errorStatus },
        processingErrors: { ...state.processingErrors, ...errorMessages }
      }));
    }
  },

  /**
   * Process a single trace with its configuration
   * @param {Object} traceConfig - Single trace configuration
   * @param {Object} rawTraceData - Raw trace data
   * @returns {Promise<Array>} Array of trace objects
   */
  processSingleTrace: async (traceConfig, rawTraceData) => {
    const traceName = traceConfig.name;

    // Mark as loading
    set(state => ({
      processingStatus: { ...state.processingStatus, [traceName]: 'loading' },
      processingErrors: { ...state.processingErrors, [traceName]: null }
    }));

    try {
      const traceObjects = await dataProcessor.processTrace(traceConfig, rawTraceData);

      // Update store
      set(state => ({
        processedTraces: { ...state.processedTraces, [traceName]: traceObjects },
        processingStatus: { ...state.processingStatus, [traceName]: 'completed' }
      }));

      return traceObjects;

    } catch (error) {
      console.error(`Failed to process trace ${traceName}:`, error);

      // Set error state
      set(state => ({
        processingStatus: { ...state.processingStatus, [traceName]: 'error' },
        processingErrors: { ...state.processingErrors, [traceName]: error.message }
      }));

      // Return fallback trace object
      const fallbackTrace = dataProcessor.createTraceObject(rawTraceData, traceConfig, 'values');
      const fallbackArray = [fallbackTrace];

      set(state => ({
        processedTraces: { ...state.processedTraces, [traceName]: fallbackArray }
      }));

      return fallbackArray;
    }
  },

  /**
   * Get processed trace objects for a specific trace
   * @param {string} traceName - Name of the trace
   * @returns {Array} Array of trace objects (empty if not processed)
   */
  getTraceObjects: (traceName) => {
    const { processedTraces } = get();
    return processedTraces[traceName] || [];
  },

  /**
   * Get all processed trace objects for multiple traces
   * @param {Array} traceNames - Array of trace names
   * @returns {Array} Flat array of all trace objects
   */
  getMultipleTraceObjects: (traceNames) => {
    const { processedTraces } = get();
    return traceNames.flatMap(traceName => processedTraces[traceName] || []);
  },

  /**
   * Get all processed trace objects across all traces
   * @returns {Array} Flat array of all trace objects
   */
  getAllTraceObjects: () => {
    const { processedTraces } = get();
    return Object.values(processedTraces).flat();
  },

  /**
   * Check if a trace is ready (completed processing)
   * @param {string} traceName - Name of the trace
   * @returns {boolean} True if trace processing is completed
   */
  isTraceReady: (traceName) => {
    const { processingStatus } = get();
    return processingStatus[traceName] === 'completed';
  },

  /**
   * Check if multiple traces are all ready
   * @param {Array} traceNames - Array of trace names
   * @returns {boolean} True if all traces are completed
   */
  areTracesReady: (traceNames) => {
    const { processingStatus } = get();
    return traceNames.every(traceName => processingStatus[traceName] === 'completed');
  },

  /**
   * Check if a trace is currently being processed
   * @param {string} traceName - Name of the trace
   * @returns {boolean} True if trace is being processed
   */
  isTraceLoading: (traceName) => {
    const { processingStatus } = get();
    return processingStatus[traceName] === 'loading';
  },

  /**
   * Check if any traces are currently being processed
   * @param {Array} traceNames - Array of trace names to check
   * @returns {boolean} True if any trace is loading
   */
  areAnyTracesLoading: (traceNames) => {
    const { processingStatus } = get();
    return traceNames.some(traceName => processingStatus[traceName] === 'loading');
  },

  /**
   * Check if a trace has an error
   * @param {string} traceName - Name of the trace
   * @returns {boolean} True if trace processing failed
   */
  hasTraceError: (traceName) => {
    const { processingStatus } = get();
    return processingStatus[traceName] === 'error';
  },

  /**
   * Get error message for a trace
   * @param {string} traceName - Name of the trace
   * @returns {string|null} Error message or null if no error
   */
  getTraceError: (traceName) => {
    const { processingErrors } = get();
    return processingErrors[traceName] || null;
  },

  /**
   * Get processing status for a trace
   * @param {string} traceName - Name of the trace
   * @returns {string} Status: 'idle' | 'loading' | 'completed' | 'error'
   */
  getTraceStatus: (traceName) => {
    const { processingStatus } = get();
    return processingStatus[traceName] || 'idle';
  },

  /**
   * Clear processed data for specific traces
   * @param {Array} traceNames - Array of trace names to clear
   */
  clearTraceData: (traceNames) => {
    set(state => {
      const newProcessedTraces = { ...state.processedTraces };
      const newProcessingStatus = { ...state.processingStatus };
      const newProcessingErrors = { ...state.processingErrors };

      traceNames.forEach(traceName => {
        delete newProcessedTraces[traceName];
        delete newProcessingStatus[traceName];
        delete newProcessingErrors[traceName];
      });

      return {
        processedTraces: newProcessedTraces,
        processingStatus: newProcessingStatus,
        processingErrors: newProcessingErrors
      };
    });
  },

  /**
   * Clear all processed trace data
   */
  clearAllTraceData: () => {
    set({
      processedTraces: {},
      processingStatus: {},
      processingErrors: {}
    });
  },

  /**
   * Get cohort names from processed trace objects
   * @param {string} traceName - Name of the trace
   * @returns {Array} Array of cohort names (trace object names)
   */
  getCohortNames: (traceName) => {
    const { processedTraces } = get();
    const traceObjects = processedTraces[traceName] || [];
    return traceObjects.map(traceObj => traceObj.name || 'values');
  },

  /**
   * Get all unique cohort names across multiple traces
   * @param {Array} traceNames - Array of trace names
   * @returns {Array} Array of unique cohort names
   */
  getAllCohortNames: (traceNames) => {
    const { processedTraces } = get();
    const allCohortNames = traceNames.flatMap(traceName => {
      const traceObjects = processedTraces[traceName] || [];
      return traceObjects.map(traceObj => traceObj.name || 'values');
    });
    return [...new Set(allCohortNames)].sort();
  },

  /**
   * Filter trace objects by cohort names
   * @param {Array} traceNames - Array of trace names
   * @param {Array} selectedCohorts - Array of cohort names to include
   * @returns {Array} Filtered array of trace objects
   */
  filterTraceObjectsByCohorts: (traceNames, selectedCohorts) => {
    const { processedTraces } = get();
    
    if (!selectedCohorts || selectedCohorts.length === 0) {
      // No filter - return all trace objects
      return traceNames.flatMap(traceName => processedTraces[traceName] || []);
    }

    // Filter by selected cohorts
    return traceNames.flatMap(traceName => {
      const traceObjects = processedTraces[traceName] || [];
      return traceObjects.filter(traceObj => 
        selectedCohorts.includes(traceObj.name || 'values')
      );
    });
  },

  /**
   * Get processing statistics
   * @returns {Object} Processing statistics
   */
  getProcessingStats: () => {
    const { processingStatus } = get();
    const stats = {
      total: 0,
      loading: 0,
      completed: 0,
      error: 0,
      idle: 0
    };

    Object.values(processingStatus).forEach(status => {
      stats.total++;
      stats[status] = (stats[status] || 0) + 1;
    });

    return stats;
  }
});

export default createDataSlice;