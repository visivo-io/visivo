# OHLC Charts

OHLC (Open-High-Low-Close) charts display the same financial data as candlestick charts but with a cleaner, more minimalist design. They use vertical lines with horizontal ticks to show price movements.

## When to Use OHLC Charts

- **Professional Trading**: Preferred by many professional traders for clarity
- **Dense Data**: Better for displaying many data points without overlap
- **Print Media**: Cleaner appearance in black and white
- **Technical Analysis**: Less visual noise for pattern recognition

## Basic OHLC Chart

Create a simple OHLC chart with stock data:

```yaml
name: ohlc-analysis

sources:
  - name: trading_db
    type: duckdb
    database: ":memory:"

models:
  - name: forex_data
    source_name: trading_db
    sql: |
      WITH RECURSIVE hours AS (
        SELECT 
          TIMESTAMP '2024-01-01 00:00:00' as time,
          1.0850 as base_rate  -- EUR/USD starting rate
        UNION ALL
        SELECT 
          time + INTERVAL '4 hours',  -- 4-hour candles
          base_rate * (1 + (RANDOM() - 0.5) * 0.002)
        FROM hours
        WHERE time < TIMESTAMP '2024-02-01 00:00:00'
      )
      SELECT 
        time,
        base_rate * (1 + (RANDOM() - 0.5) * 0.001) as open,
        base_rate * (1 + ABS(RANDOM()) * 0.0015) as high,
        base_rate * (1 - ABS(RANDOM()) * 0.0015) as low,
        base_rate as close
      FROM hours

traces:
  - name: eur_usd_ohlc
    model: ${ref(forex_data)}
    props:
      type: ohlc
      x: ?{time}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      increasing:
        line:
          color: "#26a69a"
          width: 2
      decreasing:
        line:
          color: "#ef5350"
          width: 2
          
charts:
  - name: forex_chart
    traces:
      - ${ref(eur_usd_ohlc)}
    layout:
      title: "EUR/USD Exchange Rate"
      xaxis:
        title: "Time"
        rangeslider:
          visible: false  # Cleaner without rangeslider
      yaxis:
        title: "Exchange Rate"
        tickformat: ".4f"
```

## Commodity Prices

Track commodity futures with daily OHLC:

```yaml
models:
  - name: oil_futures
    source_name: trading_db
    sql: |
      WITH RECURSIVE days AS (
        SELECT 
          DATE '2024-01-01' as date,
          75.50 as base_price  -- WTI Crude starting price
        UNION ALL
        SELECT 
          date + INTERVAL '1 day',
          CASE 
            -- Add some volatility events
            WHEN date = DATE '2024-01-15' THEN base_price * 1.05
            WHEN date = DATE '2024-01-22' THEN base_price * 0.97
            ELSE base_price * (1 + (RANDOM() - 0.5) * 0.03)
          END
        FROM days
        WHERE date < DATE '2024-03-01'
      )
      SELECT 
        date,
        ROUND(base_price * (1 + (RANDOM() - 0.5) * 0.01), 2) as open,
        ROUND(base_price * (1 + ABS(RANDOM()) * 0.02), 2) as high,
        ROUND(base_price * (1 - ABS(RANDOM()) * 0.02), 2) as low,
        ROUND(base_price, 2) as close,
        CAST(100000 + RANDOM() * 50000 AS INTEGER) as volume
      FROM days
      WHERE EXTRACT(DOW FROM date) NOT IN (0, 6)

traces:
  - name: oil_ohlc
    model: ${ref(oil_futures)}
    props:
      type: ohlc
      x: ?{date}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      line:
        width: 1.5
      tickwidth: 0.5
```

## OHLC with Bollinger Bands

Add technical indicators to OHLC charts:

```yaml
models:
  - name: prices_with_bands
    source_name: trading_db
    sql: |
      WITH price_stats AS (
        SELECT 
          *,
          AVG(close) OVER (ORDER BY date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) as sma20,
          STDDEV(close) OVER (ORDER BY date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) as std20
        FROM ${ref(oil_futures)}
      )
      SELECT 
        *,
        sma20 + 2 * std20 as upper_band,
        sma20 - 2 * std20 as lower_band
      FROM price_stats

traces:
  - name: price_ohlc
    model: ${ref(prices_with_bands)}
    props:
      type: ohlc
      x: ?{date}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      name: "Price"
      
  - name: middle_band
    model: ${ref(prices_with_bands)}
    props:
      type: scatter
      x: ?{date}
      y: ?{sma20}
      mode: "lines"
      name: "SMA(20)"
      line:
        color: "#ff9800"
        width: 2
        
  - name: upper_band
    model: ${ref(prices_with_bands)}
    props:
      type: scatter
      x: ?{date}
      y: ?{upper_band}
      mode: "lines"
      name: "Upper Band"
      line:
        color: "#9e9e9e"
        dash: "dot"
        
  - name: lower_band
    model: ${ref(prices_with_bands)}
    props:
      type: scatter
      x: ?{date}
      y: ?{lower_band}
      mode: "lines"
      name: "Lower Band"
      line:
        color: "#9e9e9e"
        dash: "dot"
```

## Index Comparison

Compare multiple market indices:

```yaml
models:
  - name: market_indices
    source_name: trading_db
    sql: |
      WITH indices AS (
        SELECT 
          date,
          index_name,
          CASE index_name
            WHEN 'S&P 500' THEN 4500 + (RANDOM() - 0.5) * 200
            WHEN 'NASDAQ' THEN 15000 + (RANDOM() - 0.5) * 800
            WHEN 'DOW' THEN 35000 + (RANDOM() - 0.5) * 1000
          END * (1 + (date - DATE '2024-01-01') * 0.0001) as base
        FROM 
          (SELECT DATE '2024-01-01' + (INTERVAL '1 day' * s) as date
           FROM generate_series(0, 60) s),
          (SELECT 'S&P 500' as index_name 
           UNION ALL SELECT 'NASDAQ' 
           UNION ALL SELECT 'DOW')
        WHERE EXTRACT(DOW FROM date) NOT IN (0, 6)
      )
      SELECT 
        date,
        index_name,
        base * 0.998 as open,
        base * 1.005 as high,
        base * 0.995 as low,
        base as close
      FROM indices

# Normalize to percentage change for comparison
traces:
  - name: sp500_normalized
    model: |
      WITH first_close AS (
        SELECT close FROM ${ref(market_indices)} 
        WHERE index_name = 'S&P 500' 
        ORDER BY date LIMIT 1
      )
      SELECT 
        date,
        100 * (open / (SELECT close FROM first_close) - 1) as open,
        100 * (high / (SELECT close FROM first_close) - 1) as high,
        100 * (low / (SELECT close FROM first_close) - 1) as low,
        100 * (close / (SELECT close FROM first_close) - 1) as close
      FROM ${ref(market_indices)}
      WHERE index_name = 'S&P 500'
    props:
      type: ohlc
      x: ?{date}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      name: "S&P 500"
```

## Intraday with Session Markers

Show trading sessions with vertical lines:

```yaml
models:
  - name: intraday_fx
    source_name: trading_db
    sql: |
      SELECT 
        time,
        open, high, low, close,
        CASE 
          WHEN EXTRACT(HOUR FROM time) BETWEEN 8 AND 16 THEN 'London'
          WHEN EXTRACT(HOUR FROM time) BETWEEN 13 AND 21 THEN 'New York'
          WHEN EXTRACT(HOUR FROM time) BETWEEN 0 AND 8 THEN 'Tokyo'
          ELSE 'Overlap'
        END as session
      FROM ${ref(forex_data)}

traces:
  - name: fx_ohlc
    model: ${ref(intraday_fx)}
    props:
      type: ohlc
      x: ?{time}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      
  # Add session markers
  - name: session_markers
    model: |
      SELECT DISTINCT
        time,
        session,
        MIN(low) OVER () * 0.999 as y_min,
        MAX(high) OVER () * 1.001 as y_max
      FROM ${ref(intraday_fx)}
      WHERE session != LAG(session) OVER (ORDER BY time)
    props:
      type: scatter
      x: ?{time}
      y: ?{y_min}
      mode: "lines"
      line:
        color: "rgba(128, 128, 128, 0.3)"
        width: 1
      showlegend: false
```

## Customization Options

### Tick Width and Style

```yaml
props:
  type: ohlc
  # Tick customization
  tickwidth: 0.3  # Width of open/close ticks (0-1)
  
  # Different styles for up/down days
  increasing:
    line:
      color: "#00c853"
      width: 2
  decreasing:
    line:
      color: "#d50000"
      width: 2
```

### Hover Information

```yaml
props:
  type: ohlc
  hovertext: ?{array['Volume: ' || volume || 'K']}
  hoverinfo: "x+text"
  hoverlabel:
    bgcolor: "white"
    bordercolor: "black"
```

## Best Practices

### Data Validation
```yaml
models:
  - name: validated_ohlc
    sql: |
      SELECT * FROM prices
      WHERE high >= open 
        AND high >= close
        AND low <= open
        AND low <= close
        AND high >= low
```

### Performance Optimization
- **Aggregation**: Pre-aggregate minute data to hourly/daily
- **Sampling**: For large datasets, consider sampling or windowing
- **Indexing**: Ensure date columns are indexed

### Visual Clarity
- **Line Width**: Use thinner lines (1-2px) for dense data
- **Color Contrast**: Ensure sufficient contrast between up/down colors
- **Grid Lines**: Add subtle grid for price reference

## Common Use Cases

### Earnings Calendar Overlay
```yaml
traces:
  - name: earnings_markers
    model: |
      SELECT 
        earnings_date as x,
        'Earnings' as text,
        MAX(high) OVER () * 1.02 as y
      FROM company_earnings
    props:
      type: scatter
      x: ?{x}
      y: ?{y}
      mode: "markers+text"
      marker:
        symbol: "triangle-down"
        size: 10
        color: "#ff9800"
      text: ?{text}
      textposition: "top"
```

### Multi-Timeframe Analysis
```yaml
# Daily OHLC with weekly overlay
models:
  - name: weekly_ohlc
    sql: |
      SELECT 
        DATE_TRUNC('week', date) as week,
        FIRST_VALUE(open) OVER w as open,
        MAX(high) OVER w as high,
        MIN(low) OVER w as low,
        LAST_VALUE(close) OVER w as close
      FROM daily_prices
      WINDOW w AS (PARTITION BY DATE_TRUNC('week', date) ORDER BY date)
```

## Comparison: OHLC vs Candlestick

| Feature | OHLC | Candlestick |
|---------|------|-------------|
| Visual Density | High - can show more data | Low - bodies take space |
| Color Dependency | Optional | Required for clarity |
| Print Friendly | Yes | No |
| Beginner Friendly | No | Yes |
| Pattern Recognition | Professional | Intuitive |

## Related Resources
- [Candlestick Charts](candlestick.md) - More visual price representation
- [Line Charts](scatter.md#line-charts) - Simple closing price trends
- [Area Charts](area.md) - For cumulative values
- [Financial Analysis](../concepts/financial.md) - Understanding market data

---
*Next Steps:* Explore [Area Charts](area.md) for visualizing cumulative values and trends