from typing import Optional, Dict, Tuple, List
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
    sort: Optional[QueryString] = Field(None, description="Column or expression to sort data by")

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

    def field_values_with_sanitized_inputs(self, dag: ProjectDag) -> dict:

        def replace_only_inputs(text: str) -> str:
            comments = []

            def repl(m: Match) -> str:
                name = m.group("model_name").strip()
                prop = m.group("property_path") or ""
                node = dag.get_descendant_by_name(name)
                if isinstance(node, Input):
                    placeholder, comment = node.query_placeholder()
                    comments.append(comment)
                    return placeholder
                return m.group(0)  # return match as is if not input

            expr_sanitized_inputs = CONTEXT_STRING_REF_PATTERN_COMPILED.sub(repl, text)
            comment_str = "".join(comments)
            expr_sanitized_inputs_and_comments = expr_sanitized_inputs + comment_str
            return expr_sanitized_inputs_and_comments

        fields = {}
        for field_name in ["filter", "split", "sort"]:
            field_value = getattr(self, field_name, None)
            if field_value is not None:
                fields[field_name] = replace_only_inputs(field_value.get_value())
        return fields
