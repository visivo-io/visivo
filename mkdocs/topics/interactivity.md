# Interactivity

At first glance you may think that Visivo's push based architecture removes the ability to create interativity elements in your dashboard. However you can **create powerful & dynamic interactivity** in your dashboards by utilizing the [selector](/../reference/configuration/Selector/). 

## Define a Selector

The [selector](/../reference/configuration/Selector/) enables you to toggle between trace cohorts with single select or multi-select. The benefit of this approach is that you still get deterministic builds that you can test while also being able to create drill down, granularity options, filtering ect. 

!!! tip 
    
    You can leverage jinja2 [loops](/../reference/functions/jinja/loops/) and [macros](/../reference/functions/jinja/macros/) to easily generate multiple similar trace cohorts & charts.

    For example you might want to create multiple different traces for different date grains and then add those traces to a single chart. 

    ??? example 

        ``` yaml
        {% raw %}
        # {% set date_grains = ['month', 'day', 'week', 'quarter', 'year']%} 
        traces:
        # {% for date_grain in date_grains %}
          - name: issues-created-per-{{date_grain}}
            model: ref(issues)
            cohort_on: "'{{date_grain}}'"
            props: 
              type: bar
              x: query(date_trunc('{{date_grain}}', created_at)::date::varchar)
              y: query(count(*) ) 
            order_by: 
              - query(date_trunc('{{date_grain}}', created_at)::date asc)
        #{% endfor %}   
        charts:
          - name: issues-created-total-over-time
            selector: 
            name: issue_metrics_date_grain
            type: single
            traces:
             #{% for date_grain in date_grains %}
             - ref(issues-created-per-{{date_grain}})
             #{% endfor %}   
        {% endraw %}
        ```
## Re-use the Selector 

## Position the Selector in a Dashboard