from typing import Optional, Dict
from pydantic import BaseModel, Field

from re import Match
from visivo.models.base.query_string import QueryString
from visivo.models.inputs import Input
from visivo.models.base.project_dag import ProjectDag
from visivo.query.patterns import CONTEXT_STRING_REF_PATTERN_COMPILED


# TODO: This should really be a discriminated single selection between a filter, split and sort class rather than this composite object
class InsightInteraction(BaseModel):
    """
    An InsightInteraction is a client-side transformation applied to an insight's
    pre-computed data in the viewer — no query re-runs, so results update instantly.

    Each interaction is a `?{ ... }` expression that does one of three things:

    - **filter**: keeps only the rows where a boolean expression is true.
    - **split**: breaks the insight into one series per distinct value of an expression.
    - **sort**: orders the rows by an expression (append `ASC`/`DESC` to control direction).

    Reference model columns with `${ref(model).column}` and input values with
    accessors like `${ref(my-input).value}` to wire interactions up to
    [inputs](../../Inputs/SingleSelectInput/) for dynamic dashboards.

    ### Example
    ``` yaml
    insights:
      - name: revenue-by-month
        props:
          type: bar
          x: ?{ ${ref(orders).month} }
          y: ?{ sum(${ref(orders).amount}) }
        interactions:
          - filter: ?{ ${ref(orders).region} = ${ref(region-input).value} }
          - split: ?{ ${ref(orders).product_line} }
          - sort: ?{ ${ref(orders).month} ASC }
    ```
    """

    filter: Optional[QueryString] = Field(
        None,
        description="Boolean expression evaluated per row in the viewer; only rows where it is true are kept.",
    )
    split: Optional[QueryString] = Field(
        None,
        description="Column or expression whose distinct values break the insight into multiple plotly series.",
    )
    sort: Optional[QueryString] = Field(
        None,
        description="Column or expression to sort rows by; append `ASC` or `DESC` to control direction.",
    )

    @property
    def field_values(self) -> Dict[str, str]:
        """Return a dictionary of field names to their non-None values.

        Returns:
            Dictionary with keys 'filter', 'split', 'sort' mapped to their values,
            only including fields that are not None.
        """
        fields = {}
        for field_name in ["filter", "split", "sort"]:
            field_value = getattr(self, field_name, None)
            if field_value is not None:
                fields[field_name] = field_value.get_value()
        return fields

    def field_values_with_js_template_literals(self, dag: ProjectDag) -> dict:
        """
        Convert input references to JavaScript template literal syntax.

        Transforms: ${ref(input_name).accessor} → ${input_name.accessor}

        This allows clean injection in frontend using JS template literals.
        Non-input refs (models, dimensions) are left unchanged.

        Examples:
            - "x > ${ref(threshold).value}" → "x > ${threshold.value}" (if threshold is an input)
            - "x > ${ref(model).field}" → "x > ${ref(model).field}" (model ref unchanged)

        Args:
            dag: Project DAG for looking up references

        Returns:
            Dict with filter/split/sort keys and converted values
        """

        def replace_input_refs(text: str) -> str:
            def repl(m: Match) -> str:
                name = m.group("model_name").strip()
                # Get property_path (accessor like .value, .min, .max, etc.)
                property_path = m.group("property_path") or ""

                try:
                    node = dag.get_descendant_by_name(name)

                    if isinstance(node, Input):
                        # Convert input ref to JS template literal syntax with accessor
                        # ${ref(threshold).value} → ${threshold.value}
                        return f"${{{name}{property_path}}}"

                    # Not an input - leave unchanged (model/dimension ref)
                    return m.group(0)
                except (ValueError, AttributeError):
                    # Ref not found - leave unchanged
                    return m.group(0)

            return CONTEXT_STRING_REF_PATTERN_COMPILED.sub(repl, text)

        fields = {}
        for field_name in ["filter", "split", "sort"]:
            field_value = getattr(self, field_name, None)
            if field_value is not None:
                fields[field_name] = replace_input_refs(field_value.get_value())

        return fields
