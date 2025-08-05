# Cohort Refactor Phase 2: Data Flow Simplification Plan

## Current Architecture Analysis

### Issues Identified

1. **Overlapping Responsibilities**: `cohortProcessor` and `duckdbService` both handle data transformation
2. **Complex Data Flow**: Data passes through multiple transformation layers unnecessarily
3. **Inconsistent Data Structures**: Mixed approaches to storing cohorted vs non-cohorted data
4. **Inefficient Processing**: Data is processed multiple times in different layers
5. **Confusing Abstractions**: `useCohortedTracesData` hook adds complexity without clear benefit

### Current Data Flow Problems

```
Raw Data → useTracesData → cohortProcessor → duckdbService → cohortStore → useCohortedTracesData → Chart
```

**Problems:**
- Too many transformation steps
- Unclear separation of concerns
- cohortProcessor and duckdbService duplicate functionality
- Zustand store holds intermediate processed data instead of final trace objects
- Chart components expect old cohort-grouped structure

## Desired Data Flow

```
Raw Trace Data → DuckDB WASM → Trace Objects List → Zustand Store → Chart/Table → Selector Filtering
```

### Key Requirements

1. **Raw trace data** (flat structure) gets loaded into DuckDB WASM
2. **cohort_on property** from trace config drives grouping logic
3. **List of trace objects** gets stored in Zustand (one per cohort group)
4. **Chart/Table components** receive standard trace object list
5. **Selector filtering** operates on the trace object list
6. **Future extensibility** for other data processing (filtering, transformations)

## Refactor Plan

### Phase 2.1: Simplify DuckDB Service Responsibilities

**Goal**: Make DuckDB service focus solely on data loading and query execution

**Changes:**
- Remove `createCohorts()` method from DuckDB service
- Keep only: `initialize()`, `loadData()`, `executeQuery()`, `cleanup()`
- DuckDB becomes a pure query engine, not a data transformer

### Phase 2.2: Redesign Cohort Processor

**Goal**: Transform cohortProcessor into a comprehensive data processor that outputs trace objects

**New Responsibilities:**
- Load raw trace data into DuckDB
- Execute cohort grouping queries via DuckDB
- Transform results into proper trace objects
- Handle future data processing needs (filtering, aggregation, etc.)

**New API:**
```javascript
class DataProcessor {
  async processTraces(tracesConfig, rawTracesData) {
    // Returns: { [traceName]: [traceObject1, traceObject2, ...] }
  }
  
  async processTrace(traceConfig, rawTraceData) {
    // Returns: [traceObject1, traceObject2, ...]
  }
  
  // Future methods:
  async filterTraces(traceObjects, filterConfig) { }
  async aggregateTraces(traceObjects, aggregationConfig) { }
}
```

### Phase 2.3: Redesign Zustand Store

**Goal**: Store final trace objects, not intermediate processed data

**New Structure:**
```javascript
{
  // Final trace objects ready for rendering
  processedTraces: {
    [traceName]: [traceObject1, traceObject2, ...] // One per cohort
  },
  
  // Processing status
  processingStatus: {
    [traceName]: 'loading' | 'completed' | 'error'
  },
  
  // Errors
  processingErrors: {
    [traceName]: errorMessage
  }
}
```

**Methods:**
- `processTraces(tracesConfig, rawTracesData)` - Main processing method
- `getTraceObjects(traceName)` - Get processed trace objects
- `getAllTraceObjects()` - Get all processed traces
- `isTraceReady(traceName)` - Check if trace is processed

### Phase 2.4: Simplify Data Hooks

**Goal**: Remove unnecessary abstraction layers

**Changes:**
- Remove `useCohortedTracesData` hook (too complex, not needed)
- Enhance `useTracesData` to work with new flow:
  ```javascript
  const { rawData, isLoading } = useTracesData(traces);
  const { processedTraces, isProcessing } = useStore(state => ({
    processedTraces: state.processedTraces,
    isProcessing: state.processingStatus
  }));
  ```

### Phase 2.5: Update Chart/Table Components

**Goal**: Consume list of trace objects instead of cohort-grouped data

**Changes:**
- Remove cohort data structure assumptions
- Accept list of trace objects directly
- Selector component filters trace object list
- Simpler data flow: `traceObjects.filter(trace => selectedCohorts.includes(trace.name))`

### Phase 2.6: Update Trace Model

**Goal**: Align trace object creation with new data flow

**Changes:**
- Update `chartDataFromCohortData` to work with flat data + trace config
- Ensure trace objects have consistent structure
- Add cohort name as trace property for identification

## Implementation Details

### 1. New Data Processor Architecture

```javascript
// services/dataProcessor.js
class DataProcessor {
  constructor() {
    this.duckdb = duckdbService; // Pure query engine
  }

  async processTraces(tracesConfig, rawTracesData) {
    await this.duckdb.initialize();
    
    const results = {};
    
    for (const traceConfig of tracesConfig) {
      const rawData = rawTracesData[traceConfig.name];
      if (!rawData) continue;
      
      results[traceConfig.name] = await this.processTrace(traceConfig, rawData);
    }
    
    return results;
  }

  async processTrace(traceConfig, rawTraceData) {
    const tableName = `trace_${traceConfig.name}_${Date.now()}`;
    
    try {
      // Load raw data into DuckDB
      await this.duckdb.loadData(tableName, rawTraceData);
      
      if (!traceConfig.cohort_on) {
        // No cohort grouping - single trace object
        return [this.createTraceObject(rawTraceData, traceConfig, 'values')];
      }
      
      // Execute cohort grouping query
      const cohortQuery = this.buildCohortQuery(tableName, traceConfig.cohort_on);
      const cohortResults = await this.duckdb.executeQuery(cohortQuery);
      
      // Transform to trace objects
      return this.transformToTraceObjects(cohortResults, traceConfig);
      
    } finally {
      // Cleanup
      await this.duckdb.executeQuery(`DROP TABLE IF EXISTS ${tableName}`);
    }
  }

  buildCohortQuery(tableName, cohortOn) {
    const cohortExpression = this.parseCohortExpression(cohortOn);
    
    return `
      SELECT 
        ${cohortExpression} as cohort_value,
        * EXCLUDE(${cohortExpression})
      FROM ${tableName}
      ORDER BY cohort_value
    `;
  }

  transformToTraceObjects(cohortResults, traceConfig) {
    const groupedData = this.groupResultsByCohort(cohortResults);
    
    return Object.entries(groupedData).map(([cohortName, cohortData]) => {
      return this.createTraceObject(cohortData, traceConfig, cohortName);
    });
  }

  createTraceObject(data, traceConfig, cohortName) {
    // Convert flat data + config to trace object
    const traceDatum = convertDotKeysToNestedObject(data);
    const traceProps = structuredClone(traceConfig.props);
    
    return mergeStaticPropertiesAndData(traceProps, traceDatum, cohortName);
  }
}
```

### 2. Simplified Zustand Store

```javascript
// stores/dataStore.js
const createDataSlice = (set, get) => ({
  // Final trace objects ready for rendering
  processedTraces: {}, // { [traceName]: [traceObject1, traceObject2, ...] }
  
  // Processing state
  processingStatus: {}, // { [traceName]: 'loading' | 'completed' | 'error' }
  processingErrors: {}, // { [traceName]: errorMessage }
  
  // Main processing method
  processTraces: async (tracesConfig, rawTracesData) => {
    const processor = new DataProcessor();
    
    // Mark all traces as loading
    const loadingStatus = {};
    tracesConfig.forEach(trace => {
      loadingStatus[trace.name] = 'loading';
    });
    set(state => ({ 
      processingStatus: { ...state.processingStatus, ...loadingStatus }
    }));
    
    try {
      const results = await processor.processTraces(tracesConfig, rawTracesData);
      
      set(state => ({
        processedTraces: { ...state.processedTraces, ...results },
        processingStatus: { 
          ...state.processingStatus, 
          ...Object.keys(results).reduce((acc, name) => {
            acc[name] = 'completed';
            return acc;
          }, {})
        }
      }));
      
    } catch (error) {
      console.error('Failed to process traces:', error);
      
      set(state => ({
        processingStatus: {
          ...state.processingStatus,
          ...tracesConfig.reduce((acc, trace) => {
            acc[trace.name] = 'error';
            return acc;
          }, {})
        },
        processingErrors: {
          ...state.processingErrors,
          ...tracesConfig.reduce((acc, trace) => {
            acc[trace.name] = error.message;
            return acc;  
          }, {})
        }
      }));
    }
  },
  
  // Getters
  getTraceObjects: (traceName) => {
    const { processedTraces } = get();
    return processedTraces[traceName] || [];
  },
  
  getAllTraceObjects: () => {
    const { processedTraces } = get();
    return Object.values(processedTraces).flat();
  },
  
  isTraceReady: (traceName) => {
    const { processingStatus } = get();
    return processingStatus[traceName] === 'completed';
  },
  
  hasError: (traceName) => {
    const { processingStatus } = get();
    return processingStatus[traceName] === 'error';
  }
});
```

### 3. Updated Chart Component

```javascript
// components/items/Chart.jsx
const Chart = ({ chart, project }) => {
  const { data: rawTracesData, isLoading: isRawLoading } = useTracesData(chart.traces);
  
  const { 
    processTraces, 
    getTraceObjects, 
    isTraceReady, 
    processingStatus 
  } = useStore();
  
  const [selectedCohorts, setSelectedCohorts] = useState([]);
  
  // Process traces when raw data is available
  useEffect(() => {
    if (rawTracesData && Object.keys(rawTracesData).length > 0) {
      processTraces(chart.traces, rawTracesData);
    }
  }, [rawTracesData, chart.traces, processTraces]);
  
  // Get all trace objects for this chart
  const allTraceObjects = useMemo(() => {
    return chart.traces.flatMap(trace => getTraceObjects(trace.name));
  }, [chart.traces, getTraceObjects, processingStatus]);
  
  // Filter trace objects based on selected cohorts
  const filteredTraceObjects = useMemo(() => {
    if (selectedCohorts.length === 0) {
      return allTraceObjects;
    }
    return allTraceObjects.filter(traceObj => 
      selectedCohorts.includes(traceObj.name)
    );
  }, [allTraceObjects, selectedCohorts]);
  
  const isLoading = isRawLoading || chart.traces.some(trace => 
    !isTraceReady(trace.name)
  );
  
  if (isLoading) return <Loading />;
  
  return (
    <div>
      <CohortSelect 
        traceObjects={allTraceObjects}
        selectedCohorts={selectedCohorts}
        onSelectionChange={setSelectedCohorts}
      />
      <Plot
        data={filteredTraceObjects}
        layout={chart.layout}
      />
    </div>
  );
};
```

## Benefits of This Refactor

### 1. **Clear Separation of Concerns**
- DuckDB Service: Pure query engine
- Data Processor: Data transformation logic
- Zustand Store: State management of final trace objects
- Components: Rendering and user interaction

### 2. **Simplified Data Flow**
- Raw Data → DuckDB Query → Trace Objects → Store → Component
- No intermediate transformations or complex hooks

### 3. **Better Performance**
- Single processing step per trace
- Results cached in store as final objects
- No redundant transformations

### 4. **Enhanced Maintainability**
- Clear responsibilities for each layer
- Easy to test individual components
- Straightforward to add new features

### 5. **Future Extensibility**
- Data Processor can handle filtering, aggregation, etc.
- Store structure supports multiple processing types
- Components work with standard trace object lists

## Migration Strategy

### Phase 2.1: Core Services (Week 1)
1. Refactor DuckDB Service (remove createCohorts)
2. Create new DataProcessor class
3. Update unit tests

### Phase 2.2: Store & State (Week 1-2)  
1. Redesign Zustand store structure
2. Update store methods and getters
3. Create integration tests

### Phase 2.3: Components (Week 2)
1. Update Chart.jsx to use new data flow
2. Update Table.jsx to use new data flow  
3. Update CohortSelect component
4. Remove useCohortedTracesData hook

### Phase 2.4: Testing & Validation (Week 2-3)
1. Test with example projects
2. Validate all cohort scenarios work
3. Performance testing
4. Update documentation

### Phase 2.5: Cleanup (Week 3)
1. Remove deprecated code
2. Clean up unused dependencies
3. Update tests to reflect new architecture
4. Final validation

## Risk Mitigation

1. **Backward Compatibility**: Keep old code until new system is fully tested
2. **Gradual Migration**: Implement behind feature flag initially
3. **Comprehensive Testing**: Test all cohort scenarios with example projects
4. **Performance Monitoring**: Ensure new system performs better than old
5. **Rollback Plan**: Ability to revert to old system if issues arise

## Success Criteria

1. ✅ **Simplified Architecture**: Clear separation of concerns
2. ✅ **Better Performance**: Faster processing, less memory usage  
3. ✅ **Enhanced Maintainability**: Easier to modify and extend
4. ✅ **Preserved Functionality**: All existing cohort features work
5. ✅ **Future Ready**: Easy to add filtering, aggregation, etc.

This refactor transforms the cohort system from a complex, multi-layered architecture into a clean, efficient data processing pipeline that's ready for future enhancements.