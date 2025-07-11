# Candlestick Charts

Candlestick charts are the standard for visualizing financial data, showing open, high, low, and close (OHLC) values in an intuitive format. Each "candle" tells a story about price movement during a specific time period.

## When to Use Candlestick Charts

- **Stock Market Analysis**: Track price movements and trends
- **Cryptocurrency Trading**: Monitor volatile price action  
- **Financial Reporting**: Display price ranges over time
- **Pattern Recognition**: Identify trading patterns and signals

## Basic Candlestick Chart

Create a simple candlestick chart with stock price data:

```yaml
name: stock-analysis

sources:
  - name: market_db
    type: duckdb
    database: ":memory:"

models:
  - name: stock_prices
    source_name: market_db
    sql: |
      WITH RECURSIVE trading_days AS (
        SELECT DATE '2024-01-01' as date, 100.0 as base_price
        UNION ALL
        SELECT 
          date + INTERVAL '1 day',
          base_price * (1 + (RANDOM() - 0.5) * 0.04) -- ±2% daily movement
        FROM trading_days
        WHERE date < DATE '2024-03-01'
      ),
      daily_prices AS (
        SELECT 
          date,
          base_price as close,
          base_price * (1 + (RANDOM() - 0.5) * 0.02) as open,
          base_price * (1 + ABS(RANDOM()) * 0.03) as high,
          base_price * (1 - ABS(RANDOM()) * 0.03) as low
        FROM trading_days
        WHERE EXTRACT(DOW FROM date) NOT IN (0, 6) -- Exclude weekends
      )
      SELECT 
        date,
        ROUND(open, 2) as open,
        ROUND(high, 2) as high,
        ROUND(low, 2) as low,
        ROUND(close, 2) as close
      FROM daily_prices

traces:
  - name: stock_candles
    model: ${ref(stock_prices)}
    props:
      type: candlestick
      x: ?{date}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      increasing:
        line:
          color: "#26a69a"  # Green for up days
      decreasing:
        line:
          color: "#ef5350"  # Red for down days
          
charts:
  - name: stock_chart
    traces:
      - ${ref(stock_candles)}
    layout:
      title: "Stock Price Movement"
      xaxis:
        title: "Date"
        rangeslider:
          visible: true
      yaxis:
        title: "Price ($)"
```

## Candlestick with Volume

Add volume bars below the candlestick chart:

```yaml
models:
  - name: stock_with_volume
    source_name: market_db
    sql: |
      SELECT 
        sp.*,
        CAST(1000000 + RANDOM() * 4000000 AS INTEGER) as volume
      FROM ${ref(stock_prices)} sp

traces:
  - name: price_candles
    model: ${ref(stock_with_volume)}
    props:
      type: candlestick
      x: ?{date}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      name: "Price"
      yaxis: "y"
      
  - name: volume_bars
    model: ${ref(stock_with_volume)}
    props:
      type: bar
      x: ?{date}
      y: ?{volume}
      name: "Volume"
      yaxis: "y2"
      marker:
        color: "rgba(128, 128, 128, 0.5)"
        
charts:
  - name: price_volume_chart
    traces:
      - ${ref(price_candles)}
      - ${ref(volume_bars)}
    layout:
      title: "Stock Price and Volume"
      xaxis:
        title: "Date"
      yaxis:
        title: "Price ($)"
        domain: [0.3, 1]
      yaxis2:
        title: "Volume"
        domain: [0, 0.2]
      grid:
        rows: 2
        columns: 1
        subplots: [["xy"], ["xy2"]]
```

## Cryptocurrency Style

24/7 trading with higher volatility:

```yaml
models:
  - name: crypto_prices
    source_name: market_db
    sql: |
      WITH RECURSIVE hours AS (
        SELECT TIMESTAMP '2024-01-01 00:00:00' as time, 50000.0 as base_price
        UNION ALL
        SELECT 
          time + INTERVAL '1 hour',
          base_price * (1 + (RANDOM() - 0.5) * 0.02) -- Higher volatility
        FROM hours
        WHERE time < TIMESTAMP '2024-01-07 00:00:00'
      )
      SELECT 
        time,
        base_price * (1 + (RANDOM() - 0.5) * 0.01) as open,
        base_price * (1 + ABS(RANDOM()) * 0.015) as high,
        base_price * (1 - ABS(RANDOM()) * 0.015) as low,
        base_price as close
      FROM hours

traces:
  - name: btc_candles
    model: ${ref(crypto_prices)}
    props:
      type: candlestick
      x: ?{time}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      increasing:
        fillcolor: "#00c853"
        line:
          color: "#00c853"
          width: 1
      decreasing:
        fillcolor: "#d50000"
        line:
          color: "#d50000"
          width: 1
```

## Adding Technical Indicators

Overlay moving averages on candlestick charts:

```yaml
models:
  - name: prices_with_ma
    source_name: market_db
    sql: |
      WITH price_data AS (
        SELECT * FROM ${ref(stock_prices)}
      )
      SELECT 
        p.*,
        AVG(close) OVER (ORDER BY date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) as ma10,
        AVG(close) OVER (ORDER BY date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) as ma20
      FROM price_data p

traces:
  - name: candles_with_ma
    model: ${ref(prices_with_ma)}
    props:
      type: candlestick
      x: ?{date}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      name: "Price"
      
  - name: ma10_line
    model: ${ref(prices_with_ma)}
    props:
      type: scatter
      x: ?{date}
      y: ?{ma10}
      mode: "lines"
      name: "MA(10)"
      line:
        color: "#ff9800"
        width: 2
        
  - name: ma20_line
    model: ${ref(prices_with_ma)}
    props:
      type: scatter
      x: ?{date}
      y: ?{ma20}
      mode: "lines"
      name: "MA(20)"
      line:
        color: "#2196f3"
        width: 2
```

## Intraday Trading

Minute-level data for day trading:

```yaml
models:
  - name: intraday_prices
    source_name: market_db
    sql: |
      WITH RECURSIVE minutes AS (
        SELECT TIMESTAMP '2024-01-15 09:30:00' as time, 150.0 as price
        UNION ALL
        SELECT 
          time + INTERVAL '1 minute',
          price * (1 + (RANDOM() - 0.5) * 0.002)
        FROM minutes
        WHERE time < TIMESTAMP '2024-01-15 16:00:00'
      )
      SELECT 
        time,
        LAG(price) OVER (ORDER BY time) as open,
        MAX(price) OVER (ORDER BY time ROWS BETWEEN CURRENT ROW AND 4 FOLLOWING) as high,
        MIN(price) OVER (ORDER BY time ROWS BETWEEN CURRENT ROW AND 4 FOLLOWING) as low,
        LEAD(price, 4, price) OVER (ORDER BY time) as close
      FROM minutes
      WHERE EXTRACT(MINUTE FROM time) % 5 = 0 -- 5-minute candles
```

## Multiple Securities Comparison

Compare multiple stocks in subplots:

```yaml
models:
  - name: tech_stocks
    source_name: market_db
    sql: |
      WITH stocks AS (
        SELECT 
          date,
          symbol,
          CASE symbol
            WHEN 'AAPL' THEN 150 + RANDOM() * 20
            WHEN 'GOOGL' THEN 140 + RANDOM() * 15
            WHEN 'MSFT' THEN 380 + RANDOM() * 30
          END as base
        FROM 
          (SELECT DATE '2024-01-01' + (INTERVAL '1 day' * s) as date
           FROM generate_series(0, 30) s),
          (SELECT 'AAPL' as symbol UNION ALL SELECT 'GOOGL' UNION ALL SELECT 'MSFT')
      )
      SELECT 
        date,
        symbol,
        base * 0.995 as open,
        base * 1.01 as high,
        base * 0.99 as low,
        base as close
      FROM stocks

# Create separate traces for each stock
traces:
  - name: aapl_candles
    model: |
      SELECT * FROM ${ref(tech_stocks)} WHERE symbol = 'AAPL'
    props:
      type: candlestick
      x: ?{date}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      name: "AAPL"
      xaxis: "x"
      yaxis: "y"
      
  - name: googl_candles
    model: |
      SELECT * FROM ${ref(tech_stocks)} WHERE symbol = 'GOOGL'
    props:
      type: candlestick
      x: ?{date}
      open: ?{open}
      high: ?{high}
      low: ?{low}
      close: ?{close}
      name: "GOOGL"
      xaxis: "x2"
      yaxis: "y2"

charts:
  - name: multi_stock_chart
    traces:
      - ${ref(aapl_candles)}
      - ${ref(googl_candles)}
    layout:
      title: "Tech Stock Comparison"
      grid:
        rows: 2
        columns: 1
        subplots: [["xy"], ["x2y2"]]
```

## Best Practices

### Data Quality
- **OHLC Validation**: Ensure high ≥ max(open, close) and low ≤ min(open, close)
- **Missing Data**: Handle market holidays and weekends appropriately
- **Time Zones**: Be consistent with market hours

### Visual Enhancement
```yaml
props:
  type: candlestick
  # Custom colors for trends
  increasing:
    fillcolor: "rgba(38, 166, 154, 0.8)"
    line:
      color: "rgba(38, 166, 154, 1)"
      width: 1
  decreasing:
    fillcolor: "rgba(239, 83, 80, 0.8)"
    line:
      color: "rgba(239, 83, 80, 1)"
      width: 1
  # Whisker styling
  whiskerwidth: 0.5
```

### Performance Tips
- **Data Aggregation**: Pre-aggregate minute data to larger timeframes
- **Range Selection**: Use layout.xaxis.range to limit initial view
- **Streaming Updates**: Consider WebSocket for real-time data

## Common Patterns

### Bullish Patterns
```yaml
# Detect hammer pattern
models:
  - name: hammer_pattern
    sql: |
      SELECT * FROM prices
      WHERE (close - low) > 2 * ABS(close - open)  -- Long lower shadow
        AND (high - MAX(open, close)) < 0.1 * (high - low)  -- Small upper shadow
```

### Support and Resistance
```yaml
# Add horizontal lines for key levels
traces:
  - name: support_line
    model: |
      SELECT 
        MIN(date) as start_date,
        MAX(date) as end_date,
        PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY low) as support_level
      FROM ${ref(stock_prices)}
    props:
      type: scatter
      x: [?{start_date}, ?{end_date}]
      y: [?{support_level}, ?{support_level}]
      mode: "lines"
      line:
        color: "green"
        dash: "dash"
      name: "Support"
```

## Related Resources
- [OHLC Charts](ohlc.md) - Alternative financial chart type
- [Line Charts](scatter.md#line-charts) - For closing prices only
- [Bar Charts](bar.md) - For volume analysis
- [Financial Analysis Concepts](../concepts/financial.md) - Understanding market data

---
*Next Steps:* Learn about [OHLC Charts](ohlc.md) for a cleaner financial visualization style