{%- raw %}
# Looping :loop:

Jinja2 loops allow you to iterate over data structures and conditionally include elements in your YAML files. This is particularly useful for:

- Generating configurations for multiple environments or instances
- Conditional inclusion based on environment variables or external data
- Dynamically constructing complex nested structures

## Jinja2 Loop Basics

Before diving into examples, let's review the basic syntax for Jinja2 loops:

- **For Loop:** `{% for item in iterable %} ... {% endfor %}`
- **While Loop:** Jinja2 does not natively support while loops, but you can mimic their behavior using for loops and conditions.

## Examples

### Iterating Over a List

Generate a list of users in a YAML configuration.

!!! example 

    === "YAML with Jinja2"
        ```yaml
        traces:
          {%- for user in ['Alice', 'Bob', 'Charlie'] %}
          - name: "{{ user }}_weekly_orders_trace"
            type: bar 
            model: ${ref(orders)}
            props:
              x: ?{ date_trunc('week', created_at) }
              y: ?{ orders }
            filters:
              - ?{ user = '{{ user }}' }
          {%- endfor %}
        ```
    === "Rendered YAML"
        ```yaml
        traces:
          - name: "Alice_weekly_orders_trace"
            type: bar 
            model: ${ref(orders)}
            props:
              x: ?{ date_trunc('week', created_at) }
              y: ?{ orders }
            filters:
              - ?{ user = 'Alice' }
          - name: "Bob_weekly_orders_trace"
            type: bar 
            model: ${ref(orders)}
            props:
              x: ?{ date_trunc('week', created_at) }
              y: ?{ orders }
            filters:
              - ?{ user = 'Bob' }
          - name: "Charlie_weekly_orders_trace"
            type: bar 
            model: ${ref(orders)}
            props:
              x: ?{ date_trunc('week', created_at) }
              y: ?{ orders }
            filters:
              - ?{ user = 'Charlie' }
        ```

### Nested Loops for Hierarchical Structures

Create a nested structure of departments and employees.

!!! example 

    === "YAML with Jinja2"
        ```yaml
        departments:
          {% for department, employees in {'Sales': ['Alice', 'Bob'], 'Engineering': ['Charlie', 'Dave']}.items() %}
          - department: "{{ department }}"
            employees:
              {% for employee in employees %}
              - name: "{{ employee }}"
              {% endfor %}
          {% endfor %}
        ```
    === "Rendered YAML"
        ```yaml
        departments:
          - department: "Sales"
            employees:
              - name: "Alice"
              - name: "Bob"
          - department: "Engineering"
            employees:
              - name: "Charlie"
              - name: "Dave"
        ```
{%- endraw %}