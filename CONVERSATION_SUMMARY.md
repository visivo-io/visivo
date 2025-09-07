# Conversation Summary: CI/CD Fixes to Column-Level Lineage Vision

## Overview
This conversation evolved from fixing immediate CI/CD integration test failures to designing a comprehensive column-level lineage system for Visivo. The journey included solving dialect-specific SQL generation issues, implementing cross-model dimension resolution, and ultimately envisioning a unified expression resolution architecture with complete field-level lineage tracking.

## Phase 1: Initial CI/CD Fixes

### Snowflake Integration Test Failure
**Problem**: `AttributeError: 'str' object has no attribute 'name'` in SQLGlot query builder
**Root Cause**: Passing `exp.Table(this=string)` objects to SQLGlot instead of strings
**Solution**: Removed the Table wrapper and passed strings directly to SQLGlot

### BigQuery Field Name Issues
**Problem**: BigQuery doesn't allow dots in field names/aliases
**User Feedback**: "Rather than underscore to dot let's stick with the old pipe to dot"
**Solution**: Implemented `_sanitize_alias()` method to replace dots with pipes (`|`)

### Snowflake ORDER BY Issues
**Problem**: ORDER BY referencing base columns instead of aliases when GROUP BY is present
**Solution**: Updated `_add_order_by()` logic to use aliases when GROUP BY is present

## Phase 2: SQLGlot Qualify Integration

### Implementation of Schema Building
Created `_build_schema_from_dimensions()` to:
- Build schema dictionary from model dimensions (explicit and implicit)
- Strip quotes from dimension names for SQLGlot compatibility
- Support cross-model dimension references

### SQLGlot Optimizer Integration
```python
# Added SQLGlot qualify for proper identifier quoting
if schema:
    try:
        ast = optimizer.qualify(ast, schema=schema, dialect=self.dialect)
    except Exception as e:
        Logger.instance().debug(f"Failed to qualify query: {e}")
```

## Phase 3: Cross-Model Dimension Resolution

### Created DimensionResolver
Parallel to MetricResolver, supports:
- Project-level dimensions
- Model-level dimensions (explicit and implicit)
- Cross-model dimension references via `${ref(model).dimension}`
- Nested dimension composition

### Key Features Implemented
1. Dimension priority: Project > Model Explicit > Model Implicit
2. Support for `${ref(model).dimension}` and `${ref(dimension)}` patterns
3. Model extraction from dimension expressions
4. Recursive resolution of nested dimension references

### Status of Global/Project-Level Dimensions
**Implementation Status**: PARTIALLY COMPLETE
- ✅ Created `DimensionResolver` class with full resolution logic
- ✅ Added support in resolver for project-level dimensions
- ✅ Created comprehensive test suite in `test_project_level_dimensions.py`
- ⚠️ **NOT INTEGRATED** into `TraceTokenizer` or query building pipeline
- ⚠️ **NOT CONNECTED** to actual trace execution
- ❌ Project dimensions not yet resolved in `${ref()}` patterns during trace tokenization

**What Still Needs to Be Done**:
1. **Integrate DimensionResolver into TraceTokenizer**
   - Add dimension resolution alongside metric resolution
   - Handle `${ref(dimension_name)}` patterns in trace expressions
   - Track referenced models from dimension usage

2. **Update QueryStringFactory/SqlglotQueryBuilder**
   - Use resolved dimension expressions in SELECT statements
   - Handle dimension references in WHERE/GROUP BY/ORDER BY

3. **Connect to Model Execution**
   - Ensure dimensions are available in model context
   - Support both project and model-scoped dimensions

**Current State**: The resolver exists and has tests, but it's not wired into the actual execution pipeline. Users can define project-level dimensions in YAML, but they won't be resolved during trace execution yet.

## Phase 4: Architecture Discussion

### Unified Resolution Question
**User**: "I'm wondering if we really need to have different metric and dimension resolvers?"
**Insight**: Both resolvers share similar patterns - they resolve expressions to SQL

### Agreed Architecture Decision
**Decision**: Create a common `FieldResolver` base class that both `MetricResolver` and `DimensionResolver` inherit from

**FieldResolver Base Class Should Include**:
- Common expression resolution logic
- Shared caching mechanism
- DAG traversal for dependencies
- Model reference extraction
- Nested reference resolution

**Subclass Responsibilities**:
- `MetricResolver`: Handle aggregation validation, metric-specific SQL patterns
- `DimensionResolver`: Handle dimension priority (project > explicit > implicit), non-aggregate validation

### Benefits of Inheritance Approach
- Eliminates code duplication between resolvers
- Centralizes common patterns (caching, DAG traversal, reference parsing)
- Maintains type-specific validation in subclasses
- Easier to extend for future expression types
- Single place to fix bugs in resolution logic

## Phase 5: Column-Level Lineage Vision

### Complete Field-Level Tracking
**User Vision**: Track data flow from source to visualization:
```
warehouse.schema.table.column → model.field → dimension → metric → trace.property
```

### Key Design Decisions

1. **Smart Introspection**
   - Only introspect tables referenced in project
   - 80% reduction in introspection time
   - Project-scoped caching in `.visivo/schema_cache/`

2. **Extended ProjectDag**
   - Add field-level nodes alongside object-level
   - Track field transformations and dependencies
   - Support lineage queries in both directions

3. **100% Backward Compatibility**
   - All changes are additive
   - No migration required
   - Existing projects work unchanged
   - New features opt-in via API usage

## Technical Implementation Summary

### Files Modified

1. **visivo/query/sqlglot_query_builder.py**
   - Added `_sanitize_alias()` for pipe delimiter conversion
   - Implemented `_build_schema_from_dimensions()`
   - Integrated SQLGlot qualify with error handling
   - Fixed ORDER BY logic for grouped queries

2. **visivo/query/dimension_resolver.py** (NEW)
   - Complete dimension resolution system
   - Support for all dimension scopes
   - Cross-model reference resolution
   - Model extraction from expressions

3. **tests/query/test_project_level_dimensions.py** (NEW)
   - Comprehensive test coverage for dimension features
   - Cross-model dimension tests
   - Nested composition tests
   - Priority/override tests

### Key Code Patterns

```python
# Alias sanitization for BigQuery
def _sanitize_alias(self, alias: str) -> str:
    return alias.replace(".", "|")

# Dimension resolution with model context
def resolve_dimension_expression(self, dimension_name: str, 
                                current_model: Optional[str] = None) -> str:
    # Check cache, find dimension, resolve nested refs
    
# Smart introspection
def get_required_tables(self) -> Dict[str, Set[str]]:
    # Parse SQL with SQLGlot to extract only referenced tables
```

## Outcomes and Next Steps

### Immediate Fixes (Completed)
✅ Fixed Snowflake SQLGlot errors
✅ Fixed BigQuery field name issues with pipe delimiters
✅ Fixed Snowflake ORDER BY with GROUP BY
✅ Added SQLGlot qualify for proper quoting
⚠️ Partially implemented cross-model dimension resolution (resolver created but not integrated)

### Architecture Improvements (Designed)
📋 Unified expression resolver architecture
📋 Extended ProjectDag with field-level tracking
📋 Smart introspection system
📋 Project-scoped caching strategy
📋 Complete lineage API

### PRD Created
A comprehensive PRD for column-level lineage was created with:
- 100% backward compatibility requirement
- Project-scoped caching in output_dir
- No cross-project features
- Phase 5 marked as out of scope
- Complete implementation plan with 4 phases

## What Remains To Be Implemented

### 1. FieldResolver Base Class Refactoring
Create a common base class to eliminate duplication:

```python
# visivo/query/field_resolver.py (NEW)
class FieldResolver:
    """Base class for all expression resolvers."""
    def __init__(self, project: Project):
        self.project = project
        self.dag = project.dag()
        self._cache = {}
    
    def _extract_references(self, expression: str) -> List[str]:
        # Common reference extraction logic
    
    def _resolve_nested_references(self, expression: str) -> str:
        # Common nested resolution logic
    
    def _get_models_from_expression(self, expression: str) -> Set[str]:
        # Common model extraction logic

# Update existing resolvers to inherit
class MetricResolver(FieldResolver):
    # Keep metric-specific logic only
    
class DimensionResolver(FieldResolver):
    # Keep dimension-specific logic only
```

### 2. Global/Project-Level Dimensions Integration
To complete the global dimension feature, the following steps are needed:

1. **Wire DimensionResolver into TraceTokenizer** (`visivo/query/trace_tokenizer.py`)
   ```python
   # Add to TraceTokenizer.__init__
   self.dimension_resolver = DimensionResolver(project)
   
   # Add dimension resolution in tokenize method
   # Handle ${ref(dimension_name)} patterns
   ```

2. **Update trace execution to use resolved dimensions**
   - Modify `QueryStringFactory` or `SqlglotQueryBuilder` to incorporate resolved dimensions
   - Ensure dimension expressions are properly substituted in SQL

3. **Test end-to-end with actual project**
   - Run integration tests with project-level dimensions
   - Verify cross-model dimension references work in practice

### Why This Matters
Without completing the integration, users can define project-level dimensions in their YAML files, but they won't actually be resolved and used during query execution. The foundation is built, but the wiring is incomplete.

## Key Takeaways

1. **Evolution of Requirements**: Started with tactical fixes, evolved to strategic architecture
2. **Backward Compatibility**: Critical requirement - all changes must be additive
3. **Performance Focus**: Smart introspection and caching are essential for scale
4. **Unified Architecture**: Consolidating similar resolvers reduces complexity
5. **Field-Level Vision**: Complete lineage tracking enables governance and optimization
6. **Incomplete Integration**: DimensionResolver exists but needs to be wired into execution pipeline

This conversation demonstrated the progression from fixing immediate issues to designing long-term architectural improvements, always with a focus on maintaining backward compatibility and enhancing user value. The global dimension feature remains partially complete, with the resolver built but not yet integrated into the trace execution flow.