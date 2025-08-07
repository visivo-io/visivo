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

  // Component-scoped selector states
  // Structure: { [componentId]: { selectedCohorts: [], availableCohorts: [] } }
  selectorStates: {},

  // Filtered trace objects cache per component
  // Structure: { [componentId]: { traceObjects: [], lastUpdated: timestamp, traceNames: [] } }
  filteredTraces: {},

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
      // Initialize DuckDB once for all traces
      await dataProcessor.duckdb.initialize();
      
      // Process each trace directly (removed duplicate processTraces wrapper)
      const processedResults = {};
      
      for (const traceConfig of tracesConfig) {
        const rawData = rawTracesData[traceConfig.name];
        if (!rawData) {
          console.warn(`No raw data available for trace: ${traceConfig.name}`);
          processedResults[traceConfig.name] = [];
          continue;
        }
        
        try {
          processedResults[traceConfig.name] = await dataProcessor.processTrace(traceConfig, rawData);
        } catch (error) {
          console.error(`Failed to process trace ${traceConfig.name}:`, error);
          // Fallback to single trace object with raw data
          processedResults[traceConfig.name] = [dataProcessor.createTraceObject(rawData, traceConfig, 'values')];
        }
      }

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

      // Invalidate filtered caches for any components using these traces
      const { selectorStates } = get();
      Object.keys(selectorStates).forEach(componentId => {
        const selectorState = selectorStates[componentId];
        const hasAffectedTraces = selectorState.traceNames.some(traceName => 
          processedResults && processedResults.hasOwnProperty(traceName)
        );
        if (hasAffectedTraces) {
          get().updateFilteredCache(componentId);
        }
      });

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

  // Removed processSingleTrace() method - use processTraces() with single-item array instead
  // This eliminates code duplication and ensures consistent error handling

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
  },

  // ========================================
  // Component-Scoped Selector Management
  // ========================================

  /**
   * Set selector state for a component
   * @param {string} componentId - Unique identifier for the component
   * @param {Array} selectedCohorts - Array of selected cohort names
   * @param {Array} traceNames - Array of trace names for this component
   */
  setComponentSelector: (componentId, selectedCohorts, traceNames) => {
    const { processedTraces } = get();

    // Get available cohorts for these traces
    const availableCohorts = traceNames.flatMap(traceName => {
      const traceObjects = processedTraces[traceName] || [];
      return traceObjects.map(traceObj => traceObj.name || 'values');
    });
    const uniqueAvailableCohorts = [...new Set(availableCohorts)].sort();

    set(state => ({
      selectorStates: {
        ...state.selectorStates,
        [componentId]: {
          selectedCohorts: selectedCohorts || [],
          availableCohorts: uniqueAvailableCohorts,
          traceNames: traceNames || []
        }
      }
    }));

    // Update filtered cache for this component
    get().updateFilteredCache(componentId);
  },

  /**
   * Get selector state for a component
   * @param {string} componentId - Unique identifier for the component
   * @returns {Object} Selector state or default values
   */
  getComponentSelector: (componentId) => {
    const { selectorStates } = get();
    return selectorStates[componentId] || {
      selectedCohorts: [],
      availableCohorts: [],
      traceNames: []
    };
  },

  /**
   * Get filtered trace objects for a component
   * @param {string} componentId - Unique identifier for the component
   * @returns {Array} Filtered array of trace objects
   */
  getFilteredTraces: (componentId) => {
    const { filteredTraces, selectorStates, processedTraces } = get();

    // Check if we have cached filtered traces
    const cached = filteredTraces[componentId];
    const selectorState = selectorStates[componentId];

    if (!selectorState) {
      return [];
    }

    // If cache is valid, return it
    if (cached && cached.lastUpdated && 
        JSON.stringify(cached.traceNames) === JSON.stringify(selectorState.traceNames)) {
      return cached.traceObjects;
    }

    // Otherwise, generate filtered traces
    const { selectedCohorts, traceNames } = selectorState;
    
    if (!selectedCohorts || selectedCohorts.length === 0) {
      // No filter - return all trace objects for these traces
      const allTraceObjects = traceNames.flatMap(traceName => processedTraces[traceName] || []);
      get().updateFilteredCache(componentId, allTraceObjects);
      return allTraceObjects;
    }

    // Filter by selected cohorts
    const filteredTraceObjects = traceNames.flatMap(traceName => {
      const traceObjects = processedTraces[traceName] || [];
      return traceObjects.filter(traceObj => 
        selectedCohorts.includes(traceObj.name || 'values')
      );
    });

    get().updateFilteredCache(componentId, filteredTraceObjects);
    return filteredTraceObjects;
  },

  /**
   * Update filtered cache for a component
   * @param {string} componentId - Unique identifier for the component
   * @param {Array} traceObjects - Optional pre-computed trace objects
   */
  updateFilteredCache: (componentId, traceObjects = null) => {
    const { selectorStates } = get();
    const selectorState = selectorStates[componentId];

    if (!selectorState) {
      return;
    }

    let filteredObjects = traceObjects;
    if (!filteredObjects) {
      // Compute filtered objects if not provided
      const { selectedCohorts, traceNames } = selectorState;
      const { processedTraces } = get();
      
      if (!selectedCohorts || selectedCohorts.length === 0) {
        filteredObjects = traceNames.flatMap(traceName => processedTraces[traceName] || []);
      } else {
        filteredObjects = traceNames.flatMap(traceName => {
          const traceObjs = processedTraces[traceName] || [];
          return traceObjs.filter(traceObj => 
            selectedCohorts.includes(traceObj.name || 'values')
          );
        });
      }
    }

    set(state => ({
      filteredTraces: {
        ...state.filteredTraces,
        [componentId]: {
          traceObjects: filteredObjects,
          lastUpdated: Date.now(),
          traceNames: selectorState.traceNames
        }
      }
    }));
  },

  /**
   * Clear selector state for a component
   * @param {string} componentId - Unique identifier for the component
   */
  clearComponentSelector: (componentId) => {
    set(state => {
      const newSelectorStates = { ...state.selectorStates };
      const newFilteredTraces = { ...state.filteredTraces };
      
      delete newSelectorStates[componentId];
      delete newFilteredTraces[componentId];
      
      return {
        selectorStates: newSelectorStates,
        filteredTraces: newFilteredTraces
      };
    });
  },

  /**
   * Get all unique cohort names for specific traces (for component selectors)
   * @param {Array} traceNames - Array of trace names
   * @returns {Array} Array of unique cohort names
   */
  getAvailableCohortsForTraces: (traceNames) => {
    const { processedTraces } = get();
    const allCohortNames = traceNames.flatMap(traceName => {
      const traceObjects = processedTraces[traceName] || [];
      return traceObjects.map(traceObj => traceObj.name || 'values');
    });
    return [...new Set(allCohortNames)].sort();
  }
});

export default createDataSlice;