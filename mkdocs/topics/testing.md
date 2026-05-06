# Testing

Tests let you **quickly** validate the data behind your insights and assert invariants across your project.

!!! note
    Tests are run with the `visivo test` command (_[docs](../reference/cli.md#test)_).

A test is any boolean Python expression that can read insight data through the `${ref(...)}` context. Insight prop arrays come back as numpy arrays, so numpy is available out of the box.

The combination of Python expressions and direct access to every insight's resolved data makes tests _fast_ to write while still allowing complex assertions about your data.

!!! example

    === "Sums Match"

        ``` yaml
        tests:
          - name: revenue-date-grains-match
            assertions:
              - >{ numpy.sum( ${ref(revenue-per-week).props.y} ) == numpy.sum( ${ref(revenue-per-month).props.y} ) }
        ```

    === "Standard Deviation"

        ``` yaml
        tests:
          - name: recent-std-less-double-normal
            assertions:
              - >{ numpy.std( ${ref(revenue-per-week).props.y} ) * 2 > numpy.std( ${ref(revenue-per-month).props.y[:-10]} ) }
        ```

    === "Assert Specific Value"

        ``` yaml
        tests:
          - name: oct-week-revenue
            assertions:
              - >{ round( ${ref(revenue-per-week).props.y[10]} ) == 2901384 }
        ```

## Conditional execution

Use the optional `if:` field to skip a test unless a condition holds. Useful for assertions that only apply to certain insight types or shapes:

``` yaml
tests:
  - name: scatter-only-check
    if: ${ ref(my-insight).props.type } == "scatter"
    assertions:
      - >{ len( ${ref(my-insight).props.x} ) == len( ${ref(my-insight).props.y} ) }
```

## Available helpers

The [`assertpy`](https://assertpy.github.io/) library and [`numpy`](https://numpy.org/doc/stable/index.html) are always available in test expressions. Together they cover most numerical and structural assertions you'll want to write.
