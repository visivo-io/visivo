# SQLGlot Trace Tokenizer Refactoring Task Plan

## Overview
Refactor the trace tokenizer system to use SQLGlot for SQL parsing and query building, replacing the current regex-based approach and Jinja templating. This will improve correctness, maintainability, and dialect support while keeping all user-facing functionality unchanged.

## Current Implementation Analysis

### Files to Modify/Remove
1. **visivo/query/trace_tokenizer.py** - Main tokenizer that uses regex via StatementClassifier (MODIFY)
2. **visivo/query/statement_classifier.py** - Uses regex patterns to classify statements (MODIFY)
3. **visivo/query/dialect.py** - Maintains hard-coded lists of aggregate functions per dialect (REMOVE)
4. **visivo/query/query_string_factory.py** - Uses Jinja2 template to build final SQL (MODIFY)
5. **visivo/templates/queries/default_trace.sql** - Jinja template for SQL generation (REMOVE)
6. **visivo/models/tokenized_trace.py** - Model that holds tokenized trace data (may need updates)

### Current Flow
1. TraceTokenizer parses trace properties and extracts query statements
2. StatementClassifier uses regex to identify aggregate functions and window functions
3. Non-aggregate statements are collected for GROUP BY clause
4. Filters are classified as WHERE (vanilla) or HAVING (aggregate) or QUALIFY (window)
5. QueryStringFactory uses Jinja template to assemble final SQL with CTEs

## Implementation Tasks

### Phase 1: Setup and Foundation
1. **Add SQLGlot dependency**
   - Add `sqlglot = "^25.32.0"` to pyproject.toml
   - Run `poetry add sqlglot`

2. **Create SQLGlot utilities module** (`visivo/query/sqlglot_utils.py`)
   - Helper functions for AST analysis
   - Aggregate detection using AST traversal
   - Column reference extraction
   - Expression type classification

### Phase 2: Core Refactoring

3. **Refactor trace_tokenizer.py**
   - Parse trace statements using `sqlglot.parse_one()` with source dialect
   - Use AST to validate statement types (SELECT vs filter expression)
   - Implement AST-based aggregate detection instead of regex
   - Extract non-aggregated columns by finding all column references and checking parent nodes
   - Maintain backward compatibility with existing TokenizedTrace output

4. **Replace statement_classifier.py**
   - Create new AST-based classifier using SQLGlot
   - Parse statements and traverse AST to find aggregate/window functions
   - Use `expr.find_all(sqlglot.exp.AggFunc)` for aggregate detection
   - Use `expr.find(sqlglot.exp.Window)` for window function detection
   - Return same StatementEnum values for compatibility

5. **Remove dialect.py entirely**
   - SQLGlot has built-in support for all dialects and their aggregate functions
   - No longer needed since SQLGlot handles dialect-specific parsing internally
   - Update imports in trace_tokenizer.py to remove Dialect dependency

### Phase 3: Query Building

6. **Replace query_string_factory.py**
   - Use SQLGlot's builder API instead of Jinja template
   - Build query using `sqlglot.select()` fluent interface
   - Construct CTEs programmatically using SQLGlot AST
   - Generate dialect-specific SQL using `.sql(dialect=target)`
   - Ensure proper quoting and escaping handled by SQLGlot

7. **Remove Jinja template**
   - Delete `visivo/templates/queries/default_trace.sql`
   - Remove Jinja2 dependency from query building (keep for other uses)

### Phase 4: Testing and Validation

8. **Update and run tests**
   - Ensure all existing tests in `test_trace_tokenizer.py` pass
   - Ensure all existing tests in `test_statement_classifier.py` pass
   - Add new tests for edge cases SQLGlot might handle differently
   - Test dialect-specific SQL generation

### Phase 5: Cleanup and Documentation

9. **Code cleanup**
    - Remove unused regex patterns from dialect.py
    - Clean up imports and dead code
    - Run black formatter on modified files


## Key Implementation Details

### AST-Based Aggregate Detection
```python
def find_non_aggregated_columns(expr, dialect):
    """Find all column references that are not inside aggregate functions"""
    columns = []
    for column in expr.find_all(sqlglot.exp.Column):
        # Check if any parent is an aggregate function
        is_aggregated = False
        parent = column.parent
        while parent:
            if isinstance(parent, sqlglot.exp.AggFunc):
                is_aggregated = True
                break
            parent = parent.parent
        if not is_aggregated:
            columns.append(column)
    return columns
```

### Query Building with SQLGlot
```python
def build_trace_query(tokenized_trace):
    """Build SQL query using SQLGlot instead of Jinja"""
    # Build base CTE
    base_cte = sqlglot.parse_one(tokenized_trace.sql)
    
    # Build main query
    query = (
        sqlglot.select(*select_expressions)
        .from_("columnize_cohort_on")
        .where(*where_conditions)
        .group_by(*group_by_expressions)
        .having(*having_conditions)
        .order_by(*order_by_expressions)
    )
    
    # Add CTEs
    query = query.with_("base_query", base_cte)
    query = query.with_("columnize_cohort_on", cohort_cte)
    
    # Generate SQL for target dialect
    return query.sql(dialect=tokenized_trace.source_type)
```

### Dialect Mapping
```python
VISIVO_TO_SQLGLOT_DIALECT = {
    "postgresql": "postgres",
    "mysql": "mysql", 
    "snowflake": "snowflake",
    "bigquery": "bigquery",
    "sqlite": "sqlite",
    "duckdb": "duckdb"
}
```

## Success Criteria

1. **No functional changes** - All existing traces generate semantically equivalent SQL
2. **All tests pass** - Both unit and integration tests
3. **Improved correctness** - Better handling of edge cases and complex expressions
4. **Better error messages** - SQLGlot provides detailed parse errors
5. **Cleaner code** - Remove regex patterns and Jinja templates
6. **Dialect support** - Easier to add new dialects via SQLGlot

## Risk Mitigation

1. **SQL formatting differences** - Generated SQL may have different formatting but must be semantically identical
2. **Performance** - SQLGlot parsing might be slower than regex for simple cases, but more reliable
3. **Edge cases** - Some regex patterns might match things SQLGlot doesn't recognize as valid SQL
4. **Dialect differences** - Ensure all currently supported dialects work with SQLGlot

## Testing Strategy

1. **Unit tests** - All existing tests must pass
2. **Integration tests** - Run full pipeline with test projects
3. **Regression tests** - Compare generated SQL for differences
4. **Edge case tests** - Complex expressions, nested functions, CTEs
5. **Performance tests** - Measure tokenization time for various trace complexities

## Rollback Plan

If issues arise:
1. Keep old implementation files temporarily renamed with `.old` suffix
2. Can quickly revert by restoring original files
3. Feature flag option to switch between implementations if needed

## Timeline Estimate

- Phase 1: 1 hour (setup and dependencies)
- Phase 2: 3-4 hours (core refactoring)
- Phase 3: 2-3 hours (query building)
- Phase 4: 2-3 hours (testing and validation)
- Phase 5: 1 hour (cleanup)

**Total: 9-12 hours of focused development**

## Notes

- SQLGlot version 25.32.0+ recommended for latest dialect support
- Consider using `sqlglot.optimizer.qualify` for advanced column resolution in future
- Potential future enhancement: Use SQLGlot's optimizer to simplify/optimize generated queries
- Keep TokenizedTrace model unchanged to maintain backward compatibility