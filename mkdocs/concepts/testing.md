# Testing Strategy

Testing is a first-class feature in Visivo, ensuring your dashboards display accurate data and work reliably. This guide covers Visivo's testing capabilities and best practices.

## Why Test Dashboards?

Dashboards are critical business tools. Testing helps:
- ✅ **Catch data issues** before users see them
- ✅ **Validate business logic** in calculations
- ✅ **Ensure visualizations** render correctly
- ✅ **Prevent regressions** when making changes
- ✅ **Build confidence** in your analytics

## Types of Tests

### 1. Model Tests

Test data quality and business logic at the model level:

```yaml
models:
  - name: daily_revenue
    sql: |
      SELECT 
        date,
        SUM(amount) as revenue,
        COUNT(DISTINCT customer_id) as customer_count
      FROM orders
      WHERE status = 'completed'
      GROUP BY date
    tests:
      # Built-in tests
      - unique: date
      - not_null: [date, revenue]
      - relationships:
          column: date
          to: ref(calendar)
          field: date
      
      # Custom SQL tests
      - custom: |
          -- Revenue should be positive
          SELECT COUNT(*) = 0
          FROM {% raw %}{{ model }}{% endraw %}
          WHERE revenue < 0
      
      - custom: |
          -- No future dates
          SELECT COUNT(*) = 0
          FROM {% raw %}{{ model }}{% endraw %}
          WHERE date > CURRENT_DATE
```

### 2. Trace Tests

Validate visualization data:

```yaml
traces:
  - name: revenue_trend
    model: ${ref(daily_revenue)}
    props:
      type: scatter
      x: ?{date}
      y: ?{revenue}
    tests:
      # Row count expectations
      - row_count > 0
      - row_count < 10000  # Performance guard
      
      # Column value tests
      - min('revenue') >= 0
      - max('revenue') < 1000000  # Sanity check
      - nulls('date') = 0
      
      # Statistical tests
      - stddev('revenue') < mean('revenue') * 2
      - percentile('revenue', 0.99) < 100000
```

### 3. Chart Tests

Ensure charts render correctly:

```yaml
charts:
  - name: sales_dashboard
    traces:
      - ${ref(revenue_trend)}
      - ${ref(profit_margin)}
    tests:
      # All traces have data
      - all_traces_have_data: true
      
      # Layout validations
      - has_title: true
      - axis_labels_present: true
      
      # Performance tests
      - render_time < 2000  # milliseconds
```

### 4. Dashboard Tests

Test complete dashboard functionality:

```yaml
dashboards:
  - name: executive_summary
    tests:
      # Component tests
      - all_charts_load: true
      - no_empty_tables: true
      
      # Selector tests  
      - selectors_have_defaults: true
      - date_range_valid: true
      
      # Performance
      - total_load_time < 5000  # ms
```

## Writing Effective Tests

### Test Business Rules

{% raw %}
```yaml
models:
  - name: commission_calculation
    sql: |
      SELECT 
        salesperson_id,
        SUM(sale_amount) as total_sales,
        SUM(sale_amount) * 0.05 as commission
      FROM sales
      GROUP BY salesperson_id
    tests:
      - custom: |
          -- Commission should be 5% of sales
          SELECT COUNT(*) = 0
          FROM {% raw %}{{ model }}{% endraw %}
          WHERE ABS(commission - (total_sales * 0.05)) > 0.01
```

### Test Edge Cases

{% raw %}
```yaml
models:
  - name: customer_segments
    tests:
      - custom: |
          -- Every customer has exactly one segment
          WITH segment_counts AS (
            SELECT customer_id, COUNT(*) as segment_count
            FROM {% raw %}{{ model }}{% endraw %}
            GROUP BY customer_id
          )
          SELECT COUNT(*) = 0
          FROM segment_counts
          WHERE segment_count != 1
```

### Test Data Freshness

{% raw %}
```yaml
models:
  - name: real_time_orders
    tests:
      - custom: |
          -- Data should be no more than 1 hour old
          SELECT COUNT(*) = 0
          FROM {% raw %}{{ model }}{% endraw %}
          WHERE MAX(created_at) < NOW() - INTERVAL '1 hour'
```

## Test Syntax Reference

### Built-in Model Tests

```yaml
tests:
  # Uniqueness
  - unique: column_name
  - unique: [column1, column2]  # Composite unique
  
  # Null checks
  - not_null: column_name
  - not_null: [col1, col2, col3]
  
  # Relationships
  - relationships:
      column: foreign_key_col
      to: ref(other_model)
      field: primary_key_col
  
  # Accepted values
  - accepted_values:
      column: status
      values: ['pending', 'completed', 'cancelled']
  
  # Expression tests
  - expression: revenue >= 0
  - expression: date <= CURRENT_DATE
```

### Trace Test Functions

```yaml
tests:
  # Aggregation functions
  - min('column') >= value
  - max('column') <= value  
  - mean('column') between [low, high]
  - sum('column') = expected
  - count('column') > 0
  - count_distinct('column') < limit
  
  # Statistical functions
  - stddev('column') < threshold
  - variance('column') < threshold
  - percentile('column', 0.5) = median_value
  
  # Null checks
  - nulls('column') = 0
  - nulls_percentage('column') < 0.05
  
  # Row counts
  - row_count > minimum
  - row_count between [min, max]
  - row_count = exact_count
```

### Custom Test Patterns

```yaml
# Pattern 1: Comparing models
tests:
  - custom: |
      -- New calculation matches legacy
      SELECT COUNT(*) = 0
      FROM {% raw %}{{ model }}{% endraw %} new
      JOIN legacy_calculation old
        ON new.id = old.id
      WHERE ABS(new.value - old.value) > 0.01

# Pattern 2: Time series continuity
tests:
  - custom: |
      -- No gaps in daily data
      WITH date_gaps AS (
        SELECT 
          date,
          LAG(date) OVER (ORDER BY date) as prev_date,
          date - LAG(date) OVER (ORDER BY date) as gap
        FROM {% raw %}{{ model }}{% endraw %}
      )
      SELECT COUNT(*) = 0
      FROM date_gaps
      WHERE gap > 1

# Pattern 3: Referential integrity
tests:
  - custom: |
      -- All products exist in dimension table
      SELECT COUNT(*) = 0
      FROM {% raw %}{{ model }}{% endraw %} f
      LEFT JOIN dim_products d
        ON f.product_id = d.product_id
      WHERE d.product_id IS NULL
```

## Test Organization

### Directory Structure

```
tests/
├── models/
│   ├── test_staging_models.yml
│   ├── test_mart_models.yml
│   └── test_business_logic.yml
├── traces/
│   ├── test_visualizations.yml
│   └── test_performance.yml
└── integration/
    ├── test_end_to_end.yml
    └── test_selectors.yml
```

### Grouping Tests

```yaml
# test_groups.yml
test_groups:
  - name: critical
    description: Must pass for deployment
    tests:
      - models: [daily_revenue, customer_segments]
      - traces: [revenue_trend, kpi_metrics]
  
  - name: performance
    description: Performance benchmarks
    tests:
      - custom: all_queries_under_5s
      - custom: dashboard_load_under_3s
  
  - name: data_quality
    description: Data quality checks
    tests:
      - models: all
        test_types: [not_null, unique, relationships]
```

## Running Tests

### Command Line

```bash
# Run all tests
visivo test

# Run specific test groups
visivo test --group critical
visivo test --group data_quality

# Run tests for specific models
visivo test --models daily_revenue,customer_segments

# Run with specific source
visivo test --source production_db

# Verbose output
visivo test --verbose
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Visivo Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Visivo
        run: pip install visivo
      
      - name: Run Critical Tests
        run: visivo test --group critical
        env:
          DB_HOST: {% raw %}${{ secrets.TEST_DB_HOST }}{% endraw %}
          
      - name: Run All Tests
        run: visivo test --verbose
        continue-on-error: true  # Don't fail on warnings
```

## Test Results and Reporting

### Test Output Format

```
Running Visivo Tests...
======================

Model Tests:
✓ daily_revenue: unique(date) - PASSED
✓ daily_revenue: not_null(revenue) - PASSED  
✗ daily_revenue: revenue >= 0 - FAILED
  → Found 3 rows with negative revenue

Trace Tests:
✓ revenue_trend: row_count > 0 - PASSED
⚠ revenue_trend: render_time < 1000ms - WARNING (1250ms)

Summary:
- Total: 25 tests
- Passed: 23
- Failed: 1
- Warnings: 1
```

### Failure Handling

```yaml
# Configure failure behavior
test_config:
  fail_fast: false  # Continue running all tests
  warning_threshold: 5  # Fail if more than 5 warnings
  
  # Alert on failures
  on_failure:
    alert: ${ref(slack_alert)}
    message: |
      Test failures in {% raw %}{{ project_name }}{% endraw %}:
      {% raw %}{{ failed_tests | join('\n') }}{% endraw %}
```

## Best Practices

### 1. Test at the Right Level

- **Model tests**: Data quality, business logic
- **Trace tests**: Visualization-specific validations
- **Integration tests**: End-to-end workflows

### 2. Keep Tests Fast

```yaml
# Good: Test sample of data
tests:
  - custom: |
      SELECT COUNT(*) = 0
      FROM (
        SELECT * FROM {% raw %}{{ model }}{% endraw %} 
        LIMIT 10000
      ) sample
      WHERE revenue < 0

# Bad: Test entire dataset unnecessarily
tests:
  - custom: |
      SELECT COUNT(*) = 0
      FROM billion_row_table
      WHERE complex_calculation() < 0
```

### 3. Make Tests Deterministic

```yaml
# Good: Specific date range
tests:
  - custom: |
      SELECT COUNT(*) > 100
      FROM {% raw %}{{ model }}{% endraw %}
      WHERE date BETWEEN '2024-01-01' AND '2024-01-31'

# Bad: Relative to current date
tests:
  - custom: |
      SELECT COUNT(*) > 100
      FROM {% raw %}{{ model }}{% endraw %}
      WHERE date >= CURRENT_DATE - 30
```

### 4. Document Test Purpose

```yaml
tests:
  - name: validate_commission_calculation
    description: |
      Ensures commission is exactly 5% of sales amount
      as per compensation plan v2.1
    custom: |
      SELECT COUNT(*) = 0
      FROM {% raw %}{{ model }}{% endraw %}
      WHERE ABS(commission - (sales * 0.05)) > 0.01
```

### 5. Progressive Testing

Start with critical tests and expand:

1. **Phase 1**: Not null, unique constraints
2. **Phase 2**: Business rule validation
3. **Phase 3**: Performance benchmarks
4. **Phase 4**: Statistical anomalies

## Common Test Patterns

### Financial Accuracy

```yaml
tests:
  # Accounting equation
  - custom: |
      SELECT COUNT(*) = 0
      FROM {% raw %}{{ model }}{% endraw %}
      WHERE ABS(assets - (liabilities + equity)) > 0.01
  
  # Revenue recognition
  - custom: |
      SELECT COUNT(*) = 0
      FROM {% raw %}{{ model }}{% endraw %}
      WHERE recognized_revenue > contract_value
```

### Time Series Validation

```yaml
tests:
  # Monotonic increase
  - custom: |
      WITH ranked AS (
        SELECT 
          date,
          cumulative_total,
          LAG(cumulative_total) OVER (ORDER BY date) as prev_total
        FROM {% raw %}{{ model }}{% endraw %}
      )
      SELECT COUNT(*) = 0
      FROM ranked
      WHERE cumulative_total < prev_total
```

### Statistical Quality

```yaml
tests:
  # Outlier detection
  - custom: |
      WITH stats AS (
        SELECT 
          AVG(value) as mean,
          STDDEV(value) as std
        FROM {% raw %}{{ model }}{% endraw %}
      )
      SELECT COUNT(*) as outlier_count
      FROM {% raw %}{{ model }}{% endraw %}
      CROSS JOIN stats
      WHERE ABS(value - mean) > 3 * std
      HAVING COUNT(*) < 10  # Allow some outliers
```

---

_Next:_ [How Visivo Works](architecture.md) | [Back to Concepts](index.md)