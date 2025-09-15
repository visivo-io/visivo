# Source Schema Building Implementation Plan

## Overview
This plan implements a new job system for building SQLGlot schemas from data sources, replacing the current simple connection testing with comprehensive schema extraction and storage.

## Current State Analysis

### Existing Architecture
1. **Source Base Class** (`visivo/models/sources/source.py`):
   - `BaseSource` has abstract `get_schema()` method signature already added
   - `SqlalchemySource` provides connection management and introspection capabilities
   - Currently has `introspect()` method for server-side metadata discovery

2. **Job System** (`visivo/jobs/`):
   - DAG-based execution with `DagRunner`
   - Jobs follow pattern: `action()` function + `job()` factory function
   - Current `run_source_connection_job.py` does simple "SELECT 1" testing
   - Trace jobs store data using `Aggregator.aggregate_data_frame()`

3. **Data Storage Pattern**:
   - Trace data stored in `{output_dir}/traces/{trace_name}/data.json`
   - Uses `Aggregator` class for JSON serialization and storage

## Implementation Plan

### Phase 1: Implement Schema Building Methods

#### 1.1 Enhance Base Source Class
**File**: `visivo/models/sources/source.py`
- Implement `get_schema()` method in `BaseSource` to build SQLGlot schema
- Method signature: `get_schema(self, table_names: List[str] = None) -> Dict[str, Any]`
- Return format: SQLGlot-compatible schema dictionary

#### 1.2 Implement SQLAlchemy Source Schema Building
**File**: `visivo/models/sources/sqlalchemy_source.py`
- Override `get_schema()` in `SqlalchemySource`
- Use existing `introspect()` foundation but format for SQLGlot
- Convert SQLAlchemy column types to SQLGlot DataTypes
- Handle optional table filtering via `table_names` parameter

#### 1.3 Implement Non-SQLAlchemy Source Schema Building
**Files**: `visivo/models/sources/csv_source.py`, `visivo/models/sources/excel_source.py`
- Override `get_schema()` for file-based sources
- Infer schema from file headers and sample data
- Return SQLGlot-compatible format

### Phase 2: Create Schema Storage System

#### 2.1 Create Schema Aggregator
**File**: `visivo/query/schema_aggregator.py` (new)
- Similar to existing `Aggregator` but for schema data
- Handle SQLGlot schema serialization to JSON
- Store schema in `{output_dir}/schemas/{source_name}/schema.json`

#### 2.2 Schema Storage Structure
```json
{
  "source_name": "example_source",
  "source_type": "postgresql",
  "generated_at": "2025-01-15T10:30:00Z",
  "tables": {
    "schema.table_name": {
      "columns": {
        "column_name": {
          "type": "VARCHAR(255)",
          "nullable": true,
          "sqlglot_type": "DataType.Type.VARCHAR"
        }
      }
    }
  },
  "sqlglot_schema": {
    // SQLGlot MappingSchema serialized format
  }
}
```

### Phase 3: Implement Schema Building Job

#### 3.1 Create Schema Building Job
**File**: `visivo/jobs/run_source_schema_job.py` (new)
- Follow same pattern as `run_trace_job.py`
- Action function calls `source.get_schema()`
- Store result using new `SchemaAggregator`
- Handle errors gracefully with detailed messages

#### 3.2 Job Structure
```python
def action(source_to_build, table_names=None, output_dir=None):
    # Get schema from source
    # Store using SchemaAggregator
    # Return JobResult

def job(source, table_names=None, output_dir=None):
    # Create Job instance
```

### Phase 4: Integrate with DAG Runner

#### 4.1 Update DAG Runner
**File**: `visivo/jobs/dag_runner.py`
- Replace `source_connection_job` import with `source_schema_job`
- Update `create_jobs_from_item()` method for Source instances
- Maintain same job lifecycle and error handling

#### 4.2 Update Job Routing
- Change line 144: `return source_schema_job(source=item, output_dir=self.output_dir)`
- Ensure backward compatibility during transition

### Phase 5: SQLGlot Integration Preparation

#### 5.1 SQLGlot Dependencies
**File**: `pyproject.toml`
- Ensure SQLGlot is available (likely already present)
- Verify version compatibility

#### 5.2 Type Mapping System
**File**: `visivo/query/sqlglot_type_mapper.py` (new)
- Map database-specific types to SQLGlot DataTypes
- Handle dialect-specific type conversions
- Support for complex types (JSON, ARRAY, etc.)

### Phase 6: Testing and Validation

#### 6.1 Unit Tests
- Test schema building for each source type
- Test SQLGlot schema format output
- Test job execution and error handling

#### 6.2 Integration Tests
- Test full DAG execution with schema jobs
- Verify schema storage format
- Test with various database configurations

## Implementation Order

1. **Schema Type Mapper** - Foundation for type conversions
2. **Schema Aggregator** - Data storage mechanism
3. **Base Source get_schema()** - Core abstract implementation
4. **SQLAlchemy Source get_schema()** - Primary database source implementation
5. **File Source get_schema()** - CSV/Excel implementations
6. **Schema Building Job** - Job system integration
7. **DAG Runner Integration** - Replace connection job
8. **Testing and Validation** - Comprehensive testing

## Migration Strategy

### Backward Compatibility
- Keep existing `introspect()` method for server functionality
- New schema building is CLI-only (no server introspection)
- Gradual rollout: schema job runs alongside connection job initially

### Rollout Plan
1. Implement schema building with feature flag
2. Test with subset of source types
3. Full replacement of connection job
4. Remove old connection job code

## Success Criteria

1. ✅ All source types can build SQLGlot-compatible schemas
2. ✅ Schema data stored in consistent JSON format
3. ✅ Job system correctly executes schema building in DAG
4. ✅ Performance acceptable for large databases
5. ✅ Error handling provides useful feedback
6. ✅ Foundation ready for future SQLGlot query optimization

## Future Enhancements

### Schema Caching
- Cache schemas to avoid repeated introspection
- Invalidation strategy for schema changes
- Performance optimization for large sources

### Incremental Schema Updates
- Only update changed tables
- Schema versioning and diff detection
- Minimal impact on execution time

### Advanced SQLGlot Integration
- Query optimization using built schemas
- Type inference for SELECT * queries
- Cross-database query planning

## Risk Assessment

### High Risk
- **Database Performance**: Large databases may have slow introspection
- **Type Mapping**: Complex database types may not map cleanly to SQLGlot

### Medium Risk
- **Memory Usage**: Large schemas may consume significant memory
- **Error Handling**: Database connection issues during schema building

### Low Risk
- **Job Integration**: Similar to existing trace job pattern
- **Storage Format**: JSON serialization is well-understood

## Dependencies

### External Libraries
- `sqlglot` - Core schema representation
- `sqlalchemy` - Database introspection (existing)
- `pandas`/`polars` - File schema inference (existing)

### Internal Components
- Existing job system and DAG runner
- Source connection management
- Logger and error handling systems

## Timeline Estimate

- **Phase 1-2**: Schema building methods and storage (3-4 days)
- **Phase 3-4**: Job system integration (1-2 days)
- **Phase 5-6**: Testing and validation (1-2 days)
- **Total**: 5-8 days for complete implementation

This plan provides a comprehensive roadmap for implementing SQLGlot schema building while maintaining system stability and following established patterns in the Visivo codebase.