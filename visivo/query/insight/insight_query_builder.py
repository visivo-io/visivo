from typing import Set, List, Dict
from visivo.models.base.project_dag import ProjectDag
from visivo.models.inputs.base import InputBasemodel
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
        self._has_client_side_interactions = len(self._objects_referenced_by_interactions_with_inputs) > 0
        self._referenced_models = self._find_all_referenced_models()
        self._sqlglot_dialect = self._get_sqlglot_dialect()

    def build_queries(self):
        models_ctes = self.build_models_ctes()
        if self._has_client_side_interactions:
            # In this case the pre query will be all the models used in the query
            # the post query will be the pre query from the else case
            self.post_query = 'select * from "hash of the insight name"'
            pass
        else:
            pass

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
            ctes[model.name] = cte_sql

        return ctes

    def _find_all_objects_referenced_from_interactions_with_inputs(self) -> Set:
        from visivo.query.patterns import extract_ref_names

        referenced_objects = set()

        if not self.insight.interactions:
            return referenced_objects

        for interaction in self.insight.interactions:
            interaction_refs = set()
            has_input_ref = False

            for field in ["filter", "split", "sort"]:
                field_value = getattr(interaction, field, None)
                if field_value:
                    field_str = str(field_value)
                    model_names = extract_ref_names(field_str)
                    interaction_refs.update(model_names)

            for name in interaction_refs:
                obj = self.dag.get_descendant_by_name(name, from_node=self.insight)
                if isinstance(obj, InputBasemodel):
                    has_input_ref = True
                    break

            if has_input_ref:
                for name in interaction_refs:
                    obj = self.dag.get_descendant_by_name(name, from_node=self.insight)
                    if not isinstance(obj, InputBasemodel):
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

        if len(model_names) == 1:
            name = list(model_names)[0]
            obj_names = [obj.name for obj in self._objects_referenced_by_interactions]
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
        return parsed_sql

    def _add_order_by(self, parsed_sql, sort_value, sort_obj):
        from visivo.models.dimension import Dimension

        if isinstance(sort_obj, Dimension):
            sort_column = self._get_hashed_name(sort_obj.name)
        else:
            sort_column = sort_obj.name

        col_expr = sqlglot.exp.Column(this=sort_column)
        parsed_sql = parsed_sql.order_by(col_expr, copy=False)

        return parsed_sql
