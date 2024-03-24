{%- raw %}
# Macros

This documentation provides a comprehensive guide to the Jinja macros designed for use within YAML files. These macros facilitate the manipulation of dates, times, and environment variables directly within your YAML configurations, ensuring dynamic and flexible setups.

## Table of Contents

- [Environment Variable Fetcher (`env_var`)](#environment-variable-fetcher-env_var)
- [Current Time (`now`)](#current-time-now)
- [Unix Timestamp Converter (`to_unix`)](#unix-timestamp-converter-to_unix)
- [ISO 8601 Formatter (`to_iso`)](#iso-8601-formatter-to_iso)
- [Custom Format Time (`to_str_format`)](#custom-format-time-to_str_format)
- [YAML Renderer (`render_yaml`)](#yaml-renderer-render_yaml)

---

### Environment Variable Fetcher (`env_var`)

Fetches the value of an environment variable for use in YAML configurations. If the variable is not set, "NOT-SET" is returned, with special characters escaped.

=== "Example 1"
    ```yaml
    database_url: "{{ env_var('DATABASE_URL') }}"
    ```
=== "Example 2"
    ```yaml
    api_key: "{{ env_var('API_KEY') }}"
    ```
=== "Example 3"
    ```yaml
    service_endpoint: "{{ env_var('SERVICE_ENDPOINT') }}"
    ```

---

### Current Time (`now`)

Generates the current Unix timestamp for dynamic date and time values in configurations.

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