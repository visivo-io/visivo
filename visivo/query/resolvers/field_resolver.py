import json
import os
from typing import Optional, Union, Dict
from visivo.models.base.project_dag import ProjectDag
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.query.patterns import (
    CONTEXT_STRING_REF_PATTERN,
    get_model_name_from_match,
    replace_refs,
    has_CONTEXT_STRING_REF_PATTERN,
)
from visivo.query.sqlglot_utils import identify_column_references
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

    def __init__(self, dag: ProjectDag, output_dir: str, dialect: Optional[str] = None):
        """
        Initialize the FieldResolver.

        Args:
            dag: Project DAG containing all models, metrics, and dimensions
            output_dir: Directory where schema files are stored
            dialect: SQLGlot dialect name for proper SQL formatting
        """
        self.dag = dag
        self.output_dir = output_dir
        self.dialect = dialect

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
            Logger().error(f"Schema file not found for model '{model_name}' at {schema_file}")
            return None
        except json.JSONDecodeError as e:
            Logger().error(f"Failed to parse schema file for model '{model_name}': {e}")
            return None

    def _get_metric_or_dimension(self, name: str) -> Optional[Union[Metric, Dimension]]:
        try:
            node = self.dag.get_node_by_name(name)
            if isinstance(node, (Metric, Dimension)):
                return node
            return None
        except ValueError:
            # Not found in DAG
            return None

    def _is_implicit_dimension(self, model_name: str, field_name: str) -> bool:
        schema = self._load_model_schema(model_name)

        # Schema format is {model_hash: {column: type, ...}}
        # We need to find the columns for this model
        try:
            model = self.dag.get_node_by_name(model_name)
            model_hash = model.name_hash()

            if model_hash in schema:
                return field_name in schema[model_hash]

            return False
        except (ValueError, AttributeError):
            return False

    def _qualify_expression(self, expression: str, model_name: str) -> str:
        """
        Fully qualify column references in an expression with the model's hash.

        Args:
            expression: SQL expression with unqualified column references
            model_name: Name of the model that owns these columns

        Returns:
            Fully qualified SQL expression with quoted identifiers

        Raises:
            ValueError: If model or schema cannot be found
        """
        # Get model and its hash
        try:
            model = self.dag.get_descendant_by_name(model_name)
            model_hash = model.name_hash()
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
                model_hash=model_hash, model_schema=schema, expr_sql=expression, dialect=self.dialect
            )
            return qualified
        except Exception as e:
            raise ValueError(
                f"Failed to qualify expression '{expression}' for model '{model_name}': {e}"
            )
    def resolve(): 
        """
        Recurse through ${ref(model).field} and ${ref(global-field)} statements within a metric replacing 
        them with their expressions until we are left with only sql statements. 

          - Use the dag to iterate by calling direct parents of the metric/dimension node. 
          - If a "${ref(model).field}" is not a direct parent then it's an implicit dimension and should 
            be replaced with "model_hash.field"
          - Once the direct parent of a field is a sql_model then we should run the expression through 
            sqlglot_utils.identify_column_references before we return and replace. 
        """
        pass 
    