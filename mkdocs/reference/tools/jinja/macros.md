{%- raw %}
# Macros 

Macros are a powerful feature that allow for dynamic content generation within your Visivo configuration files. By using macros, you can easily manage and update your configurations without manual edits.

Macros enable you to inject variables into your Visivo configuration yaml files on compile. 

## Table of Contents

- [Environment Variables (`env_var`)](#environment-variables-env_var)
- [Current Time (`now`)](#current-time-now)
- [Unix Timestamp Converter (`to_unix`)](#unix-timestamp-converter-to_unix)
- [ISO 8601 Formatter (`to_iso`)](#iso-8601-formatter-to_iso)
- [Custom Format Time (`to_str_format`)](#custom-format-time-to_str_format)
- [YAML Renderer (`render_yaml`)](#yaml-renderer-render_yaml)

---

### Environment Variables (`env_var`)

Fetches the value of an environment variable for use in YAML configurations. If the variable is not found then `NOT-SET` is returned. 

`env_var` is very useful for storing secrets & configuring environment specific components of your project. 
!!! example "Examples"
    It's very common to use the macros in your targets to ensure connection details are kept secret.
    === "Raw"
        ```yaml title="Raw"
        database_url: "{{ env_var('DATABASE_URL') }}"
        ```
    === "Rendered"
        ```yaml title="Rendered"
        database_url: "postgresql://myuser:mypass@localhost:5432/mydatabase"
        ```
    Another way you can use the macro is to configure visivo to compile differently in different environments. If for example you have `DEV`, `PROD` and `STAGING` environments where each injects their name into an env var called `LOCALITY` and you wanted to conditionally change the trace used depending on the locality you could do something like this: 
    === "Raw"
        ```yaml
        charts:
            - name: dynamic-chart
              traces:
              {%- if env_var('LOCALITY') == 'DEV' %}
                - ref(dev-trace)
              {%- elif  env_var('LOCALITY') == 'STAGING' %}
                - ref(staging-trace)
              {% else %}
                - ref(prod-trace)
              {% endif %}
              layout:
                title:
                  text: "Dynamic Chart With Trace {{ env_var("LOCALITY") }}"
        ```
    === "Rendered `LOCALITY = 'DEV'`"
        ```yaml
        charts:
            - name: dynamic-chart
              traces:
                - ref(dev-trace)
              layout:
                title:
                  text: "Dyanmic Chart With Trace DEV"
        ```

---

### Current Time (`now`)

Generates the current Unix timestamp in seconds. Enables setting dynamic date and time values in configurations. This is particularly useful for controlling default chart ranges. 

=== "Example 1"
    ```yaml
    timestamp_now: "{{ now() }}"
    ```
=== "Example 2"
    ```yaml
    cache_buster: "{{ now() }}"
    ```
=== "Example 3"
    ```yaml
    last_updated: "{{ now() }}"
    ```

---

### Unix Timestamp Converter (`to_unix`)

Converts date strings to UTC Unix timestamps, supporting a wide range of formats for flexible date parsing.

=== "Example 1"
    ```yaml
    start_date: "{{ to_unix('2024-01-01') }}"
    ```
=== "Example 2"
    ```yaml
    end_date: "{{ to_unix('Dec 31, 2024') }}"
    ```
=== "Example 3"
    ```yaml
    event_date: "{{ to_unix('2024/12/24 18:00') }}"
    ```

---

### ISO 8601 Formatter (`to_iso`)

Transforms Unix timestamps into ISO 8601 formatted strings, offering a standard date and time format for documentation and configuration.

=== "Example 1"
    ```yaml
    creation_date: "{{ to_iso(1609459200) }}"
    ```
=== "Example 2"
    ```yaml
    update_date: "{{ to_iso(1612137600) }}"
    ```
=== "Example 3"
    ```yaml
    expiration_date: "{{ to_iso(1619827200) }}"
    ```

---

### Custom Format Time (`to_str_format`)

Provides customized date and time formatting for Unix timestamps, allowing specific date-time representations.

=== "Example 1"
    ```yaml
    simple_date: "{{ to_str_format(1609459200, '%Y-%m-%d') }}"
    ```
=== "Example 2"
    ```yaml
    verbose_date: "{{ to_str_format(1609459200, '%A, %d %B %Y') }}"
    ```
=== "Example 3"
    ```yaml
    time_stamp: "{{ to_str_format(1609459200, '%H:%M:%S, %d %m %Y') }}"
    ```
{%- endraw %}