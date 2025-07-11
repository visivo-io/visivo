# Hierarchical Charts

Hierarchical visualizations reveal relationships, proportions, and flows within structured data. They're ideal for displaying organizational structures, file systems, budget breakdowns, and process flows.

## When to Use Hierarchical Charts

- **Part-to-Whole**: Show how components make up a total
- **Tree Structures**: Visualize parent-child relationships
- **Flow Analysis**: Track resources or processes through stages
- **Space Utilization**: Display proportional relationships efficiently

## Treemap

Visualize hierarchical data as nested rectangles:

```yaml
name: hierarchical-analysis

sources:
  - name: hierarchy_db
    type: duckdb
    database: ":memory:"

models:
  - name: budget_hierarchy
    source_name: hierarchy_db
    sql: |
      WITH budget AS (
        SELECT * FROM (VALUES
          ('Total Budget', NULL, 1000000),
          ('Operations', 'Total Budget', 400000),
          ('Development', 'Total Budget', 350000),
          ('Marketing', 'Total Budget', 250000),
          -- Operations breakdown
          ('Salaries', 'Operations', 250000),
          ('Facilities', 'Operations', 100000),
          ('Equipment', 'Operations', 50000),
          -- Development breakdown
          ('Engineering', 'Development', 200000),
          ('Product', 'Development', 100000),
          ('QA', 'Development', 50000),
          -- Marketing breakdown
          ('Digital', 'Marketing', 150000),
          ('Events', 'Marketing', 70000),
          ('Content', 'Marketing', 30000),
          -- Further breakdown
          ('Social Media', 'Digital', 80000),
          ('SEO/SEM', 'Digital', 70000),
          ('Trade Shows', 'Events', 50000),
          ('Webinars', 'Events', 20000)
        ) AS t(label, parent, value)
      )
      SELECT 
        label,
        COALESCE(parent, '') as parent,
        value,
        ROUND(value / 1000, 1) || 'K' as text_value
      FROM budget

traces:
  - name: budget_treemap
    model: ${ref(budget_hierarchy)}
    props:
      type: treemap
      labels: ?{label}
      parents: ?{parent}
      values: ?{value}
      text: ?{text_value}
      textposition: "middle center"
      textfont:
        size: 14
        color: "white"
      marker:
        colorscale: "Blues"
        line:
          width: 2
          color: "white"
      hovertemplate: |
        <b>%{label}</b><br>
        Budget: $%{value:,.0f}<br>
        Percentage: %{percentParent}<br>
        <extra></extra>
      
charts:
  - name: budget_breakdown
    traces:
      - ${ref(budget_treemap)}
    layout:
      title: "Company Budget Allocation"
      margin:
        l: 0
        r: 0
        t: 50
        b: 0
```

## Sunburst Chart

Radial hierarchy visualization:

```yaml
models:
  - name: file_system
    source_name: hierarchy_db
    sql: |
      WITH files AS (
        SELECT * FROM (VALUES
          ('root', '', 0),
          ('src', 'root', 0),
          ('docs', 'root', 0),
          ('tests', 'root', 0),
          -- src folder
          ('components', 'src', 0),
          ('utils', 'src', 0),
          ('api', 'src', 0),
          -- components
          ('Button.js', 'components', 2.5),
          ('Modal.js', 'components', 4.2),
          ('Table.js', 'components', 8.7),
          ('Form.js', 'components', 6.3),
          -- utils
          ('helpers.js', 'utils', 3.1),
          ('validators.js', 'utils', 2.8),
          ('constants.js', 'utils', 1.2),
          -- api
          ('client.js', 'api', 5.4),
          ('endpoints.js', 'api', 2.1),
          -- docs
          ('README.md', 'docs', 4.5),
          ('API.md', 'docs', 12.3),
          ('CONTRIBUTING.md', 'docs', 2.8),
          -- tests
          ('unit', 'tests', 0),
          ('integration', 'tests', 0),
          ('component.test.js', 'unit', 15.2),
          ('api.test.js', 'unit', 8.9),
          ('e2e.test.js', 'integration', 22.4)
        ) AS t(name, parent, size_kb)
      )
      SELECT 
        name,
        parent,
        size_kb,
        CASE 
          WHEN size_kb = 0 THEN NULL
          ELSE size_kb || ' KB'
        END as display_size
      FROM files

traces:
  - name: file_sunburst
    model: ${ref(file_system)}
    props:
      type: sunburst
      labels: ?{name}
      parents: ?{parent}
      values: ?{CASE WHEN size_kb = 0 THEN 1 ELSE size_kb END}
      text: ?{display_size}
      branchvalues: "total"
      marker:
        colors: ?{CASE 
          WHEN name LIKE '%.js' THEN '#f1c40f'
          WHEN name LIKE '%.md' THEN '#3498db'
          WHEN name LIKE '%.test.%' THEN '#e74c3c'
          ELSE '#95a5a6'
        END}
      textfont:
        size: 10
      insidetextorientation: "radial"
```

## Icicle Chart

Hierarchical data with better text readability:

```yaml
models:
  - name: org_structure
    source_name: hierarchy_db
    sql: |
      WITH organization AS (
        SELECT * FROM (VALUES
          ('CEO', '', 1, 450000),
          -- C-Suite
          ('CTO', 'CEO', 1, 350000),
          ('CFO', 'CEO', 1, 350000),
          ('CMO', 'CEO', 1, 300000),
          -- Engineering
          ('VP Engineering', 'CTO', 1, 250000),
          ('Director Platform', 'VP Engineering', 1, 200000),
          ('Director Mobile', 'VP Engineering', 1, 200000),
          ('Platform Team', 'Director Platform', 8, 150000),
          ('Mobile Team', 'Director Mobile', 6, 140000),
          -- Finance
          ('VP Finance', 'CFO', 1, 220000),
          ('Controller', 'VP Finance', 1, 180000),
          ('Accounting', 'Controller', 4, 80000),
          ('FP&A', 'VP Finance', 3, 120000),
          -- Marketing
          ('VP Marketing', 'CMO', 1, 200000),
          ('Brand Team', 'VP Marketing', 4, 90000),
          ('Growth Team', 'VP Marketing', 5, 110000)
        ) AS t(title, reports_to, count, avg_salary)
      )
      SELECT 
        title,
        reports_to,
        count,
        avg_salary,
        count * avg_salary as total_cost
      FROM organization

traces:
  - name: org_icicle
    model: ${ref(org_structure)}
    props:
      type: icicle
      labels: ?{title || ' (' || count || ')'}
      parents: ?{reports_to}
      values: ?{count}
      text: ?{title}
      textposition: "middle center"
      marker:
        colors: ?{avg_salary}
        colorscale: "Viridis"
        colorbar:
          title: "Avg Salary"
          tickformat: "$,.0f"
      pathbar:
        visible: true
        textfont:
          size: 12
```

## Sankey Diagram

Visualize flows and transformations:

```yaml
models:
  - name: customer_journey
    source_name: hierarchy_db
    sql: |
      WITH journey AS (
        SELECT * FROM (VALUES
          -- Traffic sources to landing pages
          ('Organic Search', 'Homepage', 3500, 'source'),
          ('Organic Search', 'Product Page', 2000, 'source'),
          ('Paid Ads', 'Landing Page', 4000, 'source'),
          ('Paid Ads', 'Product Page', 1500, 'source'),
          ('Social Media', 'Homepage', 2500, 'source'),
          ('Email', 'Product Page', 1000, 'source'),
          -- Landing to engagement
          ('Homepage', 'Sign Up', 2000, 'engagement'),
          ('Homepage', 'Browse Products', 4000, 'engagement'),
          ('Product Page', 'Add to Cart', 2500, 'engagement'),
          ('Product Page', 'Browse Products', 1000, 'engagement'),
          ('Landing Page', 'Sign Up', 3000, 'engagement'),
          ('Landing Page', 'Exit', 1000, 'engagement'),
          -- Engagement to conversion
          ('Sign Up', 'Trial', 3500, 'conversion'),
          ('Sign Up', 'Exit', 1500, 'conversion'),
          ('Browse Products', 'Add to Cart', 2000, 'conversion'),
          ('Browse Products', 'Exit', 3000, 'conversion'),
          ('Add to Cart', 'Purchase', 3000, 'conversion'),
          ('Add to Cart', 'Abandon Cart', 1500, 'conversion'),
          -- Final outcomes
          ('Trial', 'Paid Customer', 2000, 'outcome'),
          ('Trial', 'Churned', 1500, 'outcome'),
          ('Purchase', 'Repeat Customer', 1800, 'outcome'),
          ('Purchase', 'One-time Customer', 1200, 'outcome')
        ) AS t(source, target, value, stage)
      )
      SELECT 
        source,
        target,
        value,
        stage,
        CASE stage
          WHEN 'source' THEN '#3498db'
          WHEN 'engagement' THEN '#e74c3c'
          WHEN 'conversion' THEN '#f39c12'
          WHEN 'outcome' THEN '#2ecc71'
        END as color
      FROM journey

traces:
  - name: journey_sankey
    model: ${ref(customer_journey)}
    props:
      type: sankey
      node:
        label: ?{array_agg(DISTINCT source || target)}
        pad: 15
        thickness: 20
      link:
        source: ?{array_agg(source)}
        target: ?{array_agg(target)}
        value: ?{array_agg(value)}
        color: ?{array_agg(color)}
        opacity: 0.4
      textfont:
        size: 12
        
charts:
  - name: customer_flow
    traces:
      - ${ref(journey_sankey)}
    layout:
      title: "Customer Journey Flow"
      font:
        size: 10
```

## Parallel Categories

Show relationships between categorical variables:

```yaml
models:
  - name: survey_responses
    source_name: hierarchy_db
    sql: |
      WITH responses AS (
        SELECT 
          age_group,
          education,
          income_bracket,
          satisfaction,
          COUNT(*) as respondents
        FROM (
          SELECT 
            CASE 
              WHEN age < 25 THEN '18-24'
              WHEN age < 35 THEN '25-34'
              WHEN age < 45 THEN '35-44'
              ELSE '45+'
            END as age_group,
            education,
            CASE 
              WHEN income < 30000 THEN 'Low'
              WHEN income < 70000 THEN 'Medium'
              ELSE 'High'
            END as income_bracket,
            satisfaction
          FROM survey_data
        ) categorized
        GROUP BY age_group, education, income_bracket, satisfaction
      )
      SELECT * FROM responses

traces:
  - name: survey_parcats
    model: ${ref(survey_responses)}
    props:
      type: parcats
      dimensions:
        - label: "Age Group"
          values: ?{age_group}
        - label: "Education"
          values: ?{education}
        - label: "Income"
          values: ?{income_bracket}
        - label: "Satisfaction"
          values: ?{satisfaction}
      counts: ?{respondents}
      line:
        color: ?{CASE satisfaction 
          WHEN 'Very Satisfied' THEN '#2ecc71'
          WHEN 'Satisfied' THEN '#3498db'
          WHEN 'Neutral' THEN '#f39c12'
          WHEN 'Dissatisfied' THEN '#e74c3c'
        END}
```

## Best Practices

### Color Strategy
```yaml
# Use consistent colors for categories
marker:
  colors: ?{CASE department
    WHEN 'Engineering' THEN '#3498db'
    WHEN 'Sales' THEN '#e74c3c'
    WHEN 'Marketing' THEN '#f39c12'
    WHEN 'Operations' THEN '#2ecc71'
    ELSE '#95a5a6'
  END}
```

### Text Readability
```yaml
# Adjust text based on segment size
textfont:
  size: ?{CASE 
    WHEN value > 10000 THEN 14
    WHEN value > 5000 THEN 12
    ELSE 10
  END}
```

### Hierarchy Depth
- **Treemap**: Best for 2-4 levels
- **Sunburst**: Can handle 3-5 levels effectively
- **Icicle**: Good for deep hierarchies with text
- **Sankey**: Best for flow visualization, not deep hierarchy

### Performance Tips
```yaml
# Pre-aggregate hierarchical data
models:
  - name: hierarchy_summary
    sql: |
      WITH RECURSIVE tree AS (
        -- Recursive CTE to build hierarchy
        SELECT id, parent_id, value, 1 as level
        FROM nodes
        WHERE parent_id IS NULL
        
        UNION ALL
        
        SELECT n.id, n.parent_id, n.value, t.level + 1
        FROM nodes n
        JOIN tree t ON n.parent_id = t.id
      )
      SELECT * FROM tree
      WHERE level <= 4  -- Limit depth for performance
```

## Common Use Cases

### Financial Reporting
```yaml
models:
  - name: expense_breakdown
    sql: |
      SELECT 
        category,
        subcategory,
        expense_type,
        amount
      FROM financial_data
      WHERE fiscal_year = 2024
      ORDER BY category, subcategory
```

### Product Catalog
```yaml
models:
  - name: product_hierarchy
    sql: |
      SELECT 
        department,
        category,
        subcategory,
        product_name,
        revenue
      FROM product_catalog
      JOIN sales ON product_id = sales.product_id
```

### Website Analytics
```yaml
models:
  - name: user_flow
    sql: |
      SELECT 
        landing_page,
        second_page,
        exit_page,
        COUNT(*) as users
      FROM user_sessions
      GROUP BY landing_page, second_page, exit_page
```

## Interactive Features

### Drill-Down Capability
```yaml
props:
  type: sunburst
  # Enable clicking to zoom
  insidetextorientation: "radial"
  # Custom click behavior
  hovertemplate: "Click to zoom<extra></extra>"
```

### Path Highlighting
```yaml
# For icicle charts
pathbar:
  visible: true
  textfont:
    size: 14
  edgeshape: "diagonal"
```

## Related Resources
- [Bar Charts](bar.md) - Simple categorical comparisons
- [Pie Charts](pie.md) - Basic part-to-whole visualization
- [Network Graphs](../reference/configuration/trace/props/scatter.md) - Non-hierarchical relationships
- [Data Structure Concepts](../concepts/hierarchical-data.md) - Working with tree data

---
*Congratulations!* You've explored the complete Chart Gallery. Visit our [Tutorials](../tutorials/index.md) to see these charts in action within complete dashboards.