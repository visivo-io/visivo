CREATE SCHEMA RAW.CRM;

CREATE TABLE RAW.CRM.sales_funnel_daily as ( 
  with 
  date_dim as (
    select 
      DATEADD(YEAR,3, CURRENT_DATE )  as date_id
  ),
  DATE_RANGE AS (
    SELECT 
      DATEADD(DAY, -1*SEQ4(), date_dim.date_id ) AS AS_OF_DATE,
      uniform(1, 100, random()) as leads, 
      ROUND(leads * uniform(0, 70, random())/100)::INT as mqls, 
      ROUND(mqls * uniform(0, 70, random())/100 )::INT as sals,
      ROUND(sals * uniform(40, 90, random())/100)::INT as demos,
      ROUND(demos * uniform(40, 90, random())/100)::INT as closes,
      closes * uniform(10000, 25000, random()) as revenue_from_closes
    FROM date_dim,
         TABLE(GENERATOR(ROWCOUNT => (4000) )) 
  ) 
  --SELECT * from date_dim;

  SELECT 
      *
  FROM DATE_RANGE order by 1 desc
);

CREATE TABLE RAW.CRM.closed_deals as ( 
  with 

  DATE_RANGE AS (
  SELECT 
    DATEADD(m, UNIFORM(-1000000, 1000000, random()), CURRENT_DATE ) AS created_at,
    CASE ROUND(uniform(1, 3, random())) 
      WHEN 1 THEN 'White Paper'
      WHEN 2 THEN 'Premium Photo'
      WHEN 3 THEN 'Business Card'
    END as product,

    CASE ROUND(uniform(1, 5, random())) 
      WHEN 1 THEN 'Jim Halpert'
      WHEN 2 THEN 'Pam Halpert'
      WHEN 3 THEN 'Dwight Schrute'
      WHEN 4 THEN 'Stanley Hudson'
      WHEN 5 THEN 'Andrew Bernard'
    END as sales_rep,

    ROUND(uniform(800, 27000, random()), 2)  as amount



    FROM 
         TABLE(GENERATOR(ROWCOUNT => (90000) )) 
  ) 

  SELECT 
     * --min(as_of_date), max(as_of_date)
  FROM DATE_RANGE order by 1 desc
);