# Themes

Every dashboard is drawn with a theme. A theme sets the series colors, fonts and the surfaces
behind charts, tables, markdown and inputs. Visivo ships two built-in themes, **light** and
**dark**, designed to work for every chart type, and dashboards open in light mode by default.

Viewers can switch between light, dark and their system setting with the toggle in the top right
corner of a dashboard. Their choice is remembered in their browser.

## Customizing the theme for a project

Add a `theme` to your project to change the default mode or override any part of the built-in
themes. Tokens at the top level apply to both modes; tokens under `light` or `dark` apply only to
that mode.

``` yaml
theme:
  mode: auto                  # light, dark, or auto to follow the viewer's system setting
  allow_viewer_toggle: true   # set to false to always show `mode`
  font_family: "Inter, system-ui, sans-serif"
  colorway: ["#0a9396", "#d25946", "#5b4bab", "#4f9a3f"]
  light:
    accent: "#2d6a6f"
  dark:
    background: "#121527"
    surface: "#1b1f36"
```

| Token | What it colors |
| --- | --- |
| `background` | The page behind dashboard items |
| `surface` | Charts, tables and other cards |
| `text` / `muted_text` | Body text, and axis ticks and labels |
| `border` / `grid` | Card borders and axis lines, and chart gridlines |
| `accent` | Selected inputs, gauges and table hover rows |
| `colorway` | Series colors, as a list or the name of a predefined palette |
| `font_family` / `font_size` | Text in charts, tables and markdown |

You can also edit the theme from the **Project settings** panel in the workspace, which previews
your changes in both modes before you commit them.

## Plotly layout

For anything the tokens don't cover, `plotly_layout` takes any Plotly
[layout](../reference/configuration/Chart/Layout/index.md) property and applies it to every
chart. It can be set at the top level or per mode.

``` yaml
theme:
  plotly_layout:
    hoverlabel:
      font:
        size: 13
  dark:
    plotly_layout:
      geo:
        showocean: true
```

## What wins

From lowest to highest priority:

1. The built-in light or dark theme
2. Top-level theme tokens
3. Tokens under `light` or `dark`
4. Top-level `plotly_layout`
5. `plotly_layout` under `light` or `dark`
6. The chart's own `layout`

A chart that hard-codes colors in its `layout`, like `plot_bgcolor: white`, keeps them in both
modes. Leave colors out of chart layouts to let the theme handle them.
