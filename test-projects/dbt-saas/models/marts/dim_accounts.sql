select
    a.*,
    a.churned_at is not null as is_churned,
    (select count(*) from {{ ref('stg_events') }} e where e.account_id = a.account_id) as lifetime_events
from {{ ref('stg_accounts') }} a
