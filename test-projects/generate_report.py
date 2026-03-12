#!/usr/bin/env python3

import duckdb
import pandas as pd

print("EV Data Report")
print("=" * 60)

conn = duckdb.connect('ev_data.duckdb')

print("\n## Sales by Country and Type (2024)")
print("-" * 40)
result = conn.execute("""
    SELECT 
        region_country AS Country,
        mode AS Vehicle_Type,
        powertrain AS Powertrain,
        SUM(value) AS Sales
    FROM ev_data
    WHERE parameter = 'EV sales' 
      AND category = 'Historical'
      AND year = 2024
      AND region_country NOT IN ('World', 'Europe', 'EU27', 'North America', 'Asia Pacific', 'Rest of world')
      AND value > 0
    GROUP BY region_country, mode, powertrain
    ORDER BY Sales DESC
    LIMIT 20
""").fetchdf()
print(result.to_string(index=False))

print("\n\n## Manufacturing/Production by Country (2024 vs 2023)")
print("-" * 40)
result = conn.execute("""
    WITH country_stock AS (
        SELECT 
            region_country AS Country,
            SUM(CASE WHEN year = 2024 THEN value ELSE 0 END) AS stock_2024,
            SUM(CASE WHEN year = 2023 THEN value ELSE 0 END) AS stock_2023
        FROM ev_data
        WHERE parameter = 'EV stock' 
          AND category = 'Historical'
          AND year IN (2023, 2024)
          AND mode = 'Cars'
          AND region_country NOT IN ('World', 'Europe', 'EU27', 'North America', 'Asia Pacific', 'Rest of world')
          AND powertrain IN ('BEV', 'PHEV')
        GROUP BY region_country
    )
    SELECT 
        Country,
        stock_2024 AS Stock_2024,
        stock_2023 AS Stock_2023,
        (stock_2024 - stock_2023) AS New_Production
    FROM country_stock
    WHERE stock_2024 > 0
    ORDER BY New_Production DESC
    LIMIT 10
""").fetchdf()
print(result.to_string(index=False))

print("\n\n## Average Market Share by Country (2020-2024)")
print("-" * 40)
result = conn.execute("""
    SELECT 
        region_country AS Country,
        ROUND(AVG(value), 2) AS Avg_Market_Share_Pct,
        COUNT(DISTINCT year) AS Years_Data
    FROM ev_data
    WHERE parameter = 'EV sales share' 
      AND category = 'Historical'
      AND mode = 'Cars'
      AND region_country NOT IN ('World', 'Europe', 'EU27', 'North America', 'Asia Pacific', 'Rest of world')
      AND year >= 2020
    GROUP BY region_country
    HAVING COUNT(DISTINCT year) >= 3
    ORDER BY Avg_Market_Share_Pct DESC
    LIMIT 15
""").fetchdf()
print(result.to_string(index=False))

print("\n\n## Global Trends (2020-2024)")
print("-" * 40)
result = conn.execute("""
    SELECT 
        year AS Year,
        SUM(CASE WHEN powertrain = 'BEV' THEN value ELSE 0 END) AS BEV_Sales,
        SUM(CASE WHEN powertrain = 'PHEV' THEN value ELSE 0 END) AS PHEV_Sales,
        SUM(value) AS Total_Sales
    FROM ev_data
    WHERE parameter = 'EV sales' 
      AND category = 'Historical'
      AND mode = 'Cars'
      AND region_country = 'World'
      AND powertrain IN ('BEV', 'PHEV')
      AND year >= 2020
    GROUP BY year
    ORDER BY year
""").fetchdf()
print(result.to_string(index=False))

print("\n\nNote: Price data is not available in the current dataset.")
print("The report includes sales volumes, production estimates (based on stock changes),")
print("vehicle types, and market share information by country.")

conn.close()