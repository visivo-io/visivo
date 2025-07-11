# Box Plots

Box plots (also known as box-and-whisker plots) are excellent for displaying the distribution of data through quartiles. They're particularly useful for comparing distributions across multiple categories.

## Overview

Box plots show:
- **Median** (50th percentile) - center line
- **First quartile** (Q1, 25th percentile) - bottom of box
- **Third quartile** (Q3, 75th percentile) - top of box
- **Whiskers** - extend to min/max within 1.5 × IQR
- **Outliers** - individual points beyond whiskers

## Basic Example

```yaml
traces:
  - name: salary_distribution
    model: ${ref(employee_data)}
    props:
      type: box
      y: ?{salary}
      x: ?{department}
      name: "Salary by Department"
      boxpoints: "outliers"
      marker:
        color: "#1f77b4"
```

## Complete Example

{! ../reference/props-docs/box.md !}

---

_For more statistical visualizations, see:_ [Violin Plots](violin.md) | [Histograms](histogram.md)