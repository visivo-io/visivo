# ProjectNew Component

A new project view that pulls data from individual stores instead of `project_json`, enabling draft/published workflows.

## Features

- **Store-based Architecture**: Fetches charts, tables, markdowns, and inputs from their respective stores
- **Draft Support**: Shows draft versions of objects merged with published versions (like EditorNew/LineageNew)
- **Backward Compatible**: Handles both string references (new format) and embedded objects (legacy format)
- **Performance Optimized**: Viewport-based loading and centralized insight/input prefetching
- **Responsive**: Adapts to screen size (column mode below 1024px breakpoint)

## Usage

### Accessing the View

**Local Development:**
```
http://localhost:3000/project-new/dashboard-name
```

**Deployed/Distribution:**
```
https://your-domain.com/project-new/dashboard-name
```

### URL Structure

The route requires a dashboard name parameter:
- `/project-new/:dashboardName`

Example: `/project-new/main-dashboard`

## How It Works

### 1. Data Flow

```
Dashboard Store → Layout/Structure (rows, items, positioning)
      ↓
Item Stores → Actual Content (chart configs, table configs, etc.)
      ↓
Components → Rendered UI
```

### 2. Item Resolution

The component uses the `resolveItem` helper to handle both formats:

```javascript
// New format (string reference)
{ chart: "sales-chart" }  → looks up from chart store

// Legacy format (embedded object)
{ chart: { name: "sales-chart", ... } }  → uses directly
```

### 3. Supported Item Types

- ✅ **Charts**: Resolved from chart store
- ✅ **Tables**: Resolved from table store
- ✅ **Markdowns**: Resolved from markdown store
- ✅ **Inputs**: Resolved from input store
- ❌ **Selectors**: Not supported (as designed)

## Dashboard Structure

Expected dashboard structure from the dashboard store:

```javascript
{
  name: "dashboard-name",
  rows: [
    {
      height: "medium", // xsmall, small, medium, large, xlarge, xxlarge, compact
      items: [
        {
          chart: "chart-name",  // or embedded object
          width: 1              // grid width (1-12)
        },
        {
          table: "table-name",
          width: 2
        },
        // ... more items
      ]
    },
    // ... more rows
  ]
}
```

## Error Handling

When an item cannot be found in its store:

```
Chart not found: chart-name
Table not found: table-name
Markdown not found: markdown-name
Input not found: input-name
```

## States

### Loading State
```
Loading dashboard...
```

### Empty State
```
This dashboard is empty
```

## Integration Points

### Stores Used
- `dashboards` - Dashboard layout/structure
- `charts` - Chart configurations
- `tables` - Table configurations
- `markdowns` - Markdown content
- `inputs` - Input configurations
- `project` - Project metadata

### Hooks Used
- `useParams` - Get dashboard name from URL
- `useSearchParams` - Query parameters (for future selector support)
- `useVisibleRows` - Viewport-based loading optimization
- `useInsightsData` - Centralized insight prefetching
- `useInputsData` - Centralized input prefetching
- `useDimensions` - Responsive width tracking

## Testing

Run tests:
```bash
yarn test ProjectNew
```

All 5 tests should pass:
- ✅ Renders loading state when dashboard not found
- ✅ Renders empty state when dashboard has no rows
- ✅ Renders chart when found in store
- ✅ Shows error message when chart not found
- ✅ Fetches all data on mount

## Comparison with Original Dashboard

| Feature | Original Dashboard | ProjectNew |
|---------|-------------------|------------|
| Data Source | `project_json` | Individual stores |
| Draft Support | No | Yes |
| Selectors | Yes | No |
| Item Resolution | Embedded only | String ref + embedded |
| Loading Strategy | All at once | Viewport-based |
| URL Pattern | `/project/:dashboard` | `/project-new/:dashboard` |

## Migration Path

To migrate from the original Dashboard view:

1. Ensure all stores are properly loaded (`fetchCharts()`, `fetchTables()`, etc.)
2. Update dashboard configs to use string references instead of embedded objects
3. Test with `/project-new/:dashboardName` route
4. Once verified, replace original `/project` route with ProjectNew

## Future Enhancements

Potential improvements:
- [ ] Add selector support (if needed)
- [ ] Add real-time updates for draft changes
- [ ] Add loading skeletons for better UX
- [ ] Add error recovery/retry logic
- [ ] Add keyboard shortcuts for navigation
