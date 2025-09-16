---
search:
  exclude: true
---

<!--start-->

## Overview

The `ohlc` insight type is used to create OHLC (Open, High, Low, Close) charts, which are commonly used to visualize stock market data or financial data over time. OHLC charts represent price movements for a given period using vertical bars for high and low prices, and tick marks for open and close prices.

You can customize the colors, bar widths, and date ranges to represent financial data effectively.

!!! tip "Common Uses" - **Stock Market Visualization**: Displaying price movement data for stocks, currencies, or commodities. - **Financial Time Series**: Visualizing price fluctuations over time. - **Trading Analysis**: Understanding market trends through candlestick-like visualizations.

_**Check out the [Attributes](../configuration/Insight/Props/Ohlc/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple OHLC Plot"

        Here's a simple `ohlc` insight showing the Open, High, Low, and Close prices of a stock over time:

        ![](../../assets/example-charts/props/ohlc/simple-ohlc.png)

        ```yaml
        models:
          - name: ohlc-data
            args:
              - echo
              - |
                date,open,high,low,close
                2023-01-01,100,105,95,102
                2023-01-02,102,108,101,107
                2023-01-03,107,110,105,109
                2023-01-04,109,112,107,111
                2023-01-05,111,114,110,113

        insights:
          - name: Simple OHLC Insight
            model: ${ref(ohlc-data)}
            columns:
              date: ?{date}
              open: ?{open}
              high: ?{high}
              low: ?{low}
              close: ?{close}
            props:
              type: ohlc
              x: ?{columns.date}
              open: ?{columns.open}
              high: ?{columns.high}
              low: ?{columns.low}
              close: ?{columns.close}
              increasing:
                line:
                  color: "#17becf"
              decreasing:
                line:
                  color: "#ff7f0e"

        charts:
          - name: Simple OHLC Chart
            insights:
              - ${ref(Simple OHLC Insight)}
            layout:
              title:
                text: Simple OHLC Chart<br><sub>Stock Price Movements Over Time</sub>
              xaxis:
                title:
                  text: "Date"
              yaxis:
                title:
                  text: "Price"
        ```

    === "OHLC Plot with Custom Bar Width"

        ![](../../assets/example-charts/props/ohlc/custom-width-ohlc.png)

        ```yaml
        models:
          - name: ohlc-data-width
            args:
              - echo
              - |
                date,open,high,low,close
                2023-02-01,200,205,195,202
                2023-02-02,202,208,201,207
                2023-02-03,207,210,205,209
                2023-02-04,209,212,207,211
                2023-02-05,211,214,210,213

        insights:
          - name: OHLC with Custom Width
            model: ${ref(ohlc-data-width)}
            columns:
              date: ?{date}
              open: ?{open}
              high: ?{high}
              low: ?{low}
              close: ?{close}
            props:
              type: ohlc
              x: ?{columns.date}
              open: ?{columns.open}
              high: ?{columns.high}
              low: ?{columns.low}
              close: ?{columns.close}
              increasing:
                line:
                  color: "#2ca02c"
              decreasing:
                line:
                  color: "#d62728"
              line:
                width: 3

        charts:
          - name: OHLC Chart with Custom Width
            insights:
              - ${ref(OHLC with Custom Width)}
            layout:
              title:
                text: OHLC Plot with Custom Width<br><sub>Stock Prices with Custom Bar Width</sub>
              xaxis:
                title:
                  text: "Date"
              yaxis:
                title:
                  text: "Price"
        ```

    === "OHLC Plot with Multiple Stocks"

        ![](../../assets/example-charts/props/ohlc/multi-stock-ohlc.png)

        ```yaml
        models:
          - name: ohlc-data-multi
            args:
              - echo
              - |
                stock,date,open,high,low,close
                AAPL,2023-03-01,150,155,145,152
                AAPL,2023-03-02,152,158,150,156
                AAPL,2023-03-03,156,160,154,159
                MSFT,2023-03-01,250,255,245,252
                MSFT,2023-03-02,252,258,250,256
                MSFT,2023-03-03,256,260,254,259

        insights:
          - name: OHLC for AAPL
            model: ${ref(ohlc-data-multi)}
            columns:
              stock: ?{stock}
              date: ?{date}
              open: ?{open}
              high: ?{high}
              low: ?{low}
              close: ?{close}
            props:
              type: ohlc
              x: ?{columns.date}
              open: ?{columns.open}
              high: ?{columns.high}
              low: ?{columns.low}
              close: ?{columns.close}
              increasing:
                line:
                  color: "#1f77b4"
              decreasing:
                line:
                  color: "#ff7f0e"
            filters:
              - ?{columns.stock = 'AAPL'}

          - name: OHLC for MSFT
            model: ${ref(ohlc-data-multi)}
            columns:
              stock: ?{stock}
              date: ?{date}
              open: ?{open}
              high: ?{high}
              low: ?{low}
              close: ?{close}
            props:
              type: ohlc
              x: ?{columns.date}
              open: ?{columns.open}
              high: ?{columns.high}
              low: ?{columns.low}
              close: ?{columns.close}
              increasing:
                line:
                  color: "#2ca02c"
              decreasing:
                line:
                  color: "#d62728"
            filters:
              - ?{columns.stock = 'MSFT'}

        charts:
          - name: OHLC Chart with Multiple Stocks
            insights:
              - ${ref(OHLC for AAPL)}
              - ${ref(OHLC for MSFT)}
            layout:
              title:
                text: OHLC Chart with Multiple Stocks<br><sub>Comparing AAPL and MSFT Stock Prices</sub>
              xaxis:
                title:
                  text: "Date"
              yaxis:
                title:
                  text: "Price"
        ```

{% endraw %}

<!--end-->
