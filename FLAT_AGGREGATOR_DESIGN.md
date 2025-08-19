# Flat Aggregator Design Document

## Current vs New Structure Analysis

### Current Cohort-Based Structure (Traces)
The existing `Aggregator` class produces nested JSON grouped by `cohort_on` values:

```json
{
  "Normal Fibonacci": {
    "props.y": [13, 32, 67, 6, 8, 11, 25],
    "props.x": [7, 5, 6, 1, 2, 3, 4],
    "props.marker.color": ["#713B57", "#713B57", "#713B57", "grey", "grey", "grey", "grey"]
  },
  "Abnormal Fib": {
    "props.y": [4, 5],
    "props.x": [0, 8],
    "props.marker.color": ["grey", "#713B57"]
  }
}
```

### New Flat Structure (Insights)
The new `InsightAggregator` will produce flat arrays with aligned indices:

```json
{
  "props.y": [13, 32, 67, 6, 8, 11, 25, 4, 5],
  "props.x": [7, 5, 6, 1, 2, 3, 4, 0, 8],
  "props.marker.color": ["#713B57", "#713B57", "#713B57", "grey", "grey", "grey", "grey", "grey", "#713B57"],
  "split_column": ["Normal Fibonacci", "Normal Fibonacci", "Normal Fibonacci", "Normal Fibonacci", "Normal Fibonacci", "Normal Fibonacci", "Normal Fibonacci", "Abnormal Fib", "Abnormal Fib"]
}
```

## Key Design Differences

### 1. Data Organization
- **Current**: Groups data by cohort, each cohort has its own arrays
- **New**: Single arrays for each column with all data combined
- **Benefit**: Client-side filtering/splitting becomes simple array operations

### 2. Cohort Information
- **Current**: Cohort names are object keys
- **New**: Cohort values stored as a special column (e.g., `split_column`)
- **Benefit**: Cohort information is queryable like any other column

### 3. Client-Side Processing
- **Current**: Complex nested iteration required for filtering
- **New**: Simple WHERE clauses in DuckDB work naturally
- **Benefit**: Leverages DuckDB's powerful query capabilities

## InsightAggregator Architecture

### Core Interface
```python
class InsightAggregator:
    @classmethod
    def aggregate_insight_data(cls, data: List[dict], insight_dir: str, tokenized_insight: TokenizedInsight):
        """Main entry point for insight data aggregation"""
        
    @classmethod  
    def generate_flat_structure(cls, data: List[dict], tokenized_insight: TokenizedInsight) -> dict:
        """Convert raw query results to flat JSON structure"""
        
    @classmethod
    def generate_insight_json(cls, flat_data: dict, post_query: str, interactions: list) -> dict:
        """Generate complete insight.json with data and query template"""
```

### Data Processing Flow

1. **Input**: Raw SQL query results (list of dictionaries)
2. **Column Alignment**: Ensure all rows have same columns (fill with null)
3. **Flat Conversion**: Convert to arrays indexed by column name
4. **Metadata Addition**: Include post-query template and interactions
5. **JSON Generation**: Create insight.json file structure

### Example Processing

#### Input Data (from TokenizedInsight pre-query):
```python
[
  {"props.x": 1, "props.y": 10, "region": "North"},
  {"props.x": 2, "props.y": 20, "region": "North"}, 
  {"props.x": 3, "props.y": 15, "region": "South"},
  {"props.x": 4, "props.y": 25, "region": "South"}
]
```

#### Output Structure:
```json
{
  "data": {
    "props.x": [1, 2, 3, 4],
    "props.y": [10, 20, 15, 25],
    "region": ["North", "North", "South", "South"]
  },
  "query": "SELECT * FROM insight_data WHERE region = '${ref(region_select).value}'",
  "interactions": [
    {"filter": "region = '${ref(region_select).value}'"},
    {"split": "region"}
  ],
  "metadata": {
    "split_column": "region",
    "input_dependencies": ["region_select"],
    "requires_groupby": false
  }
}
```

## Implementation Strategy

### 1. Data Consistency
- Ensure all rows have same column set (fill missing with null)
- Handle different data types consistently
- Maintain order preservation where important

### 2. Memory Efficiency
- Stream processing for large datasets
- Lazy evaluation where possible
- Efficient JSON serialization

### 3. Error Handling
- Graceful handling of missing columns
- Type conversion errors
- Malformed data recovery

### 4. Integration Points

#### With InsightTokenizer
- Consumes `TokenizedInsight` for metadata
- Uses `select_items` and `column_items` mappings
- Incorporates `post_query` template

#### With Job System
- Replaces `Aggregator.aggregate_data_frame()` calls
- Writes to `insight_dir` instead of `trace_dir`
- Uses same JSON serialization utilities

#### With Client-Side System (Future)
- JSON structure optimized for DuckDB WASM loading
- Post-query template enables parameter substitution
- Interaction metadata enables dynamic filtering/splitting

## File Structure

### Output Location
- **Current**: `/target/traces/{trace_name}/data.json`  
- **New**: `/target/insights/{insight_name}/insight.json`

### JSON Schema
```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "patternProperties": {
        "^.*$": {"type": "array"}
      }
    },
    "query": {"type": "string"},
    "interactions": {"type": "array"},
    "metadata": {
      "type": "object", 
      "properties": {
        "split_column": {"type": ["string", "null"]},
        "input_dependencies": {"type": "array"},
        "requires_groupby": {"type": "boolean"}
      }
    }
  }
}
```

## Backward Compatibility

The `InsightAggregator` will:
- Run parallel to existing `Aggregator` 
- Not modify existing trace processing
- Use separate output directories
- Share JSON serialization utilities

This ensures existing trace functionality continues working while new insight functionality is developed.

## Performance Considerations

### Memory Usage
- Flat structure may use more memory for sparse data
- Trade-off: client-side query performance vs server memory

### Query Performance
- Client-side filtering becomes O(1) instead of nested loops
- DuckDB can optimize queries better with flat structure
- Reduced JavaScript processing overhead

### File Size
- May be slightly larger due to repeated cohort values
- Compression should mitigate size increase
- Benefit: Simpler parsing and processing

This design provides the foundation for powerful client-side interactivity while maintaining the simplicity and performance characteristics needed for the Interactivity 2.0 system.