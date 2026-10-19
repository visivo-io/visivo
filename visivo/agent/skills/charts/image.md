---
name: image
summary: Draws a raster (a grid of colored pixels or a base64 image) on x/y axes; almost never the answer for SQL data.
family: image
---

# Image charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `image` (niche): Draws a raster (a grid of colored pixels or a base64 image) on x/y axes; almost never the answer for SQL data.

**Use when**
- A real raster already exists as a pixel array (a rendered map tile, a sensor or microscope frame) and must sit on numeric axes.
- A static picture must share axes with other insights (markers over a floor plan): set `source` to a base64 data URI.
- The user explicitly asks for an image trace; it never wins on its own for metric × dimension data.

**Avoid when**
- A metric over two dimensions; that is a `heatmap` (x, y, z rows with a colorscale), not an image.
- Just showing a logo, screenshot or diagram; use a markdown item with `<img src="https://…">`, no axes and no query.
- The pixels would have to be assembled from rows in SQL; the nested-array cell is brittle and unreadable to review.
- Any value the reader must compare or read; pixels carry color only, with no colorscale, legend or per-value hover.

**Data shape:** 0–1 metrics; 0–2 dimensions; 2–500 values on the main dimension (numeric_discrete).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `heatmap`.

**Gotchas**
- `source` accepts only a base64 data URI (`data:image/png;base64,…`, also jpeg, gif, webp); an https URL or an SVG data URI is silently dropped and nothing draws. When both are set, `z` wins.
- `z` is a 2D array of pixel rows, each pixel a list of 3–4 numbers in the `colormodel` (rgb, rgba, rgba256, hsl, hsla); scalar pixels draw nothing, which is a `heatmap`.
- A nested LIST cell from `?{ … }[0]` reaches Plotly as an Arrow vector, not an array, and draws nothing (a `[[…]]` VARCHAR is a string, also nothing); bind `source: ?{ <data_uri_column> }[0]` instead.
- `colorscale` does not exist on image; the y axis is reversed by default so row 0 is at the top.

**Variations**
- When the request is really a metric over a grid: a `heatmap` (z with a colorscale), which is what most image requests mean.
- When the picture is a file rather than pixels in a model: `source: data:image/png;base64,…` in place of `z`.
- When markers should sit on top of a picture: the image plus a scatter insight on the same chart, aligned with `x0`/`dx`/`y0`/`dy`.
- When the picture is decorative or for reference only: a markdown item with `<img>` instead of a chart.

**Placement:** `medium` height, 6 of 12 columns, as a `relationship`; pair with `scatter_overlay`.
**Mobile:** Set `layout.yaxis.scaleanchor: x` so pixels stay square; a half-width image shrinks to a thumbnail on a phone.

**Example** (`image`)

```yaml
insights:
  - name: depot-raster
    props:
      type: image
      source: ?{ ${ref(depot_raster).png_data_uri} }[0]
      x0: 0
      dx: 1
      y0: 0
      dy: 1
```
<!-- rules:end -->
