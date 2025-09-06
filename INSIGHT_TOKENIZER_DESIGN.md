# InsightTokenizer Design Document

## Overview
The `InsightTokenizer` class will be responsible for parsing insights and generating both pre-query (server-side) and post-query (client-side) SQL statements, along with the metadata needed for client-side execution.

## Class Structure

### Core Interface
```python
class InsightTokenizer:
    def __init__(self, insight: Insight, model: Model, source: Source):
        self.insight = insight
        self.source = source  
        self.model = model
        self.dialect = Dialect(type=source.type)
        self.statement_classifier = StatementClassifier(dialect=self.dialect)
        
        # Analysis results
        self.select_items = {}
        self.column_items = {}
        self.interaction_dependencies = {}
        
        # Initialize analysis
        self._analyze_insight()
    
    def tokenize(self) -> TokenizedInsight:
        """Main entry point - returns tokenized insight with pre/post queries"""
        pass
```

### Key Methods

#### 1. Analysis Methods
```python
def _analyze_insight(self):
    """Master analysis method that coordinates all parsing"""
    self._analyze_props()
    self._analyze_columns() 
    self._analyze_interactions()
    self._build_dependency_graph()

def _analyze_props(self):
    """Extract SQL expressions from insight props"""
    # Similar to TraceTokenizer._set_select_items but for insight props
    
def _analyze_columns(self):
    """Extract SQL expressions from insight columns section"""
    # Process columns that aren't directly mapped to props
    
def _analyze_interactions(self):
    """Parse interactions to understand client-side requirements"""
    # Analyze filter, split, sort interactions
    # Identify input variable dependencies
```

#### 2. SQLglot Integration Methods  
```python
def _parse_expression_with_sqlglot(self, sql_expr: str) -> Dict:
    """Use SQLglot to analyze a SQL expression"""
    # Parse expression into AST
    # Find aggregation functions
    # Find column references
    # Detect complexity level
    
def _has_aggregation(self, sql_expr: str) -> bool:
    """Check if expression contains aggregation functions"""
    
def _extract_column_dependencies(self, sql_expr: str) -> List[str]:
    """Get list of columns referenced in expression"""
    
def _find_input_references(self, text: str) -> List[str]:
    """Find ${ref(...)} patterns in text"""
```

#### 3. Query Generation Methods
```python
def _generate_pre_query(self) -> str:
    """Generate server-side SQL query"""
    # Include all props that have aggregations
    # Include all columns needed for interactions
    # Include base model SQL
    
def _generate_post_query(self) -> str:
    """Generate client-side DuckDB query template"""
    # Start with "SELECT * FROM insight_data"
    # Add WHERE clauses for filters with input variables
    # Add ORDER BY for sorts
    
def _determine_required_columns(self) -> Set[str]:
    """Determine which columns need to be included in pre-query"""
    # All columns referenced in interactions
    # All columns referenced in props
    # All explicit columns
```

## TokenizedInsight Model

```python
class TokenizedInsight(BaseModel):
    # Basic metadata
    name: str
    source: str
    source_type: str
    
    # Server-side query (pre-query)
    pre_query: str
    
    # Client-side query template (post-query) 
    post_query: str
    
    # Data structure information
    select_items: Dict[str, str]  # prop_path -> sql_expression
    column_items: Dict[str, str]  # column_name -> sql_expression
    
    # Interaction metadata
    interactions: List[Dict]  # List of interaction definitions
    input_dependencies: List[str]  # List of input names this insight depends on
    
    # Execution metadata
    requires_groupby: bool
    groupby_statements: Optional[List[str]] = None
```

## Analysis Logic

### 1. Props Analysis
- Traverse insight.props recursively (similar to current TraceTokenizer)
- For each SQL expression found:
  - Use SQLglot to parse and analyze
  - Determine if it contains aggregations
  - Extract column dependencies
  - Add to select_items

### 2. Columns Analysis  
- Process insight.columns section
- Each column becomes a potential field in the flat data structure
- Check if columns are referenced in interactions
- Add to column_items

### 3. Interactions Analysis
For each interaction:
- **Filter**: Parse WHERE clause, identify input variable references
- **Split**: Identify column to split on, ensure it's in pre-query
- **Sort**: Parse ORDER BY clause, ensure referenced columns are available

### 4. Dependency Graph Building
Create a graph of dependencies:
- Props depend on columns from model
- Interactions depend on columns/props
- Input variables create client-side dependencies

### 5. Pre/Post Query Decision Logic

**Pre-Query includes**:
- Base model SQL
- All props with aggregations  
- All columns referenced in interactions
- All explicit columns from insight.columns
- GROUP BY statements for aggregations

**Post-Query includes**:
- Filters with input variable references
- Split operations (handled by client-side data processing)
- Sort operations
- Simple column selection

## Example Implementation Flow

Given this insight:
```yaml
insights:
  - name: revenue-by-exec
    model: ${ref(sales)}
    columns:
      region: ?{ region }
    props:
      type: indicator
      value: ?{ sum(amount) }
    interactions:
      - filter: ?{ account_executive = '${ref(exec_select).value}' }
      - split: ?{ region }
```

### Analysis Results:
- **select_items**: `{"props.value": "sum(amount)"}`
- **column_items**: `{"columns.region": "region"}`
- **interactions**: Filter references `account_executive`, Split references `region`
- **input_dependencies**: `["exec_select"]`

### Generated Queries:
**Pre-Query**:
```sql
SELECT 
  sum(amount) as "props.value",
  region as "columns.region",
  account_executive
FROM (${model.sql}) as base_model
GROUP BY region, account_executive
```

**Post-Query**:
```sql
SELECT * FROM insight_data WHERE account_executive = '$1'
```

## Integration Points

### 1. With Existing System
- Parallel to TraceTokenizer, not replacing it initially
- Uses same Dialect and StatementClassifier
- Similar recursive traversal patterns for props

### 2. With New Components
- Consumed by InsightJob (similar to how TraceTokenizer is consumed by run_trace_job)
- Output used by new InsightAggregator for flat JSON generation
- TokenizedInsight used by QueryStringFactory equivalent for insights

### 3. Future Client Integration
- post_query templates used by DuckDB WASM
- input_dependencies used to register input change listeners
- Flat data structure consumed by visualization components

This design provides a clear separation between server and client responsibilities while maintaining compatibility with the existing Visivo architecture.