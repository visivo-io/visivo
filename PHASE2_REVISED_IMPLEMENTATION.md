# Phase 2 Revised Implementation Plan: SQLGlot-First Architecture

## Executive Summary

After reviewing the recent refactoring to use SQLGlot for query building and the current Phase 2 implementation, we need to fundamentally rethink our approach. The key insight is that **we should build queries entirely using SQLGlot AST manipulation**, not string templates or post-hoc SQL modification.

## Key Architectural Principles

### 1. Context Resolution First, SQL Parsing Second
- **Resolve ALL ${ref()} patterns BEFORE SQL parsing**
- Metric references, model.field references, and dimensions all resolved to SQL text first
- Then parse the resolved SQL with SQLGlot for further manipulation

### 2. SQLGlot AST-Based Query Construction
- **Abandon Jinja templates** for query construction
- Build queries by constructing SQLGlot AST nodes directly
- Use SQLGlot's dialect-specific SQL generation for output

### 3. DAG-Driven Dependencies
- **Use ProjectDag for all dependency tracking**, not SQL parsing
- Metrics, dimensions, models, and relations are all DAG nodes with explicit edges
- Never use regex to extract dependencies from SQL

### 4. Incremental Query Building
- Start with the base model's SQL as a CTE
- Add CTEs for each referenced model
- Build final SELECT with JOINs using SQLGlot's expression builder

## Current State Analysis

### What's Working Well
1. **TraceTokenizer** correctly:
   - Resolves metric references to SQL expressions
   - Tracks referenced_models for cross-model support
   - Uses MetricResolver with ProjectDag integration
   
2. **MetricResolver** successfully:
   - Leverages ProjectDag for dependency tracking
   - Handles metric composition (metrics referencing metrics)
   - Detects circular dependencies

3. **RelationGraph** provides:
   - Join path discovery between models
   - Ambiguity detection
   - NetworkX-based graph algorithms

### What Needs Revision
1. **QueryStringFactory** still uses Jinja templates - needs SQLGlot rewrite
2. **MultiModelQueryBuilder** modifies SQL after parsing - should build from scratch probably shouldnt even exist. Might make more sense to move this logic into a single unified query builder
3. **Template-based approach** limits flexibility and dialect handling

## Revised Phase 2 Architecture

### Component 1: SQLGlot Query Builder (Replace QueryStringFactory)

```python
class SqlglotQueryBuilder:
    """Build queries using SQLGlot AST construction instead of templates."""
    
    def __init__(self, tokenized_trace: TokenizedTrace, project: Project):
        self.tokenized_trace = tokenized_trace
        self.project = project
        self.dialect = self._get_dialect(tokenized_trace.source_type)
        
    def build(self) -> str:
        """Build the complete query using SQLGlot expressions."""
        # 1. Create base CTE from model SQL
        base_cte = self._build_base_cte()
        
        # 2. Add CTEs for referenced models if needed
        model_ctes = self._build_model_ctes()
        
        # 3. Build main SELECT with JOINs if needed
        main_select = self._build_main_select(base_cte, model_ctes)
        
        # 4. Add WHERE/GROUP BY/HAVING/ORDER BY
        query = self._add_query_clauses(main_select)
        
        # 5. Generate SQL for specific dialect
        return query.sql(dialect=self.dialect, pretty=True)
```

### Component 2: Enhanced TraceTokenizer Integration

```python
class TraceTokenizer:
    def tokenize(self):
        # Existing metric resolution...
        
        # NEW: Build query with SQLGlot if cross-model
        if self.referenced_models:
            # Don't just track models - build the actual query structure
            self.query_structure = self._prepare_query_structure()
            data.update({"query_structure": self.query_structure})
        
        return TokenizedTrace(**data)
    
    def _prepare_query_structure(self):
        """Prepare structured data for SQLGlot query building."""
        return {
            "primary_model": self.model.name,
            "primary_sql": self.model.sql,
            "referenced_models": list(self.referenced_models),
            "model_sqls": self._get_model_sqls(),  # Get SQL for each model
            "join_paths": self._resolve_join_paths(),  # Use RelationGraph
            "field_mappings": self._map_fields_to_models()  # Track which fields come from which model
        }
```

### Component 3: Simplified Multi-Model Query Flow

Instead of modifying existing SQL, build the query from scratch:

```python
def build_multi_model_query(tokenized_trace: TokenizedTrace) -> str:
    """Build a multi-model query entirely with SQLGlot."""
    
    if not tokenized_trace.query_structure:
        # Single model - use simpler path
        return build_single_model_query(tokenized_trace)
    
    # Multi-model query construction
    builder = exp.Query()
    
    # 1. WITH clause for each model
    with_clause = []
    for model_name, model_sql in tokenized_trace.query_structure["model_sqls"].items():
        cte = exp.CTE(
            this=exp.TableAlias(
                this=exp.Table(this=model_name),
                alias=f"{model_name}_base"
            ),
            expression=sqlglot.parse_one(model_sql)
        )
        with_clause.append(cte)
    
    # 2. Main SELECT with JOINs
    select = build_select_with_joins(
        tokenized_trace.select_items,
        tokenized_trace.query_structure["join_paths"]
    )
    
    # 3. Add WHERE, GROUP BY, etc.
    query = apply_query_modifiers(select, tokenized_trace)
    
    return query.sql(dialect=tokenized_trace.source_type)
```

## Implementation Phases

### Phase 2A: SQLGlot Query Builder Foundation (Week 1)
1. **Create SqlglotQueryBuilder class**
   - Replace QueryStringFactory gradually
   - Start with single-model queries
   - Ensure all tests pass with new builder

2. **Implement CTE construction**
   - Build CTEs from model SQL
   - Handle cohort_on as a CTE layer
   - Manage dialect-specific quoting

3. **Test with existing single-model metrics**
   - Ensure no regression
   - Validate SQL output matches expected

### Phase 2B: Multi-Model Query Support (Week 2)
1. **Enhance TraceTokenizer**
   - Build query_structure for multi-model cases
   - Map fields to their source models
   - Integrate with RelationGraph for join resolution

2. **Implement JOIN generation**
   - Use RelationGraph to find join paths
   - Build JOIN expressions with SQLGlot
   - Handle different join types (INNER, LEFT, etc.)

3. **Handle GROUP BY complexity**
   - Detect aggregates vs non-aggregates
   - Add necessary fields to GROUP BY
   - Manage multi-model grouping

### Phase 2C: Cross-Model Metrics (Week 3)
1. **Extend metric resolution**
   - Allow metrics to reference fields from multiple models
   - Validate that required relations exist
   - Generate appropriate JOINs automatically

2. **Implement relation preferences**
   - Allow traces to specify preferred relations
   - Handle ambiguous join paths
   - Provide clear error messages

3. **Test complex scenarios**
   - Metrics referencing multiple models
   - Chained metric compositions
   - Mixed aggregation levels

### Phase 2D: Polish and Optimization (Week 4)
1. **Performance optimization (only if needed, skip if complexity is not worth changes)**
   - Use subqueries where appropriate
   - Optimize JOIN ordering
   - Cache resolved metrics

2. **Error handling**
   - Clear messages for missing relations
   - Helpful hints for ambiguous paths
   - Validate field existence across models

3. **Documentation and testing**
   - Update all documentation
   - Comprehensive integration tests
   - Performance benchmarks

## Key Differences from Original Plan

### 1. Query Building Approach
- **Original**: Modify existing SQL after parsing
- **Revised**: Build queries from scratch with SQLGlot AST

### 2. Template Usage
- **Original**: Keep Jinja templates, enhance them
- **Revised**: Replace templates with SQLGlot expression building

### 3. Integration Point
- **Original**: MultiModelQueryBuilder as separate component
- **Revised**: Integrated query building in TraceTokenizer → SqlglotQueryBuilder flow

### 4. Complexity Management
- **Original**: Handle all cases in one complex template
- **Revised**: Separate single-model and multi-model paths for clarity

## Success Criteria

1. **All existing tests pass** with new query builder
2. **Cross-model metrics work** seamlessly in traces
3. **SQL generation is dialect-aware** through SQLGlot
4. **Performance is maintained or improved**
5. **Error messages are clear and actionable**

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
- **Mitigation**: Implement behind feature flag initially
- **Testing**: Run parallel query generation and compare outputs
- **Rollback**: Keep QueryStringFactory until SqlglotQueryBuilder is proven

### Risk 2: SQLGlot Limitations
- **Mitigation**: Identify limitations early through prototyping
- **Workaround**: Fall back to direct SQL for unsupported features
- **Contribution**: Consider contributing to SQLGlot for missing features

### Risk 3: Performance Degradation
- **Mitigation**: Benchmark query generation time
- **Optimization**: Cache parsed SQL and reuse AST nodes
- **Monitoring**: Add metrics for query build time

## Conclusion

This revised approach leverages SQLGlot's full capabilities to build queries programmatically rather than through string manipulation. By constructing queries using AST nodes, we gain:

1. **Type safety** and validation at build time
2. **Dialect-specific handling** built-in
3. **Cleaner code** without complex string templates
4. **Better testability** through unit testing of AST construction

The key insight is that **SQLGlot should be our primary tool for query construction**, not just for parsing and validation. This aligns with the recent refactoring direction and provides a more robust foundation for the semantic layer.