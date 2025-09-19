# TraceTokenizer Analysis and Insights Requirements

## Current TraceTokenizer Analysis

### Core Functionality
The `TraceTokenizer` class in `visivo/query/trace_tokenizer.py` performs the following key functions:

1. **Initialization** (`__init__`):
   - Takes `trace`, `model`, and `source` as inputs
   - Creates `Dialect` and `StatementClassifier` instances
   - Initializes and populates data structures for query building

2. **Main Processing Methods**:
   - `_set_select_items()`: Recursively traverses trace props/columns to extract SQL expressions
   - `_set_order_by()`: Processes order_by clauses 
   - `_set_groupby()`: Analyzes queries to determine GROUP BY requirements
   - `_set_filter()`: Categorizes filters into vanilla, aggregate, and window types
   - `_get_cohort_on()`: Handles cohort splitting logic with special Redshift casting

3. **Output**: Returns `TokenizedTrace` with:
   - `sql`: Base model SQL
   - `cohort_on`: Column/expression for splitting data
   - `select_items`: Dictionary mapping prop paths to SQL expressions
   - `groupby_statements`: Required GROUP BY clauses
   - `order_by`: ORDER BY clauses
   - `filter_by`: Categorized WHERE/HAVING/QUALIFY filters
   - `source`/`source_type`: Source metadata

### Data Flow
1. Trace -> TraceTokenizer -> TokenizedTrace
2. TokenizedTrace -> QueryStringFactory -> Final SQL query
3. SQL executed -> Raw data -> Aggregator -> Cohort-based JSON structure

### Current Aggregation Structure
The `Aggregator` class produces nested JSON with cohort-based structure:
```json
{
  "cohort_name": {
    "props.x": [1, 2, 3],
    "props.y": [4, 5, 6]
  }
}
```

## Query Splitting Requirements for Insights

### Pre vs Post Query Analysis

Based on the PRD discussion, we need to split insight processing into:

1. **Pre-Query (Server-side)**: 
   - Base model SQL execution
   - Data aggregation that can't be done client-side
   - Heavy computational operations

2. **Post-Query (Client-side)**:
   - Filtering based on input values
   - Splitting data into multiple traces  
   - Sorting operations
   - Light transformations

### Key Differences from Current System

#### 1. Flat Data Structure
**Current (Traces)**: Nested cohort-based structure
**New (Insights)**: Flat JSON structure
```json
{
  "props.x": [1, 2, 3],
  "props.y": [4, 5, 6],
  "region": ["North", "South", "North"],
  "category": ["A", "A", "B"]
}
```

#### 2. Query Splitting Logic
**Interactions that should be Post-Query (Client-side)**:
- `filter`: Simple WHERE clauses with input variables
- `split`: GROUP BY operations that create multiple traces
- `sort`: ORDER BY operations

**Logic that should remain Pre-Query (Server-side)**:
- Complex aggregations (SUM, COUNT, etc.)
- Window functions
- Joins between models
- Heavy computational SQL

#### 3. Dependency Analysis Requirements
We need SQLglot to analyze queries and determine:
- Which parts reference input variables (`${ref(input_name).value}`)
- Which parts contain aggregations
- Which parts can be safely moved to client-side
- Table/column dependencies

### Example Analysis

Given this insight:
```yaml
insights:
  - name: revenue-by-sales-exec
    model: ${ref(sales-model)}
    columns:
      region: ?{ region }
      category: ?{ category }
    props:
      type: indicator
      value: ?{ sum(amount) }
    interactions:
      - filter: ?{ account_executive = '${ref(executive_select).value}' }
```

**Pre-Query should contain**:
```sql
SELECT 
  sum(amount) as "props.value",
  region as "columns.region", 
  category as "columns.category",
  account_executive
FROM sales_model
GROUP BY region, category, account_executive
```

**Post-Query should be**:
```sql
SELECT * FROM insight_data 
WHERE account_executive = '$1'
```

**Client-side data structure**:
```json
{
  "data": [
    {"props.value": 1000, "columns.region": "North", "columns.category": "A", "account_executive": "John"},
    {"props.value": 2000, "columns.region": "South", "columns.category": "B", "account_executive": "Jane"}
  ],
  "query": "SELECT * FROM data WHERE account_executive = '$1'"
}
```

### Decision Points

1. **Include Base Columns**: Always include columns referenced in interactions in the pre-query
2. **Aggregation Detection**: Use SQLglot to detect if props contain aggregation functions
3. **Input Variable Detection**: Scan for `${ref(...)}` patterns to identify client-side dependencies
4. **Interaction Analysis**: Parse interaction types to determine what data needs to be available client-side

### SQLglot Integration Plan

1. **Parse SQL expressions** using `parse_one()`
2. **Find aggregation functions** using AST traversal (`find_all(exp.AggFunc)`)
3. **Identify column references** using `find_all(exp.Column)`
4. **Detect input variables** by scanning for template patterns
5. **Build dependency graph** to determine pre/post split points

This analysis forms the foundation for implementing the new InsightTokenizer that can intelligently split queries between server and client execution.