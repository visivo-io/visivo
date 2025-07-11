# Pie Charts

Pie charts display data as proportions of a whole, making them perfect for showing percentage breakdowns and composition analysis. Visivo also supports donut charts and various customization options.

## Quick Examples

<div class="grid cards" markdown>

-   __Simple Pie Chart__

    ---
    
    Basic pie chart showing proportions.
    
    ![](../assets/example-charts/props/pie/simple-pie.png)
    
    ```yaml
    props:
      type: pie
      labels: ?{category}
      values: ?{value}
    ```

-   __Donut Chart__

    ---
    
    Pie chart with a hole in the center.
    
    ![](../assets/example-charts/props/pie/custom-colors-pie.png)
    
    ```yaml
    props:
      type: pie
      labels: ?{category}
      values: ?{value}
      hole: 0.4
    ```

-   __Exploded Slices__

    ---
    
    Emphasize specific segments.
    
    ![](../assets/example-charts/props/pie/pie-hover-info.png)
    
    ```yaml
    props:
      type: pie
      labels: ?{category}
      values: ?{value}
      pull: ?{importance}
    ```

</div>

## When to Use

### Pie charts work best for:
- **Showing parts of a whole** (must add up to 100%)
- **Comparing proportions** between 3-7 categories
- **Highlighting a dominant category**
- **Simple percentage breakdowns**

### Avoid pie charts when:
- You have more than 7 categories (use bar chart instead)
- Precise value comparison is needed
- Values are similar in size
- Showing change over time

## Complete Examples

### Basic Pie Chart

Simple pie chart with custom colors:

![](../assets/example-charts/props/pie/simple-pie.png)

```yaml
models:
  - name: market-share
    args:
      - echo
      - |
        company,market_share,growth
        "Company A",35,0.12
        "Company B",28,0.08
        "Company C",20,-0.02
        "Company D",12,0.15
        "Others",5,0.03

traces:
  - name: Market Share Distribution
    model: ${ref(market-share)}
    props:
      type: pie
      labels: ?{company}
      values: ?{market_share}
      textinfo: "label+percent"
      textposition: "outside"
      marker:
        colors: ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd"]
      hovertemplate: |
        <b>%{label}</b><br>
        Market Share: %{value}%<br>
        Growth: %{customdata[0]:.1%}
        <extra></extra>
      customdata: ?{array[growth]}

charts:
  - name: Market Share Chart
    traces:
      - ${ref(Market Share Distribution)}
    layout:
      title: "Market Share Distribution"
      showlegend: true
      height: 500
```

### Donut Chart with Center Text

Create a donut chart with KPI in the center:

![](../assets/example-charts/props/pie/custom-colors-pie.png)

```yaml
models:
  - name: expense-breakdown
    args:
      - echo
      - |
        category,amount
        "Salaries",450000
        "Marketing",120000
        "Operations",85000
        "R&D",95000
        "Other",50000

traces:
  - name: Expense Donut
    model: ${ref(expense-breakdown)}
    props:
      type: pie
      labels: ?{category}
      values: ?{amount}
      hole: 0.5
      textinfo: "label+percent"
      textposition: "outside"
      marker:
        colors: ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6"]
        line:
          color: "white"
          width: 2

charts:
  - name: Expense Breakdown
    traces:
      - ${ref(Expense Donut)}
    layout:
      title: "Annual Expense Breakdown"
      annotations:
        - text: "<b>$800K</b><br>Total"
          x: 0.5
          y: 0.5
          xref: "paper"
          yref: "paper"
          showarrow: false
          font:
            size: 20
```

### Multi-Level Pie (Sunburst Alternative)

Show hierarchical data with multiple pie charts:

```yaml
models:
  - name: sales-hierarchy
    args:
      - echo
      - |
        region,country,sales
        "North America","USA",45000
        "North America","Canada",15000
        "Europe","UK",25000
        "Europe","Germany",30000
        "Europe","France",20000
        "Asia","China",35000
        "Asia","Japan",28000

traces:
  # Inner ring - Regions
  - name: Regional Sales
    model: |
      select region, sum(sales) as sales 
      from ${ref(sales-hierarchy)} 
      group by region
    props:
      type: pie
      labels: ?{region}
      values: ?{sales}
      hole: 0.3
      domain:
        x: [0, 0.5]
      textinfo: "label"
      
  # Outer ring - Countries  
  - name: Country Sales
    model: ${ref(sales-hierarchy)}
    props:
      type: pie
      labels: ?{country}
      values: ?{sales}
      hole: 0.6
      domain:
        x: [0.5, 1]
      textinfo: "label+percent"
```

### Pie Chart with Pulled Slices

Emphasize important segments:

![](../assets/example-charts/props/pie/pie-hover-info.png)

```yaml
traces:
  - name: Product Categories
    model: ${ref(product-sales)}
    props:
      type: pie
      labels: ?{category}
      values: ?{revenue}
      pull: ?{case 
        when category = 'Featured Product' then 0.2
        when revenue > 100000 then 0.1
        else 0
      end}
      textinfo: "label+value"
      texttemplate: "%{label}<br>$%{value:,.0f}"
      insidetextorientation: "radial"
```

## Advanced Features

### Custom Text Formatting

Control what appears on slices:

```yaml
props:
  textinfo: "label+text+percent"  # Combine multiple
  text: ?{concat('$', format(revenue, ',.0f'))}
  texttemplate: "<b>%{label}</b><br>%{percent}<br>%{text}"
  textposition: "inside"  # inside, outside, auto
  insidetextorientation: "horizontal"  # radial, tangential, horizontal, auto
```

### Dynamic Colors

Color slices based on data:

```yaml
marker:
  colors: ?{case 
    when growth > 0 then '#2ca02c'
    when growth < 0 then '#d62728'
    else '#ff7f0e'
  end}
  line:
    color: "white"
    width: 2
```

### Hover Customization

Rich hover information:

```yaml
hovertemplate: |
  <b>%{label}</b><br>
  Value: $%{value:,.0f}<br>
  Percentage: %{percent}<br>
  Year-over-Year: %{customdata[0]:+.1%}<br>
  Rank: #%{customdata[1]}
  <extra></extra>
customdata: ?{array[yoy_growth, rank]}
hoverlabel:
  bgcolor: "white"
  bordercolor: "black"
```

## Common Patterns

### Threshold Highlighting

Highlight slices above/below threshold:

```yaml
marker:
  colors: ?{case when percentage > 20 then '#e74c3c' else '#95a5a6' end}
  line:
    color: ?{case when percentage > 20 then '#c0392b' else 'white' end}
    width: ?{case when percentage > 20 then 3 else 1 end}
```

### Small Slices Grouping

Group small values into "Other":

```sql
-- In your model
select 
  case 
    when revenue_share < 0.05 then 'Other'
    else category 
  end as category,
  sum(revenue) as revenue
from sales
group by 1
```

### Nested Donut Charts

Create concentric rings:

```yaml
traces:
  - name: Inner Ring
    props:
      type: pie
      hole: 0.3
      domain:
        x: [0.2, 0.8]
        y: [0.2, 0.8]
        
  - name: Outer Ring
    props:
      type: pie
      hole: 0.65
      domain:
        x: [0, 1]
        y: [0, 1]
```

## Tips & Best Practices

!!! tip "Design Guidelines"
    - Limit to 5-7 slices for clarity
    - Order slices from largest to smallest
    - Use consistent color schemes across related charts
    - Include percentages in labels or hover

!!! warning "Common Mistakes"
    - Don't use 3D pie charts - they distort perception
    - Avoid pie charts for time series data
    - Don't compare multiple pie charts side-by-side
    - Ensure values actually represent parts of a whole

!!! info "Accessibility"
    - Use patterns or textures for color-blind users
    - Include text labels, not just legend
    - Provide data table alternative
    - Use sufficient color contrast

## Alternative Visualizations

Consider these alternatives when pie charts aren't ideal:

- **[Bar Charts](bar.md)**: Better for precise comparisons
- **[Treemaps](hierarchical.md#treemap)**: For hierarchical part-to-whole
- **[Stacked Bars](bar.md#stacked-bars)**: For part-to-whole over time
- **[Sunburst](hierarchical.md#sunburst)**: For multi-level hierarchies

## Styling Options

### Text Styling

```yaml
textfont:
  size: 14
  color: "white"
  family: "Arial Black"
outsidetextfont:
  size: 12
  color: "black"
```

### Legend Customization

```yaml
layout:
  legend:
    orientation: "v"  # v for vertical, h for horizontal
    x: 1.1
    y: 0.5
    bgcolor: "rgba(255,255,255,0.8)"
    bordercolor: "black"
    borderwidth: 1
```

### Animation

```yaml
layout:
  transition:
    duration: 500
    easing: "cubic-in-out"
```

## Full Configuration Reference

For a complete list of all available properties, see the [Pie Trace Configuration](../reference/configuration/Trace/Props/Pie/index.md).

---

_Need help choosing between pie charts and other visualizations?_ Check our [Chart Selection Guide](index.md#chart-selection-guide).