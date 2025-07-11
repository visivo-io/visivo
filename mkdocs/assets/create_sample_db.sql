-- Script to create a sample DuckDB database for Visivo tutorials
-- Run with: duckdb sample_sales.duckdb < create_sample_db.sql

-- Create sales table
CREATE TABLE sales AS
WITH RECURSIVE dates AS (
    SELECT DATE '2024-01-01' as date
    UNION ALL
    SELECT date + INTERVAL '1 day'
    FROM dates
    WHERE date < DATE '2024-12-31'
),
categories AS (
    SELECT * FROM (VALUES 
        ('Electronics', 0.4),
        ('Clothing', 0.3),
        ('Books', 0.2),
        ('Home & Garden', 0.1)
    ) AS t(category, weight)
),
customers AS (
    SELECT * FROM (VALUES 
        ('Customer A', 'Enterprise'),
        ('Customer B', 'Enterprise'),
        ('Customer C', 'Mid-Market'),
        ('Customer D', 'Mid-Market'),
        ('Customer E', 'Small Business'),
        ('Customer F', 'Small Business'),
        ('Customer G', 'Small Business')
    ) AS t(customer_name, segment)
),
sales_data AS (
    SELECT 
        d.date,
        c.category,
        cust.customer_name,
        cust.segment,
        -- Generate realistic revenue with seasonality
        CAST(
            (10000 + RANDOM() * 40000) * c.weight * 
            (1 + 0.2 * SIN(EXTRACT(DOY FROM d.date) * 2 * PI() / 365)) *
            CASE 
                WHEN cust.segment = 'Enterprise' THEN 2.5
                WHEN cust.segment = 'Mid-Market' THEN 1.5
                ELSE 1.0
            END
        AS INTEGER) as revenue,
        -- Random quantity
        CAST(1 + RANDOM() * 20 AS INTEGER) as quantity
    FROM dates d
    CROSS JOIN categories c
    CROSS JOIN customers cust
    WHERE RANDOM() < 0.1  -- Only 10% of combinations have sales
)
SELECT 
    ROW_NUMBER() OVER () as order_id,
    date,
    category,
    customer_name,
    segment,
    revenue,
    quantity,
    CAST(revenue / quantity AS DECIMAL(10,2)) as unit_price
FROM sales_data;

-- Create a products dimension table
CREATE TABLE products AS
SELECT DISTINCT
    category,
    category || '_' || ROW_NUMBER() OVER (PARTITION BY category) as product_id,
    category || ' Product ' || ROW_NUMBER() OVER (PARTITION BY category) as product_name,
    CASE 
        WHEN category = 'Electronics' THEN 'Technology'
        WHEN category = 'Books' THEN 'Media'
        ELSE 'General Merchandise'
    END as product_group
FROM sales
LIMIT 20;

-- Create a customers dimension table
CREATE TABLE customers AS
SELECT DISTINCT
    customer_name,
    segment,
    CASE 
        WHEN segment = 'Enterprise' THEN 'High'
        WHEN segment = 'Mid-Market' THEN 'Medium'
        ELSE 'Low'
    END as priority,
    '2020-01-01'::DATE + (RANDOM() * 1460)::INTEGER as first_purchase_date
FROM sales;

-- Create some KPI metrics
CREATE TABLE daily_metrics AS
SELECT 
    date,
    COUNT(DISTINCT customer_name) as active_customers,
    SUM(revenue) as total_revenue,
    AVG(revenue) as avg_order_value,
    COUNT(*) as order_count
FROM sales
GROUP BY date;

-- Show summary
SELECT 
    'Sales Records' as table_name,
    COUNT(*) as row_count
FROM sales
UNION ALL
SELECT 
    'Products' as table_name,
    COUNT(*) as row_count
FROM products
UNION ALL
SELECT 
    'Customers' as table_name,
    COUNT(*) as row_count
FROM customers
UNION ALL
SELECT 
    'Daily Metrics' as table_name,
    COUNT(*) as row_count
FROM daily_metrics
ORDER BY table_name;