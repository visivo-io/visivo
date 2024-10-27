SELECT 
    created_at, 
    product, 
    sales_rep, 
    amount
FROM {{source('crm', 'closed_deals')}}    