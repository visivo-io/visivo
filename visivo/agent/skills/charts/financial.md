---
name: financial
summary: Daily price bars (open/high/low/close) over time; the default for a single security's price history.
family: financial
---

# Financial charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `candlestick` (preferred): Daily price bars (open/high/low/close) over time; the default for a single security's price history.
- `ohlc` (niche): Open/high/low/close as tick bars; a thinner candlestick for finance readers who expect bar charts.

**Use when**
- Four price columns named like open, high, low and close per period over a time axis.
- One security (or one picked by an input) over enough periods to show a pattern: daily for shorter spans, weekly for longer ones.
- `intent: trend` or `change` on prices where intra-period range and direction both matter.
- The same OHLC shape as candlestick and the audience explicitly asks for tick bars (traders, print or monochrome).
- Denser series where filled candle bodies would merge but ticks still separate.

**Avoid when**
- Four metrics that merely share a time axis (fares, tips, tolls, total); the shape matches but the semantics do not, so use scatter lines.
- Only a close price is available, or the reader needs the level, not the range; a line is clearer.
- Too many candles for the width; they collapse to slivers, so regrain to weeks or months (first open, max high, min low, last close).
- Several securities on one chart with the default colours (every trace gets the same green and red, so tickers can't be told apart), at very different price levels on one axis, or more than the series limit; candles at the same date stack exactly and converging tickers tangle.
- No explicit ask; candlestick is the family default and reads faster for general audiences.
- Four metrics that are not open/high/low/close prices; the shape alone cannot tell, so use scatter lines.
- Too many periods even for ticks; regrain to weeks or months first.
- Several securities on one chart with the default colours (identical ticks), at very different price levels on one axis, or more than the series limit; ticks at the same date overlap and peers that move together hide each other.

**Data shape:** 4 metrics; 1–2 dimensions; 10–300 points on the axis (time, categorical).

**Limits:** 1 series ideal, 3 at most; over the limit, repair with `input_filter`, `small_multiples`, `regrain`.

**Gotchas**
- Plotly shows a range slider under candlestick and ohlc by default; set `layout.xaxis.rangeslider.visible: false` on dashboards, or it eats a third of a medium row.
- Weekends and holidays leave empty gaps on a date axis; add `xaxis.rangebreaks: [{bounds: [sat, mon]}]` (holidays need `values:` lists).
- `x` must be a real date: string dates like `6/5/24` sort and type as categories; `strptime` or cast in the model.
- Regrain with first/last, not sum/avg: `arg_min(open, date)`, `max(high)`, `min(low)`, `arg_max(close, date)` per `date_trunc('week', date)`.
- Every candlestick trace, split or not, takes the theme's up/down colours, so several tickers draw identically and their legend swatches match; bind the colours per ticker with a CASE and `[0]`. The legend shows the split value or the insight name, never `name`.
- Same range slider default as candlestick: set `layout.xaxis.rangeslider.visible: false` on dashboards.
- Same weekend gaps: `xaxis.rangebreaks: [{bounds: [sat, mon]}]` on a real date axis.
- Every ohlc trace takes the theme's up/down colours, so several tickers draw identically; bind `increasing.line.color`/`decreasing.line.color` per ticker with a CASE and `[0]`. With one ticker, leave them unset unless the brand requires it.
- Regrain with first/last (`arg_min(open, date)`, `arg_max(close, date)`), never avg of opens.

**Variations**
- When trading volume should be shown with the price: the `volume_bar_subplot` pairing: volume in its own band below the candles, with the dates under the volume.
- When two or three securities should be compared on one price axis: `split` on the ticker with a colour per ticker: `increasing.line.color`, `increasing.fillcolor` and `decreasing.line.color` each `"?{ CASE ${ref(prices).ticker} WHEN 'AAPL' THEN '#0a9396' WHEN 'MSFT' THEN '#5b4bab' ELSE '#9e9e9e' END }[0]"`, and `decreasing.fillcolor: 'rgba(0,0,0,0)'`, so colour is the ticker and a hollow body is a down day; avoid red and green, which read as up and down; normalise to % of the first open in SQL when price levels differ.
- When two or three securities should each keep their own price scale: one insight per ticker, named after the ticker, each on its own axis (`yaxis: y2`, `y3`); on the chart layout give `yaxis.domain`, `yaxis2.domain`, … equal bands with a small gap, `yaxis<N>.title.text` set to the ticker, `xaxis.anchor` set to the bottom band's axis so the dates sit under it, and `showlegend: false`.
- When one security is the focus and others are benchmarks: that security as candles and the others as `type: scatter`, `mode: lines` on close, all normalised to % of the first open, each line with its own `line.color` that is not red or green.
- When a moving average should run over the candles: a third insight `type: scatter`, `mode: lines` on the same axes, with the window function in SQL.

**Other uses**
- Intra-period range of any level that moves within a day or week (an account balance, inventory on hand, queue length): opening, peak, trough and closing value per period. `x: ?{ date_trunc('day', <ts>) }` with `open: ?{ arg_min(<level>, <ts>) }`, `high: ?{ max(<level>) }`, `low: ?{ min(<level>) }`, `close: ?{ arg_max(<level>, <ts>) }`.

**Placement:** `large` height, 12 of 12 columns, as a `hero`; pair with `volume_bar_subplot`, `kpi_strip_above`, `detail_table_below`.
**Mobile:** Full width, showing a recent window via an input or a default range; candles thinner than ~3 px stop reading as candles.

**Example** (`candlestick`)

```yaml
insights:
  - name: aapl-daily-candles
    props:
      type: candlestick
      x: ?{ ${ref(aapl).date} }
      open: ?{ ${ref(aapl).open} }
      high: ?{ ${ref(aapl).high} }
      low: ?{ ${ref(aapl).low} }
      close: ?{ ${ref(aapl).close} }
charts:
  - name: aapl-price
    insights:
      - ${ref(aapl-daily-candles)}
    layout: {xaxis: {rangeslider: {visible: false}, rangebreaks: [{bounds: [sat, mon]}]}}
```
<!-- rules:end -->
