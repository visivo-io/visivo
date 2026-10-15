---
name: view-and-analyze-dashboard-screenshot
summary: A dashboard you have not seen is a dashboard you have not finished.
tools: [write_dashboard, screenshot_dashboard]
---

# View and analyze a dashboard screenshot

The config being valid says nothing about whether the page reads. Charts
overlap, a row wraps, a legend sits on the data, ticks collide, a chart comes
back empty because its insight returned no rows. None of that is visible in
YAML, and all of it is obvious in a picture.

So after writing or changing a dashboard, call `screenshot_dashboard` with its
name and actually read the image before you report back.

## What to look for

- **An empty chart, or one still showing a spinner.** Empty usually means the
  insight returned no rows — check it with `preview_insight` rather than
  changing the chart.
- **Overlap and clipping.** A legend over the plot area, a title cut off, a
  chart squeezed so its axis labels run together. These are layout problems:
  fix the row, not the chart.
- **A row that wrapped.** Too many items in one row, or widths that do not
  sum the way you expected.
- **Unreadable text.** Ticks on top of each other usually means too many
  categories; a top-N or an input is the fix.
- **Whether it reads top to bottom.** Headline numbers, then the main
  picture, then the breakdowns. If the first thing you see is a detail table,
  the order is wrong.

## Reading the result

The result carries `width` and `height`. If it also carries a `scale` below
1, the image was shrunk to fit what the model providers accept — and if the
result says the text may be unreadable, **do not guess at it**. Call again
with `full_page: false` to see the top of the dashboard at full size.

A `warning` about a run still building means some charts were mid-render.
Take it again rather than reporting an empty chart that was merely slow.

## Then fix it

Finding a problem is half the job. Change the dashboard, screenshot it again,
and only tell the user it is done once the picture looks right. If something
is wrong that you cannot fix, say what you saw and what you tried.
