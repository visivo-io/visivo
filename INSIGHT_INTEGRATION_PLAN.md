# Frontend Insight Integration - Comprehensive Implementation Plan

## Overview
Close the gap between the backend's new multi-model insight architecture and the frontend viewer to enable fully functional static and dynamic insights within charts.

---

## Phase 0: Documentation (Before Implementation)

### 0.1 Create Implementation Plan Document
**File**: `INSIGHT_INTEGRATION_PLAN.md` (NEW - project root)
- Write complete implementation plan to markdown file
- Include all phases, tasks, success criteria, and estimates
- Save for team reference and progress tracking
- This becomes the single source of truth for the integration work

---

## Phase 1: Backend Verification & API Updates (Critical Foundation)

### 1.1 Verify Insight JSON Generation
**Files**: `visivo/jobs/run_insight_job.py`, test output files
- Run integration test to verify insight JSON structure is correct
- Check that `files[]` array contains proper name_hash entries
- Verify `post_query` contains DuckDB-compatible SQL
- Verify `props_mapping` has correct path → alias mappings
- Document actual output format for team reference

### 1.2 Update Flask API Endpoint
**File**: `visivo/server/views/insight_views.py:11-34`
- Modify endpoint to properly resolve file URLs (currently using relative paths)
- Ensure signed URLs are correctly generated for parquet files
- Add error handling for missing insight files
- Add logging for debugging insight loading issues
- Return proper HTTP status codes (404 for missing insights)

### 1.3 Add Backend Name Hash Utility Endpoint
**File**: `visivo/server/views/insight_views.py` (new endpoint)
- Create `/api/insights/hash` endpoint to compute name_hash from name
- This allows frontend to compute hashes without duplicating logic
- Returns `{"name_hash": "m..."}`

---

## Phase 2: Frontend Data Loading (Core Infrastructure)

### 2.1 Update Insight API Client
**File**: `viewer/src/api/insights.js`
- Update `fetchInsights()` to handle new JSON structure
- Parse `files[]` array properly
- Extract `query` (post_query) and `props_mapping`
- Handle both single-file and multi-file patterns
- Add error handling and retry logic

### 2.2 Enhance DuckDB File Registration
**File**: `viewer/src/duckdb/queries.js`
- Update `insertDuckDBFile()` to register files with name_hash pattern
- For non-dynamic: register as `'insight_hash.parquet'`
- For dynamic: register each model as `'model_hash.parquet'`
- Add caching to avoid re-downloading same parquet files
- Add error handling for failed downloads

### 2.3 Create Parquet File Cache Manager
**File**: `viewer/src/duckdb/parquetCache.js` (NEW)
- Track which parquet files are already loaded in DuckDB
- Prevent duplicate downloads of same model files
- Implement cache invalidation strategy
- Store mapping of name_hash → loaded state
```javascript
// Structure:
{
  isLoaded(nameHash): boolean
  markLoaded(nameHash): void
  clear(): void
}
```

---

## Phase 3: Query Execution (Critical Logic)

### 3.1 Update Post-Query Execution
**File**: `viewer/src/duckdb/queries.js`
- Modify `runDuckDBQuery()` to handle full SQL (not just simple SELECTs)
- Support CTEs in post_query
- Handle window functions and complex aggregations
- Add query validation before execution
- Better error messages with query context

### 3.2 Implement Input Substitution
**File**: `viewer/src/duckdb/queries.js` - enhance `prepPostQuery()`
- Parse post_query for input reference patterns `${ref(input_name)}`
- Replace with actual values from insight store
- Handle different input types (currently DROPDOWN)
- Add validation for missing input values
- Preserve SQL syntax (proper quoting, escaping)

### 3.3 Handle Multi-File Loading Pipeline
**File**: `viewer/src/hooks/useInsightsData.js`
- Update loading logic:
  1. Fetch insight metadata from `/api/insights/`
  2. Extract `files[]` array
  3. Download all parquet files in parallel (if not cached)
  4. Register each with DuckDB using name_hash
  5. Execute post_query with input substitution
  6. Map results using props_mapping
- Add loading states for each step
- Handle partial failures gracefully

---

## Phase 4: Props Mapping & Data Transformation

### 4.1 Implement Props Mapper
**File**: `viewer/src/models/Insight.js` (NEW utility)
- Create `mapQueryResultsToProps(results, props_mapping)` function
- Handle nested prop paths (e.g., `"props.marker.colorscale[0]"`)
- Transform flat query results into nested prop structure
- Handle array indices in prop paths
- Validate all expected props are present

### 4.2 Update Chart Data Transformation
**File**: `viewer/src/models/Insight.js` - update `chartDataFromInsightData()`
- Use props_mapping to construct Plotly trace data
- Handle missing props gracefully with defaults
- Support deeply nested props (markers, colorscales, etc.)
- Preserve data types (numbers vs strings)
- Convert BigInt values to strings (existing logic)

---

## Phase 5: Zustand Store Updates

### 5.1 Update Insight Store Structure
**File**: `viewer/src/stores/insightStore.js`
- Modify insight object structure:
```javascript
{
  [insightName]: {
    data: [],              // Query results
    files: [],             // File references
    query: "",             // post_query
    props_mapping: {},     // Prop mappings
    is_dynamic: boolean,   // Computed from files length or interactions
    loading: boolean,
    error: null
  }
}
```

### 5.2 Enhance Input Change Handler
**File**: `viewer/src/stores/insightStore.js` - update `setInputValue()`
- Find all insights that reference the changed input
- For each dependent insight:
  1. Regenerate post_query with new input value
  2. Re-execute query in DuckDB
  3. Re-apply props_mapping
  4. Update insight data in store
- Debounce rapid input changes
- Show loading states during re-computation

### 5.3 Add Parquet Cache to Store
**File**: `viewer/src/stores/insightStore.js`
- Add `parquetCache: Set<string>` to track loaded files
- Methods: `isParquetLoaded(hash)`, `markParquetLoaded(hash)`
- Prevents re-downloading same model files

---

## Phase 6: Component Updates

### 6.1 Update Chart Component
**File**: `viewer/src/components/charts/Chart.jsx`
- Remove single-model assumption
- Use `useInsightsData()` with multiple insight names
- Apply props_mapping to transform data for Plotly
- Handle loading states for multi-file insights
- Display errors gracefully

### 6.2 Update Table Component
**File**: `viewer/src/components/tables/Table.jsx`
- Similar updates to Chart component
- Handle insights in table format
- Support column mapping from props_mapping
- Add sorting/filtering on transformed data

### 6.3 Create Insight Loading Indicator
**File**: `viewer/src/components/insights/InsightLoader.jsx` (NEW)
- Show progress: "Loading files (2/3)...", "Executing query...", "Mapping props..."
- Display which parquet files are being loaded
- Show query execution time
- Error states with retry button

---

## Phase 7: Interaction Support

### 7.1 Implement Filter Interactions
**File**: `viewer/src/hooks/useInsightsData.js`
- Parse `filter` from interactions
- Apply WHERE-like logic to post_query
- Re-execute when filter inputs change

### 7.2 Implement Split Interactions
**File**: `viewer/src/hooks/useInsightsData.js`
- Parse `split` from interactions (replaces cohort_on)
- Create multiple series based on split field
- Transform results into multi-series format for charts

### 7.3 Implement Sort Interactions
**File**: `viewer/src/hooks/useInsightsData.js`
- Parse `sort` from interactions
- Apply ORDER BY to post_query
- Re-execute when sort changes

---

## Phase 8: Testing & Validation

### 8.1 Create Test Utilities
**File**: `viewer/src/test-utils/insightMocks.js` (NEW)
- Mock insight JSON responses
- Mock parquet file downloads
- Mock DuckDB query execution
- Test fixtures for single-model and multi-model cases

### 8.2 Unit Tests
**Files**: Various `*.test.js` files
- Test props_mapping logic
- Test input substitution
- Test multi-file loading pipeline
- Test cache management
- Test error handling

### 8.3 Integration Testing
- Test with real DuckDB WASM
- Test single-model insights (non-dynamic)
- Test multi-model insights (dynamic)
- Test with inputs and interactions
- Test with metrics and dimensions
- Test with relations (multi-model joins)

### 8.4 End-to-End Testing
- Build test project with:
  - Simple single-model insight
  - Multi-model insight with relation
  - Dynamic insight with input
  - Insight with all features (metrics, dimensions, relations, inputs)
- Run `visivo run` and verify files generated
- Load in viewer and verify rendering
- Test interactions work correctly

---

## Phase 9: Error Handling & UX Polish

### 9.1 Comprehensive Error Handling
- File download failures → show retry with specific file
- Query execution errors → show SQL error with context
- Props mapping failures → show which props are missing
- Input validation → show clear error messages
- Network timeouts → show retry with exponential backoff

### 9.2 Loading States
- Skeleton loaders for charts during insight loading
- Progress indicators for multi-file downloads
- Query execution time display
- Cache hit indicators

### 9.3 Developer Experience
- Console logging for debugging (with DEBUG flag)
- DevTools integration showing:
  - Loaded parquet files
  - Executed queries
  - Props mappings
  - Cache state
- Clear error messages with actionable next steps

---

## Phase 10: Documentation & Cleanup

### 10.1 Code Documentation
- JSDoc comments on all new functions
- Inline comments explaining complex logic
- README updates for new patterns

### 10.2 Remove Old Code
- Remove old single-model-only assumptions
- Clean up unused imports
- Remove deprecated insight patterns

### 10.3 Migration Guide
- Document breaking changes from old pattern
- Provide examples of new insight structure
- Update viewer README with new data flow diagram

---

## Success Criteria

✅ Single-model insights render correctly (backwards compatibility)
✅ Multi-model insights with relations render correctly
✅ Dynamic insights with inputs work interactively
✅ Interactions (filter, split, sort) work correctly
✅ Metrics and dimensions resolve properly
✅ Parquet files cache correctly (no duplicate downloads)
✅ Props mapping works for deeply nested props
✅ Error handling is comprehensive and user-friendly
✅ All tests pass (unit, integration, e2e)
✅ Performance is acceptable (< 2s load time for typical insight)

---

## Implementation Order

1. **Phase 0** - Write this plan to markdown file 📝
2. **Phase 1** - Verify backend is working correctly ⚠️
3. **Phase 2.1-2.2** - Get basic file loading working
4. **Phase 3.1** - Get query execution working
5. **Phase 4.1** - Get props mapping working
6. **Phase 2.3 + 5.3** - Add caching
7. **Phase 5.1** - Update store structure
8. **Phase 6.1-6.2** - Update components
9. **Phases 3.2, 5.2, 7** - Add interactions support
10. **Phase 8** - Comprehensive testing
11. **Phase 9-10** - Polish & documentation

---

## Estimated Effort

- **Backend verification**: 2-4 hours
- **Core data loading**: 8-12 hours
- **Query execution & props mapping**: 6-8 hours
- **Store & component updates**: 6-8 hours
- **Interactions**: 4-6 hours
- **Testing**: 8-12 hours
- **Error handling & polish**: 4-6 hours
- **Documentation**: 2-4 hours

**Total**: 40-60 hours of focused development

---

## Key Architectural Insights from Analysis

### Backend Architecture
The backend generates insight metadata with this structure:
```json
{
  "name": "insight_name",
  "files": [
    {"name_hash": "m...", "signed_data_file_url": "/path/to/file.parquet"}
  ],
  "query": "WITH m123 AS (...) SELECT ... FROM m123",
  "props_mapping": {
    "props.x": "column_alias_1",
    "props.y": "column_alias_2"
  }
}
```

### Query Structure
- **Non-dynamic insights**: `pre_query` runs on backend, writes parquet, `post_query` = `SELECT * FROM 'insight_hash.parquet'`
- **Dynamic insights**: No `pre_query`, models run separately, `post_query` contains full SQL with CTEs referencing model parquet files

### Multi-Model Pattern
- Each model's data is in a separate parquet file named by `model.name_hash()`
- CTEs in `post_query` reference these files: `WITH m123abc AS (SELECT * FROM 'm123abc.parquet')`
- Relations automatically generate JOIN logic via RelationGraph
- FieldResolver resolves all `${ref(model).field}` references to qualified column names

### Dynamic vs Non-Dynamic
- **Dynamic**: Has inputs or interactions → `post_query` runs in browser DuckDB
- **Non-Dynamic**: No inputs → `pre_query` runs on backend, simple file read in browser
- Both patterns must work seamlessly in the viewer
