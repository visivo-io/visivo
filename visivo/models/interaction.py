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
    Represents a client-side interaction that can be applied to insight data.
    """

    filter: Optional[QueryString] = Field(
        None, description="Filter expression to apply to the data on the client side"
    )
    split: Optional[QueryString] = Field(
        None, description="Column or expression to split data into multiple traces"
    )
<<<<<<< HEAD
    sort: Optional[QueryString] = Field(None, description="Column or expression to sort data by")

    @property
    def field_values(self) -> Dict[str, str]:
=======
    sort: Optional[QueryOrStringField] = Field(
        None, description="Column or expression to sort data by"
    )

    @property
    def field_values(self) -> Dict[str, QueryOrStringField]:
>>>>>>> 6b6853ba (WIP)
        """Return a dictionary of field names to their non-None values.

        Returns:
            Dictionary with keys 'filter', 'split', 'sort' mapped to their values,
            only including fields that are not None.
        """
        fields = {}
        for field_name in ["filter", "split", "sort"]:
            field_value = getattr(self, field_name, None)
            if field_value is not None:
<<<<<<< HEAD
                fields[field_name] = field_value.get_value()
        return fields

    def field_values_with_js_template_literals(self, dag: ProjectDag) -> dict:
        """
        Convert input references to JavaScript template literal syntax.

        Transforms: ${ref(input_name)} → ${input_name}

        This allows clean injection in frontend using JS template literals.
        Non-input refs (models, dimensions) are left unchanged.

        Examples:
            - "x > ${ref(threshold)}" → "x > ${threshold}" (if threshold is an input)
            - "x > ${ref(model).field}" → "x > ${ref(model).field}" (model ref unchanged)

        Args:
            dag: Project DAG for looking up references

        Returns:
            Dict with filter/split/sort keys and converted values
        """

        def replace_input_refs(text: str) -> str:
            def repl(m: Match) -> str:
                name = m.group("model_name").strip()

                try:
                    node = dag.get_descendant_by_name(name)

                    if isinstance(node, Input):
                        # Convert input ref to JS template literal syntax
                        # ${ref(threshold)} → ${threshold}
                        return f"${{{name}}}"

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

=======
                fields[field_name] = field_value
>>>>>>> 6b6853ba (WIP)
        return fields
