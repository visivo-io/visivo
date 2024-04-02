SELECT * FROM (
SELECT 
    'y*3+1' as grouping,
    CASE WHEN x%2=1 THEN y*3+1 ELSE -y END as y, 
    x as week_day 
FROM test_table 
UNION ALL 
SELECT 
    'y*2+2' as grouping,
    CASE WHEN x%2=1 THEN y*2+2 ELSE -y END as y, 
    x as week_day 
FROM test_table WHERE x between 0 and 6) a
ORDER BY week_day asc , grouping