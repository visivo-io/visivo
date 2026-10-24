select
    account_id,
    cast(month as date) as month,
    plan,
    seats,
    mrr
from main.subscriptions_monthly
