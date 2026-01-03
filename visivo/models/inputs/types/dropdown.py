from typing import List, Literal, Optional, Union

from pydantic import Field, model_serializer, model_validator
from visivo.models.base.context_string import ContextString
from visivo.models.base.query_string import QueryString
from visivo.models.fields import QueryOrStringField
from visivo.models.inputs.input import Input


class DropdownInput(Input):
    type: Literal["dropdown"] = "dropdown"
    options: Optional[Union[List[str], QueryOrStringField, str]] = Field(
        None, description="Static list of options OR a dynamic SQL string '${refs.model.field}'"
    )
    multi: bool = Field(False, description="Allow multi-select")

    @model_validator(mode="after")
    def validate_query_references(self):
        """
        Validate that query-based options reference exactly one SqlModel (not Insight).

        This is compile-time validation using Pydantic's model_validator to ensure
        the input can be executed on the source backend during the build phase.

        Runs automatically during model initialization.

        Raises:
            ValueError: If query doesn't reference exactly one item
        """
        # Only validate query-based options
        if not isinstance(self.options, QueryString):
            return self

        from visivo.query.patterns import extract_ref_names

        query_value = self.options.get_value()
        refs = extract_ref_names(query_value)

        # Must reference exactly one item
        if len(refs) == 0:
            raise ValueError(
                f"Input '{self.name}' query must reference exactly one model using ${{refs.model_name}}.\n"
                f"Example: ?{{ SELECT DISTINCT category FROM ${{refs.products}} }}"
            )

        if len(refs) > 1:
            raise ValueError(
                f"Input '{self.name}' query references {len(refs)} items ({', '.join(refs)}) "
                f"but must reference exactly one model.\n"
                f"Example: ?{{ SELECT DISTINCT category FROM ${{refs.products}} }}"
            )

        # Ref count validation passed
        return self

    def child_items(self):
        """
        Return dependencies for DAG construction.

        Extracts ${ref(...)} patterns from query-based options to ensure
        referenced models/insights are executed before this input is serialized.
        """
        from visivo.query.patterns import extract_ref_names

        children = []

        # Check if this input has query-based options
        if isinstance(self.options, QueryString):
            query_str = str(self.options)
            ref_names = extract_ref_names(query_str)
            for ref_name in ref_names:
                children.append(f"ref({ref_name})")
        # Handle legacy ContextString references
        elif ContextString.is_context_string(self.options):
            children.append(self.options)

        return children

    @model_serializer(mode="wrap")
    def serialize_model(self, serializer, _info):
        """
        Custom serializer for dropdown inputs.

        Adds name_hash for client-side parquet file lookup.
        QueryString options serialize naturally to their string value.
        """
        model = serializer(self)

        # Add name_hash for viewer to construct parquet URL
        model["name_hash"] = self.name_hash()

        # Convert static list options to strings
        if isinstance(self.options, list):
            model["options"] = [str(option) for option in self.options]
        # QueryString serializes automatically via its __get_pydantic_core_schema__

        return model
