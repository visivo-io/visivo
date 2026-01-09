import json
import os
from typing import Optional, Dict
from visivo.models.base.project_dag import ProjectDag

from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.query.patterns import (
    CONTEXT_STRING_REF_PATTERN_COMPILED,
    has_CONTEXT_STRING_REF_PATTERN,
)
from visivo.query.resolvers.error_messages import format_column_not_found_error
from visivo.query.sqlglot_utils import (
    identify_column_references,
    field_alias_hasher,
    get_sqlglot_dialect,
    normalize_identifier_for_dialect,
    parse_expression,
)
from sqlglot import exp
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

    def _find_column_in_schema(
        self, table: dict, field_name: str, is_quoted: bool
    ) -> Optional[str]:
        """Find column with case-sensitivity rules.

        Implements SQL identifier case-sensitivity conventions:
        - Unquoted identifiers: case-insensitive lookup
        - Quoted identifiers: exact case match required

        Args:
            table: Schema dict {column_name: type}
            field_name: Field to find (without quotes)
            is_quoted: If True, exact match required; if False, case-insensitive

        Returns:
            Actual column name from schema, or None if not found
        """
        if is_quoted:
            # Quoted identifier: exact case match required
            return field_name if field_name in table else None

        # Unquoted identifier: case-insensitive lookup
        field_lower = field_name.lower()
        for schema_col in table.keys():
            if schema_col.lower() == field_lower:
                return schema_col
        return None

    def _qualify_expression(self, expression: str, model_node: SqlModel) -> str:
        # Get model and its hash
        try:
            model_name = model_node.name
            model_hash = model_node.name_hash()
        except ValueError as e:
            raise ValueError(f"Failed to get model info for '{model_node}': {e}")

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

    def _strip_trailing_alias(self, sql: str) -> str:
        """
        Strip trailing alias from SQL expression using SQLGlot.

        This properly handles CAST(x AS type) syntax which contains ' AS ' but is NOT an alias.
        Only strips the alias if the root expression is an Alias node.

        Args:
            sql: SQL expression that may have a trailing alias (e.g., '"x" AS "alias"')

        Returns:
            SQL expression without trailing alias (e.g., '"x"')
        """
        # If expression contains ${} placeholders, SQLGlot can't parse it
        # Use regex to check for trailing alias pattern
        if "${" in sql:
            # Expression has placeholders - use a safe regex for trailing alias
            # Match: ... AS "identifier" at the end
            import re

            trailing_alias_pattern = r'\s+AS\s+"[^"]+"\s*$'
            match = re.search(trailing_alias_pattern, sql, re.IGNORECASE)
            if match:
                return sql[: match.start()]
            return sql

        # Try to parse with SQLGlot
        try:
            sqlglot_dialect = get_sqlglot_dialect(self.native_dialect)
            parsed = parse_expression(sql, self.native_dialect)
            if parsed and isinstance(parsed, exp.Alias):
                # Root is an alias - return just the aliased expression
                return parsed.this.sql(dialect=sqlglot_dialect)
        except Exception:
            # Parsing failed - return as-is
            pass

        return sql

    def _replace_template_patterns_with_placeholders(self, text: str) -> tuple[str, dict]:
        """
        Replace ${...} patterns with SQLGlot-parseable placeholders using string operations.

        Args:
            text: String containing ${...} patterns

        Returns:
            Tuple of (text with placeholders, dict mapping placeholders to original patterns)
        """
        placeholders = {}
        result = []
        i = 0
        counter = 0

        while i < len(text):
            if text[i : i + 2] == "${":
                # Find matching closing brace
                start = i
                depth = 0
                while i < len(text):
                    if text[i] == "{":
                        depth += 1
                    elif text[i] == "}":
                        depth -= 1
                        if depth == 0:
                            break
                    i += 1

                original = text[start : i + 1]
                placeholder = f"__PH{counter}__"
                placeholders[placeholder] = original
                result.append(placeholder)
                counter += 1
                i += 1
            else:
                result.append(text[i])
                i += 1

        return "".join(result), placeholders

    def resolve_sort(self, expression: str) -> str:
        """
        Resolve a sort expression, preserving ASC/DESC modifiers.

        Sort expressions like "${ref(model).field} DESC" need special handling because
        parse_expression() doesn't understand ORDER BY modifiers and may misinterpret
        them as aliases.

        Uses SQLGlot's ORDER BY node to properly parse and extract modifiers.

        Args:
            expression: Sort expression that may end with ASC/DESC

        Returns:
            Resolved expression with ASC/DESC preserved
        """
        from sqlglot import parse_one

        # If no refs to resolve, return as-is
        if "${" not in expression:
            return expression

        # Replace ${...} patterns with placeholders using string operations
        placeholder_expr, placeholders = self._replace_template_patterns_with_placeholders(
            expression
        )

        # Parse with SQLGlot using ORDER BY context to properly interpret modifiers
        try:
            sqlglot_dialect = get_sqlglot_dialect(self.native_dialect)
            parsed = parse_one(f"SELECT 1 ORDER BY {placeholder_expr}", dialect=sqlglot_dialect)

            # Extract the Ordered expression from the parsed query
            order_clause = parsed.args.get("order")
            if order_clause and order_clause.expressions:
                order_expr = order_clause.expressions[0]

                # Extract sort modifiers from the Ordered node
                is_desc = order_expr.args.get("desc", False)
                nulls_first = order_expr.args.get("nulls_first")

                # Get the inner expression SQL and restore original patterns
                inner_expr_sql = order_expr.this.sql(dialect=sqlglot_dialect)
                for placeholder, original in placeholders.items():
                    inner_expr_sql = inner_expr_sql.replace(placeholder, original)

                # Resolve the expression (handles ${ref(...)} patterns)
                resolved_inner = self.resolve(inner_expr_sql, alias=False)

                # If resolved expression still contains ${...} placeholders (input refs),
                # we can't use SQLGlot to parse it - use string concatenation for modifiers
                if "${" in resolved_inner:
                    result = resolved_inner
                    if is_desc:
                        result += " DESC"
                    elif not is_desc and order_expr.args.get("desc") is None:
                        # ASC is implicit in SQLGlot, check original expression
                        if " ASC" in expression.upper():
                            result += " ASC"
                    if nulls_first is True:
                        result += " NULLS FIRST"
                    elif nulls_first is False:
                        result += " NULLS LAST"
                    return result

                # Reconstruct using SQLGlot's Ordered node for proper SQL generation
                ordered_node = exp.Ordered(
                    this=parse_expression(resolved_inner, self.native_dialect),
                    desc=is_desc,
                    nulls_first=nulls_first,
                )
                return ordered_node.sql(dialect=sqlglot_dialect)

        except Exception:
            # SQLGlot couldn't parse - fall back to resolving without modifiers
            pass

        # Fallback: resolve normally (may lose modifiers if SQLGlot fails)
        return self.resolve(expression, alias=False)

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

                    # Only Metrics and Dimensions are valid for model-scoped field references.
                    # Other named nodes (Inputs, Insights, etc.) with the same name should
                    # fall through to implicit dimension lookup in the schema.
                    if not isinstance(field_node, (Metric, Dimension)):
                        raise ValueError(
                            f"Found node '{field_name_stripped}' but it's a "
                            f"{type(field_node).__name__}, not a Metric or Dimension"
                        )
                except ValueError:
                    # No model found check to see if there's a matching implicit dimension in the schema
                    model_hash = model_node.name_hash()
                    schema = self._load_model_schema(model_node.name)
                    if not schema:
                        raise Exception(f"Missing schema for model: {model_node.name}.")
                    table = schema.get(model_hash)
                    if not table:
                        raise Exception(f"Missing schema for model: {model_node.name}.")

                    # Detect if field is quoted (e.g., ${ref(model)."Column"})
                    # Quoted fields require exact case match; unquoted are case-insensitive
                    is_quoted = (
                        field_name_stripped.startswith('"')
                        and field_name_stripped.endswith('"')
                        and len(field_name_stripped) > 2
                    )
                    lookup_name = field_name_stripped
                    if is_quoted:
                        # Strip surrounding quotes for lookup
                        lookup_name = field_name_stripped[1:-1]

                    # Use case-insensitive lookup for unquoted, exact match for quoted
                    actual_column_name = self._find_column_in_schema(table, lookup_name, is_quoted)

                    if not actual_column_name:
                        error_msg = format_column_not_found_error(
                            field_name=lookup_name,
                            model_name=model_node.name,
                            table=table,
                            is_quoted=is_quoted,
                        )
                        raise Exception(error_msg)

                    # If the field name is found in the schema it's an implicit dimension
                    # Use the ACTUAL column name from schema (preserves original case)
                    return self._qualify_expression(
                        expression=actual_column_name, model_node=model_node
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
        # Use SQLGlot-based alias stripping to properly handle CAST(x AS type) syntax
        # The naive .split(" AS ")[0] approach incorrectly truncates expressions containing " AS "
        resolved_strip_alias = self._strip_trailing_alias(resolved_sql)
        if alias:
            # Use dialect-aware identifier normalization for proper case handling
            # Snowflake: uppercase (matches unquoted storage)
            # PostgreSQL: lowercase (matches unquoted storage)
            # Others: preserve case
            sqlglot_dialect = get_sqlglot_dialect(self.native_dialect)
            alias_identifier = normalize_identifier_for_dialect(
                hashed_alias, self.native_dialect, quoted=True
            )
            alias_sql = alias_identifier.sql(dialect=sqlglot_dialect)
            return f"{resolved_strip_alias} AS {alias_sql}"
        else:
            return resolved_strip_alias
