# Violin Plots

Violin plots combine the benefits of box plots and density distributions, showing both statistical summaries and the full distribution shape. They're ideal for comparing distributions across multiple categories.

## When to Use Violin Plots

- **Distribution Comparison**: Compare shapes of distributions across groups
- **Outlier Analysis**: See both outliers and distribution density
- **Statistical Summary**: Get quartiles, median, and spread at a glance
- **Bimodal Detection**: Identify multiple peaks in data

## Basic Violin Plot

Compare salary distributions across departments:

```yaml
name: salary-analysis

sources:
  - name: hr_db
    type: duckdb
    database: ":memory:"

models:
  - name: salaries
    source_name: hr_db
    sql: |
      WITH salary_data AS (
        -- Engineering salaries (higher average, wider spread)
        SELECT 'Engineering' as department, 85000 + RANDOM() * 60000 as salary
        FROM generate_series(1, 50)
        UNION ALL
        -- Sales salaries (bimodal: base + high performers)
        SELECT 'Sales', 
          CASE WHEN RANDOM() > 0.7 
            THEN 90000 + RANDOM() * 40000  -- High performers
            ELSE 55000 + RANDOM() * 20000  -- Base performers
          END
        FROM generate_series(1, 50)
        UNION ALL
        -- Marketing salaries (normal distribution)
        SELECT 'Marketing', 65000 + RANDOM() * 30000
        FROM generate_series(1, 50)
      )
      SELECT department, CAST(salary AS INTEGER) as salary
      FROM salary_data

traces:
  - name: salary_violin
    model: ${ref(salaries)}
    props:
      type: violin
      x: ?{department}
      y: ?{salary}
      box:
        visible: true
      line:
        color: "#3498db"
      fillcolor: "rgba(52, 152, 219, 0.5)"
      
charts:
  - name: department_salaries
    traces:
      - ${ref(salary_violin)}
    layout:
      title: "Salary Distribution by Department"
      xaxis:
        title: "Department"
      yaxis:
        title: "Annual Salary ($)"
        tickformat: "$,.0f"
```

## Split Violins for Comparison

Compare distributions side-by-side within categories:

```yaml
models:
  - name: performance_by_gender
    source_name: hr_db
    sql: |
      WITH performance AS (
        SELECT 
          department,
          CASE WHEN RANDOM() > 0.5 THEN 'M' ELSE 'F' END as gender,
          60 + RANDOM() * 40 as performance_score
        FROM generate_series(1, 200),
          (SELECT 'Engineering' as department 
           UNION ALL SELECT 'Sales' 
           UNION ALL SELECT 'Marketing') d
      )
      SELECT * FROM performance

traces:
  - name: male_performance
    model: |
      SELECT department, performance_score 
      FROM ${ref(performance_by_gender)} 
      WHERE gender = 'M'
    props:
      type: violin
      x: ?{department}
      y: ?{performance_score}
      side: "negative"
      line:
        color: "#3498db"
      name: "Male"
      
  - name: female_performance
    model: |
      SELECT department, performance_score 
      FROM ${ref(performance_by_gender)} 
      WHERE gender = 'F'
    props:
      type: violin
      x: ?{department}
      y: ?{performance_score}
      side: "positive"
      line:
        color: "#e74c3c"
      name: "Female"
      
charts:
  - name: split_violin_chart
    traces:
      - ${ref(male_performance)}
      - ${ref(female_performance)}
    layout:
      title: "Performance Score Distribution by Gender"
      violingap: 0
      violingroupgap: 0
      violinmode: "overlay"
```

## Violin with Data Points

Show individual data points on the violin:

```yaml
traces:
  - name: violin_with_points
    model: ${ref(salaries)}
    props:
      type: violin
      x: ?{department}
      y: ?{salary}
      points: "all"
      jitter: 0.3
      pointpos: -1.8
      box:
        visible: true
      meanline:
        visible: true
      line:
        color: "#2ecc71"
      marker:
        size: 3
        opacity: 0.5
```

## Horizontal Violin Plots

Better for long category names:

```yaml
models:
  - name: product_ratings
    source_name: hr_db
    sql: |
      WITH ratings AS (
        SELECT 'Customer Support Excellence' as category, 3.5 + RANDOM() * 1.5 as rating
        FROM generate_series(1, 100)
        UNION ALL
        SELECT 'Product Quality & Reliability', 4.0 + RANDOM() * 1.0
        FROM generate_series(1, 100)
        UNION ALL
        SELECT 'Shipping Speed & Accuracy', 3.0 + RANDOM() * 2.0
        FROM generate_series(1, 100)
        UNION ALL
        SELECT 'Value for Money', 3.8 + RANDOM() * 1.2
        FROM generate_series(1, 100)
      )
      SELECT category, ROUND(rating, 1) as rating FROM ratings

traces:
  - name: rating_violin
    model: ${ref(product_ratings)}
    props:
      type: violin
      y: ?{category}  # Note: y for categories in horizontal
      x: ?{rating}     # Note: x for values in horizontal
      orientation: "h"
      line:
        color: "#9b59b6"
        
charts:
  - name: horizontal_ratings
    traces:
      - ${ref(rating_violin)}
    layout:
      title: "Customer Rating Distributions"
      xaxis:
        title: "Rating (1-5)"
        range: [1, 5]
      yaxis:
        title: ""
      margin:
        l: 200  # Extra margin for long labels
```

## Grouped Violins

Compare multiple metrics across categories:

```yaml
models:
  - name: student_scores
    source_name: hr_db
    sql: |
      WITH scores AS (
        SELECT 
          school,
          subject,
          CASE 
            WHEN school = 'North High' AND subject = 'Math' THEN 75 + RANDOM() * 20
            WHEN school = 'North High' AND subject = 'Science' THEN 80 + RANDOM() * 15
            WHEN school = 'South High' AND subject = 'Math' THEN 70 + RANDOM() * 25
            WHEN school = 'South High' AND subject = 'Science' THEN 72 + RANDOM() * 23
            WHEN school = 'East High' AND subject = 'Math' THEN 82 + RANDOM() * 13
            WHEN school = 'East High' AND subject = 'Science' THEN 78 + RANDOM() * 17
          END as score
        FROM generate_series(1, 50),
          (SELECT 'North High' as school UNION ALL SELECT 'South High' UNION ALL SELECT 'East High') s,
          (SELECT 'Math' as subject UNION ALL SELECT 'Science') sub
      )
      SELECT * FROM scores

traces:
  - name: math_scores
    model: |
      SELECT school, score FROM ${ref(student_scores)} WHERE subject = 'Math'
    props:
      type: violin
      x: ?{school}
      y: ?{score}
      name: "Math"
      scalegroup: "Math"
      line:
        color: "#3498db"
        
  - name: science_scores
    model: |
      SELECT school, score FROM ${ref(student_scores)} WHERE subject = 'Science'
    props:
      type: violin
      x: ?{school}
      y: ?{score}
      name: "Science"
      scalegroup: "Science"
      line:
        color: "#e74c3c"
        
charts:
  - name: school_comparison
    traces:
      - ${ref(math_scores)}
      - ${ref(science_scores)}
    layout:
      title: "Test Score Distributions by School and Subject"
      violinmode: "group"
```

## Customized Appearance

Fine-tune the violin appearance:

```yaml
traces:
  - name: custom_violin
    model: ${ref(salaries)}
    props:
      type: violin
      x: ?{department}
      y: ?{salary}
      bandwidth: 0.2  # Smoothing parameter
      spanmode: "hard"  # Don't extend beyond data range
      box:
        visible: true
        fillcolor: "white"
        line:
          color: "black"
          width: 2
      meanline:
        visible: true
        color: "#e74c3c"
        width: 2
      line:
        color: "#34495e"
        width: 2
      fillcolor: "rgba(52, 73, 94, 0.3)"
```

## Statistical Overlays

Add reference lines and annotations:

```yaml
traces:
  - name: salary_violin_annotated
    model: ${ref(salaries)}
    props:
      type: violin
      x: ?{department}
      y: ?{salary}
      
  - name: company_average
    model: |
      SELECT AVG(salary) as avg_salary FROM ${ref(salaries)}
    props:
      type: scatter
      x: ["Engineering", "Sales", "Marketing"]
      y: [?{avg_salary}, ?{avg_salary}, ?{avg_salary}]
      mode: "lines"
      line:
        color: "red"
        dash: "dash"
        width: 2
      name: "Company Average"
```

## Best Practices

### Data Requirements
- **Minimum samples**: At least 10-20 points per category for meaningful shapes
- **Outlier handling**: Consider whether to include or filter extreme values
- **Balance**: Similar sample sizes across categories for fair comparison

### Visual Design
```yaml
# Consistent color scheme for related violins
traces:
  - name: q1_performance
    props:
      line:
        color: "#3498db"
      fillcolor: "rgba(52, 152, 219, 0.3)"
      
  - name: q2_performance
    props:
      line:
        color: "#2980b9"  # Darker shade
      fillcolor: "rgba(41, 128, 185, 0.3)"
```

### Interpretation Tips
- **Width**: Represents the density of data at that value
- **Length**: Shows the range of the data
- **Shape**: Reveals distribution characteristics (normal, skewed, bimodal)
- **Box**: Provides quartile information like a box plot

## Common Use Cases

### A/B Testing Results
```yaml
models:
  - name: ab_test_results
    sql: |
      SELECT 
        variant,
        conversion_rate,
        sample_size
      FROM ab_tests
      WHERE test_name = 'Homepage Redesign'
```

### Performance Reviews
```yaml
models:
  - name: review_scores
    sql: |
      SELECT 
        department,
        employee_level,
        overall_rating
      FROM performance_reviews
      WHERE review_year = 2024
```

### Quality Metrics
```yaml
models:
  - name: defect_rates
    sql: |
      SELECT 
        production_line,
        shift,
        defects_per_thousand
      FROM quality_metrics
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
```

## Related Resources
- [Box Plots](box.md) - For simpler statistical summaries
- [Histograms](histogram.md) - For single distribution analysis
- [Scatter Plots](scatter.md) - For relationship analysis
- [Statistical Concepts](../concepts/statistics.md) - Understanding distributions

---
*Next Steps:* Explore [Time Series Charts](candlestick.md) for financial data visualization