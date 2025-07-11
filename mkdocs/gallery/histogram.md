# Histogram Charts

Histograms are essential for understanding data distributions, showing the frequency of values across defined ranges (bins). They're perfect for analyzing patterns in continuous data.

## When to Use Histograms

- **Distribution Analysis**: Understand how values are spread across a range
- **Outlier Detection**: Identify unusual values in your dataset
- **Data Quality**: Check for gaps or unexpected patterns
- **Comparative Analysis**: Compare distributions across categories

## Basic Histogram

Create a simple histogram showing the distribution of sales amounts:

```yaml
name: sales-distribution

sources:
  - name: sales_db
    type: duckdb
    database: ":memory:"

models:
  - name: sales_amounts
    source_name: sales_db
    sql: |
      WITH sales AS (
        SELECT 
          45.99 as amount UNION ALL SELECT 23.50 UNION ALL SELECT 67.25 
          UNION ALL SELECT 34.99 UNION ALL SELECT 89.00 UNION ALL SELECT 12.75
          UNION ALL SELECT 56.50 UNION ALL SELECT 78.25 UNION ALL SELECT 41.00
          UNION ALL SELECT 92.75 UNION ALL SELECT 28.50 UNION ALL SELECT 65.00
          UNION ALL SELECT 37.25 UNION ALL SELECT 71.50 UNION ALL SELECT 19.99
          UNION ALL SELECT 84.25 UNION ALL SELECT 52.00 UNION ALL SELECT 76.50
          UNION ALL SELECT 31.25 UNION ALL SELECT 68.75 UNION ALL SELECT 44.50
      )
      SELECT amount FROM sales

traces:
  - name: amount_distribution
    model: ${ref(sales_amounts)}
    props:
      type: histogram
      x: ?{amount}
      nbinsx: 10
      marker:
        color: "#3498db"
      
charts:
  - name: sales_histogram
    traces:
      - ${ref(amount_distribution)}
    layout:
      title: "Sales Amount Distribution"
      xaxis:
        title: "Sale Amount ($)"
      yaxis:
        title: "Frequency"
```

## Customized Bins

Control bin sizes and ranges for better insights:

```yaml
traces:
  - name: custom_bins
    model: ${ref(sales_amounts)}
    props:
      type: histogram
      x: ?{amount}
      xbins:
        start: 0
        end: 100
        size: 20  # $20 bins
      marker:
        color: "#e74c3c"
        line:
          color: "#c0392b"
          width: 1
```

## Multiple Distributions

Compare distributions across categories using overlay:

```yaml
models:
  - name: product_prices
    source_name: sales_db
    sql: |
      WITH products AS (
        SELECT 'Electronics' as category, 299.99 as price
        UNION ALL SELECT 'Electronics', 449.50
        UNION ALL SELECT 'Electronics', 899.00
        UNION ALL SELECT 'Electronics', 129.99
        UNION ALL SELECT 'Clothing', 39.99
        UNION ALL SELECT 'Clothing', 79.50
        UNION ALL SELECT 'Clothing', 24.99
        UNION ALL SELECT 'Clothing', 59.00
        UNION ALL SELECT 'Books', 14.99
        UNION ALL SELECT 'Books', 29.50
        UNION ALL SELECT 'Books', 19.99
        UNION ALL SELECT 'Books', 34.00
      )
      SELECT category, price FROM products

traces:
  - name: electronics_dist
    model: |
      SELECT price FROM ${ref(product_prices)} 
      WHERE category = 'Electronics'
    props:
      type: histogram
      x: ?{price}
      name: "Electronics"
      opacity: 0.7
      
  - name: clothing_dist
    model: |
      SELECT price FROM ${ref(product_prices)} 
      WHERE category = 'Clothing'
    props:
      type: histogram
      x: ?{price}
      name: "Clothing"
      opacity: 0.7
      
charts:
  - name: category_comparison
    traces:
      - ${ref(electronics_dist)}
      - ${ref(clothing_dist)}
    layout:
      title: "Price Distribution by Category"
      barmode: "overlay"
      xaxis:
        title: "Price ($)"
      yaxis:
        title: "Count"
```

## Normalized Histogram

Show probability density instead of counts:

```yaml
traces:
  - name: normalized_dist
    model: ${ref(sales_amounts)}
    props:
      type: histogram
      x: ?{amount}
      histnorm: "probability density"
      marker:
        color: "#2ecc71"
```

## Cumulative Distribution

Display cumulative frequencies:

```yaml
traces:
  - name: cumulative_dist
    model: ${ref(sales_amounts)}
    props:
      type: histogram
      x: ?{amount}
      cumulative:
        enabled: true
      marker:
        color: "#9b59b6"
```

## 2D Histogram (Heatmap Style)

Analyze relationships between two continuous variables:

```yaml
models:
  - name: customer_behavior
    source_name: sales_db
    sql: |
      WITH behavior AS (
        SELECT 
          25 + RANDOM() * 40 as age,
          50 + RANDOM() * 150 as avg_purchase
        FROM generate_series(1, 500)
      )
      SELECT 
        CAST(age AS INTEGER) as age,
        CAST(avg_purchase AS DECIMAL(10,2)) as avg_purchase
      FROM behavior

traces:
  - name: age_purchase_dist
    model: ${ref(customer_behavior)}
    props:
      type: histogram2d
      x: ?{age}
      y: ?{avg_purchase}
      colorscale: "Blues"
      
charts:
  - name: behavior_heatmap
    traces:
      - ${ref(age_purchase_dist)}
    layout:
      title: "Customer Age vs Purchase Behavior"
      xaxis:
        title: "Age"
      yaxis:
        title: "Average Purchase ($)"
```

## Best Practices

### Choosing Bin Count
- **Too few bins**: May hide important patterns
- **Too many bins**: Creates noise and reduces clarity
- **Rule of thumb**: Start with sqrt(n) bins, then adjust

### Handling Outliers
```yaml
# Filter extreme values in your model
models:
  - name: filtered_sales
    source_name: sales_db
    sql: |
      SELECT amount 
      FROM sales 
      WHERE amount BETWEEN 
        (SELECT PERCENTILE_CONT(0.01) WITHIN GROUP (ORDER BY amount) FROM sales)
        AND 
        (SELECT PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY amount) FROM sales)
```

### Adding Statistics
Overlay mean and standard deviation lines:

```yaml
traces:
  - name: distribution
    model: ${ref(sales_amounts)}
    props:
      type: histogram
      x: ?{amount}
      
  - name: mean_line
    model: |
      SELECT 
        AVG(amount) as mean_val,
        'Mean: $' || ROUND(AVG(amount), 2) as label
      FROM ${ref(sales_amounts)}
    props:
      type: scatter
      x: [?{mean_val}, ?{mean_val}]
      y: [0, 10]  # Adjust based on your histogram height
      mode: "lines+text"
      line:
        color: "red"
        dash: "dash"
      text: [null, ?{label}]
      textposition: "top"
```

## Common Use Cases

### Quality Control
Monitor manufacturing measurements:
```yaml
models:
  - name: measurements
    sql: |
      SELECT 
        measurement_value,
        CASE 
          WHEN measurement_value BETWEEN 9.95 AND 10.05 THEN 'In Spec'
          ELSE 'Out of Spec'
        END as status
      FROM quality_control_data
```

### Response Time Analysis
Analyze API or query performance:
```yaml
models:
  - name: response_times
    sql: |
      SELECT 
        response_time_ms,
        endpoint
      FROM api_logs
      WHERE timestamp >= CURRENT_DATE - INTERVAL '7 days'
```

### Score Distributions
Examine test scores or ratings:
```yaml
models:
  - name: test_scores
    sql: |
      SELECT 
        score,
        subject,
        COUNT(*) OVER (PARTITION BY subject) as total_students
      FROM student_scores
```

## Related Resources
- [Box Plots](box.md) - For comparing distributions with quartiles
- [Violin Plots](violin.md) - Combines histogram and box plot features
- [Scatter Plots](scatter.md) - For correlation analysis
- [Statistical Concepts](../concepts/statistics.md) - Understanding distributions

---
*Next Steps:* Learn about [Violin Plots](violin.md) for more advanced distribution visualization