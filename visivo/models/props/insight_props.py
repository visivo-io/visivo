from pydantic import Field, model_validator
from jsonschema_rs import validator_for
import json
from importlib.resources import files
from jsonschema_rs import ValidationError
from typing import List, Tuple, Any
import re

from visivo.models.props.json_schema_base import JsonSchemaBase, get_message_from_error
from visivo.models.props.types import PropType
from visivo.query.patterns import QUERY_STRING_VALUE_PATTERN


class InsightProps(JsonSchemaBase):

    type: PropType = Field(..., description="Type of the trace")

    @model_validator(mode="after")
    def validate_against_schema(self) -> "InsightProps":
        if not hasattr(InsightProps, "_validators"):
            InsightProps._validators = {}
        if not hasattr(InsightProps, "_schemas"):
            InsightProps._schemas = {}

        if self.type.value not in InsightProps._validators:
            schema_path = files("visivo.schema").joinpath(f"{self.type.value}.schema.json")
            with open(schema_path) as f:
                schema = json.load(f)
            InsightProps._schemas[self.type.value] = schema
            InsightProps._validators[self.type.value] = validator_for(schema)

        validator = InsightProps._validators.get(self.type.value)
        if not validator:
            raise ValueError(f"Schema not found for trace type: {self.type.value}")

        try:
            data_dict = self.model_dump()

            validator.validate(data_dict)

        except FileNotFoundError:
            raise ValueError(f"Schema file not found for trace type: {self.type.value}")
        except json.JSONDecodeError:
            raise ValueError(f"Invalid JSON in schema file for trace type: {self.type.value}")
        except ValidationError as e:
            schema = InsightProps._schemas.get(self.type.value)
            message = get_message_from_error(e, schema)
            raise ValueError(
                f"Validation error for trace type {self.type.value} at location: {e.instance_path}: {str(message)}"
            )

        return self

    def extract_query_strings(self, prefix: str = "props") -> List[Tuple[str, str]]:
        """
        Recursively extract all query string patterns (?{...}) from the InsightProps object.

        Args:
            prefix: The prefix to use for paths (default: "props")

        Returns:
            List of tuples (path, query_string) where:
            - path is the dotted/bracketed path to the value (e.g., "props.x", "props.marker.colorscale[0]")
            - query_string is the extracted content from ?{...} (e.g., "sum(amount)", "blue")

        Example:
            >>> props = InsightProps(type="scatter", x="?{sum(amount)}", marker={"colorscale": ["?{blue}"]})
            >>> props.extract_query_strings()
            [('props.x', 'sum(amount)'), ('props.marker.colorscale[0]', 'blue')]
        """
        results = []
        pattern = re.compile(QUERY_STRING_VALUE_PATTERN)

        def recurse(obj: Any, path: str):
            if isinstance(obj, str):
                # Check if this string matches the query pattern
                match = pattern.match(obj)
                if match:
                    query_string = match.group("query_string")
                    results.append((path, query_string))

            elif isinstance(obj, dict):
                for key, value in obj.items():
                    new_path = f"{path}.{key}"
                    recurse(value, new_path)

            elif isinstance(obj, list):
                for idx, item in enumerate(obj):
                    new_path = f"{path}[{idx}]"
                    recurse(item, new_path)

            elif isinstance(obj, (int, float, bool, type(None))):
                # Skip primitive types that can't contain query strings
                pass

        # Start recursion from the model's dictionary representation
        data = self.model_dump()
        recurse(data, prefix)

        return results

    def extract_static_props(self) -> dict:
        """
        Extract all static (non-query) props from InsightProps.

        Returns a nested dict structure matching the original props,
        but only containing static values (no ?{...} patterns).
        The 'type' prop is excluded as it's handled separately.

        Note: Props with ${ref(input).accessor} patterns ARE included here as static props.
        They will be converted to ${input.accessor} format during compile (in InsightQueryBuilder)
        and processed by the frontend at runtime.

        Returns:
            Dict with static props preserving nested structure.

        Example:
            >>> props = InsightProps(type="bar", x="?{sum(amount)}", marker={"color": ["red", "green"], "size": 10})
            >>> props.extract_static_props()
            {'marker': {'color': ['red', 'green'], 'size': 10}}

            >>> props = InsightProps(type="scatter", mode="${ref(show_markers).value}")
            >>> props.extract_static_props()
            {'mode': '${ref(show_markers).value}'}  # Converted later to ${show_markers.value}
        """
        pattern = re.compile(QUERY_STRING_VALUE_PATTERN)

        def is_query_string(value: Any) -> bool:
            """Check if a value is a query string pattern."""
            return isinstance(value, str) and pattern.match(value) is not None

        def recurse(obj: Any) -> Any:
            """
            Recursively filter out query strings.
            Returns None if the entire subtree should be excluded.
            """
            if isinstance(obj, str):
                # If it's a query string, exclude it
                if is_query_string(obj):
                    return None
                return obj

            elif isinstance(obj, dict):
                result = {}
                for key, value in obj.items():
                    filtered = recurse(value)
                    if filtered is not None:
                        result[key] = filtered
                # Return None if the dict is empty after filtering
                return result if result else None

            elif isinstance(obj, list):
                # For arrays, check if ANY element is a query string
                # If so, exclude the entire array (can't have partial arrays in Plotly)
                has_query_string = any(is_query_string(item) for item in obj)
                if has_query_string:
                    return None
                # Otherwise, recursively process the list
                result = []
                for item in obj:
                    filtered = recurse(item)
                    if filtered is not None:
                        result.append(filtered)
                return result if result else None

            else:
                # Primitives (int, float, bool, None) are static
                return obj

        # Start from the model's dictionary representation
        data = self.model_dump()

        # Exclude 'type' as it's handled separately
        data.pop("type", None)

        # Filter and return static props
        result = recurse(data)
        return result if result else {}
