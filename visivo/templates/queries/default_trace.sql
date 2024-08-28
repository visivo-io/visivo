WITH 
base_query as (
    {{sql}}
),
columnize_cohort_on as (
    SELECT 
        *,
        {{cohort_on}} as "cohort_on"
    FROM base_query
)
SELECT 
    {%- if select_items is defined and (select_items) %}
        {%- for key, value in select_items.items() %}
            {{ value }} as "{{ key }}", 
        {%- endfor %}
    {%- else %}
        *,
    {%- endif %}
    "cohort_on"
FROM columnize_cohort_on
{%- if filter_by is defined and filter_by.vanilla|length > 0 %}
    WHERE
    {%- for filter in filter_by.vanilla %}
        {{ filter }}{% if not loop.last %} AND {% endif %}
    {%- endfor %} 
{%- endif %}    
{%- if groupby_statements is defined or cohort_on != "'values'" %}
    GROUP BY 
    {%- for statement in groupby_statements %}
        {{statement}} {% if not loop.last %} , {% endif %}
    {%- endfor %}{% if groupby_statements is defined%},{% endif %}
    "cohort_on"
{%- endif %}
{%- if filter_by is defined %}
    {%- if filter_by.aggregate|length > 0 %}
        HAVING
        {%- for filter in filter_by.aggregate %}
            {{ filter }}{% if not loop.last %}, {% endif %}
        {%- endfor %} 
    {%- endif %}
    {%- if filter_by.window|length > 0 %}
        QUALIFY
        {%- for filter in filter_by.window %}
            {{ filter }}{% if not loop.last %}, {% endif %}
        {%- endfor %} 
    {%- endif %}
{%- endif %} 
{%- if order_by is defined and order_by|length > 0 %}
    ORDER BY 
    {%- for order in order_by %}
        {{ order }}{% if not loop.last %}, {% endif %}
    {%- endfor %}
{%- endif %} 
-- source: {{ source }}