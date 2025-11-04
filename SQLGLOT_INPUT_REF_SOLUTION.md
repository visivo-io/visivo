# SQLGlot Input Reference Handling - Analysis & Solution

## Problem Statement

SQLGlot is misinterpreting `${input_name}` syntax in dynamic insight queries, converting it to PostgreSQL composite type format `{'_0': "table"."input_name"}` instead of preserving it as a template literal for frontend interpolation.

**Example:**
- **Input**: `CASE WHEN amount > ${threshold} THEN 'green' ELSE 'red' END`
- **Expected**: `CASE WHEN amount > ${threshold} THEN 'green' ELSE 'red' END`
- **Actual**: `CASE WHEN amount > {'_0': "table"."threshold"} THEN 'green' ELSE 'red' END`

## Root Cause Analysis

Based on the debug trace, the corruption happens in `_build_main_query()`:

1. ✅ **After `get_all_query_statements()`**: `${threshold}` (correct)
2. ✅ **After `FieldResolver.resolve()`**: `${threshold}` (still correct)
3. ❌ **After `_build_main_query()` SQLGlot parsing**: `{'_0': "table"."threshold"}` (CORRUPTED)

The issue: SQLGlot's parser sees `${}` and interprets it as PostgreSQL syntax (dollar-quoted strings or composite types).

## Current Attempted Solution (Not Working)

Agent 1 implemented a protection/restoration pattern:
- `_protect_input_refs()`: Replace `${input}` → `__VISIVO_INPUT_input__` before parsing
- `_restore_input_refs()`: Replace `__VISIVO_INPUT_input__` → `${input}` after formatting

**Why it's failing**: The protection is applied at the wrong level. Looking at the code:

```python
def _build_main_select(self):
    # ...
    protected_statement, mapping = self._protect_input_refs(cleaned_statement)
    parsed_expr = parse_expression(protected_statement, native_dialect)
    # ...
```

The `parse_expression()` helper function (in `sqlglot_utils.py`) is what's calling SQLGlot, but the restored SQL goes through ANOTHER round of SQLGlot parsing when building the final AST.

## Solution Options

### Option 1: Skip SQLGlot AST Building for Dynamic Queries ⭐ PREFERRED

**Rationale**: For dynamic insights, the query will run in DuckDB WASM on the frontend. We don't need SQLGlot validation at build time - runtime validation in the browser is sufficient.

**Approach**:
```python
def _build_main_query(self):
    native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
    target_dialect = "duckdb" if self.is_dyanmic else native_dialect

    # FOR DYNAMIC QUERIES: Skip SQLGlot AST building
    if self.is_dyanmic:
        return self._build_dynamic_query_string_directly()

    # FOR NON-DYNAMIC QUERIES: Use SQLGlot AST as before
    # (no input refs to worry about)
    return self._build_static_query_with_sqlglot()
```

**Implementation**:

1. **Create `_build_dynamic_query_string_directly()`** method:
   - Manually construct SQL string from resolved statements
   - Use string formatting/templates instead of SQLGlot AST
   - Preserve `${input_name}` patterns as-is
   - Apply dialect transpilation ONLY to model/field references (already resolved)

2. **Keep existing `_build_main_query()` logic for non-dynamic insights**:
   - No inputs, so no `${...}` patterns to worry about
   - SQLGlot AST provides validation and formatting

**Advantages**:
- ✅ Simple - no fighting with SQLGlot parser
- ✅ Fast - skips unnecessary AST building for dynamic queries
- ✅ Safe - frontend DuckDB validates SQL at runtime anyway
- ✅ Clean separation - different code paths for different use cases
- ✅ No risk of breaking non-dynamic queries

**Disadvantages**:
- ⚠️ Less validation at build time for dynamic queries
- ⚠️ Need to manually handle SQL construction (but resolved statements are already valid)

---

### Option 2: Custom SQLGlot Token/Expression Type

**Approach**: Extend SQLGlot to recognize `${input_name}` as a custom token type that shouldn't be parsed.

**Implementation**:
```python
from sqlglot.dialects.dialect import Dialect
from sqlglot import exp, tokens, TokenType

class VisivoDialect(Dialect):
    class Tokenizer(tokens.Tokenizer):
        KEYWORDS = {
            **tokens.Tokenizer.KEYWORDS,
        }

        # Add pattern to recognize ${...} as a special token
        IDENTIFIERS = ['"', "`"]

    class Generator(Dialect.Generator):
        # Custom rendering for input placeholders
        TRANSFORMS = {
            exp.Placeholder: lambda self, e: f"${{{e.name}}}"
        }
```

**Challenges**:
- ❌ Complex - requires deep SQLGlot knowledge
- ❌ Fragile - might break with SQLGlot updates
- ❌ Overkill - we're not using most of SQLGlot's features for dynamic queries
- ❌ Still need to parse expressions with `${...}` which triggers the issue

---

### Option 3: String-Based Placeholder Protection (Fix Current Approach)

**Approach**: Fix the protection/restoration pattern to work at ALL levels of SQLGlot parsing.

**Problem with current implementation**:
The protection happens in individual helper methods (`_build_main_select`, `_build_where_clause`, etc.) but the final AST assembly in `_build_main_query()` triggers ANOTHER parse that re-corrupts the placeholders.

**Better approach**:
```python
def _build_main_query(self):
    # Protect BEFORE any SQLGlot operations
    all_resolved_statements_protected = []
    global_mapping = {}

    for key, stmt in self.resolved_query_statements:
        protected, mapping = self._protect_input_refs(stmt)
        all_resolved_statements_protected.append((key, protected))
        global_mapping.update(mapping)

    # Temporarily swap out resolved statements
    original = self.resolved_query_statements
    self.resolved_query_statements = all_resolved_statements_protected

    # Build AST (all refs now protected)
    query = exp.Select()
    # ... existing AST building code ...
    formatted_sql = query.sql(dialect=target_dialect, pretty=True)

    # Restore original statements
    self.resolved_query_statements = original

    # Restore input refs in final SQL
    return self._restore_input_refs(formatted_sql, global_mapping)
```

**Challenges**:
- ⚠️ Still complex - need to track protection across multiple parsing rounds
- ⚠️ Risk of edge cases - what if placeholder appears in generated SQL accidentally?
- ⚠️ Performance overhead - multiple string replacements

---

## Recommended Solution: Option 1 (Skip SQLGlot for Dynamic Queries)

### Implementation Plan

#### 1. Create `_build_dynamic_query_string_directly()` method

```python
def _build_dynamic_query_string_directly(self):
    """
    Build SQL query string directly for dynamic insights without using SQLGlot AST.

    This avoids SQLGlot parsing issues with ${input_name} template literals.
    The resolved_query_statements already have field references resolved by FieldResolver,
    so we just need to assemble them into a properly formatted SQL string.

    Returns:
        Formatted SQL string with ${input_name} placeholders preserved
    """
    # Collect SELECT expressions (props)
    select_clauses = []
    for key, statement in self.resolved_query_statements:
        if key.startswith("props."):
            select_clauses.append(statement)

    # Collect FROM clause (should use model hash)
    # Dynamic insights always query from registered parquet tables (model hashes)
    if not self.models:
        raise ValueError("Dynamic insight must have at least one model")

    # For dynamic insights with multiple models, we need to handle joins
    # But for now, if there's only one model, just use it
    if len(self.models) == 1:
        from_clause = f'"{self.models[0].name_hash()}"'
    else:
        # TODO: Handle multi-model joins for dynamic insights
        raise NotImplementedError("Multi-model dynamic insights not yet supported")

    # Collect WHERE conditions (non-aggregate filters)
    where_conditions = []
    for key, statement in self.resolved_query_statements:
        if key == "filter":
            # Check if it's non-aggregate (would go in WHERE vs HAVING)
            # For now, include all - we can refine later
            where_conditions.append(statement)

    # Collect GROUP BY expressions
    # Need to extract non-aggregated expressions from SELECT
    # For simplicity, include all prop expressions that don't have aggregates
    group_by_clauses = []
    # TODO: Implement proper GROUP BY detection

    # Collect ORDER BY (sort interactions)
    order_by_clauses = []
    for key, statement in self.resolved_query_statements:
        if key == "sort":
            order_by_clauses.append(statement)

    # Assemble query
    query_parts = ["SELECT"]
    query_parts.append("  " + ",\n  ".join(select_clauses))
    query_parts.append(f"FROM {from_clause}")

    if where_conditions:
        query_parts.append("WHERE")
        query_parts.append("  " + " AND ".join(where_conditions))

    if group_by_clauses:
        query_parts.append("GROUP BY")
        query_parts.append("  " + ", ".join(group_by_clauses))

    if order_by_clauses:
        query_parts.append("ORDER BY")
        query_parts.append("  " + ", ".join(order_by_clauses))

    return "\n".join(query_parts)
```

#### 2. Update `_build_main_query()` to branch on dynamic vs static

```python
def _build_main_query(self):
    """
    Build the main query SQL.

    - For DYNAMIC insights: Build SQL string directly to preserve ${input_name} placeholders
    - For STATIC insights: Use SQLGlot AST for validation and formatting
    """
    native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
    target_dialect = "duckdb" if self.is_dyanmic else native_dialect

    if self.is_dyanmic:
        # Dynamic query: Skip SQLGlot AST to preserve input placeholders
        return self._build_dynamic_query_string_directly()
    else:
        # Static query: Use SQLGlot AST as before
        return self._build_static_query_with_sqlglot(target_dialect)
```

#### 3. Extract current AST logic into `_build_static_query_with_sqlglot()`

```python
def _build_static_query_with_sqlglot(self, target_dialect):
    """
    Build query using SQLGlot AST for non-dynamic insights.

    This provides validation and proper dialect transpilation.
    """
    # All the existing _build_main_query() logic goes here
    ctes = self._build_ctes()
    select_expressions = self._build_main_select()
    from_table, joins = self._build_from_and_joins()
    # ... rest of existing code ...

    return formatted_sql
```

### Testing Strategy

1. **Unit tests** for `_build_dynamic_query_string_directly()`:
   - Test with props containing `${input_name}`
   - Test with interactions containing `${input_name}`
   - Test with multiple inputs in same expression
   - Verify NO `{'_0':` patterns in output
   - Verify `${input_name}` format preserved

2. **Integration tests** (already created by Agent 3):
   - Run existing tests in `test_input_uniform_format.py`
   - All 11 tests should pass after implementation

3. **Regression tests** for non-dynamic insights:
   - Ensure existing non-dynamic insight tests still pass
   - Verify SQLGlot validation still catches errors in static queries

### Migration Notes

- **Breaking change**: None - this is internal implementation
- **Performance**: Faster for dynamic queries (skip AST building)
- **Validation**: Dynamic queries validated at runtime in browser DuckDB
- **Maintainability**: Cleaner separation of concerns

## Conclusion

**Option 1 (Skip SQLGlot for dynamic queries)** is the best solution because:
1. It's pragmatic - we don't need SQLGlot validation for queries that run in browser
2. It's simple - no complex workarounds or SQLGlot extensions
3. It's safe - frontend validates SQL anyway
4. It's maintainable - clear separation between dynamic and static code paths

The protection/restoration approach (Option 3) is fighting SQLGlot's parser at multiple levels and adds unnecessary complexity. Custom SQLGlot dialects (Option 2) are overkill for this use case.

**Next Steps:**
1. Implement `_build_dynamic_query_string_directly()` method
2. Update `_build_main_query()` to branch on `is_dynamic`
3. Run Agent 3's integration tests to verify fix
4. Run full test suite to ensure no regressions
