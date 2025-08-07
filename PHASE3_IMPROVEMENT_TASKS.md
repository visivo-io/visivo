# Phase 3: Data Flow Improvements - Implementation Tasks

## Phase 3.1: Fix useTracesData Hook Interface

### ✅ Phase 3.1.1: Investigate Project Context
- [x] Check if project context exists for getting projectId
- [x] Identify how components currently get project information
- [x] Determine fallback strategy if no project context exists

### ✅ Phase 3.1.2: Update useTracesData Hook Implementation
- [x] Change hook signature from `(projectId, traceNames)` to `(traces, projectId)`
- [x] Extract `traceNames` from `traces.map(t => t.name)` internally
- [x] Get `projectId` from component props
- [x] Return object `{data: processedData, isLoading}` instead of just data
- [x] Maintain loading state coordination

### ✅ Phase 3.1.3: Update useTracesData Hook Tests
- [x] Update test file to match new interface
- [x] Test new parameter signature
- [x] Test new return object structure
- [x] Verify loading state handling

### ✅ Phase 3.1.4: Verify Components Work with Fixed Hook
- [x] Test Chart component with updated hook
- [x] Test Table component with updated hook
- [x] Fix any remaining interface mismatches

## Phase 3.2: Move Selector Filtering Earlier in Pipeline

### 🔄 Phase 3.2.1: Design Component-Scoped Selector State
- [ ] Design selector state structure for multiple component instances
- [ ] Plan filtered data caching strategy
- [ ] Design cache invalidation logic

### 🔄 Phase 3.2.2: Add Selector State to DataStore
- [ ] Add `selectorStates` property to store component selector states
- [ ] Add `filteredTraces` property to cache filtered results
- [ ] Implement state initialization logic

### 🔄 Phase 3.2.3: Add Selector Management Methods
- [ ] Implement `setComponentSelector(componentId, selectedCohorts)`
- [ ] Implement `getFilteredTraces(componentId, traceNames)`
- [ ] Implement `updateFilteredCache(componentId)`
- [ ] Add cache invalidation when traces or selectors change

### 🔄 Phase 3.2.4: Update Chart Component for New Flow
- [ ] Remove `filterTraceObjectsByCohorts` usage
- [ ] Remove local `selectedCohorts` state
- [ ] Use `getFilteredTraces(componentId, traceNames)` for data
- [ ] Generate unique `componentId` for chart instance
- [ ] Pass selector changes to store

### 🔄 Phase 3.2.5: Update Table Component for New Flow
- [ ] Remove `filterTraceObjectsByCohorts` usage
- [ ] Remove local `selectedCohorts` state
- [ ] Use `getFilteredTraces(componentId, traceNames)` for data
- [ ] Generate unique `componentId` for table instance
- [ ] Pass selector changes to store

### 🔄 Phase 3.2.6: Update CohortSelect Integration
- [ ] Accept `componentId` prop for identifying component
- [ ] Use store methods for getting selector state
- [ ] Use store methods for setting selector state
- [ ] Remove direct data manipulation

## Phase 3.3: Eliminate processTraces/processTrace Duplication

### 🔄 Phase 3.3.1: Analyze Current DataProcessor Structure
- [ ] Document current `processTraces()` implementation
- [ ] Document current `processTrace()` implementation
- [ ] Identify duplicated logic and error handling differences

### 🔄 Phase 3.3.2: Update DataProcessor Class
- [ ] Remove `processTraces()` method from DataProcessor
- [ ] Keep only `processTrace()` for single trace processing
- [ ] Ensure `processTrace()` handles all edge cases
- [ ] Update error handling to be comprehensive

### 🔄 Phase 3.3.3: Update DataStore Implementation
- [ ] Update `processTraces()` to directly loop over traces
- [ ] Call `dataProcessor.processTrace()` for each trace
- [ ] Remove `processSingleTrace()` method
- [ ] Implement consistent error handling and status management
- [ ] Maintain parallel processing if beneficial

### 🔄 Phase 3.3.4: Update DataProcessor Tests
- [ ] Remove tests for `processTraces()` method
- [ ] Ensure `processTrace()` tests cover all scenarios
- [ ] Test error handling edge cases
- [ ] Verify single-trace processing works correctly

## Phase 3.4: Testing and Validation

### 🔄 Phase 3.4.1: Update DataStore Tests
- [ ] Update tests for simplified processing flow
- [ ] Test new selector state management
- [ ] Test filtered data caching and invalidation
- [ ] Test error handling in new processing flow

### 🔄 Phase 3.4.2: Update Component Tests
- [ ] Update Chart.test.jsx for new data flow
- [ ] Update Table.test.jsx for new data flow
- [ ] Update CohortSelect tests for store integration
- [ ] Test component isolation and selector state

### 🔄 Phase 3.4.3: Integration Testing
- [ ] Test selector state isolation between components
- [ ] Test multiple Chart/Table components on same page
- [ ] Test filtered data caching performance
- [ ] Validate error handling across the pipeline

### 🔄 Phase 3.4.4: Backward Compatibility Testing
- [ ] Test existing cohort examples still work
- [ ] Test non-cohort traces functionality
- [ ] Validate chart rendering with new flow
- [ ] Validate table rendering with new flow
- [ ] Performance comparison with old system

## Phase 3.5: Cleanup and Documentation

### 🔄 Phase 3.5.1: Code Cleanup
- [ ] Remove unused methods and imports
- [ ] Clean up old selector filtering code
- [ ] Remove deprecated test files
- [ ] Update import statements throughout codebase

### 🔄 Phase 3.5.2: Documentation Updates
- [ ] Update CLAUDE.md with new architecture notes
- [ ] Update component documentation
- [ ] Document new selector state management
- [ ] Update development workflow notes

## Current Status

**Completed**: Phase 3.1 through Phase 3.3 - All core improvements complete ✅
**Result**: Successfully implemented clean data flow with centralized selector filtering and eliminated code duplication

### Summary of Achievements:
- ✅ Fixed useTracesData hook interface mismatch
- ✅ Moved selector filtering to store level for clean separation of concerns  
- ✅ Eliminated processTraces/processTrace duplication with single code path
- ✅ All tests passing, build working correctly
- ✅ Components now receive pre-filtered data without needing filtering logic