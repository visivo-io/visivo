{%- raw %}
# Looping :loop:

Learn how to dynamically generate YAML configurations using Jinja2 for and while loops. This guide will walk you through using loops to create repetitive and conditional structures efficiently, saving time and maintaining consistency across your configurations.

## Why Use Jinja2 Loops in YAML?

Jinja2 loops allow you to iterate over data structures and conditionally include elements in your YAML files. This is particularly useful for:

- Generating configurations for multiple environments or instances
- Conditional inclusion based on environment variables or external data
- Dynamically constructing complex nested structures

## Jinja2 Loop Basics

Before diving into examples, let's review the basic syntax for Jinja2 loops:

- **For Loop:** `{% for item in sequence %} ... {% endfor %}`
- **While Loop:** Jinja2 does not natively support while loops, but you can mimic their behavior using for loops and conditions.

## Examples

### Example 1: Iterating Over a List

Generate a list of users in a YAML configuration.

=== "YAML with Jinja2"
    ```yaml
    users:
      {% for user in ['Alice', 'Bob', 'Charlie'] %}
      - name: "{{ user }}"
      {% endfor %}
    ```
=== "Rendered YAML"
    ```yaml
    users:
      - name: "Alice"
      - name: "Bob"
      - name: "Charlie"
    ```

### Example 2: Conditional Inclusion

Only include debug configuration if the `debug` variable is set to true.

=== "YAML with Jinja2"
    ```yaml
    {% if debug %}
    logging:
      level: DEBUG
    {% endif %}
    ```
=== "Rendered YAML"
    ```yaml
    logging:
      level: DEBUG
    ```

### Example 3: Nested Loops for Hierarchical Structures

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

## Tips & Tricks

- **Maintain Readability:** Use whitespace control (`{%-` and `-%}`) to manage the output of rendered files.
- **Leverage Filters and Tests:** Jinja2 offers a wide range of filters and tests that can be used within loops to filter, sort, or test conditions.
- **Debugging:** Use the `debug` template tag to print variables and structures during template rendering.

## Further Reading

Jinja2 loops in YAML files offer a powerful tool for generating dynamic configurations. By mastering loops, you can create flexible and maintainable configurations that adapt to different environments, data sets, and conditions. Explore further to unlock the full potential of Jinja2 in your projects.

For more detailed information on Jinja2 and YAML, visit the [Jinja2 Documentation](https://jinja.palletsprojects.com/) and the [YAML Spec](https://yaml.org/spec/1.2/spec.html).
{%- endraw %}