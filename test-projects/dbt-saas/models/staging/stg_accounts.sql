select
    account_id,
    name as account_name,
    industry,
    country,
    company_size,
    acquisition_channel,
    cast(signup_date as date) as signup_date,
    current_plan,
    cast(churned_at as date) as churned_at
from main.accounts
