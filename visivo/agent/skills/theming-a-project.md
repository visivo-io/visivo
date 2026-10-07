---
name: theming-a-project
summary: Change the colors, fonts and light/dark mode every dashboard uses.
---

# Theme a project

A project has one theme, and it decides how every dashboard is drawn: series
colors, fonts, the surfaces behind charts and tables, and whether dashboards
open light or dark.

```yaml
theme:
  mode: auto                 # light | dark | auto (follows the viewer's OS)
  colorway: ["#0a9396", "#d25946", "#5b4bab"]
  light:
    accent: "#2d6a6f"
  dark:
    background: "#121527"
```

Tokens at the top level apply to both modes; tokens under `light:` or `dark:`
apply to one and win over the shared ones. Anything left unset falls back to
Visivo's built-in theme for that mode, so you can set one token and still get a
coherent dashboard.

## Read it, change it, write it back

`write_theme` **replaces** the theme. There is no name to merge on, so a config
that omits a token drops it. Always `get_theme` first, change what you mean to,
and write the whole document back. `get_schema('theme')` has the vocabulary.

## Colors are hex, and the token set is closed

`#1d2136` or `#fff`, not `chartreuse` or `rgb(...)`. Unknown tokens are
rejected rather than ignored, so a plausible invention like `primary_color`
fails — check `get_schema('theme')` rather than guessing a name.

## Do not restyle a chart to change the palette

If someone wants different colors, set `colorway` on the theme. Writing
`marker.color` onto each insight does the same thing for one project and then
opts those charts out of theming forever, because an explicit color always beats
the theme. A chart that names its own color cannot follow light/dark.

## Contrast is a real constraint

The built-in colorways are checked for contrast against both backgrounds and
for color-vision deficiency. A hand-picked palette is not. When choosing one,
keep series colors distinct in both modes, and keep text readable on the
surface behind it.
