# Variables 
You can set variables in yaml files using the jinja {% raw %}`{% set %}`{% endraw %} macro. 

This enables you to keep your code cleaner by storing variables that you can reuse across the file. 
{%- raw %}
!!! example
    ```yaml
    {%- set current_timestamp = to_iso(now()) %}
    {%- set seven_days_ago = to_iso(to_unix(current_timestamp) - timedelta(days=7)) %}
    charts:
      ...
      - name: cool-chart
        ...
        layout:
          xaxis:
            range: 
              - '{{ current_timestamp }}'
              - '{{ seven_days_ago }}'
    traces:
      ...
      - name: awesome-trace
        model: ref(model-name)
        props:
            type: bar 
            ...
        filters:
          - query(date_column between '{{ seven_days_ago }}'::date and '{{ current_timestamp }}'::date )
    ```

It also gives you to the ability to store configurations and reuse them. 
!!! example 
    ```yaml
    {%- set bar-marker-options %}
          marker:
            colorscale: 'Earth'
            line:
              color: 'blue'
              opacity: 0.6
    {% endset %}
    traces:
      - name: first-trace
        ...
        props:
          type: bar
          {{ bar-marker-options }}
      - name: second-trace
        ...
        props:
          type: bar
          {{ bar-marker-options }}
    ```
{% endraw %}