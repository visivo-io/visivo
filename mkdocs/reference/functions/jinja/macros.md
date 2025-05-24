{%- raw %}
# Macros 

Macros are a powerful feature that enable dynamic content generation within your Visivo configuration files on compile. They enable you to perform a wide range of operations to support your visualizations, CI/CD process & architecture across multiple environments. 

## Table of Contents

- [Environment Variables (`env_var`)](#environment-variables-env_var)
- [Current Time (`now`)](#current-time-now)
- [Unix Timestamp Converter (`to_unix`)](#unix-timestamp-converter-to_unix)
- [ISO 8601 Formatter (`to_iso`)](#iso-8601-formatter-to_iso)
- [Custom Format Time (`to_str_format`)](#custom-format-time-to_str_format)
- [Timedelta Macro (`timedelta`)](#timedelta-timedelta)
- [Read Json File (`read_json_file`)](#read-json-file-read_json_file)
---

### Environment Variables (`env_var`)

Fetches the value of an environment variable for use in YAML configurations. If the variable is not found then `NOT-SET` is returned. 

`env_var` is very useful for storing secrets & configuring environment specific components of your project. 

```
Args: 
    key (str): Name of the environment variable. 
Returns:
    object: Value of the environment variable. 
```

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
    Another way you can use the macro is to configure visivo to compile differently in different environments. For example if you have `DEV`, `PROD` and `STAGING` environments where each injects their name into an env var called `LOCALITY` and you wanted to conditionally change the trace used depending on the locality you could do something like this: 
    === "Raw"
        ```yaml
        charts:
            - name: dynamic-chart
              traces:
              {%- if env_var('LOCALITY') == 'DEV' %}
                - ${ref(dev-trace)}
              {%- elif  env_var('LOCALITY') == 'STAGING' %}
                - ${ref(staging-trace)}
              {% else %}
                - ${ref(prod-trace)}
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
                - ${ref(dev-trace)}
              layout:
                title:
                  text: "Dyanmic Chart With Trace DEV"
        ```

---

### Current Time (`now`)

Generates the current Unix timestamp in seconds. Enables setting dynamic date and time values in configurations. This is particularly useful for controlling default chart ranges. 

```
Args: 
    None
Returns:
    float: The current UTC unix timestamp.
```

!!! example

    === "Raw"
        ```yaml
        timestamp_now: "{{ now() }}"
        ```
    === "Rendered"
        ```yaml
        timestamp_now: "1711928451.845498"
        ```

---

### Unix Timestamp Converter (`to_unix`)

Converts date strings to UTC Unix timestamps, supporting a wide range of formats for flexible date parsing. This conversion can be useful if you want to add or subtract units of time with the [Timedelta Macro](#timedelta).

```
Args:
    date_str (str): The string representing the date or date & time.

Returns:
    float: The UTC unix timestamp.
```

!!! example "Examples"

    You can pass a plain date.
    === "Raw"
        ```yaml
        start_date: "{{ to_unix('2024-01-01') }}"
        ```
    === "Rendered"
        ```yaml 
        start_date: "1704067200.0"
        ```
    The function will accept common date strings too.
    === "Raw"
        ```yaml
        end_date: "{{ to_unix('Dec 31, 2024') }}"
        ```
    === "Rendered"
        ```yaml
        end_date: "1735603200.0"
        ``` 
    Common time formats will get converted to unix as well.
    === "Raw"
        ```yaml
        event_date: {{ to_unix('2024/12/24 18:00') }}
        ```
    === "Rendered"
        ```yaml
        event_date: 1735063200.0
        ```

---

### ISO 8601 Formatter (`to_iso`)

Transforms Unix timestamps into ISO 8601 formatted strings, offering a standard date and time format for documentation and configuration.
```
Args:
    unix_timestamp (float): The UTC unix timestamp.

Returns:
    str: The ISO 8601 formatted string.
```

!!! example "Examples"

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
```
Args:
    unix_timestamp (float): The UTC unix timestamp.
    str_format (str): The format string.

Returns:
    str: The formatted string. 
```

!!! example "Examples"

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

 ---

### Timedelta (`timedelta`)

Produces the seconds corresponding to the units of time passed to the function. This enables you to perform arithmetic operations on unix timestamps through adding or subtracting time intervals from a given date or time. You can add or subtract days, hours, minutes, seconds and micro seconds from a given date or time.

```
Args:
    days (float): A negative or positive number. (Default 0)
    seconds (float): A negative or positive number. (Default 0)
    microseconds (float): A negative or positive number. (Default 0)
    milliseconds (float): A negative or positive number. (Default 0)
    hours (float): A negative or positive number. (Default 0)
    weeks (float): A negative or positive number. (Default 0)
Returns:
    float: The seconds that the combination of arguments add up to. 
```

!!! example "Examples"
    You can render the raw timedelta in seconds all on its own.
    === "Raw"
        ```yaml
        interval: {{ timedelta(days=7) }}
        ```
    === "Rendered"
        ```yaml
        interval: 604800.0
        ```

    A more common use of timedelta is to set relative dates. 
    === "Raw"
        ```yaml
        charts:
          - name: ranged-chart
            traces: 
              - ${ref(trace1)}
              - ${ref(trace2)}
            layout 
              xaxis:
                range: 
                  {%- set current_time = now() %}
                  - "{{ to_iso(current_time - timedelta(days=7)) }}"
                  - "{{ to_iso(current_time) }}"

        ```
    === "Rendered"
        ```yaml
        charts:
          - name: ranged-chart
            traces:
              - ${ref(trace1)}
              - ${ref(trace2)}
            layout
            xaxis:
              range:
                - "2024-03-26T14:02:40.101522+00:00"
                - "2024-04-02T14:02:40.101522+00:00"
        ```
### Read Json File (`read_json_file`)

Enables you to read a `.json` file into a jinja object from a file.
```
Args:
    filepath (str): The relative or absolute file path to the .json

Returns:
    obj: The json represented as a jinja object.
```
!!! tip

    Passing an invalid file path will lead to a compile error, so ensure your file exists! 

This function is very useful to passing in configurations to Visivo for jinja loops or conditional statements. 
!!! example 

    Rather than creating a long list in the jinja `{% set %}` you may want to store that information in a json file and just read it into the template using the macro.
    ```json title="dir/iterables.json"
    {"accounts":["Acme Co","Knights of Ni LTD"]}
    ```
    
    Then in your yaml file you can read in the configuration. 

    === "Raw"
        ```yaml title="dir/project.visivo.yml"
        {%- set accounts = read_json_file(iterables.json)['accounts'] %}
        {%- for account in accounts %}
        traces:
          - name: {{ account }}-orders-per-week
            model: ${ref(orders)}
            props:
              type: bar 
              x: ?{ date_trunc('week', created_at) }
              y: ?{ count(distinct id) }
            filters:
              - ?{ account_name = '{{ account }}'}
        {%- endfor %}
        ```
    === "Rendered"
        ```yaml title="dir/project.visivo.yml"
        traces:
          - name: Acme Co-orders-per-week
            model: ${ref(orders)}
            props:
              type: bar 
              x: ?{ date_trunc('week', created_at) }
              y: ?{ count(distinct id) }
            filters:
              - ?{ account_name = 'Acme Co'}
          - name: Knights of Ni LTD-orders-per-week
            model: ${ref(orders)}
            props:
              type: bar 
              x: ?{ date_trunc('week', created_at) }
              y: ?{ count(distinct id) }
            filters:
              - ?{ account_name = 'Knights of Ni LTD'}
        ```


{%- endraw %}