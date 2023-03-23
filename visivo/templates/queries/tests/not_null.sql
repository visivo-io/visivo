WITH 
trace_sql as (
    {{ trace_sql }}
),
test_case as (
    SELECT 
        max(CAST( {%- for attribute in attributes %}
            "{{ attribute }}" is not null {% if not loop.last %} AND{% endif %}
        {%- endfor %}
         as int )
        ) as condition
    FROM trace_sql 
), 
error as (        
    SELECT 
        0 as condition,
        'coordinates {%- for attribute in attributes %} {{attribute}}{% if not loop.last %}or{% endif %} {%- endfor %} contained null values.' as err_msg 
)
SELECT --error if result is returned. 
    e.err_msg
FROM test_case tc 
JOIN error e 
    ON e.condition = tc.condition