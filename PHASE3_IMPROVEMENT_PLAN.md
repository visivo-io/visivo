# Phase 3: Data Flow Improvements Plan

## Overview

This plan addresses three critical improvements to enhance the trace data flow architecture:

1. **Fix useTracesData hook interface mismatch**
2. **Move selector filtering earlier in the pipeline** 
3. **Eliminate processTraces/processTrace duplication**

## Issue Analysis

### 1. useTracesData Hook Interface Mismatch
**Current State**: Hook expects `(projectId, traceNames)` but components call `useTracesData(chart.traces)`
**Expected Interface**: `{data: rawTracesData, isLoading: isRawDataLoading} = useTracesData(chart.traces)`

### 2. Filtering Architecture
**Current Flow**: Raw Data → DuckDB → Store → **Components** → Selector Filtering → Chart/Table
**Desired Flow**: Raw Data → DuckDB → Store → **Selector Filtering** → Chart/Table

**Benefits of New Flow**:
- Components don't need filtering logic awareness
- Cleaner separation of concerns
- Selector state managed centrally
- Better performance (filter once, not per component)

### 3. Code Duplication
**Current**: `dataStore.processTraces()` and `dataStore.processSingleTrace()` both exist
**Issue**: `processTraces()` calls `dataProcessor.processTraces()` which loops and calls `processTrace()`
**Goal**: Eliminate the intermediate layer and simplify the call chain

## Implementation Plan

## Phase 3.1: Fix useTracesData Hook Interface

### 3.1.1: Update Hook Signature and Return Type
- **File**: `/Users/tgsoverly/code/visivo/viewer/src/hooks/useTracesData.js`
- **Changes**:
  - Change signature from `(projectId, traceNames)` to `(traces)`
  - Extract `traceNames` from `traces.map(t => t.name)` internally
  - Get `projectId` from context (add `useProject()` or similar)
  - Return object `{data: processedData, isLoading}` instead of just data
  - Maintain loading state coordination

### 3.1.2: Add Project Context if Missing
- **Investigation**: Check if project context exists for getting projectId
- **Fallback**: Use URL parameters or default project handling if no context

### 3.1.3: Update Hook Tests
- **File**: `/Users/tgsoverly/code/visivo/viewer/src/hooks/useTracesData.test.jsx`
- **Changes**: Update tests to match new interface

## Phase 3.2: Move Selector Filtering Earlier in Pipeline

### 3.2.1: Add Selector State to DataStore
- **File**: `/Users/tgsoverly/code/visivo/viewer/src/stores/dataStore.js`
- **New State Properties**:
  ```javascript
  // Selector state per component instance
  selectorStates: {
    [componentId]: {
      selectedCohorts: [],
      availableCohorts: []
    }
  },
  
  // Filtered data cache per component
  filteredTraces: {
    [componentId]: {
      traceObjects: [],
      lastUpdated: timestamp
    }
  }
  ```

### 3.2.2: Add Selector Management Methods
- **New Store Methods**:
  ```javascript
  // Set selector state for a component
  setComponentSelector: (componentId, selectedCohorts) => {...}
  
  // Get filtered trace objects for a component
  getFilteredTraces: (componentId, traceNames) => {...}
  
  // Update filtered cache when traces or selectors change
  updateFilteredCache: (componentId) => {...}
  ```

### 3.2.3: Update Components to Use New Flow
- **Files**: Chart.jsx, Table.jsx
- **Changes**:
  - Remove `filterTraceObjectsByCohorts` calls
  - Remove local `selectedCohorts` state
  - Use `getFilteredTraces(componentId, traceNames)` for data
  - Pass selector changes to `setComponentSelector(componentId, selection)`

### 3.2.4: Update CohortSelect Integration
- **File**: CohortSelect.jsx
- **Changes**:
  - Accept `componentId` prop for identifying which component's selector state
  - Use store methods for getting/setting selector state
  - Remove direct data manipulation

## Phase 3.3: Eliminate processTraces/processTrace Duplication

### 3.3.1: Analyze Current Call Chain
**Current Flow**:
```
Component -> dataStore.processTraces() -> dataProcessor.processTraces() -> loop: dataProcessor.processTrace()
Component -> dataStore.processSingleTrace() -> dataProcessor.processTrace()
```

**Issues**:
- Double wrapping of processing logic
- `dataProcessor.processTraces()` is just a loop wrapper
- Inconsistent error handling between batch and single processing

### 3.3.2: Simplify to Single Processing Path
**New Flow**:
```
Component -> dataStore.processTraces() -> loop: dataProcessor.processTrace()
```

**Changes**:
- **Remove**: `dataProcessor.processTraces()` method
- **Update**: `dataStore.processTraces()` to directly loop and call `dataProcessor.processTrace()`  
- **Remove**: `dataStore.processSingleTrace()` (use processTraces with single item array)
- **Benefit**: Single code path for all processing, consistent error handling

### 3.3.3: Update DataProcessor Class
- **File**: `/Users/tgsoverly/code/visivo/viewer/src/services/dataProcessor.js`
- **Changes**:
  - Remove `processTraces()` method entirely
  - Keep only `processTrace()` for single trace processing
  - Simplify class to focus on single-trace transformations

### 3.3.4: Update DataStore Implementation  
- **File**: `/Users/tgsoverly/code/visivo/viewer/src/stores/dataStore.js`
- **Changes**:
  - Update `processTraces()` to directly loop over traces
  - Remove `processSingleTrace()` method
  - Implement consistent error handling and status management

## Phase 3.4: Testing and Validation

### 3.4.1: Update Tests
- **dataProcessor.test.js**: Remove `processTraces` tests, focus on `processTrace`
- **dataStore.test.js**: Update tests for simplified processing flow
- **useTracesData.test.jsx**: Update for new hook interface
- **Chart.test.jsx** and **Table.test.jsx**: Update for new data flow

### 3.4.2: Integration Testing
- Test selector state isolation between components
- Test filtered data caching and invalidation
- Test error handling in simplified processing flow
- Validate performance improvements

### 3.4.3: Backward Compatibility Testing
- Ensure existing cohort examples still work
- Test non-cohort traces
- Validate chart and table rendering with new flow

## Implementation Priority and Dependencies

### High Priority (Core Functionality)
1. **Phase 3.1**: useTracesData hook fix - Required for basic functionality
2. **Phase 3.3**: Eliminate duplication - Simplifies maintenance

### Medium Priority (Architecture Improvement)  
3. **Phase 3.2**: Move filtering earlier - Improves separation of concerns

### Dependencies
- Phase 3.1 must complete before testing other phases
- Phase 3.2 can be done independently after 3.1
- Phase 3.3 can be done in parallel with 3.2

## Expected Benefits

### Performance
- Reduced duplicate processing in filtering
- Better caching of filtered results  
- Simplified call chains

### Maintainability
- Single processing code path
- Clear separation of concerns
- Components focused on presentation only

### Developer Experience
- Consistent interfaces across hooks and components
- Centralized selector state management
- Clearer data flow understanding

## Risk Mitigation

### Breaking Changes
- Update tests first to define expected behavior
- Implement feature flags for gradual rollout
- Maintain backward compatibility during transition

### Performance Regression
- Add performance monitoring to key operations
- Compare before/after metrics for data processing
- Test with large datasets

### State Management Complexity
- Document new selector state patterns
- Provide clear examples of component integration
- Implement debugging tools for state inspection

## Rollback Plan

If issues arise:
1. **Hook Interface**: Revert to old interface while maintaining new internal logic
2. **Filtering Architecture**: Keep filtering in components while maintaining store infrastructure  
3. **Duplication Removal**: Re-add wrapper methods with deprecation warnings

## Success Criteria

- [ ] useTracesData hook matches expected interface in all components
- [ ] Chart and Table components receive pre-filtered data
- [ ] CohortSelect components control filtering through store
- [ ] Single code path for all trace processing
- [ ] All existing functionality works without regression
- [ ] Performance metrics show improvement or no degradation
- [ ] Code complexity metrics improve (fewer lines, clearer structure)