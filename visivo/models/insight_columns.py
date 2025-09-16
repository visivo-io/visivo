from pydantic import BaseModel, ConfigDict


class InsightColumns(BaseModel):
    """
    Insight Columns allow you to define reusable SQL expressions that can be referenced
    both in **props** (for visualization configuration) and in **interactions**
    (for client-side filtering, splitting, sorting).

    !!! tip
        Use Insight Columns to avoid repeating long SQL expressions across multiple
        properties and to expose fields for client-side interactivity.

    ## Example: Waterfall Chart

    ```yaml
    insights:
      - name: Fibonacci Waterfall Insight
        description: "Waterfall breakdown of Apple P&L with year-over-year comparison"
        model: ${ref(Waterfall Model)}

        columns:
          category: ?{ category }
          year: ?{ year }
          dollars: ?{ try_cast(replace(thousands_dollars, ',', '') as float) * try_cast(sign as float) }

        props:
          type: waterfall
          base: 0
          measure: ?{ waterfall }
          x: ?{ columns.category }
          y: ?{ columns.dollars }
          text: ?{ cast(thousands_dollars as text) }
          increasing:
            marker:
              color: "#b97a9b"
          decreasing:
            marker:
              color: "#edbdb5"

        interactions:
          - filter: ?{ waterfall is not null }
          - filter: ?{ year in ('Sep 2023', 'Sep 2022') }
          - sort: ?{ row asc }
    ```

    In this example:
    - **Server-side**: Columns define reusable expressions (`dollars`, `category`, `year`).
    - **Props**: Use these columns to configure chart axes (`x`, `y`).
    - **Interactions**: Apply filters and sorts directly against the same columns.

    ## Key Benefits
    - **DRY Expressions**: Define once in `columns`, reuse across `props` & `interactions`.
    - **Consistency**: Ensures filters and encodings reference the same underlying logic.
    - **Client-Side Flexibility**: Columns are materialized in the insight’s dataset,
      enabling DuckDB WASM to apply `filter`, `split`, and `sort` instantly.

    ## Migration Note
    - From Traces: `TraceColumns` were mostly for props reuse.
    - With Insights: `InsightColumns` serve **both** props reuse *and*
      client-side interactivity, making them more versatile.
    """

    model_config = ConfigDict(extra="allow")
