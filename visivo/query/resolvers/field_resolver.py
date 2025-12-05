import json
import os
from typing import Optional, Dict
from visivo.models.base.project_dag import ProjectDag

from visivo.models.models.sql_model import SqlModel
from visivo.query.patterns import (
    CONTEXT_STRING_REF_PATTERN_COMPILED,
    has_CONTEXT_STRING_REF_PATTERN,
)
from visivo.query.sqlglot_utils import identify_column_references, field_alias_hasher
from visivo.logger.logger import Logger


class FieldResolver:
    """
    Recursively resolves ${ref(...)} patterns in SQL expressions.

    Handles three types of references:
      1. Implicit dimensions (raw columns): ${ref(model)."column"} → "model_hash"."column"
      2. Global metrics/dimensions: ${ref(metric_name)} → fully qualified expression
      3. Model-scoped metrics/dimensions: ${ref(model)."metric"} → fully qualified expression

    All column references are fully qualified with table aliases using model.name_hash()
    and sqlglot's identify_column_references function.
    """

    def __init__(self, dag: ProjectDag, output_dir: str, native_dialect: str):
        """
        Initialize the FieldResolver.

        Args:
            dag: Project DAG containing all models, metrics, and dimensions
            output_dir: Directory where schema files are stored
            native_dialect: SQLGlot dialect name for proper SQL formatting
        """
        self.dag = dag
        self.output_dir = output_dir
        self.native_dialect = native_dialect

        # Caches to avoid repeated file reads and detect cycles
        self._schema_cache: Dict[str, dict] = {}
        self._resolution_cache: Dict[str, str] = {}
        self._resolution_stack: list = []  # Track current resolution path for cycle detection

    def _load_model_schema(self, model_name: str) -> Optional[dict]:
        if model_name in self._schema_cache:
            return self._schema_cache[model_name]

        # Build path to schema file
        schema_file = os.path.join(self.output_dir, "schema", model_name, "schema.json")

        # Try to read schema file
        try:
            with open(schema_file, "r") as fp:
                schema = json.load(fp)
                self._schema_cache[model_name] = schema
                return schema
        except FileNotFoundError:
            Logger.instance().error(
                f"Schema file not found for model '{model_name}' at {schema_file}"
            )
            return None
        except json.JSONDecodeError as e:
            Logger.instance().error(f"Failed to parse schema file for model '{model_name}': {e}")
            return None

    def _is_implicit_dimension(self, model_name: str, field_name: str) -> bool:
        schema = self._load_model_schema(model_name)

        # Schema format is {model_hash: {column: type, ...}}
        # We need to find the columns for this model
        try:
            if schema is None:
                return False

            model = self.dag.get_descendant_by_name(model_name)
            model_hash = model.name_hash()

            if model_hash in schema:
                return field_name in schema[model_hash]

            return False
        except (ValueError, AttributeError):
            return False

    def _qualify_expression(self, expression: str, model_node: SqlModel) -> str:
        # Get model and its hash
        try:
            model_name = model_node.name
            model_hash = model_node.name_hash()
        except ValueError as e:
            raise ValueError(f"Model '{model_name}' not found in DAG: {e}")

        # Load model schema
        schema = self._load_model_schema(model_name)
        if not schema:
            raise ValueError(
                f"Schema not found for model '{model_name}'. " f"Has the model been executed yet?"
            )

        # Use identify_column_references to qualify the expression
        try:
            qualified = identify_column_references(
                model_hash=model_hash,
                model_schema=schema,
                expr_sql=expression,
                dialect=self.native_dialect,
            )
            return qualified
        except Exception as e:
            raise ValueError(
                f"Failed to qualify expression '{expression}' for model '{model_name}': {e}"
            )

    def resolve(self, expression: str, alias=True) -> str:
        """
        Recurse through ${ref(model).field} and ${ref(global-field)} statements within a metric replacing
        them with their expressions until we are left with only sql statements.

          - Use the dag to iterate by calling direct parents of the metric/dimension node.
          - If a "${ref(model).field}" is not a direct parent of the current metric/dimension node
            then it's an implicit dimension and should be replaced with "model_hash.field"
          - Once the direct parent of a field is a sql_model then we should run the expression through
            sqlglot_utils.identify_column_references before we return and replace using the parent model
            schema to qualify columns and the model source dialect to inform dialect

        Returns resolved sql str
        """

        def replace_one_by_one(text, repl_fn):
            # pattern is a compiled regex
            steps = 0
            while steps < 10000:
                steps += 1
                # subn with count=1 replaces only the first match
                new_text, n = CONTEXT_STRING_REF_PATTERN_COMPILED.subn(
                    lambda m: repl_fn(m), text, count=1
                )
                if n == 0:
                    break
                text = new_text
            return text

        # Example, resolve ${ref(name)} recursively

        def resolve_ref(model_name, field_name) -> str:
            # When field name is none or empty string then the model name is actually a metric or dimension.
            # This is validated in compile to be true ie. ${ref(global-metric)}
            if not field_name:
                field_node = self.dag.get_descendant_by_name(model_name)
            else:  # field name is not null
                model_node = self.dag.get_descendant_by_name(model_name)
                # Strip leading dot from field_name since property_path includes it
                # e.g., "${ref(orders).total_amount}" has property_path = ".total_amount"
                # but the metric/dimension/column is named "total_amount"
                field_name_stripped = field_name.lstrip(".")
                try:
                    # set the field node to the descenant of the model
                    field_node = self.dag.get_descendant_by_name(field_name_stripped)
                except ValueError:
                    # No model found check to see if there's a matching implicit dimension in the schema
                    model_hash = model_node.name_hash()
                    schema = self._load_model_schema(model_node.name)
                    if not schema:
                        raise Exception(f"Missing schema for model: {model_node.name}.")
                    table = schema.get(model_hash)
                    if not table:
                        raise Exception(f"Missing schema for model: {model_node.name}.")
                    column = table.get(field_name_stripped)
                    if not column:
                        columns = ", ".join(table.keys())
                        raise Exception(
                            f"No column: {field_name_stripped} exists on model: {model_node.name}. Here's the available columns returned from the model: {columns}"
                        )
                    # If the field name is found in the schema it's an implicit dimension like expected and we can return the qualified expression
                    # In most dialects this will just be f"{model_hash}"."{field_name}", but some don't use double quotes.
                    return self._qualify_expression(
                        expression=field_name_stripped, model_node=model_node
                    )

            field_parent_name = self.dag.get_named_parents(field_node.name)[0]
            field_parent = self.dag.get_descendant_by_name(field_parent_name)
            if isinstance(field_parent, SqlModel):
                # Check if expression still has unresolved refs
                if has_CONTEXT_STRING_REF_PATTERN(field_node.expression):
                    # Return unresolved expression for outer recursion to handle
                    return field_node.expression
                else:
                    # No more refs - qualify the expression
                    return self._qualify_expression(
                        expression=field_node.expression, model_node=field_parent
                    )
            elif has_CONTEXT_STRING_REF_PATTERN(field_node.expression):
                return field_node.expression
            else:
                raise Exception(
                    "Parent should either be a SqlModel or expression should return another nested expression"
                )

        def repl_fn(match):
            model_name = match.group("model_name").strip()
            field_name = match.group("property_path") or ""
            inner = resolve_ref(model_name, field_name)
            # recurse into any refs produced by the replacement
            return replace_one_by_one(inner, repl_fn)

        resolved_sql = replace_one_by_one(expression, repl_fn=repl_fn)
        # TODO: We could validate that types from different models line up using sqlglot at this point too.
        #      This might make sense to do if we start validating the run queries on compile rather than
        #      during the run like we do currently.
        hashed_alias = field_alias_hasher(resolved_sql)
        resolved_strip_alias = resolved_sql.split(" AS ")[0]
        if alias:
            return f'{resolved_strip_alias} AS "{hashed_alias}"'
        else:
            return resolved_strip_alias
