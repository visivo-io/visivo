from typing import Set, List, Dict
from visivo.models.base.project_dag import ProjectDag
from visivo.models.inputs.base import Input
from visivo.models.insight import Insight
from visivo.models.models.model import Model
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.source import Source
from visivo.models.dimension import Dimension
from visivo.models.metric import Metric
from visivo.models.dag import all_descendants_of_type
from visivo.query.patterns import extract_ref_names
from visivo.query.sqlglot_utils import get_sqlglot_dialect
import sqlglot
import hashlib


class InsightQueryBuilder:
    def __init__(self, insight: Insight, dag: ProjectDag):
        self.insight = insight
        self.project = dag.get_project()
        self.dag = dag

        self.pre_queries = None
        self.post_query = None

        self._name_to_hash_map = {}

        self._objects_referenced_by_interactions_with_inputs = (
            self._find_all_objects_referenced_from_interactions_with_inputs()
        )
        self._has_client_side_interactions = (
            len(self._objects_referenced_by_interactions_with_inputs) > 0
        )
        self._referenced_models = self._find_all_referenced_models()
        self._sqlglot_dialect = self._get_sqlglot_dialect()

    def build_queries(self):
        models_ctes = self.build_models_ctes()
        main_query = None
        # main_query = join ctes with metrics and dimentions to build mail query
        if self._has_client_side_interactions:
            # In this case the pre queries will be all the models used in the query
            # the post query will be the pre query from the else case
            self.pre_queries = main_query 
            self.post_query = main_query
        else:
            self.pre_queries = [main_query]
            self.post_query = 'select * from "hash of the insight name"'

    def build_models_ctes(self) -> Dict[str, str]:
        ctes = {}

        for model in self._referenced_models:
            # Start with base SQL or add dimensions
            if model.dimensions:
                parsed_sql = sqlglot.parse_one(model.sql, dialect=self._sqlglot_dialect)

                for dimension in model.dimensions:
                    dim_expr = sqlglot.parse_one(
                        dimension.expression, dialect=self._sqlglot_dialect
                    )

                    aliased_column = sqlglot.expressions.Alias(
                        this=dim_expr, alias=self._get_hashed_name(dimension.name)
                    )

                    parsed_sql.select(aliased_column, append=True, copy=False)
            else:
                parsed_sql = sqlglot.parse_one(model.sql, dialect=self._sqlglot_dialect)

            # Apply interactions if they reference this model
            parsed_sql = self._apply_interactions_to_model_sql(parsed_sql, model)

            cte_sql = parsed_sql.sql(dialect=self._sqlglot_dialect)

            # Replace parameter placeholders with $ prefix for client-side substitution
            cte_sql = cte_sql.replace("PARAM_", "$")

            ctes[model.name] = cte_sql

        return ctes

    def _find_all_objects_referenced_from_interactions_with_inputs(self) -> Set:
        from visivo.query.patterns import extract_ref_names

        referenced_objects = set()

        if not self.insight.interactions:
            return referenced_objects

        # Use DAG to check if any inputs are descendants of this insight
        input_descendants = all_descendants_of_type(
            type=Input, dag=self.dag, from_node=self.insight
        )

        # If no inputs are descendants, no interactions can reference them
        if not input_descendants:
            return referenced_objects

        # If there are input descendants, find all objects referenced in interactions
        # that also have at least one input referenced in the same interaction
        for interaction in self.insight.interactions:
            interaction_refs = set()
            has_input_ref = False

            # Extract all references from this interaction
            for field_value in interaction.field_values.values():
                field_str = str(field_value)
                model_names = extract_ref_names(field_str)
                interaction_refs.update(model_names)

            # Check if any references are to input descendants
            for name in interaction_refs:
                obj = self.dag.get_descendant_by_name(name, from_node=self.insight)
                if isinstance(obj, Input):
                    has_input_ref = True
                    break

            # If this interaction references an input, collect all non-input objects
            if has_input_ref:
                for name in interaction_refs:
                    obj = self.dag.get_descendant_by_name(name, from_node=self.insight)
                    if not isinstance(obj, Input):
                        referenced_objects.add(obj)

        return referenced_objects

    def _find_all_referenced_models(self) -> List[Model]:
        return all_descendants_of_type(type=Model, dag=self.dag, from_node=self.insight)

    def _get_sqlglot_dialect(self) -> str:
        source = all_descendants_of_type(type=Source, dag=self.dag, from_node=self.insight)[0]

        return get_sqlglot_dialect(source.get_dialect())

    def _get_hashed_name(self, name: str) -> str:
        if name in self._name_to_hash_map:
            return self._name_to_hash_map[name]

        hashed_name = hashlib.md5(name.encode()).hexdigest()
        self._name_to_hash_map[name] = hashed_name
        return hashed_name

    def _apply_interactions_to_model_sql(self, parsed_sql, model):
        if not self.insight.interactions:
            return parsed_sql

        for interaction in self.insight.interactions:
            if interaction.filter:
                filter_obj = self._find_interaction_target(interaction.filter)
                if filter_obj and self._is_related_to_model(filter_obj, model):
                    parsed_sql = self._add_where_clause(parsed_sql, interaction.filter, filter_obj)

            if interaction.sort:
                sort_obj = self._find_interaction_target(interaction.sort)
                if sort_obj and self._is_related_to_model(sort_obj, model):
                    parsed_sql = self._add_order_by(parsed_sql, interaction.sort, sort_obj)

        return parsed_sql

    def _find_interaction_target(self, field_value):

        field_str = str(field_value)
        model_names = extract_ref_names(field_str)

        # Find the first referenced object that's in our tracked interactions objects
        obj_names = [obj.name for obj in self._objects_referenced_by_interactions_with_inputs]
        for name in model_names:
            if name in obj_names:
                return self.dag.get_descendant_by_name(name, from_node=self.insight)

        return None

    def _is_related_to_model(self, obj, model):
        if obj == model:
            return True

        if isinstance(obj, Dimension) and isinstance(model, SqlModel):
            if model.dimensions and obj in model.dimensions:
                return True

        # TODO This might not be correct
        if isinstance(obj, (Dimension, Metric)):
            dependent_models = all_descendants_of_type(type=Model, dag=self.dag, from_node=obj)
            if model in dependent_models:
                return True

        return False

    def _add_where_clause(self, parsed_sql, filter_value, filter_obj):
        from visivo.query.patterns import extract_ref_names

        # Extract the filter expression from ?{...}
        filter_str = str(filter_value)
        # Remove ?{ and }
        if filter_str.startswith("?{") and filter_str.endswith("}"):
            filter_expr = filter_str[2:-1].strip()
        else:
            filter_expr = filter_str

        # For now, handle simple equality: ${ref(dim)} = ${ref(input)}
        # Extract all referenced names
        ref_names = list(extract_ref_names(filter_expr))

        if len(ref_names) == 2:
            # Get both objects and determine which is which
            obj1 = self.dag.get_descendant_by_name(ref_names[0], from_node=self.insight)
            obj2 = self.dag.get_descendant_by_name(ref_names[1], from_node=self.insight)

            # Find which is the dimension and which is the input
            dimension_obj = None
            input_obj = None

            if isinstance(obj1, Dimension):
                dimension_obj = obj1
                input_obj = obj2
            elif isinstance(obj2, Dimension):
                dimension_obj = obj2
                input_obj = obj1

            if dimension_obj and isinstance(input_obj, Input):
                # Build WHERE clause: dimension_hash = $dimension_hash
                dimension_col = self._get_hashed_name(dimension_obj.name)
                left_col = dimension_col
                right_col = f"PARAM_{dimension_col}"

                # Build equality expression using SQLGlot
                left_expr = sqlglot.exp.Column(this=left_col)
                right_expr = sqlglot.exp.Column(this=right_col)
                where_condition = sqlglot.exp.EQ(this=left_expr, expression=right_expr)

                parsed_sql = parsed_sql.where(where_condition, copy=False)

        return parsed_sql

    def _add_order_by(self, parsed_sql, sort_value, sort_obj):
        from visivo.models.dimension import Dimension

        if isinstance(sort_obj, Dimension):
            sort_column = self._get_hashed_name(sort_obj.name)
        else:
            sort_column = sort_obj.name

        # Extract DESC/ASC from sort_value if present
        sort_str = str(sort_value)
        desc = False
        if "DESC" in sort_str.upper():
            desc = True

        col_expr = sqlglot.exp.Column(this=sort_column)

        # Create an Ordered expression with the desc flag
        ordered_expr = sqlglot.exp.Ordered(this=col_expr, desc=desc)
        parsed_sql = parsed_sql.order_by(ordered_expr, copy=False)

        return parsed_sql
