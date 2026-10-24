select
    s.account_id,
    s.month,
    s.plan,
    s.seats,
    s.mrr,
    a.industry,
    a.country,
    a.acquisition_channel
from {{ ref('stg_subscriptions') }} s
join {{ ref('stg_accounts') }} a using (account_id)
