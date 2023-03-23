WITH 
trace_sql as (
    {{ trace_sql }}
),
test_case as (
    SELECT 
        max(CAST( {%- for key, value in coordinates.items() %}
            "{{ key }}" = '{{ value }}'{% if not loop.last %} AND{% endif %}
        {%- endfor %}
         as int )
        ) as condition
    FROM trace_sql 
), 
error as (        
    SELECT 
        0 as condition,
        'coordinates {%- for key, value in coordinates.items() %} {{key}}={{value}}{% if not loop.last %},{% endif %} {%- endfor %} were not found in any trace cohort' as err_msg 
)
SELECT --error if result is returned. 
    e.err_msg
FROM test_case tc 
JOIN error e 
    ON e.condition = tc.condition