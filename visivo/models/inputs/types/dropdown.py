from typing import List, Literal, Optional, Union

from pydantic import Field, model_serializer
from visivo.models.base.context_string import ContextString
from visivo.models.base.query_string import QueryString
from visivo.models.fields import QueryOrStringField
from visivo.models.inputs.input import Input
from visivo.query.sqlglot_utils import parse_expression


class DropdownInput(Input):
    type: Literal["dropdown"] = "dropdown"
    options: Optional[Union[List[str], QueryOrStringField, str]] = Field(
        None, description="Static list of options OR a dynamic SQL string '${ref(model).field}'"
    )
    multi: bool = Field(False, description="Allow multi-select")

    def query_placeholder(self):
        placeholder = "'visivo-input-placeholder-string'"
        comment = f" -- replace('visivo-input-placeholder-string', Input({self.name}) )"
        return placeholder, comment

    def _validate_query(self, query_sql: str, dialect: str = "duckdb") -> None:
        """
        Validate that the query is a SELECT statement returning exactly one column.

        Args:
            query_sql: SQL query to validate
            dialect: SQL dialect (default: duckdb for client-side execution)

        Raises:
            ValueError: If query is invalid, not a SELECT, or returns multiple columns
        """
        from sqlglot import exp

        # Parse query
        parsed = parse_expression(query_sql, dialect)
        if not parsed:
            raise ValueError(
                f"Invalid SQL in input '{self.name}' query. Query must be valid DuckDB SQL.\n"
                f"Query: {query_sql}"
            )

        # Must be SELECT statement
        if not isinstance(parsed, exp.Select):
            raise ValueError(
                f"Input '{self.name}' query must be a SELECT statement.\n"
                f"Example: ?{{ SELECT DISTINCT category FROM ${{ref(products)}} }}\n"
                f"Found: {type(parsed).__name__}"
            )

        # Count selected columns
        select_exprs = parsed.expressions
        if len(select_exprs) != 1:
            raise ValueError(
                f"Input '{self.name}' query must return exactly one column, found {len(select_exprs)} columns.\n"
                f"Valid:   ?{{ SELECT category FROM ${{ref(model)}} }}\n"
                f"Invalid: ?{{ SELECT category, name FROM ${{ref(model)}} }}"
            )

    def _resolve_query_references(self, query_value: str, dag, output_dir: str) -> str:
        """
        Resolve all ${ref(...)} patterns in query to parquet table references.

        For client-side execution, resolves references to parquet file reads:
        - ${ref(model)} → read_parquet('files/{hash}.parquet') AS {hash}
        - ${ref(insight)} → read_parquet('files/{hash}.parquet') AS {hash}

        Args:
            query_value: SQL query with ${ref(...)} patterns
            dag: Project DAG for looking up references
            output_dir: Output directory for schema files (required by FieldResolver)

        Returns:
            SQL query with references resolved to parquet table names

        Raises:
            ValueError: If query has no refs, multiple refs, or refs don't exist
        """
        from visivo.models.insight import Insight
        from visivo.models.models.sql_model import SqlModel
        from visivo.query.patterns import extract_ref_components, replace_refs

        if not dag:
            raise ValueError(
                f"Input '{self.name}' has query-based options but no DAG provided. "
                f"Query options require DAG context for reference resolution."
            )

        # Extract all ${ref(...)} references
        refs = extract_ref_components(query_value)

        # Validate: exactly one reference
        if len(refs) == 0:
            raise ValueError(
                f"Input '{self.name}' query must reference exactly one model or insight using ${{ref(name)}}.\n"
                f"Example: ?{{ SELECT DISTINCT category FROM ${{ref(products_model)}} }}"
            )

        if len(refs) > 1:
            ref_names = [name for name, _ in refs]
            raise ValueError(
                f"Input '{self.name}' query references {len(refs)} items ({', '.join(ref_names)}) "
                f"but must reference exactly one model or insight.\n"
                f"Example: ?{{ SELECT DISTINCT category FROM ${{ref(products_model)}} }}"
            )

        model_name, _ = refs[0]  # field_name not used for input queries

        # Look up referenced item in DAG
        try:
            item = dag.get_descendant_by_name(model_name)
        except (ValueError, AttributeError):
            raise ValueError(
                f"Input '{self.name}' references '{model_name}' which was not found in the project.\n"
                f"Ensure the model or insight '{model_name}' is defined and spelled correctly."
            )

        # Validate item type and get hash
        if isinstance(item, (SqlModel, Insight)):
            name_hash = item.name_hash()
            # Replace ${ref(name)} with parquet table reference
            # Client-side DuckDB will use: read_parquet('files/hash.parquet')
            replacement = f"read_parquet('files/{name_hash}.parquet')"
        else:
            raise ValueError(
                f"Input '{self.name}' query can only reference models or insights, "
                f"not {type(item).__name__}.\n"
                f"Found reference to: {model_name} (type: {type(item).__name__})"
            )

        # Replace ${ref(...)} with the parquet table reference
        resolved = replace_refs(query_value, lambda _m, _f: replacement)

        return resolved

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
    def serialize_model(self, serializer, info):
        model = serializer(self)

        if model.get("options"):
            dag = info.context.get("dag") if info and info.context else None
            output_dir = info.context.get("output_dir") if info and info.context else ""

            if isinstance(self.options, list):
                # Static list options
                model["options"] = [str(option) for option in self.options]
            elif isinstance(self.options, QueryString):
                # Query-based options for client-side execution
                query_value = self.options.get_value()

                # Resolve ${ref(...)} to parquet table references
                resolved_query = self._resolve_query_references(query_value, dag, output_dir)

                # Validate query structure (single column SELECT)
                self._validate_query(resolved_query, dialect="duckdb")

                # Format the SQL for client-side DuckDB
                parsed = parse_expression(resolved_query, "duckdb")
                if not parsed:
                    raise ValueError(
                        f"Failed to parse resolved query for input '{self.name}'.\n"
                        f"Resolved query: {resolved_query}"
                    )

                model["options"] = parsed.sql()
                model["is_query"] = True

        return model
